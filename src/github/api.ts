import type {
  GitHubComment,
  GitHubIssue,
  GitHubIssueDetail,
  GitHubIssueState,
  GitHubPullRequest,
  GitHubPullRequestDetail,
  GitHubPullRequestFile,
  GitHubPullRequestState,
  GitHubRepositoryBinding,
  RepositoryView,
} from '../types.ts'
import { clampPositiveInt } from '../types.ts'
import { redactTokenMessage, GitHubAuthManager } from './auth.ts'

interface GitHubErrorBody {
  message?: string
  documentation_url?: string
}

function encodePath(value: string): string {
  return encodeURIComponent(value)
}

function query(params: Record<string, string | number | undefined>): string {
  const value = Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined)
  return value.length === 0 ? '' : `?${new URLSearchParams(value.map(([key, item]) => [key, String(item)]))}`
}

function dateValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function parseComment(value: unknown): GitHubComment {
  const item = value as Record<string, unknown>
  const user = (item.user ?? {}) as Record<string, unknown>
  return {
    id: numberValue(item.id),
    author: stringValue(user.login) || 'unknown',
    body: stringValue(item.body),
    createdAt: dateValue(item.created_at),
    updatedAt: dateValue(item.updated_at),
    htmlUrl: stringValue(item.html_url),
  }
}

function parseIssue(value: unknown): GitHubIssue {
  const item = value as Record<string, unknown>
  const user = (item.user ?? {}) as Record<string, unknown>
  const labels = Array.isArray(item.labels) ? item.labels.map((label) => stringValue((label as Record<string, unknown>).name)).filter(Boolean) : []
  return {
    number: numberValue(item.number),
    title: stringValue(item.title),
    body: typeof item.body === 'string' ? item.body : null,
    state: item.state === 'closed' ? 'closed' : 'open',
    author: stringValue(user.login) || 'unknown',
    ...(typeof user.avatar_url === 'string' ? { authorAvatarUrl: user.avatar_url } : {}),
    createdAt: dateValue(item.created_at),
    updatedAt: dateValue(item.updated_at),
    htmlUrl: stringValue(item.html_url),
    labels,
    commentCount: numberValue(item.comments),
  }
}

function parsePullRequest(value: unknown): GitHubPullRequest {
  const item = value as Record<string, unknown>
  const user = (item.user ?? {}) as Record<string, unknown>
  const head = (item.head ?? {}) as Record<string, unknown>
  const base = (item.base ?? {}) as Record<string, unknown>
  return {
    number: numberValue(item.number),
    title: stringValue(item.title),
    body: typeof item.body === 'string' ? item.body : null,
    state: item.state === 'closed' ? 'closed' : 'open',
    draft: item.draft === true,
    author: stringValue(user.login) || 'unknown',
    sourceBranch: stringValue(head.ref),
    baseBranch: stringValue(base.ref),
    createdAt: dateValue(item.created_at),
    updatedAt: dateValue(item.updated_at),
    htmlUrl: stringValue(item.html_url),
    changedFiles: numberValue(item.changed_files),
    additions: numberValue(item.additions),
    deletions: numberValue(item.deletions),
  }
}

function parseFile(value: unknown): GitHubPullRequestFile {
  const item = value as Record<string, unknown>
  return {
    filename: stringValue(item.filename),
    status: (['added', 'modified', 'removed', 'renamed', 'copied', 'changed', 'unchanged'] as const).includes(item.status as never)
      ? item.status as GitHubPullRequestFile['status']
      : 'modified',
    additions: numberValue(item.additions),
    deletions: numberValue(item.deletions),
    changes: numberValue(item.changes),
    ...(typeof item.patch === 'string' ? { patch: item.patch } : {}),
    ...(typeof item.previous_filename === 'string' ? { previousFilename: item.previous_filename } : {}),
  }
}

/** Minimal GitHub REST client. Tokens stay entirely inside this Host class. */
export class GitHubApiClient {
  constructor(
    private readonly auth: GitHubAuthManager,
  ) {}

  private async request<T>(
    binding: GitHubRepositoryBinding,
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const token = await this.auth.token(binding.authMode, binding.installationId)
    if (token === undefined) throw new Error('GitHub authentication is not configured')
    const headers = new Headers({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: `Bearer ${token.token}`,
    })
    if (init.headers !== undefined) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    }
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      ...(signal === undefined ? {} : { signal }),
      headers,
    })
    if (!response.ok) {
      let message = `GitHub API request failed: HTTP ${String(response.status)}`
      try {
        const body = await response.json() as GitHubErrorBody
        if (body.message) message += ` — ${body.message}`
        if (body.documentation_url) message += ` (${body.documentation_url})`
      } catch {
        // Keep the status-only diagnostic.
      }
      if (response.status === 401) message = 'GitHub authentication expired or is invalid'
      if (response.status === 403) message = 'GitHub permission denied or rate limited'
      throw new Error(redactTokenMessage(message))
    }
    if (response.status === 204) return undefined as T
    return await response.json() as T
  }

  async repository(binding: GitHubRepositoryBinding, signal?: AbortSignal): Promise<RepositoryView> {
    const body = await this.request<Record<string, unknown>>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}`, {}, signal)
    const permissions = (body.permissions ?? {}) as Record<string, unknown>
    return {
      owner: binding.owner,
      name: binding.repository,
      htmlUrl: stringValue(body.html_url),
      defaultBranch: stringValue(body.default_branch) || 'main',
      private: body.private === true,
      permissions: {
        metadata: body.permissions !== undefined,
        contentsRead: permissions.pull === true || permissions.push === true,
        contentsWrite: permissions.push === true,
        issuesRead: permissions.pull === true || permissions.triage === true || permissions.push === true,
        issuesWrite: permissions.push === true || permissions.maintain === true,
        pullRequestsRead: permissions.pull === true || permissions.push === true,
        pullRequestsWrite: permissions.push === true,
      },
    }
  }

  async issues(binding: GitHubRepositoryBinding, state: GitHubIssueState = 'open', page = 1, perPage = 30, signal?: AbortSignal): Promise<GitHubIssue[]> {
    const response = await this.request<unknown[]>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}/issues${query({ state, page: clampPositiveInt(page, 1, 100), per_page: clampPositiveInt(perPage, 30, 100) })}`, {}, signal)
    return response.filter((item) => !(item as Record<string, unknown>).pull_request).map(parseIssue)
  }

  async issue(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubIssueDetail> {
    const [issue, comments] = await Promise.all([
      this.request<unknown>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}/issues/${String(number)}`, {}, signal),
      this.comments(binding, number, signal),
    ])
    return { ...parseIssue(issue), comments }
  }

  async comments(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubComment[]> {
    const response = await this.request<unknown[]>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}/issues/${String(number)}/comments${query({ per_page: 100 })}`, {}, signal)
    return response.map(parseComment)
  }

  async pullRequests(binding: GitHubRepositoryBinding, state: GitHubPullRequestState = 'open', page = 1, perPage = 30, signal?: AbortSignal): Promise<GitHubPullRequest[]> {
    const response = await this.request<unknown[]>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}/pulls${query({ state, page: clampPositiveInt(page, 1, 100), per_page: clampPositiveInt(perPage, 30, 100) })}`, {}, signal)
    return response.map(parsePullRequest)
  }

  async pullRequest(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubPullRequestDetail> {
    const [pullRequest, comments] = await Promise.all([
      this.request<unknown>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}/pulls/${String(number)}`, {}, signal),
      this.comments(binding, number, signal),
    ])
    return { ...parsePullRequest(pullRequest), comments }
  }

  async pullRequestFiles(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubPullRequestFile[]> {
    const response = await this.request<unknown[]>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}/pulls/${String(number)}/files${query({ per_page: 100 })}`, {}, signal)
    return response.map(parseFile)
  }

  async createPullRequest(
    binding: GitHubRepositoryBinding,
    input: { title: string; body: string; base: string; head: string; draft?: boolean },
    signal?: AbortSignal,
  ): Promise<GitHubPullRequest> {
    const body = await this.request<unknown>(binding, `/repos/${encodePath(binding.owner)}/${encodePath(binding.repository)}/pulls`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }, signal)
    return parsePullRequest(body)
  }
}
