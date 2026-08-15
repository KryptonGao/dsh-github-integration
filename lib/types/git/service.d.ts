import type { Context } from '@deepseek-ai/cordis';
import type { GitDiff, GitStatus } from '../types.ts';
interface CommandResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}
/** Run git without a shell. Every caller supplies an argv array and a validated cwd. */
export declare function runGit(ctx: Context, cwd: string, args: readonly string[], signal?: AbortSignal): Promise<CommandResult>;
/** Parse `git status --porcelain=v1 -z --branch` into a safe UI shape. */
export declare function parseGitStatus(output: string): GitStatus;
export declare class GitService {
    private readonly ctx;
    constructor(ctx: Context);
    detectRepository(workspaceId: string, signal?: AbortSignal): Promise<import("../types.ts").GitHubRepositoryBinding | null>;
    currentBranch(workspaceId: string, signal?: AbortSignal): Promise<string>;
    status(workspaceId: string, signal?: AbortSignal): Promise<GitStatus>;
    diff(workspaceId: string, signal?: AbortSignal): Promise<GitDiff>;
    createBranch(workspaceId: string, name: string, signal?: AbortSignal): Promise<void>;
    stage(workspaceId: string, files: string[], signal?: AbortSignal): Promise<void>;
    commit(workspaceId: string, message: string, signal?: AbortSignal): Promise<string>;
    push(workspaceId: string, branch: string, signal?: AbortSignal): Promise<void>;
}
export {};
//# sourceMappingURL=service.d.ts.map