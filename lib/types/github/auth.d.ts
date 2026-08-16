import type { Context } from '@deepseek-ai/cordis';
import type { GitHubAppSettings, GitHubAuthMode, GitHubAuthState } from '../types.ts';
import type { GitHubStateStore } from './storage.ts';
export interface GitHubTokenValue {
    token: string;
    expiresAt: number;
    source: 'user' | 'installation';
}
export declare function createPkceVerifier(): string;
export declare function createPkceChallenge(verifier: string): string;
export declare function createOAuthState(): string;
/** Resolves GitHub App user and installation tokens without exposing secrets. */
export declare class GitHubAuthManager {
    private readonly ctx;
    private readonly state;
    private readonly installationTokens;
    private userToken;
    private userTokenInvalid;
    private refreshInFlight;
    private readonly pendingAuthorizations;
    private pendingBrokerAuthorization;
    private brokerCompletionInFlight;
    constructor(ctx: Context, state?: GitHubStateStore);
    private ensureState;
    settings(): Promise<GitHubAppSettings>;
    private brokerRequest;
    private completeBrokerAuthorization;
    beginUserAuthorization(): Promise<{
        authorizationUrl: string;
    }>;
    private exchangeCode;
    private profileForToken;
    private saveTokenPair;
    private refreshUserToken;
    private markReauthorizationRequired;
    token(mode: GitHubAuthMode, installationId?: number): Promise<GitHubTokenValue | undefined>;
    invalidateUserToken(): void;
    authState(): Promise<GitHubAuthState>;
    private handleCallback;
    disconnect(): Promise<{
        disconnected: true;
        remoteRevoked: boolean;
    }>;
}
export declare function redactTokenMessage(value: string): string;
//# sourceMappingURL=auth.d.ts.map