import type { GitHubComment, GitHubIssue, GitHubIssueDetail, GitHubIssueState, GitHubPullRequest, GitHubPullRequestDetail, GitHubPullRequestFile, GitHubPullRequestState, GitHubRepositoryBinding, RepositoryView } from '../types.ts';
import { GitHubAuthManager } from './auth.ts';
/** Minimal GitHub REST client. Tokens stay entirely inside this Host class. */
export declare class GitHubApiClient {
    private readonly auth;
    constructor(auth: GitHubAuthManager);
    private request;
    repository(binding: GitHubRepositoryBinding, signal?: AbortSignal): Promise<RepositoryView>;
    issues(binding: GitHubRepositoryBinding, state?: GitHubIssueState, page?: number, perPage?: number, signal?: AbortSignal): Promise<GitHubIssue[]>;
    issue(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubIssueDetail>;
    comments(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubComment[]>;
    pullRequests(binding: GitHubRepositoryBinding, state?: GitHubPullRequestState, page?: number, perPage?: number, signal?: AbortSignal): Promise<GitHubPullRequest[]>;
    pullRequest(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubPullRequestDetail>;
    pullRequestFiles(binding: GitHubRepositoryBinding, number: number, signal?: AbortSignal): Promise<GitHubPullRequestFile[]>;
    createPullRequest(binding: GitHubRepositoryBinding, input: {
        title: string;
        body: string;
        base: string;
        head: string;
        draft?: boolean;
    }, signal?: AbortSignal): Promise<GitHubPullRequest>;
}
//# sourceMappingURL=api.d.ts.map