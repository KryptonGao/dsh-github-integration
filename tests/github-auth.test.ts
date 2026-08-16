import { describe, expect, it, vi } from 'vitest'
import { createPkceChallenge, GitHubAuthManager } from '../src/github/auth.ts'
import type { GitHubAppSettings } from '../src/types.ts'
import type { StoredAuthState } from '../src/github/storage.ts'

const settings: GitHubAppSettings = {
  appId: '123',
  clientId: 'Iv1.client',
  appSlug: 'harness-app',
  redirectUri: 'http://127.0.0.1:43123/github/oauth/callback',
  brokerUrl: '',
  clientSecretRef: 'GITHUB_APP_CLIENT_SECRET',
  privateKeyRef: 'GITHUB_APP_PRIVATE_KEY',
}

class MemoryState {
  value: StoredAuthState = { status: 'disconnected', installations: [] }

  async load(): Promise<void> {}

  auth(): StoredAuthState {
    return structuredClone(this.value)
  }

  async setAuth(value: StoredAuthState): Promise<void> {
    this.value = structuredClone(value)
  }

  async clearAuth(): Promise<void> {
    this.value = { status: 'disconnected', installations: [] }
  }
}

function createHarness(state: MemoryState, configuredSettings: GitHubAppSettings = settings) {
  const values = new Map<string, string>([['GITHUB_APP_CLIENT_SECRET', 'client-secret']])
  const routes: Array<{ handler: (request: any, response: any) => Promise<void> | void }> = []
  const ctx = {
    get(name: string) {
      if (name === 'settings') return { get: () => configuredSettings }
      if (name === 'credentials') return {
        resolve: async (ref: string) => values.has(ref) ? { value: values.get(ref), source: 'test' } : undefined,
        set: async (ref: string, value: string) => { values.set(ref, value) },
        unset: async (ref: string) => { values.delete(ref) },
      }
      return undefined
    },
    inject(_dependencies: readonly string[], callback: (value: any) => void) {
      callback({ webServer: { register: (route: { handler: (request: any, response: any) => Promise<void> | void }) => { routes.push(route); return () => undefined } } })
    },
  }
  return { auth: new GitHubAuthManager(ctx as never, state as never), values, routes }
}

function responseFor(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
}

describe('GitHub App user authorization', () => {
  it('creates a PKCE S256 challenge', () => {
    expect(createPkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })

  it('exchanges the authorization code on the Host and persists only credentials', async () => {
    const state = new MemoryState()
    const { auth, values, routes } = createHarness(state)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === 'https://github.com/login/oauth/access_token') {
        return responseFor({ access_token: 'ghu_access', refresh_token: 'ghr_refresh', expires_in: 28800, refresh_token_expires_in: 15897600 })
      }
      if (url === 'https://api.github.com/user') {
        return responseFor({ id: 7, login: 'octocat', avatar_url: 'https://github.com/images/octocat.png', html_url: 'https://github.com/octocat' })
      }
      return responseFor({ installations: [{ id: 9, app_id: 123, account: { login: 'octo-org', avatar_url: 'https://github.com/images/org.png' }, html_url: 'https://github.com/organizations/octo-org/settings/installations/9', repository_selection: 'selected' }] })
    })
    try {
      const started = await auth.beginUserAuthorization()
      const authorizationUrl = new URL(started.authorizationUrl)
      expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256')
      expect(authorizationUrl.searchParams.get('state')).toBeTruthy()
      expect(authorizationUrl.searchParams.get('code_challenge')).toHaveLength(43)

      const response = {
        writeHead: vi.fn(),
        end: vi.fn(),
      }
      await routes[0]?.handler({ url: `/github/oauth/callback?code=temporary&state=${authorizationUrl.searchParams.get('state')}` }, response)
      expect(response.writeHead).toHaveBeenCalledWith(200, expect.any(Object))
      expect(values.get('GITHUB_APP_USER_TOKEN')).toBe('ghu_access')
      expect(values.get('GITHUB_APP_USER_REFRESH_TOKEN')).toBe('ghr_refresh')
      expect(JSON.stringify(state.value)).not.toContain('ghu_access')
      expect(JSON.stringify(state.value)).not.toContain('ghr_refresh')
      expect(state.value.user?.login).toBe('octocat')
      expect(state.value.installations[0]?.htmlUrl).toContain('/installations/9')
      expect(String(fetchMock.mock.calls[0]?.[1] && (fetchMock.mock.calls[0]?.[1] as RequestInit).body)).toContain('code_verifier=')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('rejects a callback with an unknown state without exchanging the code', async () => {
    const state = new MemoryState()
    const { auth, routes } = createHarness(state)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not fetch'))
    try {
      await auth.beginUserAuthorization()
      const response = { writeHead: vi.fn(), end: vi.fn() }
      await routes[0]?.handler({ url: '/github/oauth/callback?code=temporary&state=wrong' }, response)
      expect(response.writeHead).toHaveBeenCalledWith(400, expect.any(Object))
      expect(fetchMock).not.toHaveBeenCalled()
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('rotates the refresh token when the access token expires', async () => {
    const state = new MemoryState()
    state.value = {
      status: 'connected',
      installations: [],
      expiresAt: Date.now() - 1,
      refreshTokenExpiresAt: Date.now() + 60_000,
      user: { id: 7, login: 'octocat', avatarUrl: 'https://github.com/images/octocat.png', htmlUrl: 'https://github.com/octocat' },
    }
    const { auth, values } = createHarness(state)
    values.set('GITHUB_APP_USER_TOKEN', 'ghu_old')
    values.set('GITHUB_APP_USER_REFRESH_TOKEN', 'ghr_old')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(responseFor({ access_token: 'ghu_new', refresh_token: 'ghr_new', expires_in: 28800, refresh_token_expires_in: 15897600 }))
    try {
      const token = await auth.token('user')
      expect(token?.token).toBe('ghu_new')
      expect(values.get('GITHUB_APP_USER_TOKEN')).toBe('ghu_new')
      expect(values.get('GITHUB_APP_USER_REFRESH_TOKEN')).toBe('ghr_new')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('uses the public OAuth Broker without sending a Client Secret to the client flow', async () => {
    const state = new MemoryState()
    const brokerSettings = { ...settings, brokerUrl: 'https://oauth.example.test' }
    const { auth, values } = createHarness(state, brokerSettings)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input)
      if (url.endsWith('/v1/github/oauth/start')) {
        return responseFor({ flowId: 'flow-1', flowSecret: 'flow-secret', authorizationUrl: 'https://github.com/login/oauth/authorize?state=flow-1' })
      }
      if (url.endsWith('/v1/github/oauth/poll')) return responseFor({ status: 'succeeded' })
      if (url.endsWith('/v1/github/oauth/redeem')) {
        expect(JSON.parse(String(init?.body))).toEqual({ flowId: 'flow-1', flowSecret: 'flow-secret' })
        return responseFor({ result: {
          accessToken: 'ghu_broker_access',
          refreshToken: 'ghr_broker_refresh',
          expiresIn: 28800,
          refreshTokenExpiresIn: 15897600,
          user: { id: 7, login: 'octocat', avatarUrl: 'https://github.com/images/octocat.png', htmlUrl: 'https://github.com/octocat' },
          installations: [],
        } })
      }
      throw new Error(`unexpected request ${url}`)
    })
    try {
      const started = await auth.beginUserAuthorization()
      expect(started.authorizationUrl).toContain('github.com/login/oauth/authorize')
      const connected = await auth.authState()
      expect(connected.status).toBe('connected')
      expect(connected.user?.login).toBe('octocat')
      expect(values.get('GITHUB_APP_USER_TOKEN')).toBe('ghu_broker_access')
      expect(values.get('GITHUB_APP_USER_REFRESH_TOKEN')).toBe('ghr_broker_refresh')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('clears local credentials even when GitHub revoke cannot be completed', async () => {
    const state = new MemoryState()
    const { auth, values } = createHarness(state)
    values.set('GITHUB_APP_USER_TOKEN', 'ghu_access')
    values.set('GITHUB_APP_USER_REFRESH_TOKEN', 'ghr_refresh')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network unavailable'))
    try {
      const result = await auth.disconnect()
      expect(result).toEqual({ disconnected: true, remoteRevoked: false })
      expect(values.has('GITHUB_APP_USER_TOKEN')).toBe(false)
      expect(values.has('GITHUB_APP_USER_REFRESH_TOKEN')).toBe(false)
      expect(state.value.status).toBe('disconnected')
    } finally {
      fetchMock.mockRestore()
    }
  })
})
