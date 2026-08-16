import type { GitHubRepositoryBinding } from '../types.ts';
/** Parse only the two public GitHub upstream forms supported by the MVP. */
export declare function parseGitHubRemote(url: string, remoteName?: string): GitHubRepositoryBinding | null;
export declare function safeBranchName(value: string): string;
export declare function issueBranchName(number: number, title: string): string;
//# sourceMappingURL=remote.d.ts.map