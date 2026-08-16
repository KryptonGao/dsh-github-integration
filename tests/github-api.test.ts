import { describe, expect, it, vi } from 'vitest'
import { GitHubApiClient } from '../src/github/api.ts'
import { GitHubAuthManager } from '../src/github/auth.ts'
import type { GitHubRepositoryBinding } from '../src/types.ts'

const binding: GitHubRepositoryBinding = {
  provider: 'github',
  owner: 'acme',
  repository: 'widget',
  remoteName: 'upstream',
  remoteUrl: 'https://github.com/acme/widget.git',
  authMode: 'user',
}

function authWithToken(): GitHubAuthManager {
  const ctx = {
    get(name: string) {
      if (name === 'settings') return { get: () => ({}) }
      if (name === 'credentials') return { resolve: async () => ({ value: 'ghp_test_token', source: 'test' }) }
      return undefined
    },
  }
  return new GitHubAuthManager(ctx as never)
}

describe('GitHub API gateway boundaries', () => {
  it('clamps pagination and filters pull-request entries from issues', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { number: 1, title: 'Issue', state: 'open', user: { login: 'alice' }, labels: [], comments: 0 },
      { number: 2, title: 'PR', state: 'open', pull_request: {}, user: { login: 'bob' }, labels: [], comments: 0 },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }))
    try {
      const issues = await new GitHubApiClient(authWithToken()).issues(binding, 'open', 3, 999)
      expect(issues).toHaveLength(1)
      expect(issues[0]?.number).toBe(1)
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('page=3')
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('per_page=100')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('maps permission errors without returning token material', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ message: 'permission denied' }), { status: 403 }))
    try {
      await expect(new GitHubApiClient(authWithToken()).repository(binding)).rejects.toThrow('GitHub permission denied or rate limited')
      await expect(new GitHubApiClient(authWithToken()).repository(binding)).rejects.not.toThrow('ghp_test_token')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('lists repository branches for the pull-request base selector', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { name: 'main', protected: true },
      { name: 'feature/preview', protected: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }))
    try {
      const branches = await new GitHubApiClient(authWithToken()).branches(binding)
      expect(branches).toEqual([
        { name: 'main', protected: true },
        { name: 'feature/preview', protected: false },
      ])
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/repos/acme/widget/branches')
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('per_page=100')
    } finally {
      fetchMock.mockRestore()
    }
  })

  it('caches a configured user token for repeated requests', async () => {
    const auth = authWithToken()
    const first = await auth.token('user')
    const second = await auth.token('user')
    expect(first).toBeDefined()
    expect(second).toBe(first)
  })
})
