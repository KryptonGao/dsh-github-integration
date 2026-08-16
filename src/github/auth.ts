import { createHash, createPrivateKey, createSign, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import type {
  GitHubAppSettings,
  GitHubAuthMode,
  GitHubAuthState,
  GitHubInstallationAccess,
  GitHubUserProfile,
} from '../types.ts'
import {
  DEFAULT_GITHUB_APP_SETTINGS,
  GITHUB_OAUTH_CALLBACK_PATH,
  GITHUB_USER_ACCESS_TOKEN_REF,
  GITHUB_USER_REFRESH_TOKEN_REF,
} from '../types.ts'
import type { GitHubStateStore, StoredAuthState } from './storage.ts'
import { GitHubStateStore as DefaultGitHubStateStore } from './storage.ts'

export interface GitHubTokenValue {
  token: string
  expiresAt: number
  source: 'user' | 'installation'
}

interface OAuthTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  refresh_token_expires_in?: number
  error?: string
}

interface PendingAuthorization {
  codeVerifier: string
  createdAt: number
}

interface PendingBrokerAuthorization {
  flowId: string
  flowSecret: string
  createdAt: number
}

interface BrokerAuthorizationStart {
  flowId?: string
  flowSecret?: string
  authorizationUrl?: string
}

interface BrokerTokenResult {
  accessToken?: string
  refreshToken?: string
  expiresIn?: number
  refreshTokenExpiresIn?: number
  user?: unknown
  installations?: unknown
}

interface WebServerLike {
  register(route: {
    kind: 'exact'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

const AUTHORIZATION_TTL_MS = 10 * 60_000
const TOKEN_REFRESH_MARGIN_MS = 60_000

class GitHubUnauthorizedError extends Error {}

function base64url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url')
}

export function createPkceVerifier(): string {
  return base64url(randomBytes(32))
}

export function createPkceChallenge(verifier: string): string {
  return base64url(createHash('sha256').update(verifier).digest())
}

export function createOAuthState(): string {
  return base64url(randomBytes(32))
}

function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId }))
  const unsigned = `${header}.${payload}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(createPrivateKey(privateKey)).toString('base64url')}`
}

async function readCredential(ctx: Context, ref: string): Promise<string | undefined> {
  if (!ref) return undefined
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const value = await credentials.resolve(credentialRef(ref))
    if (value?.value) return value.value
  }
  return process.env[ref] || undefined
}

async function writeCredential(ctx: Context, ref: string, value: string): Promise<void> {
  const credentials = ctx.get('credentials')
  if (credentials?.set === undefined) throw new Error('Harness credential storage is unavailable')
  await credentials.set(credentialRef(ref), value)
}

async function unsetCredential(ctx: Context, ref: string): Promise<void> {
  const credentials = ctx.get('credentials')
  if (credentials?.unset === undefined) throw new Error('Harness credential storage is unavailable')
  await credentials.unset(credentialRef(ref))
}

async function readSettings(ctx: Context): Promise<GitHubAppSettings> {
  const settings = ctx.get('settings')
  if (settings === undefined) return { ...DEFAULT_GITHUB_APP_SETTINGS }
  const scope = settings.get?.('github-integration') as Partial<GitHubAppSettings> | undefined
  return { ...DEFAULT_GITHUB_APP_SETTINGS, ...(scope ?? {}) }
}

async function githubTokenRequest(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  })
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : 0
}

function brokerBaseUrl(config: GitHubAppSettings): string {
  const raw = config.brokerUrl?.trim() ?? ''
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'))) return ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return ''
  }
}

function githubUrl(value: unknown): string {
  const candidate = stringValue(value)
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && url.hostname === 'github.com' ? url.toString() : ''
  } catch {
    return ''
  }
}

function githubAvatarUrl(value: unknown): string {
  const candidate = stringValue(value)
  try {
    const url = new URL(candidate)
    return url.protocol === 'https:' && (url.hostname === 'avatars.githubusercontent.com' || url.hostname === 'github.com')
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

function parseUserProfile(value: unknown): GitHubUserProfile {
  const body = jsonRecord(value)
  const id = numberValue(body.id)
  const login = stringValue(body.login)
  const avatarUrl = githubAvatarUrl(body.avatar_url)
  const htmlUrl = githubUrl(body.html_url)
  if (!id || !login || !avatarUrl || !htmlUrl) throw new Error('GitHub user response was incomplete')
  return { id, login, avatarUrl, htmlUrl }
}

function parseInstallations(value: unknown, appId: string): GitHubInstallationAccess[] {
  const body = jsonRecord(value)
  const raw = Array.isArray(body.installations) ? body.installations : []
  return raw.flatMap((entry) => {
    const item = jsonRecord(entry)
    if (String(item.app_id ?? '') !== appId) return []
    const account = jsonRecord(item.account)
    const id = numberValue(item.id)
    const accountLogin = stringValue(account.login)
    const htmlUrl = githubUrl(item.html_url)
    if (!id || !accountLogin || !htmlUrl) return []
    const repositorySelection = item.repository_selection === 'all' || item.repository_selection === 'selected'
      ? item.repository_selection
      : 'unknown'
    const avatarUrl = githubAvatarUrl(account.avatar_url)
    return [{
      id,
      accountLogin,
      ...(avatarUrl ? { accountAvatarUrl: avatarUrl } : {}),
      htmlUrl,
      repositorySelection,
    }]
  })
}

function buildAuthState(stored: StoredAuthState, config: GitHubAppSettings): GitHubAuthState {
  const manageRepositoryAccessUrl = stored.installations[0]?.htmlUrl
    || (config.appSlug.trim() ? `https://github.com/apps/${encodeURIComponent(config.appSlug.trim())}/installations/new` : undefined)
  return {
    status: stored.status,
    installations: stored.installations,
    ...(stored.user === undefined ? {} : { user: stored.user }),
    ...(manageRepositoryAccessUrl === undefined ? {} : { manageRepositoryAccessUrl }),
  }
}

function callbackHtml(status: 'connected' | 'error'): string {
  const message = status === 'connected'
    ? 'GitHub connected. You can close this window.'
    : 'GitHub connection failed. Return to Harness to try again.'
  const event = JSON.stringify({ type: 'github-oauth-callback', status })
  return `<!doctype html><html><head><meta charset="utf-8"><title>GitHub authorization</title></head><body><p>${message}</p><script>try{window.opener?.postMessage(${event},window.location.origin)}catch{};try{window.history.replaceState(null,document.title,window.location.pathname)}catch{};setTimeout(()=>window.close(),150)</script></body></html>`
}

function respondCallback(response: ServerResponse, statusCode: number, status: 'connected' | 'error'): void {
  response.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8',
    'Referrer-Policy': 'no-referrer',
  })
  response.end(callbackHtml(status))
}

/** Resolves GitHub App user and installation tokens without exposing secrets. */
export class GitHubAuthManager {
  private readonly installationTokens = new Map<number, GitHubTokenValue>()
  private userToken: GitHubTokenValue | undefined
  private userTokenInvalid = false
  private refreshInFlight: Promise<GitHubTokenValue | undefined> | undefined
  private readonly pendingAuthorizations = new Map<string, PendingAuthorization>()
  private pendingBrokerAuthorization: PendingBrokerAuthorization | undefined
  private brokerCompletionInFlight: Promise<void> | undefined

  constructor(
    private readonly ctx: Context,
    private readonly state: GitHubStateStore = new DefaultGitHubStateStore(),
  ) {
    const inject = (ctx as unknown as { inject?: (dependencies: readonly string[], callback: (value: any) => void) => unknown }).inject
    if (typeof inject === 'function') {
      inject.call(ctx, ['webServer'], (webCtx: { webServer?: WebServerLike; effect?: (execute: () => unknown, label?: string) => unknown }) => {
        const server = webCtx.webServer
        if (server === undefined) return
        const register = () => server.register({
          kind: 'exact',
          path: GITHUB_OAUTH_CALLBACK_PATH,
          handler: (request, response) => this.handleCallback(request, response),
        })
        if (typeof webCtx.effect === 'function') webCtx.effect(register, 'github oauth callback')
        else register()
      })
    }
  }

  private async ensureState(): Promise<void> {
    await this.state.load()
  }

  async settings(): Promise<GitHubAppSettings> {
    return readSettings(this.ctx)
  }

  private async brokerRequest(config: GitHubAppSettings, path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const base = brokerBaseUrl(config)
    if (!base) throw new Error('GitHub OAuth Broker is not configured')
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const value = jsonRecord(await response.json().catch(() => ({})))
    if (!response.ok) throw new Error(stringValue(value.error) || `GitHub OAuth Broker request failed: HTTP ${String(response.status)}`)
    return value
  }

  private async completeBrokerAuthorization(config: GitHubAppSettings): Promise<void> {
    const pending = this.pendingBrokerAuthorization
    if (pending === undefined) return
    if (pending.createdAt + AUTHORIZATION_TTL_MS <= Date.now()) {
      this.pendingBrokerAuthorization = undefined
      return
    }
    if (this.brokerCompletionInFlight !== undefined) return this.brokerCompletionInFlight
    this.brokerCompletionInFlight = (async () => {
      const status = await this.brokerRequest(config, '/v1/github/oauth/poll', { flowId: pending.flowId })
      const value = stringValue(status.status)
      if (value === 'pending' || value === 'processing') return
      if (value !== 'succeeded') {
        this.pendingBrokerAuthorization = undefined
        return
      }
      const redeemed = await this.brokerRequest(config, '/v1/github/oauth/redeem', {
        flowId: pending.flowId,
        flowSecret: pending.flowSecret,
      })
      const result = jsonRecord(redeemed.result) as BrokerTokenResult
      const accessToken = stringValue(result.accessToken)
      const refreshToken = stringValue(result.refreshToken)
      const expiresIn = numberValue(result.expiresIn)
      const refreshTokenExpiresIn = numberValue(result.refreshTokenExpiresIn)
      if (!accessToken || !refreshToken || !expiresIn || !refreshTokenExpiresIn) throw new Error('GitHub OAuth Broker returned an incomplete token result')
      const user = parseUserProfile({
        id: jsonRecord(result.user).id,
        login: jsonRecord(result.user).login,
        avatar_url: jsonRecord(result.user).avatarUrl,
        html_url: jsonRecord(result.user).htmlUrl,
      })
      const installations = parseInstallations({ installations: result.installations }, config.appId.trim())
      const token = await this.saveTokenPair(accessToken, refreshToken, expiresIn, refreshTokenExpiresIn)
      await this.ensureState()
      await this.state.setAuth({
        status: 'connected',
        user,
        installations,
        expiresAt: token.expiresAt,
        refreshTokenExpiresAt: Date.now() + refreshTokenExpiresIn * 1_000,
      })
      this.pendingBrokerAuthorization = undefined
    })()
    try {
      await this.brokerCompletionInFlight
    } finally {
      this.brokerCompletionInFlight = undefined
    }
  }

  async beginUserAuthorization(): Promise<{ authorizationUrl: string }> {
    const config = await readSettings(this.ctx)
    if (!config.appId.trim()) throw new Error('GitHub App ID is not configured')
    if (!config.clientId.trim()) throw new Error('GitHub App Client ID is not configured')
    if (!config.appSlug.trim()) throw new Error('GitHub App slug is not configured')
    if (!config.redirectUri.trim()) throw new Error('GitHub OAuth redirect URI is not configured')
    if (brokerBaseUrl(config)) {
      const started = await this.brokerRequest(config, '/v1/github/oauth/start', {}) as BrokerAuthorizationStart
      if (!started.flowId || !started.flowSecret || !started.authorizationUrl) throw new Error('GitHub OAuth Broker returned an incomplete authorization request')
      this.pendingBrokerAuthorization = { flowId: started.flowId, flowSecret: started.flowSecret, createdAt: Date.now() }
      return { authorizationUrl: started.authorizationUrl }
    }
    if (!config.clientSecretRef.trim() || !await readCredential(this.ctx, config.clientSecretRef)) {
      throw new Error('GitHub App Client Secret is not configured in Harness credentials')
    }
    const codeVerifier = createPkceVerifier()
    const state = createOAuthState()
    this.pendingAuthorizations.set(state, { codeVerifier, createdAt: Date.now() })
    for (const [key, pending] of this.pendingAuthorizations) {
      if (pending.createdAt + AUTHORIZATION_TTL_MS <= Date.now()) this.pendingAuthorizations.delete(key)
    }
    const url = new URL('https://github.com/login/oauth/authorize')
    url.searchParams.set('client_id', config.clientId.trim())
    url.searchParams.set('redirect_uri', config.redirectUri.trim())
    url.searchParams.set('state', state)
    url.searchParams.set('code_challenge', createPkceChallenge(codeVerifier))
    url.searchParams.set('code_challenge_method', 'S256')
    url.searchParams.set('prompt', 'select_account')
    return { authorizationUrl: url.toString() }
  }

  private async exchangeCode(config: GitHubAppSettings, code: string, codeVerifier: string): Promise<OAuthTokenResponse> {
    const clientSecret = await readCredential(this.ctx, config.clientSecretRef)
    if (!clientSecret) throw new Error('GitHub App Client Secret is not configured in Harness credentials')
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId.trim(),
        client_secret: clientSecret,
        code,
        redirect_uri: config.redirectUri.trim(),
        code_verifier: codeVerifier,
      }),
    })
    const body = jsonRecord(await response.json()) as OAuthTokenResponse
    if (!response.ok || body.error) throw new Error('GitHub authorization code exchange failed')
    if (!body.access_token || !body.refresh_token) {
      throw new Error('GitHub App must return an expiring user access token and refresh token')
    }
    if (!Number.isFinite(body.expires_in) || !Number.isFinite(body.refresh_token_expires_in)) {
      throw new Error('GitHub App token expiration is not enabled')
    }
    return body
  }

  private async profileForToken(token: string, appId: string): Promise<{ user: GitHubUserProfile; installations: GitHubInstallationAccess[] }> {
    const userResponse = await githubTokenRequest('https://api.github.com/user', token)
    if (userResponse.status === 401) throw new GitHubUnauthorizedError('GitHub user token was rejected')
    if (!userResponse.ok) throw new Error('GitHub user profile request failed')
    const user = parseUserProfile(await userResponse.json())
    const installationsResponse = await githubTokenRequest('https://api.github.com/user/installations', token)
    if (installationsResponse.status === 401) throw new GitHubUnauthorizedError('GitHub user token was rejected')
    if (!installationsResponse.ok) throw new Error('GitHub installation list request failed')
    const installations = parseInstallations(await installationsResponse.json(), appId)
    return { user, installations }
  }

  private async saveTokenPair(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
    refreshTokenExpiresIn: number,
  ): Promise<GitHubTokenValue> {
    const now = Date.now()
    const value: GitHubTokenValue = {
      token: accessToken,
      expiresAt: now + expiresIn * 1_000,
      source: 'user',
    }
    // GitHub rotates refresh tokens. Persist the new refresh token first so a
    // process interruption cannot leave only the invalidated one.
    await writeCredential(this.ctx, GITHUB_USER_REFRESH_TOKEN_REF, refreshToken)
    await writeCredential(this.ctx, GITHUB_USER_ACCESS_TOKEN_REF, accessToken)
    await this.ensureState()
    const stored = this.state.auth()
    await this.state.setAuth({
      ...stored,
      status: 'connected',
      expiresAt: value.expiresAt,
      refreshTokenExpiresAt: now + refreshTokenExpiresIn * 1_000,
    })
    this.userToken = value
    this.userTokenInvalid = false
    return value
  }

  private async refreshUserToken(config: GitHubAppSettings, refreshToken: string): Promise<GitHubTokenValue | undefined> {
    if (this.refreshInFlight !== undefined) return this.refreshInFlight
    this.refreshInFlight = (async () => {
      let body: OAuthTokenResponse
      if (brokerBaseUrl(config)) {
        try {
          body = await this.brokerRequest(config, '/v1/github/oauth/refresh', { refreshToken }) as OAuthTokenResponse
        } catch {
          await this.markReauthorizationRequired()
          return undefined
        }
      } else {
        const clientSecret = await readCredential(this.ctx, config.clientSecretRef)
        if (!clientSecret) return undefined
        const response = await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.clientId.trim(),
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        })
        body = jsonRecord(await response.json()) as OAuthTokenResponse
      }
      if (body.error || !body.access_token || !body.refresh_token) {
        await this.markReauthorizationRequired()
        return undefined
      }
      if (typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || typeof body.refresh_token_expires_in !== 'number' || !Number.isFinite(body.refresh_token_expires_in)) {
        await this.markReauthorizationRequired()
        return undefined
      }
      const accessToken = body.access_token
      const nextRefreshToken = body.refresh_token
      const expiresIn = body.expires_in
      const refreshTokenExpiresIn = body.refresh_token_expires_in
      return await this.saveTokenPair(accessToken, nextRefreshToken, expiresIn, refreshTokenExpiresIn)
    })()
    try {
      return await this.refreshInFlight
    } finally {
      this.refreshInFlight = undefined
    }
  }

  private async markReauthorizationRequired(): Promise<void> {
    this.userToken = undefined
    this.userTokenInvalid = true
    try {
      await unsetCredential(this.ctx, GITHUB_USER_ACCESS_TOKEN_REF)
      await unsetCredential(this.ctx, GITHUB_USER_REFRESH_TOKEN_REF)
    } finally {
      await this.ensureState()
      const stored = this.state.auth()
      await this.state.setAuth({
        status: 'reauthorization_required',
        installations: [],
        ...(stored.user === undefined ? {} : { user: stored.user }),
      })
    }
  }

  async token(mode: GitHubAuthMode, installationId?: number): Promise<GitHubTokenValue | undefined> {
    const config = await readSettings(this.ctx)
    if (mode === 'installation') {
      if (installationId === undefined) return undefined
      const cached = this.installationTokens.get(installationId)
      if (cached !== undefined && cached.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) return cached
      const appId = config.appId.trim()
      const privateKey = await readCredential(this.ctx, config.privateKeyRef)
      if (!appId || !privateKey) return undefined
      const jwt = createAppJwt(appId, privateKey)
      const response = await githubTokenRequest(
        `https://api.github.com/app/installations/${String(installationId)}/access_tokens`,
        jwt,
        { method: 'POST' },
      )
      if (!response.ok) throw new Error(`GitHub App installation token failed: HTTP ${String(response.status)}`)
      const body = await response.json() as { token?: string; expires_at?: string }
      if (!body.token) throw new Error('GitHub App installation token response did not include a token')
      const value: GitHubTokenValue = {
        token: body.token,
        expiresAt: body.expires_at ? Date.parse(body.expires_at) : Date.now() + 55 * 60_000,
        source: 'installation',
      }
      this.installationTokens.set(installationId, value)
      return value
    }

    if (this.userToken !== undefined && !this.userTokenInvalid && this.userToken.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS) return this.userToken
    const accessToken = this.userTokenInvalid ? undefined : await readCredential(this.ctx, GITHUB_USER_ACCESS_TOKEN_REF)
    await this.ensureState()
    const stored = this.state.auth()
    if (accessToken && !this.userTokenInvalid && (stored.expiresAt === undefined || stored.expiresAt > Date.now() + TOKEN_REFRESH_MARGIN_MS)) {
      this.userToken = {
        token: accessToken,
        expiresAt: stored.expiresAt ?? Date.now() + 5 * 60_000,
        source: 'user',
      }
      return this.userToken
    }
    const refreshToken = await readCredential(this.ctx, GITHUB_USER_REFRESH_TOKEN_REF)
    const broker = brokerBaseUrl(config)
    if (!refreshToken || !config.clientId.trim() || (!broker && !config.clientSecretRef.trim())) {
      if (accessToken && stored.expiresAt !== undefined && stored.expiresAt <= Date.now()) await this.markReauthorizationRequired()
      else if (!accessToken && stored.status === 'connected' && config.clientId.trim() && (broker || config.clientSecretRef.trim())) await this.markReauthorizationRequired()
      return undefined
    }
    if (stored.refreshTokenExpiresAt !== undefined && stored.refreshTokenExpiresAt <= Date.now()) {
      await this.markReauthorizationRequired()
      return undefined
    }
    return this.refreshUserToken(config, refreshToken)
  }

  invalidateUserToken(): void {
    this.userToken = undefined
    this.userTokenInvalid = true
  }

  async authState(): Promise<GitHubAuthState> {
    const config = await readSettings(this.ctx)
    await this.ensureState()
    const initialStored = this.state.auth()
    const broker = brokerBaseUrl(config)
    if (!config.appId.trim() || !config.clientId.trim() || !config.appSlug.trim() || !config.redirectUri.trim() || (!broker && !config.clientSecretRef.trim())) {
      return buildAuthState({ ...initialStored, status: 'developer_configuration_required' }, config)
    }
    if (!broker && !await readCredential(this.ctx, config.clientSecretRef)) {
      return buildAuthState({ ...initialStored, status: 'developer_configuration_required' }, config)
    }
    if (broker) await this.completeBrokerAuthorization(config)
    const stored = this.state.auth()
    try {
      const token = await this.token('user')
      if (token === undefined) return buildAuthState(this.state.auth(), config)
      // An empty installation list is valid: the user may not have installed
      // this App yet. Only a missing profile requires another GitHub request.
      if (stored.user === undefined) {
        let profile: { user: GitHubUserProfile; installations: GitHubInstallationAccess[] }
        try {
          profile = await this.profileForToken(token.token, config.appId.trim())
        } catch (error: unknown) {
          if (!(error instanceof GitHubUnauthorizedError)) throw error
          this.invalidateUserToken()
          const refreshed = await this.token('user')
          if (refreshed === undefined || refreshed.token === token.token) throw error
          profile = await this.profileForToken(refreshed.token, config.appId.trim())
        }
        const next: StoredAuthState = {
          ...stored,
          status: 'connected',
          user: profile.user,
          installations: profile.installations,
          expiresAt: token.expiresAt,
        }
        await this.state.setAuth(next)
        return buildAuthState(next, config)
      }
      return buildAuthState({ ...stored, status: 'connected', expiresAt: token.expiresAt }, config)
    } catch (error: unknown) {
      if (error instanceof GitHubUnauthorizedError) {
        try {
          await this.markReauthorizationRequired()
        } catch {
          // The state response remains non-connected even if a read-only
          // credential provider cannot remove the stale secret.
        }
      }
      const current = this.state.auth()
      return buildAuthState({
        ...current,
        status: 'reauthorization_required',
        ...(current.user === undefined ? {} : { user: current.user }),
        installations: [],
      }, config)
    }
  }

  private async handleCallback(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const state = requestUrl.searchParams.get('state')
    const code = requestUrl.searchParams.get('code')
    if (!state || !code) {
      if (state) this.pendingAuthorizations.delete(state)
      respondCallback(response, 400, 'error')
      return
    }
    const pending = this.pendingAuthorizations.get(state)
    this.pendingAuthorizations.delete(state)
    if (pending === undefined || pending.createdAt + AUTHORIZATION_TTL_MS <= Date.now()) {
      respondCallback(response, 400, 'error')
      return
    }
    try {
      const config = await readSettings(this.ctx)
      if (!config.appId.trim() || !config.clientId.trim() || !config.appSlug.trim() || !config.redirectUri.trim()) throw new Error('GitHub OAuth is not configured')
      const exchanged = await this.exchangeCode(config, code, pending.codeVerifier)
      const profile = await this.profileForToken(exchanged.access_token!, config.appId.trim())
      const token = await this.saveTokenPair(
        exchanged.access_token!,
        exchanged.refresh_token!,
        exchanged.expires_in!,
        exchanged.refresh_token_expires_in!,
      )
      await this.ensureState()
      await this.state.setAuth({
        status: 'connected',
        user: profile.user,
        installations: profile.installations,
        expiresAt: token.expiresAt,
        refreshTokenExpiresAt: Date.now() + exchanged.refresh_token_expires_in! * 1_000,
      })
      respondCallback(response, 200, 'connected')
    } catch {
      respondCallback(response, 400, 'error')
    }
  }

  async disconnect(): Promise<{ disconnected: true; remoteRevoked: boolean }> {
    const config = await readSettings(this.ctx)
    const accessToken = await readCredential(this.ctx, GITHUB_USER_ACCESS_TOKEN_REF)
    let remoteRevoked = false
    if (accessToken && brokerBaseUrl(config)) {
      try {
        const result = await this.brokerRequest(config, '/v1/github/oauth/revoke', { accessToken })
        remoteRevoked = result.remoteRevoked === true
      } catch {
        remoteRevoked = false
      }
    } else if (accessToken && config.clientId.trim() && config.clientSecretRef) {
      const clientSecret = await readCredential(this.ctx, config.clientSecretRef)
      if (clientSecret) {
      try {
        const basic = Buffer.from(`${config.clientId.trim()}:${clientSecret}`).toString('base64')
        const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(config.clientId.trim())}/grant`, {
          method: 'DELETE',
          headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            Authorization: `Basic ${basic}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ access_token: accessToken }),
        })
        remoteRevoked = response.status === 204
      } catch {
        remoteRevoked = false
      }
      }
    }
    await unsetCredential(this.ctx, GITHUB_USER_ACCESS_TOKEN_REF)
    await unsetCredential(this.ctx, GITHUB_USER_REFRESH_TOKEN_REF)
    this.userToken = undefined
    this.userTokenInvalid = false
    this.installationTokens.clear()
    this.pendingAuthorizations.clear()
    this.pendingBrokerAuthorization = undefined
    await this.ensureState()
    await this.state.clearAuth()
    return { disconnected: true, remoteRevoked }
  }
}

export function redactTokenMessage(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9_\-]+/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/(?:gh[opsur]|github_pat)[A-Za-z0-9_\-]+/gi, '[REDACTED_TOKEN]')
}
