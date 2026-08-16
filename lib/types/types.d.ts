/** JSON-safe contracts shared by the Host Gateway and browser bundle. */
export type GitHubAuthMode = 'user' | 'installation';
export type GitHubIssueState = 'open' | 'closed' | 'all';
export type GitHubPullRequestState = 'open' | 'closed' | 'all';
export interface GitHubRepositoryBinding {
    provider: 'github';
    owner: string;
    repository: string;
    remoteName: 'origin';
    remoteUrl: string;
    authMode: GitHubAuthMode;
    installationId?: number;
}
export interface RepositoryView {
    owner: string;
    name: string;
    htmlUrl: string;
    defaultBranch: string;
    private: boolean;
    permissions: {
        metadata: boolean;
        contentsRead: boolean;
        contentsWrite: boolean;
        issuesRead: boolean;
        issuesWrite: boolean;
        pullRequestsRead: boolean;
        pullRequestsWrite: boolean;
    };
}
export interface GitHubIssue {
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    author: string;
    authorAvatarUrl?: string;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
    labels: string[];
    commentCount: number;
}
export interface GitHubComment {
    id: number;
    author: string;
    body: string;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
}
export interface GitHubIssueDetail extends GitHubIssue {
    comments: GitHubComment[];
}
export interface GitHubPullRequest {
    number: number;
    title: string;
    body: string | null;
    state: 'open' | 'closed';
    draft: boolean;
    author: string;
    sourceBranch: string;
    baseBranch: string;
    createdAt: string;
    updatedAt: string;
    htmlUrl: string;
    changedFiles: number;
    additions: number;
    deletions: number;
}
export interface GitHubPullRequestFile {
    filename: string;
    status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
    previousFilename?: string;
}
export interface GitHubBranch {
    name: string;
    protected: boolean;
}
export interface GitHubPullRequestDetail extends GitHubPullRequest {
    comments: GitHubComment[];
}
export interface GitStatusEntry {
    path: string;
    index: string;
    worktree: string;
    status: 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'unknown';
    oldPath?: string;
}
export interface GitStatus {
    branch: string;
    upstream?: string;
    ahead: number;
    behind: number;
    entries: GitStatusEntry[];
    clean: boolean;
}
export interface GitDiff {
    unstaged: string;
    staged: string;
    head: string;
    truncated: boolean;
}
export interface GitHubCapabilities {
    canReadRepository: boolean;
    canReadIssues: boolean;
    canWriteIssues: boolean;
    canReadPullRequests: boolean;
    canWritePullRequests: boolean;
    canReadContents: boolean;
    canWriteContents: boolean;
    canCommit: boolean;
    canPush: boolean;
    authMode: GitHubAuthMode;
}
export interface WorkspaceGitHubState {
    workspaceId: string;
    bound: boolean;
    binding?: GitHubRepositoryBinding;
    repository?: RepositoryView;
    currentBranch?: string;
    changeCount: number;
    authenticated: boolean;
    authSource?: 'user' | 'installation';
    authError?: string;
    capabilities: GitHubCapabilities;
}
export interface ListIssuesInput {
    workspaceId: string;
    state?: GitHubIssueState;
    page?: number;
    perPage?: number;
}
export interface IssueInput {
    workspaceId: string;
    number: number;
}
export interface ListPullRequestsInput {
    workspaceId: string;
    state?: GitHubPullRequestState;
    page?: number;
    perPage?: number;
}
export interface ListBranchesInput {
    workspaceId: string;
    page?: number;
    perPage?: number;
}
export interface PullRequestInput {
    workspaceId: string;
    number: number;
}
export interface CreateBranchInput {
    workspaceId: string;
    name: string;
}
export interface StageInput {
    workspaceId: string;
    files: string[];
}
export interface CommitInput {
    workspaceId: string;
    message: string;
}
export interface PushInput {
    workspaceId: string;
    branch: string;
}
export interface CreatePullRequestInput {
    workspaceId: string;
    title: string;
    body: string;
    base: string;
    head: string;
    draft?: boolean;
}
export interface GitHubSessionLink {
    sessionId: string;
    workspaceId: string;
    repository: {
        owner: string;
        name: string;
    };
    issueNumber?: number;
    pullRequestNumber?: number;
}
export interface GitHubAppSettings {
    appId: string;
    clientId: string;
    appSlug: string;
    redirectUri: string;
    /** Public OAuth Broker base URL. Empty keeps the self-hosted Host flow. */
    brokerUrl: string;
    clientSecretRef: string;
    privateKeyRef: string;
}
export type GitHubAuthStatus = 'connected' | 'disconnected' | 'reauthorization_required' | 'developer_configuration_required';
export interface GitHubUserProfile {
    id: number;
    login: string;
    avatarUrl: string;
    htmlUrl: string;
}
export interface GitHubInstallationAccess {
    id: number;
    accountLogin: string;
    accountAvatarUrl?: string;
    htmlUrl: string;
    repositorySelection: 'all' | 'selected' | 'unknown';
}
export interface GitHubAuthState {
    status: GitHubAuthStatus;
    user?: GitHubUserProfile;
    installations: GitHubInstallationAccess[];
    manageRepositoryAccessUrl?: string;
    message?: string;
}
export interface GitHubRemoteErrorShape {
    status: number;
    message: string;
    documentationUrl?: string;
    rateLimitResetAt?: string;
}
export declare const DEFAULT_GITHUB_APP_SETTINGS: GitHubAppSettings;
export declare const GITHUB_USER_ACCESS_TOKEN_REF = "GITHUB_APP_USER_TOKEN";
export declare const GITHUB_USER_REFRESH_TOKEN_REF = "GITHUB_APP_USER_REFRESH_TOKEN";
export declare const GITHUB_OAUTH_CALLBACK_PATH = "/github/oauth/callback";
export declare const MAX_ISSUE_BODY_BYTES = 32000;
export declare const MAX_COMMENT_BYTES = 8000;
export declare const MAX_ISSUE_COMMENTS = 20;
export declare const MAX_DIFF_BYTES = 1000000;
export declare function asTrimmedString(value: unknown, fallback?: string): string;
export declare function clampPositiveInt(value: unknown, fallback: number, max: number): number;
export declare function truncateUtf8(value: string, maxBytes: number): {
    text: string;
    truncated: boolean;
};
export declare function buildIssuePrompt(issue: GitHubIssue, comments: GitHubComment[]): string;
//# sourceMappingURL=types.d.ts.map