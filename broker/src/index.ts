interface Env {
  FLOW_STORE: DurableObjectNamespace
  GITHUB_APP_ID: string
  GITHUB_APP_CLIENT_ID: string
  GITHUB_APP_SLUG: string
  GITHUB_APP_CALLBACK_URL: string
  GITHUB_APP_CLIENT_SECRET?: string
}

interface FlowResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshTokenExpiresIn: number
  user: {
    id: number
    login: string
    avatarUrl: string
    htmlUrl: string
  }
  installations: Array<{
    id: number
    accountLogin: string
    accountAvatarUrl?: string
    htmlUrl: string
    repositorySelection: 'all' | 'selected' | 'unknown'
  }>
}

interface StoredFlow {
  flowId: string
  flowSecretHash: string
  codeVerifier: string
  createdAt: number
  expiresAt: number
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  redeemed: boolean
  result?: FlowResult
  error?: string
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  error?: string
}

const FLOW_TTL_MS = 10 * 60_000
const JSON_HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS })
}

function html(value: string, status = 200): Response {
  return new Response(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json()
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function randomValue(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return base64Url(new Uint8Array(digest))
}

async function codeChallenge(verifier: string): Promise<string> {
  return sha256(verifier)
}

function githubUrl(value: unknown): string {
  const candidate = typeof value === 'string' ? value : ''
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && (url.hostname === 'github.com' || url.hostname === 'avatars.githubusercontent.com')
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

function githubHtmlUrl(value: unknown): string {
  const candidate = typeof value === 'string' ? value : ''
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.toString() : ''
  } catch {
    return ''
  }
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function positiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 0
}

async function githubTokenRequest(url: string, token: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-github-integration-oauth-broker',
      Authorization: `Bearer ${token}`,
    },
  })
}

async function profileForToken(token: string, env: Env): Promise<FlowResult['user'] & { installations: FlowResult['installations'] }> {
  const userResponse = await githubTokenRequest('https://api.github.com/user', token)
  if (!userResponse.ok) throw new Error('GitHub user profile request failed')
  const userBody = record(await userResponse.json())
  const user = {
    id: positiveInteger(userBody.id),
    login: typeof userBody.login === 'string' ? userBody.login : '',
    avatarUrl: githubUrl(userBody.avatar_url),
    htmlUrl: githubHtmlUrl(userBody.html_url),
  }
  if (!user.id || !user.login || !user.avatarUrl || !user.htmlUrl) throw new Error('GitHub user response was incomplete')

  const installationResponse = await githubTokenRequest('https://api.github.com/user/installations', token)
  if (!installationResponse.ok) throw new Error('GitHub installation list request failed')
  const installationBody = record(await installationResponse.json())
  const raw = Array.isArray(installationBody.installations) ? installationBody.installations : []
  const installations = raw.flatMap((entry) => {
    const item = record(entry)
    if (String(item.app_id ?? '') !== env.GITHUB_APP_ID) return []
    const account = record(item.account)
    const id = positiveInteger(item.id)
    const accountLogin = typeof account.login === 'string' ? account.login : ''
    const htmlUrl = githubHtmlUrl(item.html_url)
    if (!id || !accountLogin || !htmlUrl) return []
    const repositorySelection = item.repository_selection === 'all' || item.repository_selection === 'selected'
      ? item.repository_selection
      : 'unknown'
    const accountAvatarUrl = githubUrl(account.avatar_url)
    return [{
      id,
      accountLogin,
      ...(accountAvatarUrl ? { accountAvatarUrl } : {}),
      htmlUrl,
      repositorySelection,
    }]
  })
  return { ...user, installations }
}

async function exchangeCode(code: string, codeVerifier: string, env: Env): Promise<TokenResponse> {
  if (!env.GITHUB_APP_CLIENT_SECRET) throw new Error('Broker Client Secret is not configured')
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GITHUB_APP_CLIENT_ID,
      client_secret: env.GITHUB_APP_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_APP_CALLBACK_URL,
      code_verifier: codeVerifier,
    }),
  })
  const body = record(await response.json()) as TokenResponse
  if (!response.ok || body.error || !body.access_token || !body.refresh_token) throw new Error('GitHub authorization code exchange failed')
  if (!Number.isFinite(body.expires_in) || !Number.isFinite(body.refresh_token_expires_in) || body.expires_in! <= 0 || body.refresh_token_expires_in! <= 0) {
    throw new Error('GitHub App must return expiring user access and refresh tokens')
  }
  return body
}

async function refreshToken(refreshToken: string, env: Env): Promise<TokenResponse> {
  if (!env.GITHUB_APP_CLIENT_SECRET) throw new Error('Broker Client Secret is not configured')
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GITHUB_APP_CLIENT_ID,
      client_secret: env.GITHUB_APP_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const body = record(await response.json()) as TokenResponse
  if (!response.ok || body.error || !body.access_token || !body.refresh_token) throw new Error('GitHub refresh token exchange failed')
  if (!Number.isFinite(body.expires_in) || !Number.isFinite(body.refresh_token_expires_in) || body.expires_in! <= 0 || body.refresh_token_expires_in! <= 0) {
    throw new Error('GitHub refresh response was incomplete')
  }
  return body
}

async function revokeToken(accessToken: string, env: Env): Promise<boolean> {
  if (!env.GITHUB_APP_CLIENT_SECRET) throw new Error('Broker Client Secret is not configured')
  const basic = btoa(`${env.GITHUB_APP_CLIENT_ID}:${env.GITHUB_APP_CLIENT_SECRET}`)
  const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(env.GITHUB_APP_CLIENT_ID)}/grant`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dsh-github-integration-oauth-broker',
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: accessToken }),
  })
  return response.status === 204
}

function callbackPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>GitHub authorization</title></head><body><p>${message}</p><script>try{window.opener?.postMessage({type:'github-oauth-callback',status:'complete'},'*')}catch{};try{window.history.replaceState(null,document.title,window.location.pathname)}catch{};setTimeout(()=>window.close(),250)</script></body></html>`
}

export class OAuthFlowStore {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    const body = await bodyOf(request)
    const action = typeof body.action === 'string' ? body.action : ''
    const flow = await this.state.storage.get<StoredFlow>('flow')
    if (flow !== undefined && flow.expiresAt <= Date.now()) {
      await this.state.storage.deleteAll()
      return json({ status: 'expired' }, 410)
    }

    if (action === 'create') {
      const next = body.flow as StoredFlow | undefined
      if (!next || flow !== undefined) return json({ error: 'flow_exists' }, 409)
      await this.state.storage.put('flow', next)
      return json({ status: 'created' })
    }
    if (flow === undefined) return json({ error: 'flow_not_found' }, 404)

    if (action === 'complete') {
      if (flow.status !== 'processing') return json({ error: 'flow_already_completed' }, 409)
      const result = body.result as FlowResult | undefined
      if (result === undefined) return json({ error: 'result_required' }, 400)
      await this.state.storage.put('flow', { ...flow, status: 'succeeded', result })
      return json({ status: 'succeeded' })
    }
    if (action === 'fail') {
      if (flow.status === 'pending' || flow.status === 'processing') await this.state.storage.put('flow', { ...flow, status: 'failed', error: 'GitHub authorization failed' })
      return json({ status: 'failed' })
    }
    if (action === 'get-flow-for-exchange') {
      if (flow.status !== 'pending') return json({ error: 'flow_already_completed' }, 409)
      await this.state.storage.put('flow', { ...flow, status: 'processing' })
      return json({ codeVerifier: flow.codeVerifier })
    }
    if (action === 'poll') return json({ status: flow.status, ...(flow.status === 'failed' ? { error: flow.error } : {}) })
    if (action === 'redeem') {
      const providedHash = typeof body.flowSecret === 'string' ? await sha256(body.flowSecret) : ''
      if (providedHash !== flow.flowSecretHash) return json({ error: 'invalid_flow_secret' }, 403)
      if (flow.status !== 'succeeded' || flow.result === undefined) return json({ status: flow.status, ...(flow.status === 'failed' ? { error: flow.error } : {}) }, 409)
      if (flow.redeemed) return json({ error: 'flow_already_redeemed' }, 409)
      await this.state.storage.put('flow', { ...flow, redeemed: true })
      return json({ status: 'succeeded', result: flow.result })
    }
    return json({ error: 'unknown_action' }, 400)
  }
}

async function flowRequest(env: Env, flowId: string, action: string, value: Record<string, unknown> = {}): Promise<Response> {
  const id = env.FLOW_STORE.idFromName(flowId)
  const stub = env.FLOW_STORE.get(id)
  return stub.fetch('https://flow.internal/', {
    method: 'POST',
    body: JSON.stringify({ action, ...value }),
    headers: { 'Content-Type': 'application/json' },
  })
}

async function handleStart(request: Request, env: Env): Promise<Response> {
  const flowId = randomValue()
  const flowSecret = randomValue()
  const codeVerifier = randomValue()
  const codeChallenge = await codeChallengeFor(codeVerifier)
  const createdAt = Date.now()
  const stored: StoredFlow = {
    flowId,
    flowSecretHash: await sha256(flowSecret),
    codeVerifier,
    createdAt,
    expiresAt: createdAt + FLOW_TTL_MS,
    status: 'pending',
    redeemed: false,
  }
  const created = await flowRequest(env, flowId, 'create', { flow: stored })
  if (!created.ok) return json({ error: 'could_not_create_flow' }, 500)
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', env.GITHUB_APP_CLIENT_ID)
  url.searchParams.set('redirect_uri', env.GITHUB_APP_CALLBACK_URL)
  url.searchParams.set('state', flowId)
  url.searchParams.set('code_challenge', codeChallenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')
  return json({ flowId, flowSecret, authorizationUrl: url.toString(), expiresAt: stored.expiresAt })
}

async function codeChallengeFor(verifier: string): Promise<string> {
  return sha256(verifier)
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const state = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  if (!state) return html(callbackPage('GitHub authorization failed.'), 400)
  if (error || !code) {
    await flowRequest(env, state, 'fail')
    return html(callbackPage('GitHub authorization was not completed.'), 400)
  }
  const id = env.FLOW_STORE.idFromName(state)
  const stub = env.FLOW_STORE.get(id)
  const flowResponse = await stub.fetch('https://flow.internal/', {
    method: 'POST',
    body: JSON.stringify({ action: 'poll' }),
    headers: { 'Content-Type': 'application/json' },
  })
  if (!flowResponse.ok) return html(callbackPage('This authorization request has expired.'), 400)
  const flowStatus = await flowResponse.json() as { status?: string }
  if (flowStatus.status !== 'pending') return html(callbackPage('This authorization request was already used.'), 400)
  try {
    const flow = await env.FLOW_STORE.get(id).fetch('https://flow.internal/', {
      method: 'POST',
      body: JSON.stringify({ action: 'get-flow-for-exchange' }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (!flow.ok) throw new Error('flow_not_found')
    const flowValue = await flow.json() as { codeVerifier?: string }
    if (!flowValue.codeVerifier) throw new Error('flow_not_found')
    const exchanged = await exchangeCode(code, flowValue.codeVerifier, env)
    const profile = await profileForToken(exchanged.access_token!, env)
    const result: FlowResult = {
      accessToken: exchanged.access_token!,
      refreshToken: exchanged.refresh_token!,
      expiresIn: exchanged.expires_in!,
      refreshTokenExpiresIn: exchanged.refresh_token_expires_in!,
      user: {
        id: profile.id,
        login: profile.login,
        avatarUrl: profile.avatarUrl,
        htmlUrl: profile.htmlUrl,
      },
      installations: profile.installations,
    }
    await flowRequest(env, state, 'complete', { result })
    return html(callbackPage('GitHub connected. You can close this window.'))
  } catch {
    await flowRequest(env, state, 'fail')
    return html(callbackPage('GitHub authorization failed.'), 400)
  }
}

async function handleJson(request: Request, env: Env, path: string): Promise<Response> {
  const body = await bodyOf(request)
  if (path === '/v1/github/oauth/start') return handleStart(request, env)
  const flowId = typeof body.flowId === 'string' ? body.flowId : ''
  if (path === '/v1/github/oauth/poll') {
    if (!flowId) return json({ error: 'flow_id_required' }, 400)
    return flowRequest(env, flowId, 'poll')
  }
  if (path === '/v1/github/oauth/redeem') {
    if (!flowId || typeof body.flowSecret !== 'string') return json({ error: 'flow_credentials_required' }, 400)
    return flowRequest(env, flowId, 'redeem', { flowSecret: body.flowSecret })
  }
  if (path === '/v1/github/oauth/refresh') {
    if (typeof body.refreshToken !== 'string' || body.refreshToken.length === 0) return json({ error: 'refresh_token_required' }, 400)
    try {
      const token = await refreshToken(body.refreshToken, env)
      return json(token)
    } catch {
      return json({ error: 'refresh_failed' }, 401)
    }
  }
  if (path === '/v1/github/oauth/revoke') {
    if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) return json({ error: 'access_token_required' }, 400)
    try {
      return json({ remoteRevoked: await revokeToken(body.accessToken, env) })
    } catch {
      return json({ remoteRevoked: false })
    }
  }
  return json({ error: 'not_found' }, 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } })
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, appSlug: env.GITHUB_APP_SLUG })
    if (request.method === 'GET' && url.pathname === '/github/oauth/callback') return handleCallback(request, env)
    if (request.method === 'POST') return handleJson(request, env, url.pathname)
    return json({ error: 'not_found' }, 404)
  },
}
