import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type {
  CommitInput,
  CreateBranchInput,
  CreatePullRequestInput,
  GitHubAppSettings,
  GitHubBranch,
  GitHubAuthState,
  GitHubCapabilities,
  GitHubIssueDetail,
  GitHubPullRequestDetail,
  GitHubPullRequestFile,
  GitHubRepositoryBinding,
  GitHubSessionLink,
  WorkspaceGitHubState,
  ListIssuesInput,
  ListBranchesInput,
  ListPullRequestsInput,
  PullRequestInput,
  IssueInput,
  PushInput,
  RepositoryView,
  StageInput,
  GitStatus,
  GitDiff,
} from './types.ts'
import { DEFAULT_GITHUB_APP_SETTINGS } from './types.ts'
import { GitService } from './git/service.ts'
import { safeBranchName } from './git/remote.ts'
import { gitSafetyGuard } from './git/safety.ts'
import { GitHubApiClient } from './github/api.ts'
import { GitHubAuthManager, redactTokenMessage } from './github/auth.ts'
import { GitHubStateStore } from './github/storage.ts'

export * from './types.ts'
export { parseGitHubRemote, safeBranchName, issueBranchName } from './git/remote.ts'
export { parseGitStatus, runGit, GitService } from './git/service.ts'
export { gitSafetyGuard } from './git/safety.ts'

export const GITHUB_SETTINGS_NAMESPACE = settingsNamespace('github-integration')

export const GitHubSettingsSchema: z<GitHubAppSettings> = z.object({
  appId: z.string().default(''),
  clientId: z.string().default(''),
  appSlug: z.string().default(''),
  redirectUri: z.string().default(''),
  brokerUrl: z.string().default(DEFAULT_GITHUB_APP_SETTINGS.brokerUrl ?? ''),
  clientSecretRef: z.string().default(DEFAULT_GITHUB_APP_SETTINGS.clientSecretRef),
  privateKeyRef: z.string().default(DEFAULT_GITHUB_APP_SETTINGS.privateKeyRef),
})

interface ResolvedBinding {
  binding: GitHubRepositoryBinding
  repository: RepositoryView
}

function emptyCapabilities(mode: GitHubRepositoryBinding['authMode'] = 'user'): GitHubCapabilities {
  return {
    canReadRepository: false,
    canReadIssues: false,
    canWriteIssues: false,
    canReadPullRequests: false,
    canWritePullRequests: false,
    canReadContents: false,
    canWriteContents: false,
    canCommit: false,
    canPush: false,
    authMode: mode,
  }
}

function capabilities(repository: RepositoryView, mode: GitHubRepositoryBinding['authMode']): GitHubCapabilities {
  return {
    canReadRepository: true,
    canReadIssues: repository.permissions.issuesRead,
    canWriteIssues: repository.permissions.issuesWrite,
    canReadPullRequests: repository.permissions.pullRequestsRead,
    canWritePullRequests: repository.permissions.pullRequestsWrite,
    canReadContents: repository.permissions.contentsRead,
    canWriteContents: repository.permissions.contentsWrite,
    canCommit: repository.permissions.contentsWrite,
    canPush: repository.permissions.contentsWrite,
    authMode: mode,
  }
}

function requireWorkspaceId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
    throw new Error('workspaceId is required')
  }
  return value
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`)
  }
  return value
}

function requireText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be text`)
  const normalized = value.trim()
  if (normalized.length === 0) throw new Error(`${label} is required`)
  if (normalized.length > maxLength) throw new Error(`${label} is too long`)
  return normalized
}

function requireFiles(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500 || value.some(item => typeof item !== 'string' || item.length === 0 || item.length > 4_096)) {
    throw new Error('files must contain between 1 and 500 paths')
  }
  return [...new Set(value.map(item => item as string))]
}

/** Host-side GitHub integration Gateway. */
export class GitHubGateway extends TypertRemoteService {
  private readonly git: GitService
  private readonly state = new GitHubStateStore()
  private readonly auth: GitHubAuthManager
  private readonly github: GitHubApiClient

  constructor(ctx: Context) {
    super(ctx, 'github')
    this.git = new GitService(ctx)
    this.auth = new GitHubAuthManager(ctx, this.state)
    this.github = new GitHubApiClient(this.auth)
    ctx.inject(['tools'], (toolsCtx) => {
      toolsCtx.tools.guard(gitSafetyGuard)
    })
    ctx.inject(['settings'], (settingsCtx) => {
      settingsCtx.settings.register(GITHUB_SETTINGS_NAMESPACE, GitHubSettingsSchema, {
        base: DEFAULT_GITHUB_APP_SETTINGS,
      })
    })
  }

  private async ensureState(): Promise<void> {
    await this.state.load()
  }

  private async bindingFor(workspaceId: string, signal: AbortSignal): Promise<GitHubRepositoryBinding | null> {
    await this.ensureState()
    let detected: GitHubRepositoryBinding | null
    try {
      detected = await this.git.detectRepository(workspaceId, signal)
    } catch {
      detected = null
    }
    if (detected === null) return null
    const override = this.state.binding(workspaceId)
    return {
      ...detected,
      // Repository authentication is explicit and workspace-scoped. The
      // settings namespace stores App credentials only; it never silently
      // changes an existing repository's auth mode.
      authMode: override?.authMode ?? 'user',
      ...(override?.installationId === undefined ? {} : { installationId: override.installationId }),
    }
  }

  private async requireBinding(workspaceId: string, signal: AbortSignal): Promise<GitHubRepositoryBinding> {
    const binding = await this.bindingFor(workspaceId, signal)
    if (binding === null) throw new Error('Workspace is not bound to a supported GitHub origin')
    return binding
  }

  private async requireRepository(workspaceId: string, signal: AbortSignal): Promise<ResolvedBinding> {
    const binding = await this.requireBinding(workspaceId, signal)
    const repository = await this.github.repository(binding, signal)
    return { binding, repository }
  }

  private async requireCapability(workspaceId: string, capability: keyof GitHubCapabilities, signal: AbortSignal): Promise<ResolvedBinding> {
    const resolved = await this.requireRepository(workspaceId, signal)
    const available = capabilities(resolved.repository, resolved.binding.authMode)[capability]
    if (available !== true) throw new Error(`GitHub capability denied: ${capability}`)
    return resolved
  }

  @Remote
  async beginUserAuthorization(_input: Record<string, never>, signal: AbortSignal): Promise<{ authorizationUrl: string }> {
    signal.throwIfAborted()
    return this.auth.beginUserAuthorization()
  }

  @Remote
  async getAuthState(_input: Record<string, never>, signal: AbortSignal): Promise<GitHubAuthState> {
    signal.throwIfAborted()
    return this.auth.authState()
  }

  @Remote
  async disconnect(_input: Record<string, never>, signal: AbortSignal): Promise<{ disconnected: true; remoteRevoked: boolean }> {
    signal.throwIfAborted()
    return this.auth.disconnect()
  }

  @Remote
  async getWorkspaceState(input: { workspaceId: string }, signal: AbortSignal): Promise<WorkspaceGitHubState> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    let status: GitStatus
    try {
      status = await this.git.status(workspaceId, signal)
    } catch {
      status = { branch: '(unknown)', entries: [], clean: true, ahead: 0, behind: 0 }
    }
    const binding = await this.bindingFor(workspaceId, signal)
    if (binding === null) {
      return {
        workspaceId,
        bound: false,
        currentBranch: status.branch,
        changeCount: status.entries.length,
        authenticated: false,
        capabilities: emptyCapabilities(),
      }
    }
    try {
      const token = await this.auth.token(binding.authMode, binding.installationId)
      if (token === undefined) {
        return {
          workspaceId,
          bound: true,
          binding,
          currentBranch: status.branch,
          changeCount: status.entries.length,
          authenticated: false,
          authError: 'GitHub App credentials are not configured',
          capabilities: emptyCapabilities(binding.authMode),
        }
      }
      const repository = await this.github.repository(binding, signal)
      return {
        workspaceId,
        bound: true,
        binding,
        repository,
        currentBranch: status.branch,
        changeCount: status.entries.length,
        authenticated: true,
        authSource: token.source,
        capabilities: capabilities(repository, binding.authMode),
      }
    } catch (error: unknown) {
      return {
        workspaceId: input.workspaceId,
        bound: true,
        binding,
        currentBranch: status.branch,
        changeCount: status.entries.length,
        authenticated: false,
        authError: redactTokenMessage(error instanceof Error ? error.message : String(error)),
        capabilities: emptyCapabilities(binding.authMode),
      }
    }
  }

  @Remote
  async setWorkspaceAuth(input: { workspaceId: string; authMode: 'user' | 'installation'; installationId?: number }, signal: AbortSignal): Promise<GitHubRepositoryBinding | null> {
    signal.throwIfAborted()
    const workspaceId = requireWorkspaceId(input.workspaceId)
    if (input.authMode !== 'user' && input.authMode !== 'installation') throw new Error('unsupported GitHub authentication mode')
    const binding = await this.requireBinding(workspaceId, signal)
    if (input.authMode === 'installation' && (!Number.isSafeInteger(input.installationId) || input.installationId! < 1)) {
      throw new Error('installationId is required for installation authentication')
    }
    const stored = input.authMode === 'installation'
      ? { authMode: input.authMode, installationId: input.installationId! }
      : { authMode: input.authMode }
    await this.ensureState()
    await this.state.setBinding(workspaceId, stored)
    return {
      ...binding,
      authMode: input.authMode,
      ...(input.authMode === 'installation' ? { installationId: input.installationId! } : {}),
    }
  }

  @Remote
  async listIssues(input: ListIssuesInput, signal: AbortSignal) {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const { binding } = await this.requireCapability(workspaceId, 'canReadIssues', signal)
    return this.github.issues(binding, input.state ?? 'open', input.page ?? 1, input.perPage ?? 30, signal)
  }

  @Remote
  async getIssue(input: IssueInput, signal: AbortSignal): Promise<GitHubIssueDetail> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const number = requirePositiveInteger(input.number, 'issue number')
    const { binding } = await this.requireCapability(workspaceId, 'canReadIssues', signal)
    return this.github.issue(binding, number, signal)
  }

  @Remote
  async getIssueComments(input: IssueInput, signal: AbortSignal) {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const number = requirePositiveInteger(input.number, 'issue number')
    const { binding } = await this.requireCapability(workspaceId, 'canReadIssues', signal)
    return this.github.comments(binding, number, signal)
  }

  @Remote
  async listPullRequests(input: ListPullRequestsInput, signal: AbortSignal) {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const { binding } = await this.requireCapability(workspaceId, 'canReadPullRequests', signal)
    return this.github.pullRequests(binding, input.state ?? 'open', input.page ?? 1, input.perPage ?? 30, signal)
  }

  @Remote
  async listBranches(input: ListBranchesInput, signal: AbortSignal): Promise<GitHubBranch[]> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const { binding } = await this.requireCapability(workspaceId, 'canReadRepository', signal)
    return this.github.branches(binding, input.page ?? 1, input.perPage ?? 100, signal)
  }

  @Remote
  async getPullRequest(input: PullRequestInput, signal: AbortSignal): Promise<GitHubPullRequestDetail> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const number = requirePositiveInteger(input.number, 'pull request number')
    const { binding } = await this.requireCapability(workspaceId, 'canReadPullRequests', signal)
    return this.github.pullRequest(binding, number, signal)
  }

  @Remote
  async getPullRequestFiles(input: PullRequestInput, signal: AbortSignal): Promise<GitHubPullRequestFile[]> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const number = requirePositiveInteger(input.number, 'pull request number')
    const { binding } = await this.requireCapability(workspaceId, 'canReadPullRequests', signal)
    return this.github.pullRequestFiles(binding, number, signal)
  }

  @Remote
  async getGitStatus(input: { workspaceId: string }, signal: AbortSignal): Promise<GitStatus> {
    return this.git.status(requireWorkspaceId(input.workspaceId), signal)
  }

  @Remote
  async getGitDiff(input: { workspaceId: string }, signal: AbortSignal): Promise<GitDiff> {
    return this.git.diff(requireWorkspaceId(input.workspaceId), signal)
  }

  @Remote
  async createBranch(input: CreateBranchInput, signal: AbortSignal): Promise<void> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const name = requireText(input.name, 'branch name', 200)
    await this.requireCapability(workspaceId, 'canWriteContents', signal)
    await this.git.createBranch(workspaceId, name, signal)
  }

  @Remote
  async stage(input: StageInput, signal: AbortSignal): Promise<void> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const files = requireFiles(input.files)
    await this.requireCapability(workspaceId, 'canWriteContents', signal)
    await this.git.stage(workspaceId, files, signal)
  }

  @Remote
  async commit(input: CommitInput, signal: AbortSignal): Promise<{ sha: string }> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const message = requireText(input.message, 'commit message', 200)
    await this.requireCapability(workspaceId, 'canWriteContents', signal)
    return { sha: await this.git.commit(workspaceId, message, signal) }
  }

  @Remote
  async push(input: PushInput, signal: AbortSignal): Promise<void> {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const branch = requireText(input.branch, 'branch name', 200)
    await this.requireCapability(workspaceId, 'canPush', signal)
    await this.git.push(workspaceId, safeBranchName(branch), signal)
  }

  @Remote
  async createPullRequest(input: CreatePullRequestInput, signal: AbortSignal) {
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const title = requireText(input.title, 'pull request title', 256)
    if (typeof input.body !== 'string' || input.body.length > 100_000) throw new Error('pull request body is invalid')
    const base = requireText(input.base, 'pull request base branch', 200)
    const head = requireText(input.head, 'pull request head branch', 200)
    const { binding } = await this.requireCapability(workspaceId, 'canWritePullRequests', signal)
    const status = await this.git.status(workspaceId, signal)
    if (!status.clean) throw new Error('Working tree must be clean before creating a pull request')
    if (base === head) throw new Error('Pull request base and head must differ')
    const pullRequestInput = {
      title,
      body: input.body,
      base: safeBranchName(base),
      head: safeBranchName(head),
      ...(input.draft === undefined ? {} : { draft: input.draft }),
    }
    const pullRequest = await this.github.createPullRequest(binding, pullRequestInput, signal)
    await this.ensureState()
    return pullRequest
  }

  @Remote
  async linkSession(input: GitHubSessionLink, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    const workspaceId = requireWorkspaceId(input.workspaceId)
    const sessionId = requireText(input.sessionId, 'sessionId', 512)
    const owner = requireText(input.repository?.owner, 'repository owner', 256)
    const name = requireText(input.repository?.name, 'repository name', 256)
    const binding = await this.requireBinding(workspaceId, signal)
    if (binding.owner !== owner || binding.repository !== name) {
      throw new Error('Session link repository does not match Workspace origin')
    }
    const issueNumber = input.issueNumber === undefined ? undefined : requirePositiveInteger(input.issueNumber, 'issue number')
    const pullRequestNumber = input.pullRequestNumber === undefined ? undefined : requirePositiveInteger(input.pullRequestNumber, 'pull request number')
    await this.ensureState()
    await this.state.setSession({
      sessionId,
      workspaceId,
      repository: { owner, name },
      ...(issueNumber === undefined ? {} : { issueNumber }),
      ...(pullRequestNumber === undefined ? {} : { pullRequestNumber }),
    })
  }

  @Remote
  async getSessionLink(input: { sessionId: string }): Promise<GitHubSessionLink | null> {
    const sessionId = requireText(input.sessionId, 'sessionId', 512)
    await this.ensureState()
    return this.state.session(sessionId) ?? null
  }
}

export default GitHubGateway
