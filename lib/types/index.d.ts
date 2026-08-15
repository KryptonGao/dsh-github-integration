import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { CommitInput, CreateBranchInput, CreatePullRequestInput, GitHubAppSettings, GitHubIssueDetail, GitHubPullRequestDetail, GitHubPullRequestFile, GitHubRepositoryBinding, GitHubSessionLink, WorkspaceGitHubState, ListIssuesInput, ListPullRequestsInput, PullRequestInput, IssueInput, PushInput, StageInput, GitStatus, GitDiff } from './types.ts';
export * from './types.ts';
export { parseGitHubRemote, safeBranchName, issueBranchName } from './git/remote.ts';
export { parseGitStatus, runGit, GitService } from './git/service.ts';
export { gitSafetyGuard } from './git/safety.ts';
export declare const GITHUB_SETTINGS_NAMESPACE: string;
export declare const GitHubSettingsSchema: z<GitHubAppSettings>;
/** Host-side GitHub integration Gateway. */
export declare class GitHubGateway extends TypertRemoteService {
    private readonly git;
    private readonly auth;
    private readonly github;
    private readonly state;
    constructor(ctx: Context);
    private ensureState;
    private bindingFor;
    private requireBinding;
    private requireRepository;
    private requireCapability;
    getWorkspaceState(input: {
        workspaceId: string;
    }, signal: AbortSignal): Promise<WorkspaceGitHubState>;
    setWorkspaceAuth(input: {
        workspaceId: string;
        authMode: 'user' | 'installation';
        installationId?: number;
    }, signal: AbortSignal): Promise<GitHubRepositoryBinding | null>;
    listIssues(input: ListIssuesInput, signal: AbortSignal): Promise<import("./types.ts").GitHubIssue[]>;
    getIssue(input: IssueInput, signal: AbortSignal): Promise<GitHubIssueDetail>;
    getIssueComments(input: IssueInput, signal: AbortSignal): Promise<import("./types.ts").GitHubComment[]>;
    listPullRequests(input: ListPullRequestsInput, signal: AbortSignal): Promise<import("./types.ts").GitHubPullRequest[]>;
    getPullRequest(input: PullRequestInput, signal: AbortSignal): Promise<GitHubPullRequestDetail>;
    getPullRequestFiles(input: PullRequestInput, signal: AbortSignal): Promise<GitHubPullRequestFile[]>;
    getGitStatus(input: {
        workspaceId: string;
    }, signal: AbortSignal): Promise<GitStatus>;
    getGitDiff(input: {
        workspaceId: string;
    }, signal: AbortSignal): Promise<GitDiff>;
    createBranch(input: CreateBranchInput, signal: AbortSignal): Promise<void>;
    stage(input: StageInput, signal: AbortSignal): Promise<void>;
    commit(input: CommitInput, signal: AbortSignal): Promise<{
        sha: string;
    }>;
    push(input: PushInput, signal: AbortSignal): Promise<void>;
    createPullRequest(input: CreatePullRequestInput, signal: AbortSignal): Promise<import("./types.ts").GitHubPullRequest>;
    linkSession(input: GitHubSessionLink, signal: AbortSignal): Promise<void>;
    getSessionLink(input: {
        sessionId: string;
    }): Promise<GitHubSessionLink | null>;
}
export default GitHubGateway;
//# sourceMappingURL=index.d.ts.map