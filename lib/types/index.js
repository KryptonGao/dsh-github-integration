var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import z from '@deepseek-ai/schemastery';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
import { DEFAULT_GITHUB_APP_SETTINGS } from "./types.js";
import { GitService } from "./git/service.js";
import { safeBranchName } from "./git/remote.js";
import { gitSafetyGuard } from "./git/safety.js";
import { GitHubApiClient } from "./github/api.js";
import { GitHubAuthManager, redactTokenMessage } from "./github/auth.js";
import { GitHubStateStore } from "./github/storage.js";
export * from "./types.js";
export { parseGitHubRemote, safeBranchName, issueBranchName } from "./git/remote.js";
export { parseGitStatus, runGit, GitService } from "./git/service.js";
export { gitSafetyGuard } from "./git/safety.js";
export const GITHUB_SETTINGS_NAMESPACE = settingsNamespace('github-integration');
export const GitHubSettingsSchema = z.object({
    appId: z.string().default(''),
    clientId: z.string().default(''),
    clientSecretRef: z.string().default(DEFAULT_GITHUB_APP_SETTINGS.clientSecretRef),
    privateKeyRef: z.string().default(DEFAULT_GITHUB_APP_SETTINGS.privateKeyRef),
    userAccessTokenRef: z.string().default(DEFAULT_GITHUB_APP_SETTINGS.userAccessTokenRef),
    userRefreshTokenRef: z.string().default(DEFAULT_GITHUB_APP_SETTINGS.userRefreshTokenRef),
});
function emptyCapabilities(mode = 'user') {
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
    };
}
function capabilities(repository, mode) {
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
    };
}
function requireWorkspaceId(value) {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 512) {
        throw new Error('workspaceId is required');
    }
    return value;
}
function requirePositiveInteger(value, label) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${label} must be a positive integer`);
    }
    return value;
}
function requireText(value, label, maxLength) {
    if (typeof value !== 'string')
        throw new Error(`${label} must be text`);
    const normalized = value.trim();
    if (normalized.length === 0)
        throw new Error(`${label} is required`);
    if (normalized.length > maxLength)
        throw new Error(`${label} is too long`);
    return normalized;
}
function requireFiles(value) {
    if (!Array.isArray(value) || value.length === 0 || value.length > 500 || value.some(item => typeof item !== 'string' || item.length === 0 || item.length > 4_096)) {
        throw new Error('files must contain between 1 and 500 paths');
    }
    return [...new Set(value.map(item => item))];
}
/** Host-side GitHub integration Gateway. */
let GitHubGateway = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _getWorkspaceState_decorators;
    let _setWorkspaceAuth_decorators;
    let _listIssues_decorators;
    let _getIssue_decorators;
    let _getIssueComments_decorators;
    let _listPullRequests_decorators;
    let _getPullRequest_decorators;
    let _getPullRequestFiles_decorators;
    let _getGitStatus_decorators;
    let _getGitDiff_decorators;
    let _createBranch_decorators;
    let _stage_decorators;
    let _commit_decorators;
    let _push_decorators;
    let _createPullRequest_decorators;
    let _linkSession_decorators;
    let _getSessionLink_decorators;
    return class GitHubGateway extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _getWorkspaceState_decorators = [Remote];
            _setWorkspaceAuth_decorators = [Remote];
            _listIssues_decorators = [Remote];
            _getIssue_decorators = [Remote];
            _getIssueComments_decorators = [Remote];
            _listPullRequests_decorators = [Remote];
            _getPullRequest_decorators = [Remote];
            _getPullRequestFiles_decorators = [Remote];
            _getGitStatus_decorators = [Remote];
            _getGitDiff_decorators = [Remote];
            _createBranch_decorators = [Remote];
            _stage_decorators = [Remote];
            _commit_decorators = [Remote];
            _push_decorators = [Remote];
            _createPullRequest_decorators = [Remote];
            _linkSession_decorators = [Remote];
            _getSessionLink_decorators = [Remote];
            __esDecorate(this, null, _getWorkspaceState_decorators, { kind: "method", name: "getWorkspaceState", static: false, private: false, access: { has: obj => "getWorkspaceState" in obj, get: obj => obj.getWorkspaceState }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setWorkspaceAuth_decorators, { kind: "method", name: "setWorkspaceAuth", static: false, private: false, access: { has: obj => "setWorkspaceAuth" in obj, get: obj => obj.setWorkspaceAuth }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listIssues_decorators, { kind: "method", name: "listIssues", static: false, private: false, access: { has: obj => "listIssues" in obj, get: obj => obj.listIssues }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getIssue_decorators, { kind: "method", name: "getIssue", static: false, private: false, access: { has: obj => "getIssue" in obj, get: obj => obj.getIssue }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getIssueComments_decorators, { kind: "method", name: "getIssueComments", static: false, private: false, access: { has: obj => "getIssueComments" in obj, get: obj => obj.getIssueComments }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listPullRequests_decorators, { kind: "method", name: "listPullRequests", static: false, private: false, access: { has: obj => "listPullRequests" in obj, get: obj => obj.listPullRequests }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getPullRequest_decorators, { kind: "method", name: "getPullRequest", static: false, private: false, access: { has: obj => "getPullRequest" in obj, get: obj => obj.getPullRequest }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getPullRequestFiles_decorators, { kind: "method", name: "getPullRequestFiles", static: false, private: false, access: { has: obj => "getPullRequestFiles" in obj, get: obj => obj.getPullRequestFiles }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getGitStatus_decorators, { kind: "method", name: "getGitStatus", static: false, private: false, access: { has: obj => "getGitStatus" in obj, get: obj => obj.getGitStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getGitDiff_decorators, { kind: "method", name: "getGitDiff", static: false, private: false, access: { has: obj => "getGitDiff" in obj, get: obj => obj.getGitDiff }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createBranch_decorators, { kind: "method", name: "createBranch", static: false, private: false, access: { has: obj => "createBranch" in obj, get: obj => obj.createBranch }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stage_decorators, { kind: "method", name: "stage", static: false, private: false, access: { has: obj => "stage" in obj, get: obj => obj.stage }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _commit_decorators, { kind: "method", name: "commit", static: false, private: false, access: { has: obj => "commit" in obj, get: obj => obj.commit }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _push_decorators, { kind: "method", name: "push", static: false, private: false, access: { has: obj => "push" in obj, get: obj => obj.push }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createPullRequest_decorators, { kind: "method", name: "createPullRequest", static: false, private: false, access: { has: obj => "createPullRequest" in obj, get: obj => obj.createPullRequest }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _linkSession_decorators, { kind: "method", name: "linkSession", static: false, private: false, access: { has: obj => "linkSession" in obj, get: obj => obj.linkSession }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getSessionLink_decorators, { kind: "method", name: "getSessionLink", static: false, private: false, access: { has: obj => "getSessionLink" in obj, get: obj => obj.getSessionLink }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        git = __runInitializers(this, _instanceExtraInitializers);
        auth;
        github;
        state = new GitHubStateStore();
        constructor(ctx) {
            super(ctx, 'github');
            this.git = new GitService(ctx);
            this.auth = new GitHubAuthManager(ctx);
            this.github = new GitHubApiClient(this.auth);
            ctx.inject(['tools'], (toolsCtx) => {
                toolsCtx.tools.guard(gitSafetyGuard);
            });
            ctx.inject(['settings'], (settingsCtx) => {
                settingsCtx.settings.register(GITHUB_SETTINGS_NAMESPACE, GitHubSettingsSchema, {
                    base: DEFAULT_GITHUB_APP_SETTINGS,
                });
            });
        }
        async ensureState() {
            await this.state.load();
        }
        async bindingFor(workspaceId, signal) {
            await this.ensureState();
            let detected;
            try {
                detected = await this.git.detectRepository(workspaceId, signal);
            }
            catch {
                detected = null;
            }
            if (detected === null)
                return null;
            const override = this.state.binding(workspaceId);
            return {
                ...detected,
                // Repository authentication is explicit and workspace-scoped. The
                // settings namespace stores App credentials only; it never silently
                // changes an existing repository's auth mode.
                authMode: override?.authMode ?? 'user',
                ...(override?.installationId === undefined ? {} : { installationId: override.installationId }),
            };
        }
        async requireBinding(workspaceId, signal) {
            const binding = await this.bindingFor(workspaceId, signal);
            if (binding === null)
                throw new Error('Workspace is not bound to a supported GitHub origin');
            return binding;
        }
        async requireRepository(workspaceId, signal) {
            const binding = await this.requireBinding(workspaceId, signal);
            const repository = await this.github.repository(binding, signal);
            return { binding, repository };
        }
        async requireCapability(workspaceId, capability, signal) {
            const resolved = await this.requireRepository(workspaceId, signal);
            const available = capabilities(resolved.repository, resolved.binding.authMode)[capability];
            if (available !== true)
                throw new Error(`GitHub capability denied: ${capability}`);
            return resolved;
        }
        async getWorkspaceState(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            let status;
            try {
                status = await this.git.status(workspaceId, signal);
            }
            catch {
                status = { branch: '(unknown)', entries: [], clean: true, ahead: 0, behind: 0 };
            }
            const binding = await this.bindingFor(workspaceId, signal);
            if (binding === null) {
                return {
                    workspaceId,
                    bound: false,
                    currentBranch: status.branch,
                    changeCount: status.entries.length,
                    authenticated: false,
                    capabilities: emptyCapabilities(),
                };
            }
            try {
                const token = await this.auth.token(binding.authMode, binding.installationId);
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
                    };
                }
                const repository = await this.github.repository(binding, signal);
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
                };
            }
            catch (error) {
                return {
                    workspaceId: input.workspaceId,
                    bound: true,
                    binding,
                    currentBranch: status.branch,
                    changeCount: status.entries.length,
                    authenticated: false,
                    authError: redactTokenMessage(error instanceof Error ? error.message : String(error)),
                    capabilities: emptyCapabilities(binding.authMode),
                };
            }
        }
        async setWorkspaceAuth(input, signal) {
            signal.throwIfAborted();
            const workspaceId = requireWorkspaceId(input.workspaceId);
            if (input.authMode !== 'user' && input.authMode !== 'installation')
                throw new Error('unsupported GitHub authentication mode');
            const binding = await this.requireBinding(workspaceId, signal);
            if (input.authMode === 'installation' && (!Number.isSafeInteger(input.installationId) || input.installationId < 1)) {
                throw new Error('installationId is required for installation authentication');
            }
            const stored = input.authMode === 'installation'
                ? { authMode: input.authMode, installationId: input.installationId }
                : { authMode: input.authMode };
            await this.ensureState();
            await this.state.setBinding(workspaceId, stored);
            return {
                ...binding,
                authMode: input.authMode,
                ...(input.authMode === 'installation' ? { installationId: input.installationId } : {}),
            };
        }
        async listIssues(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const { binding } = await this.requireCapability(workspaceId, 'canReadIssues', signal);
            return this.github.issues(binding, input.state ?? 'open', input.page ?? 1, input.perPage ?? 30, signal);
        }
        async getIssue(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const number = requirePositiveInteger(input.number, 'issue number');
            const { binding } = await this.requireCapability(workspaceId, 'canReadIssues', signal);
            return this.github.issue(binding, number, signal);
        }
        async getIssueComments(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const number = requirePositiveInteger(input.number, 'issue number');
            const { binding } = await this.requireCapability(workspaceId, 'canReadIssues', signal);
            return this.github.comments(binding, number, signal);
        }
        async listPullRequests(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const { binding } = await this.requireCapability(workspaceId, 'canReadPullRequests', signal);
            return this.github.pullRequests(binding, input.state ?? 'open', input.page ?? 1, input.perPage ?? 30, signal);
        }
        async getPullRequest(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const number = requirePositiveInteger(input.number, 'pull request number');
            const { binding } = await this.requireCapability(workspaceId, 'canReadPullRequests', signal);
            return this.github.pullRequest(binding, number, signal);
        }
        async getPullRequestFiles(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const number = requirePositiveInteger(input.number, 'pull request number');
            const { binding } = await this.requireCapability(workspaceId, 'canReadPullRequests', signal);
            return this.github.pullRequestFiles(binding, number, signal);
        }
        async getGitStatus(input, signal) {
            return this.git.status(requireWorkspaceId(input.workspaceId), signal);
        }
        async getGitDiff(input, signal) {
            return this.git.diff(requireWorkspaceId(input.workspaceId), signal);
        }
        async createBranch(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const name = requireText(input.name, 'branch name', 200);
            await this.requireCapability(workspaceId, 'canWriteContents', signal);
            await this.git.createBranch(workspaceId, name, signal);
        }
        async stage(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const files = requireFiles(input.files);
            await this.requireCapability(workspaceId, 'canWriteContents', signal);
            await this.git.stage(workspaceId, files, signal);
        }
        async commit(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const message = requireText(input.message, 'commit message', 200);
            await this.requireCapability(workspaceId, 'canWriteContents', signal);
            return { sha: await this.git.commit(workspaceId, message, signal) };
        }
        async push(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const branch = requireText(input.branch, 'branch name', 200);
            await this.requireCapability(workspaceId, 'canPush', signal);
            await this.git.push(workspaceId, safeBranchName(branch), signal);
        }
        async createPullRequest(input, signal) {
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const title = requireText(input.title, 'pull request title', 256);
            if (typeof input.body !== 'string' || input.body.length > 100_000)
                throw new Error('pull request body is invalid');
            const base = requireText(input.base, 'pull request base branch', 200);
            const head = requireText(input.head, 'pull request head branch', 200);
            const { binding } = await this.requireCapability(workspaceId, 'canWritePullRequests', signal);
            const status = await this.git.status(workspaceId, signal);
            if (!status.clean)
                throw new Error('Working tree must be clean before creating a pull request');
            if (base === head)
                throw new Error('Pull request base and head must differ');
            const pullRequestInput = {
                title,
                body: input.body,
                base: safeBranchName(base),
                head: safeBranchName(head),
                ...(input.draft === undefined ? {} : { draft: input.draft }),
            };
            const pullRequest = await this.github.createPullRequest(binding, pullRequestInput, signal);
            await this.ensureState();
            return pullRequest;
        }
        async linkSession(input, signal) {
            signal.throwIfAborted();
            const workspaceId = requireWorkspaceId(input.workspaceId);
            const sessionId = requireText(input.sessionId, 'sessionId', 512);
            const owner = requireText(input.repository?.owner, 'repository owner', 256);
            const name = requireText(input.repository?.name, 'repository name', 256);
            const binding = await this.requireBinding(workspaceId, signal);
            if (binding.owner !== owner || binding.repository !== name) {
                throw new Error('Session link repository does not match Workspace origin');
            }
            const issueNumber = input.issueNumber === undefined ? undefined : requirePositiveInteger(input.issueNumber, 'issue number');
            const pullRequestNumber = input.pullRequestNumber === undefined ? undefined : requirePositiveInteger(input.pullRequestNumber, 'pull request number');
            await this.ensureState();
            await this.state.setSession({
                sessionId,
                workspaceId,
                repository: { owner, name },
                ...(issueNumber === undefined ? {} : { issueNumber }),
                ...(pullRequestNumber === undefined ? {} : { pullRequestNumber }),
            });
        }
        async getSessionLink(input) {
            const sessionId = requireText(input.sessionId, 'sessionId', 512);
            await this.ensureState();
            return this.state.session(sessionId) ?? null;
        }
    };
})();
export { GitHubGateway };
export default GitHubGateway;
//# sourceMappingURL=index.js.map