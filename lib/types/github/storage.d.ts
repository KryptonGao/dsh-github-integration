import type { GitHubAuthMode, GitHubAuthStatus, GitHubInstallationAccess, GitHubSessionLink, GitHubUserProfile } from '../types.ts';
export interface StoredAuthState {
    status: GitHubAuthStatus;
    installations: GitHubInstallationAccess[];
    user?: GitHubUserProfile;
    expiresAt?: number;
    refreshTokenExpiresAt?: number;
}
interface StoredState {
    bindings: Record<string, {
        authMode: GitHubAuthMode;
        installationId?: number;
    }>;
    sessions: Record<string, GitHubSessionLink>;
    auth: StoredAuthState;
}
/** Small serialized JSON store for plugin-owned Workspace and Session links. */
export declare class GitHubStateStore {
    private state;
    private loaded;
    private tail;
    load(): Promise<void>;
    binding(workspaceId: string): StoredState['bindings'][string] | undefined;
    setBinding(workspaceId: string, value: StoredState['bindings'][string]): Promise<void>;
    session(sessionId: string): GitHubSessionLink | undefined;
    setSession(value: GitHubSessionLink): Promise<void>;
    auth(): StoredAuthState;
    setAuth(value: StoredAuthState): Promise<void>;
    clearAuth(): Promise<void>;
    private persist;
}
export type StoredBinding = NonNullable<ReturnType<GitHubStateStore['binding']>>;
export {};
//# sourceMappingURL=storage.d.ts.map