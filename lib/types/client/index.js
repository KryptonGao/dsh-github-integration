import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { DEFAULT_GITHUB_APP_SETTINGS, buildIssuePrompt } from "../types.js";
import githubRemote from "../remote.js";
const SETTINGS_NAMESPACE = 'github-integration';
class PanelController {
    open = false;
    listeners = new Set();
    getSnapshot = () => this.open;
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    setOpen(value) {
        if (this.open === value)
            return;
        this.open = value;
        for (const listener of this.listeners)
            listener();
    }
}
function usePanelOpen(controller) {
    return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
}
function useWorkspaceId(ctx) {
    const subscribe = useCallback((listener) => {
        const offSessions = ctx.sessions.list.subscribe(listener);
        const offWorkspaces = ctx.workspaces.list.subscribe(listener);
        return () => { offSessions(); offWorkspaces(); };
    }, [ctx]);
    const get = useCallback(() => {
        const sessions = ctx.sessions.list.getSnapshot();
        const workspaces = ctx.workspaces.list.getSnapshot();
        const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current];
        const currentWorkspace = current === undefined
            ? undefined
            : workspaces.items.find(workspace => workspace.sessionIds.includes(current.id));
        return currentWorkspace?.workspaceId ?? workspaces.recentWorkspaceId;
    }, [ctx]);
    return useSyncExternalStore(subscribe, get, get);
}
async function remoteValue(call) {
    const result = await call();
    if (!result.ok)
        throw new Error(`${result.error.code}: ${result.error.message}`);
    return result.value;
}
function ErrorBox({ error, onRetry }) {
    return _jsxs("div", { style: { padding: 16, color: '#b42318' }, role: "alert", children: [_jsx("p", { children: error }), onRetry ? _jsx("button", { type: "button", onClick: onRetry, children: "Retry" }) : null] });
}
function PanelHeader({ tab, setTab, onClose }) {
    return _jsxs("header", { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }, children: [_jsx("strong", { style: { marginRight: 12 }, children: "GitHub" }), ['issues', 'pulls', 'changes'].map((item) => (_jsx("button", { type: "button", onClick: () => setTab(item), "aria-pressed": tab === item, style: { fontWeight: tab === item ? 700 : 400 }, children: item === 'issues' ? 'Issues' : item === 'pulls' ? 'Pull requests' : 'Changes' }, item))), _jsx("span", { style: { flex: 1 } }), _jsx("button", { type: "button", onClick: onClose, "aria-label": "Close GitHub panel", children: "\u00D7" })] });
}
function WorkspaceSummary({ state }) {
    if (!state.bound)
        return _jsxs("div", { style: { padding: 20 }, children: [_jsx("h2", { children: "No GitHub repository" }), _jsx("p", { children: "Set the Workspace origin to a GitHub HTTPS or SSH remote to use this panel." })] });
    return _jsxs("div", { style: { padding: '12px 20px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }, children: [_jsx("strong", { children: state.binding ? `${state.binding.owner}/${state.binding.repository}` : 'GitHub' }), _jsxs("span", { style: { marginLeft: 12 }, children: ["branch: ", state.currentBranch ?? '(unknown)'] }), _jsxs("span", { style: { marginLeft: 12 }, children: ["changes: ", state.changeCount] }), !state.authenticated ? _jsx("span", { style: { marginLeft: 12, color: '#b54708' }, children: state.authError ?? 'Not authenticated' }) : null] });
}
function WorkspaceAuthControl({ ctx, workspaceId, state, onSaved, }) {
    const remote = ctx.remote;
    const [mode, setMode] = useState(state.binding?.authMode ?? 'user');
    const [installationId, setInstallationId] = useState(state.binding?.installationId?.toString() ?? '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState();
    useEffect(() => {
        setMode(state.binding?.authMode ?? 'user');
        setInstallationId(state.binding?.installationId?.toString() ?? '');
    }, [state.binding?.authMode, state.binding?.installationId]);
    const save = async () => {
        const parsed = installationId.trim() ? Number(installationId) : undefined;
        if (mode === 'installation' && (!Number.isSafeInteger(parsed) || parsed < 1)) {
            setError('Installation ID is required for installation authentication');
            return;
        }
        setSaving(true);
        try {
            await remoteValue(() => remote.github.setWorkspaceAuth({
                workspaceId,
                authMode: mode,
                ...(parsed === undefined ? {} : { installationId: parsed }),
            }));
            setError(undefined);
            onSaved();
        }
        catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        }
        finally {
            setSaving(false);
        }
    };
    if (!state.bound || state.binding === undefined)
        return null;
    return _jsxs("div", { style: { padding: '10px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }, children: [_jsx("span", { children: "Workspace auth:" }), _jsxs("select", { value: mode, onChange: event => setMode(event.currentTarget.value), "aria-label": "Workspace authentication mode", children: [_jsx("option", { value: "user", children: "User access token" }), _jsx("option", { value: "installation", children: "Installation token" })] }), mode === 'installation' ? _jsx("input", { value: installationId, onChange: event => setInstallationId(event.currentTarget.value), inputMode: "numeric", placeholder: "Installation ID", "aria-label": "GitHub installation ID", style: { width: 150 } }) : null, _jsx("button", { type: "button", disabled: saving, onClick: () => { void save(); }, children: saving ? 'Saving…' : 'Save binding' }), error ? _jsx("span", { role: "alert", style: { color: '#b42318' }, children: error }) : null] });
}
function IssuesView({ ctx, workspaceId, state }) {
    const remote = ctx.remote;
    const [issues, setIssues] = useState([]);
    const [selected, setSelected] = useState(null);
    const [error, setError] = useState();
    const [loading, setLoading] = useState(true);
    const [request, setRequest] = useState(0);
    useEffect(() => {
        let active = true;
        setLoading(true);
        void remoteValue(() => remote.github.listIssues({ workspaceId, state: 'open', page: 1, perPage: 50 })).then(value => { if (active) {
            setIssues(value);
            setError(undefined);
            setLoading(false);
        } }, value => { if (active) {
            setError(value instanceof Error ? value.message : String(value));
            setLoading(false);
        } });
        return () => { active = false; };
    }, [remote, request, workspaceId]);
    const openIssue = async (issue) => {
        try {
            setSelected(await remoteValue(() => remote.github.getIssue({ workspaceId, number: issue.number })));
            setError(undefined);
        }
        catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        }
    };
    const fixIssue = async () => {
        if (selected === null || state.binding === undefined)
            return;
        const connection = ctx.get('connection');
        const created = await connection.api.sessions.create({ workspaceId });
        if (!created.result.ok)
            throw new Error(`${created.result.error.code}: ${created.result.error.message}`);
        const sessionId = created.result.value.sessionId;
        const binding = ctx.sessions.binding(sessionId);
        if (binding === undefined)
            throw new Error('The new Session is not ready in the client runtime');
        const prompt = buildIssuePrompt(selected, selected.comments);
        const accepted = await binding.session.prompt([{ type: 'text', text: prompt }], 'queue');
        if (!accepted.ok)
            throw new Error(`${accepted.error.code}: ${accepted.error.message}`);
        await remoteValue(() => remote.github.linkSession({
            sessionId,
            workspaceId,
            repository: { owner: state.binding.owner, name: state.binding.repository },
            issueNumber: selected.number,
        }));
        ctx.sessions.open(sessionId);
    };
    if (!state.authenticated)
        return _jsx("div", { style: { padding: 20 }, children: "Configure and authorize the GitHub App in Settings first." });
    return _jsxs("div", { style: { display: 'grid', gridTemplateColumns: selected ? 'minmax(260px, 0.8fr) minmax(0, 1.2fr)' : '1fr', minHeight: 420 }, children: [_jsxs("section", { style: { borderRight: selected ? '1px solid #e5e7eb' : undefined }, children: [_jsxs("div", { style: { padding: 12, display: 'flex', justifyContent: 'space-between' }, children: [_jsx("strong", { children: "Open issues" }), _jsx("button", { type: "button", onClick: () => setRequest(value => value + 1), children: "Refresh" })] }), loading ? _jsx("p", { style: { padding: 12 }, children: "Loading\u2026" }) : null, error ? _jsx(ErrorBox, { error: error }) : null, _jsx("ul", { style: { listStyle: 'none', padding: 0, margin: 0 }, children: issues.map(issue => _jsx("li", { children: _jsxs("button", { type: "button", onClick: () => { void openIssue(issue); }, style: { display: 'block', width: '100%', textAlign: 'left', padding: 12, border: 0, borderTop: '1px solid #f0f0f0', background: selected?.number === issue.number ? '#f5f7ff' : 'transparent' }, children: [_jsxs("strong", { children: ["#", issue.number, " ", issue.title] }), _jsx("br", {}), _jsxs("small", { children: ["@", issue.author, " \u00B7 ", issue.commentCount, " comments"] })] }) }, issue.number)) })] }), selected ? _jsxs("section", { style: { padding: 20, overflow: 'auto' }, children: [_jsxs("h2", { children: ["#", selected.number, " ", selected.title] }), _jsx("p", { children: _jsx("a", { href: selected.htmlUrl, target: "_blank", rel: "noreferrer", children: "Open on GitHub" }) }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit' }, children: selected.body || '(empty body)' }), _jsx("h3", { children: "Comments" }), selected.comments.map(comment => _jsxs("article", { style: { borderTop: '1px solid #e5e7eb', padding: '10px 0' }, children: [_jsxs("strong", { children: ["@", comment.author] }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit' }, children: comment.body })] }, comment.id)), _jsx("button", { type: "button", onClick: () => { void fixIssue().catch(value => setError(value instanceof Error ? value.message : String(value))); }, children: "\u5728\u65B0\u5BF9\u8BDD\u4E2D\u4FEE\u590D" })] }) : null] });
}
function PullRequestsView({ ctx, workspaceId, state }) {
    const remote = ctx.remote;
    const [pulls, setPulls] = useState([]);
    const [files, setFiles] = useState([]);
    const [selected, setSelected] = useState();
    const [error, setError] = useState();
    useEffect(() => {
        let active = true;
        void remoteValue(() => remote.github.listPullRequests({ workspaceId, state: 'open', page: 1, perPage: 50 })).then(value => { if (active)
            setPulls(value); }, value => { if (active)
            setError(value instanceof Error ? value.message : String(value)); });
        return () => { active = false; };
    }, [remote, workspaceId]);
    const openPull = async (pull) => {
        try {
            setSelected(pull);
            setFiles(await remoteValue(() => remote.github.getPullRequestFiles({ workspaceId, number: pull.number })));
        }
        catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        }
    };
    if (!state.authenticated)
        return _jsx("div", { style: { padding: 20 }, children: "Configure and authorize the GitHub App in Settings first." });
    return _jsxs("div", { style: { display: 'grid', gridTemplateColumns: selected ? 'minmax(260px, 0.8fr) minmax(0, 1.2fr)' : '1fr', minHeight: 420 }, children: [_jsxs("section", { children: [_jsx("div", { style: { padding: 12 }, children: _jsx("strong", { children: "Open pull requests" }) }), error ? _jsx(ErrorBox, { error: error }) : null, _jsx("ul", { style: { listStyle: 'none', padding: 0, margin: 0 }, children: pulls.map(pull => _jsx("li", { children: _jsxs("button", { type: "button", onClick: () => { void openPull(pull); }, style: { display: 'block', width: '100%', textAlign: 'left', padding: 12, border: 0, borderTop: '1px solid #f0f0f0', background: selected?.number === pull.number ? '#f5f7ff' : 'transparent' }, children: [_jsxs("strong", { children: ["#", pull.number, " ", pull.title] }), _jsx("br", {}), _jsxs("small", { children: [pull.sourceBranch, " \u2192 ", pull.baseBranch, " \u00B7 +", pull.additions, "/-", pull.deletions] })] }) }, pull.number)) })] }), selected ? _jsxs("section", { style: { padding: 20, overflow: 'auto' }, children: [_jsxs("h2", { children: ["#", selected.number, " ", selected.title] }), _jsx("p", { children: _jsx("a", { href: selected.htmlUrl, target: "_blank", rel: "noreferrer", children: "Open on GitHub" }) }), _jsx("h3", { children: "Files changed" }), _jsx("ul", { children: files.map(file => _jsxs("li", { children: [_jsx("code", { children: file.filename }), " \u00B7 ", file.status, " \u00B7 +", file.additions, "/-", file.deletions] }, file.filename)) })] }) : null] });
}
function ChangesView({ ctx, workspaceId, state }) {
    const remote = ctx.remote;
    const [status, setStatus] = useState();
    const [diff, setDiff] = useState();
    const [selected, setSelected] = useState([]);
    const [message, setMessage] = useState('Fix GitHub issue');
    const [branch, setBranch] = useState(state.currentBranch ?? '');
    const [prTitle, setPrTitle] = useState('');
    const [prBody, setPrBody] = useState('');
    const [base, setBase] = useState(state.repository?.defaultBranch ?? 'main');
    const [error, setError] = useState();
    const [pushFailed, setPushFailed] = useState(false);
    const [request, setRequest] = useState(0);
    const refresh = useCallback(async () => {
        try {
            const [nextStatus, nextDiff] = await Promise.all([
                remoteValue(() => remote.github.getGitStatus({ workspaceId })),
                remoteValue(() => remote.github.getGitDiff({ workspaceId })),
            ]);
            setStatus(nextStatus);
            setDiff(nextDiff);
            setBranch(nextStatus.branch);
            setError(undefined);
        }
        catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        }
    }, [remote, workspaceId]);
    useEffect(() => { void refresh(); }, [refresh, request]);
    const run = async (operation, confirmation) => {
        if (!window.confirm(confirmation))
            return;
        try {
            await operation();
            await refresh();
        }
        catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        }
    };
    const pushChanges = async () => {
        if (!window.confirm('Push this branch to GitHub?'))
            return;
        try {
            await remoteValue(() => remote.github.push({ workspaceId, branch }));
            setPushFailed(false);
            await refresh();
        }
        catch (value) {
            setPushFailed(true);
            setError(value instanceof Error ? value.message : String(value));
        }
    };
    const createPullRequest = async () => {
        if (!window.confirm('Create this pull request on GitHub?'))
            return;
        try {
            const pullRequest = await remoteValue(() => remote.github.createPullRequest({ workspaceId, title: prTitle, body: prBody, base, head: branch }));
            const sessionId = ctx.sessions.list.getSnapshot().current;
            const binding = state.binding;
            if (sessionId !== undefined && binding !== undefined) {
                const existing = await remoteValue(() => remote.github.getSessionLink({ sessionId }));
                await remoteValue(() => remote.github.linkSession({
                    ...(existing ?? { sessionId, workspaceId, repository: { owner: binding.owner, name: binding.repository } }),
                    sessionId,
                    workspaceId,
                    repository: { owner: binding.owner, name: binding.repository },
                    pullRequestNumber: pullRequest.number,
                }));
            }
            await refresh();
        }
        catch (value) {
            setError(value instanceof Error ? value.message : String(value));
        }
    };
    if (!state.bound)
        return _jsx("div", { style: { padding: 20 }, children: "Bind this Workspace to a GitHub repository first." });
    return _jsxs("section", { style: { padding: 20, overflow: 'auto' }, children: [_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsx("h2", { style: { marginRight: 'auto' }, children: "Local changes" }), _jsx("button", { type: "button", onClick: () => setRequest(value => value + 1), children: "Refresh" })] }), error ? _jsx(ErrorBox, { error: error }) : null, _jsxs("p", { children: ["Branch: ", _jsx("code", { children: status?.branch ?? state.currentBranch ?? '(unknown)' })] }), _jsx("ul", { children: status?.entries.map(entry => _jsx("li", { children: _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: selected.includes(entry.path), onChange: event => setSelected(current => event.currentTarget.checked ? [...current, entry.path] : current.filter(path => path !== entry.path)) }), " ", _jsx("code", { children: entry.path }), " \u00B7 ", entry.status] }) }, entry.path)) }), _jsxs("div", { style: { display: 'flex', gap: 8, flexWrap: 'wrap' }, children: [_jsx("button", { type: "button", disabled: !state.capabilities.canWriteContents || selected.length === 0, onClick: () => { void run(() => remoteValue(() => remote.github.stage({ workspaceId, files: selected })), 'Stage the selected files?'); }, children: "Stage selected" }), _jsx("input", { value: message, onChange: event => setMessage(event.currentTarget.value), "aria-label": "Commit message" }), _jsx("button", { type: "button", disabled: !state.capabilities.canCommit, onClick: () => { void run(async () => remoteValue(() => remote.github.commit({ workspaceId, message })), 'Create a local commit with this message?'); }, children: "Commit" }), _jsx("input", { value: branch, onChange: event => setBranch(event.currentTarget.value), "aria-label": "Push branch" }), _jsx("button", { type: "button", disabled: !state.capabilities.canPush || !branch, onClick: () => { void pushChanges(); }, children: "Push" })] }), _jsx("h3", { children: "Create pull request" }), _jsxs("div", { style: { display: 'grid', gap: 8, maxWidth: 700 }, children: [_jsx("input", { value: prTitle, onChange: event => setPrTitle(event.currentTarget.value), placeholder: "PR title" }), _jsx("input", { value: base, onChange: event => setBase(event.currentTarget.value), placeholder: "Base branch" }), _jsx("textarea", { value: prBody, onChange: event => setPrBody(event.currentTarget.value), placeholder: "PR body", rows: 4 }), _jsx("button", { type: "button", disabled: !state.capabilities.canWritePullRequests || !prTitle || !branch || pushFailed, onClick: () => { void createPullRequest(); }, children: "Create pull request" }), pushFailed ? _jsx("small", { role: "alert", children: "Push failed; fix the remote error and retry Push before creating a PR." }) : null] }), _jsxs("details", { style: { marginTop: 20 }, children: [_jsx("summary", { children: "Unified diff" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', overflow: 'auto' }, children: diff?.unstaged || diff?.staged || diff?.head || '(no diff)' })] })] });
}
function GitHubPanel({ ctx, controller }) {
    const open = usePanelOpen(controller);
    const workspaceId = useWorkspaceId(ctx);
    const [tab, setTab] = useState('issues');
    const [state, setState] = useState();
    const [error, setError] = useState();
    const remote = ctx.remote;
    const refreshState = useCallback(() => {
        if (!open || workspaceId === undefined)
            return;
        void remoteValue(() => remote.github.getWorkspaceState({ workspaceId })).then(value => { setState(value); setError(undefined); }, value => setError(value instanceof Error ? value.message : String(value)));
    }, [open, remote, workspaceId]);
    useEffect(() => {
        if (!open || workspaceId === undefined)
            return;
        let active = true;
        void remoteValue(() => remote.github.getWorkspaceState({ workspaceId })).then(value => { if (active) {
            setState(value);
            setError(undefined);
        } }, value => { if (active)
            setError(value instanceof Error ? value.message : String(value)); });
        return () => { active = false; };
    }, [open, remote, workspaceId]);
    if (!open)
        return null;
    return _jsxs("div", { style: { position: 'fixed', inset: 0, zIndex: 1000, background: 'white', color: '#171717', overflow: 'auto', pointerEvents: 'auto' }, role: "dialog", "aria-label": "GitHub integration", children: [_jsx(PanelHeader, { tab: tab, setTab: setTab, onClose: () => controller.setOpen(false) }), workspaceId === undefined ? _jsx("div", { style: { padding: 20 }, children: "Select or create a Workspace first." }) : error ? _jsx(ErrorBox, { error: error }) : state === undefined ? _jsx("div", { style: { padding: 20 }, children: "Loading\u2026" }) : _jsxs(_Fragment, { children: [_jsx(WorkspaceSummary, { state: state }), _jsx(WorkspaceAuthControl, { ctx: ctx, workspaceId: workspaceId, state: state, onSaved: refreshState }), tab === 'issues' ? _jsx(IssuesView, { ctx: ctx, workspaceId: workspaceId, state: state }) : tab === 'pulls' ? _jsx(PullRequestsView, { ctx: ctx, workspaceId: workspaceId, state: state }) : _jsx(ChangesView, { ctx: ctx, workspaceId: workspaceId, state: state })] })] });
}
function GitHubSidebarAction({ wide, controller }) {
    return _jsx("button", { type: "button", onClick: () => controller.setOpen(true), title: "GitHub", style: { width: '100%', padding: '8px 10px' }, children: wide ? 'GitHub' : 'GH' });
}
function GitHubSessionBadge({ sessionId, remote }) {
    const [link, setLink] = useState();
    useEffect(() => {
        let active = true;
        void remoteValue(() => remote.github.getSessionLink({ sessionId })).then(value => { if (active)
            setLink(value); }, () => { if (active)
            setLink(null); });
        return () => { active = false; };
    }, [remote, sessionId]);
    if (link === undefined || link === null)
        return null;
    const label = [
        link.issueNumber === undefined ? undefined : `Issue #${String(link.issueNumber)}`,
        link.pullRequestNumber === undefined ? undefined : `PR #${String(link.pullRequestNumber)}`,
    ].filter((value) => value !== undefined).join(' · ');
    if (!label)
        return null;
    return _jsx("span", { title: "GitHub association", style: { padding: '4px 8px', borderRadius: 999, background: '#eef2ff', fontSize: 12 }, children: label });
}
function GitHubSettingsTab({ scope }) {
    const snapshot = useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot);
    const value = snapshot.value ?? DEFAULT_GITHUB_APP_SETTINGS;
    const set = (field, next) => { void scope.set(field, next); };
    return _jsxs("section", { style: { display: 'grid', gap: 10, maxWidth: 640 }, children: [_jsx("h2", { children: "GitHub App" }), _jsx("p", { children: "Only credential references are stored in Settings. The secret values remain in Harness credentials." }), _jsxs("label", { children: ["App ID", _jsx("input", { value: value.appId, onChange: event => set('appId', event.currentTarget.value) })] }), _jsxs("label", { children: ["Client ID", _jsx("input", { value: value.clientId, onChange: event => set('clientId', event.currentTarget.value) })] }), _jsxs("label", { children: ["Client secret reference", _jsx("input", { value: value.clientSecretRef, onChange: event => set('clientSecretRef', event.currentTarget.value) })] }), _jsxs("label", { children: ["Private key reference", _jsx("input", { value: value.privateKeyRef, onChange: event => set('privateKeyRef', event.currentTarget.value) })] }), _jsxs("label", { children: ["User access token reference", _jsx("input", { value: value.userAccessTokenRef, onChange: event => set('userAccessTokenRef', event.currentTarget.value) })] }), _jsxs("label", { children: ["User refresh token reference", _jsx("input", { value: value.userRefreshTokenRef, onChange: event => set('userRefreshTokenRef', event.currentTarget.value) })] }), snapshot.status === 'loading' ? _jsx("small", { children: "Loading settings\u2026" }) : null] });
}
export const inject = ['slots', 'remote', 'connection', 'sessions', 'workspaces', 'settingsScope'];
export async function apply(ctx) {
    const remote = ctx.remote;
    const remoteDisposer = await ctx.remote.$mount(githubRemote);
    const controller = new PanelController();
    const settingsScope = ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE });
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'github-integration',
        order: 40,
        inject: (props) => ({ ...props, controller }),
    }, GitHubSidebarAction));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'github-integration',
    }, () => _jsx(GitHubPanel, { ctx: ctx, controller: controller })));
    ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
        name: 'conversation.session.header.actions',
        id: 'github-integration',
        order: -10,
        inject: (sessionId) => ({ sessionId, remote }),
    }, GitHubSessionBadge));
    ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
        name: 'settings.plugins.tab',
        id: 'github-integration',
        order: 25,
        label: 'GitHub',
        inject: () => ({ scope: settingsScope }),
    }, GitHubSettingsTab));
    return async () => {
        await settingsScope.dispose();
        await remoteDisposer();
    };
}
export default apply;
//# sourceMappingURL=index.js.map