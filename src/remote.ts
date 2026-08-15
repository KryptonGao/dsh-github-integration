import type {
  RemoteResult,
  TypertRemoteContribution,
} from '@deepseek-ai/dsh-typert-protocol'
import type {
  CommitInput,
  CreateBranchInput,
  CreatePullRequestInput,
  GitDiff,
  GitHubIssueDetail,
  GitHubPullRequestDetail,
  GitHubPullRequestFile,
  GitHubRepositoryBinding,
  GitHubSessionLink,
  WorkspaceGitHubState,
  GitStatus,
  IssueInput,
  ListIssuesInput,
  ListPullRequestsInput,
  PullRequestInput,
  PushInput,
  StageInput,
} from './types.ts'
import { z } from 'zod'

const JSON_VALUE = z.json()
const JSON_RESULT = z.union([z.json(), z.undefined()])

export interface GitHubRemoteNamespace {
  getWorkspaceState(input: { workspaceId: string }, signal?: AbortSignal): Promise<RemoteResult<WorkspaceGitHubState>>
  setWorkspaceAuth(input: { workspaceId: string; authMode: 'user' | 'installation'; installationId?: number }, signal?: AbortSignal): Promise<RemoteResult<GitHubRepositoryBinding | null>>
  listIssues(input: ListIssuesInput, signal?: AbortSignal): Promise<RemoteResult<import('./types.ts').GitHubIssue[]>>
  getIssue(input: IssueInput, signal?: AbortSignal): Promise<RemoteResult<GitHubIssueDetail>>
  getIssueComments(input: IssueInput, signal?: AbortSignal): Promise<RemoteResult<import('./types.ts').GitHubComment[]>>
  listPullRequests(input: ListPullRequestsInput, signal?: AbortSignal): Promise<RemoteResult<import('./types.ts').GitHubPullRequest[]>>
  getPullRequest(input: PullRequestInput, signal?: AbortSignal): Promise<RemoteResult<GitHubPullRequestDetail>>
  getPullRequestFiles(input: PullRequestInput, signal?: AbortSignal): Promise<RemoteResult<GitHubPullRequestFile[]>>
  getGitStatus(input: { workspaceId: string }, signal?: AbortSignal): Promise<RemoteResult<GitStatus>>
  getGitDiff(input: { workspaceId: string }, signal?: AbortSignal): Promise<RemoteResult<GitDiff>>
  createBranch(input: CreateBranchInput, signal?: AbortSignal): Promise<RemoteResult<void>>
  stage(input: StageInput, signal?: AbortSignal): Promise<RemoteResult<void>>
  commit(input: CommitInput, signal?: AbortSignal): Promise<RemoteResult<{ sha: string }>>
  push(input: PushInput, signal?: AbortSignal): Promise<RemoteResult<void>>
  createPullRequest(input: CreatePullRequestInput, signal?: AbortSignal): Promise<RemoteResult<import('./types.ts').GitHubPullRequest>>
  linkSession(input: GitHubSessionLink, signal?: AbortSignal): Promise<RemoteResult<void>>
  getSessionLink(input: { sessionId: string }, signal?: AbortSignal): Promise<RemoteResult<GitHubSessionLink | null>>
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface TypertRemoteMap {
    'github/getWorkspaceState': GitHubRemoteNamespace['getWorkspaceState']
    'github/setWorkspaceAuth': GitHubRemoteNamespace['setWorkspaceAuth']
    'github/listIssues': GitHubRemoteNamespace['listIssues']
    'github/getIssue': GitHubRemoteNamespace['getIssue']
    'github/getIssueComments': GitHubRemoteNamespace['getIssueComments']
    'github/listPullRequests': GitHubRemoteNamespace['listPullRequests']
    'github/getPullRequest': GitHubRemoteNamespace['getPullRequest']
    'github/getPullRequestFiles': GitHubRemoteNamespace['getPullRequestFiles']
    'github/getGitStatus': GitHubRemoteNamespace['getGitStatus']
    'github/getGitDiff': GitHubRemoteNamespace['getGitDiff']
    'github/createBranch': GitHubRemoteNamespace['createBranch']
    'github/stage': GitHubRemoteNamespace['stage']
    'github/commit': GitHubRemoteNamespace['commit']
    'github/push': GitHubRemoteNamespace['push']
    'github/createPullRequest': GitHubRemoteNamespace['createPullRequest']
    'github/linkSession': GitHubRemoteNamespace['linkSession']
    'github/getSessionLink': GitHubRemoteNamespace['getSessionLink']
  }
  interface TypertRemoteNamespaceMap {
    github: GitHubRemoteNamespace
  }
}

function descriptor(method: string, hasSignal = true) {
  return {
    id: `dsh-github-integration#github/${method}`,
    service: 'github',
    namespace: 'github',
    method,
    invocation: { kind: 'direct' as const },
    parameters: [{
      name: 'input',
      wire: 'input',
      source: 'json' as const,
      codec: { mode: 'strict' as const, typeSymbol: 'dsh-github-integration#JsonValue', schema: JSON_VALUE },
    }],
    ...(hasSignal ? { cancellation: { parameter: 'signal' as const } } : {}),
    result: { mode: 'strict' as const, typeSymbol: 'dsh-github-integration#JsonResult', schema: JSON_RESULT },
  }
}

export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: 'dsh-github-integration',
  descriptors: [
    descriptor('getWorkspaceState'),
    descriptor('setWorkspaceAuth'),
    descriptor('listIssues'),
    descriptor('getIssue'),
    descriptor('getIssueComments'),
    descriptor('listPullRequests'),
    descriptor('getPullRequest'),
    descriptor('getPullRequestFiles'),
    descriptor('getGitStatus'),
    descriptor('getGitDiff'),
    descriptor('createBranch'),
    descriptor('stage'),
    descriptor('commit'),
    descriptor('push'),
    descriptor('createPullRequest'),
    descriptor('linkSession'),
    descriptor('getSessionLink', false),
  ],
}

export default TYPERT_REMOTE
