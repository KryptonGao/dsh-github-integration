import type { Context } from '@deepseek-ai/cordis';
import type { GitHubAppSettings, GitHubAuthMode } from '../types.ts';
export interface GitHubTokenValue {
    token: string;
    expiresAt: number;
    source: 'user' | 'installation';
}
/** Resolves GitHub App user and installation tokens without exposing secrets. */
export declare class GitHubAuthManager {
    private readonly ctx;
    private readonly installationTokens;
    private userToken?;
    constructor(ctx: Context);
    settings(): Promise<GitHubAppSettings>;
    token(mode: GitHubAuthMode, installationId?: number): Promise<GitHubTokenValue | undefined>;
}
export declare function redactTokenMessage(value: string): string;
//# sourceMappingURL=auth.d.ts.map