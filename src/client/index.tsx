import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { ClientContext, SessionId, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {
  GitHubAppSettings,
  GitHubIssue,
  GitHubIssueDetail,
  GitHubPullRequest,
  GitHubPullRequestFile,
  GitHubSessionLink,
  GitDiff,
  GitStatus,
  WorkspaceGitHubState,
} from '../types.ts'
import { DEFAULT_GITHUB_APP_SETTINGS, buildIssuePrompt } from '../types.ts'
import githubRemote, { type GitHubRemoteNamespace } from '../remote.ts'

const SETTINGS_NAMESPACE = 'github-integration'

type RemoteFace = { github: GitHubRemoteNamespace }

class PanelController {
  private open = false
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): boolean => this.open
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  setOpen(value: boolean): void {
    if (this.open === value) return
    this.open = value
    for (const listener of this.listeners) listener()
  }
}

function usePanelOpen(controller: PanelController): boolean {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
}

function useWorkspaceId(ctx: ClientContext): WorkspaceId | undefined {
  const subscribe = useCallback((listener: () => void) => {
    const offSessions = ctx.sessions.list.subscribe(listener)
    const offWorkspaces = ctx.workspaces.list.subscribe(listener)
    return () => { offSessions(); offWorkspaces() }
  }, [ctx])
  const get = useCallback(() => {
    const sessions = ctx.sessions.list.getSnapshot()
    const workspaces = ctx.workspaces.list.getSnapshot()
    const current = sessions.current === undefined ? undefined : sessions.byId[sessions.current]
    const currentWorkspace = current === undefined
      ? undefined
      : workspaces.items.find(workspace => workspace.sessionIds.includes(current.id))
    return currentWorkspace?.workspaceId ?? workspaces.recentWorkspaceId
  }, [ctx])
  return useSyncExternalStore(subscribe, get, get)
}

async function remoteValue<T>(call: () => Promise<{ ok: true; value: T } | { ok: false; error: { code: string; message: string } }>): Promise<T> {
  const result = await call()
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }): ReactNode {
  return <div style={{ padding: 16, color: '#b42318' }} role="alert">
    <p>{error}</p>
    {onRetry ? <button type="button" onClick={onRetry}>Retry</button> : null}
  </div>
}

function PanelHeader({ tab, setTab, onClose }: { tab: PanelTab; setTab: (tab: PanelTab) => void; onClose: () => void }): ReactNode {
  return <header style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
    <strong style={{ marginRight: 12 }}>GitHub</strong>
    {(['issues', 'pulls', 'changes'] as const).map((item) => (
      <button key={item} type="button" onClick={() => setTab(item)} aria-pressed={tab === item} style={{ fontWeight: tab === item ? 700 : 400 }}>
        {item === 'issues' ? 'Issues' : item === 'pulls' ? 'Pull requests' : 'Changes'}
      </button>
    ))}
    <span style={{ flex: 1 }} />
    <button type="button" onClick={onClose} aria-label="Close GitHub panel">×</button>
  </header>
}

type PanelTab = 'issues' | 'pulls' | 'changes'

function WorkspaceSummary({ state }: { state: WorkspaceGitHubState }): ReactNode {
  if (!state.bound) return <div style={{ padding: 20 }}><h2>No GitHub repository</h2><p>Set the Workspace origin to a GitHub HTTPS or SSH remote to use this panel.</p></div>
  return <div style={{ padding: '12px 20px', borderBottom: '1px solid #e5e7eb', fontSize: 13 }}>
    <strong>{state.binding ? `${state.binding.owner}/${state.binding.repository}` : 'GitHub'}</strong>
    <span style={{ marginLeft: 12 }}>branch: {state.currentBranch ?? '(unknown)'}</span>
    <span style={{ marginLeft: 12 }}>changes: {state.changeCount}</span>
    {!state.authenticated ? <span style={{ marginLeft: 12, color: '#b54708' }}>{state.authError ?? 'Not authenticated'}</span> : null}
  </div>
}

function WorkspaceAuthControl({
  ctx,
  workspaceId,
  state,
  onSaved,
}: {
  ctx: ClientContext
  workspaceId: WorkspaceId
  state: WorkspaceGitHubState
  onSaved: () => void
}): ReactNode {
  const remote = ctx.remote as RemoteFace
  const [mode, setMode] = useState<'user' | 'installation'>(state.binding?.authMode ?? 'user')
  const [installationId, setInstallationId] = useState(state.binding?.installationId?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  useEffect(() => {
    setMode(state.binding?.authMode ?? 'user')
    setInstallationId(state.binding?.installationId?.toString() ?? '')
  }, [state.binding?.authMode, state.binding?.installationId])
  const save = async (): Promise<void> => {
    const parsed = installationId.trim() ? Number(installationId) : undefined
    if (mode === 'installation' && (!Number.isSafeInteger(parsed) || parsed! < 1)) {
      setError('Installation ID is required for installation authentication')
      return
    }
    setSaving(true)
    try {
      await remoteValue(() => remote.github.setWorkspaceAuth({
        workspaceId,
        authMode: mode,
        ...(parsed === undefined ? {} : { installationId: parsed }),
      }))
      setError(undefined)
      onSaved()
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setSaving(false)
    }
  }
  if (!state.bound || state.binding === undefined) return null
  return <div style={{ padding: '10px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
    <span>Workspace auth:</span>
    <select value={mode} onChange={event => setMode(event.currentTarget.value as 'user' | 'installation')} aria-label="Workspace authentication mode">
      <option value="user">User access token</option>
      <option value="installation">Installation token</option>
    </select>
    {mode === 'installation' ? <input value={installationId} onChange={event => setInstallationId(event.currentTarget.value)} inputMode="numeric" placeholder="Installation ID" aria-label="GitHub installation ID" style={{ width: 150 }} /> : null}
    <button type="button" disabled={saving} onClick={() => { void save() }}>{saving ? 'Saving…' : 'Save binding'}</button>
    {error ? <span role="alert" style={{ color: '#b42318' }}>{error}</span> : null}
  </div>
}

function IssuesView({ ctx, workspaceId, state }: { ctx: ClientContext; workspaceId: WorkspaceId; state: WorkspaceGitHubState }): ReactNode {
  const remote = ctx.remote as RemoteFace
  const [issues, setIssues] = useState<GitHubIssue[]>([])
  const [selected, setSelected] = useState<GitHubIssueDetail | null>(null)
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState(0)
  useEffect(() => {
    let active = true
    setLoading(true)
    void remoteValue(() => remote.github.listIssues({ workspaceId, state: 'open', page: 1, perPage: 50 })).then(
      value => { if (active) { setIssues(value); setError(undefined); setLoading(false) } },
      value => { if (active) { setError(value instanceof Error ? value.message : String(value)); setLoading(false) } },
    )
    return () => { active = false }
  }, [remote, request, workspaceId])

  const openIssue = async (issue: GitHubIssue): Promise<void> => {
    try {
      setSelected(await remoteValue(() => remote.github.getIssue({ workspaceId, number: issue.number })))
      setError(undefined)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    }
  }

  const fixIssue = async (): Promise<void> => {
    if (selected === null || state.binding === undefined) return
    const connection = (ctx.get('connection') as ConnectionHandle)
    const created = await connection.api.sessions.create({ workspaceId })
    if (!created.result.ok) throw new Error(`${created.result.error.code}: ${created.result.error.message}`)
    const sessionId = created.result.value.sessionId as SessionId
    const binding = ctx.sessions.binding(sessionId)
    if (binding === undefined) throw new Error('The new Session is not ready in the client runtime')
    const prompt = buildIssuePrompt(selected, selected.comments)
    const accepted = await binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
    if (!accepted.ok) throw new Error(`${accepted.error.code}: ${accepted.error.message}`)
    await remoteValue(() => remote.github.linkSession({
      sessionId,
      workspaceId,
      repository: { owner: state.binding!.owner, name: state.binding!.repository },
      issueNumber: selected.number,
    }))
    ctx.sessions.open(sessionId)
  }

  if (!state.authenticated) return <div style={{ padding: 20 }}>Configure and authorize the GitHub App in Settings first.</div>
  return <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(260px, 0.8fr) minmax(0, 1.2fr)' : '1fr', minHeight: 420 }}>
    <section style={{ borderRight: selected ? '1px solid #e5e7eb' : undefined }}>
      <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between' }}><strong>Open issues</strong><button type="button" onClick={() => setRequest(value => value + 1)}>Refresh</button></div>
      {loading ? <p style={{ padding: 12 }}>Loading…</p> : null}
      {error ? <ErrorBox error={error} /> : null}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {issues.map(issue => <li key={issue.number}><button type="button" onClick={() => { void openIssue(issue) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, border: 0, borderTop: '1px solid #f0f0f0', background: selected?.number === issue.number ? '#f5f7ff' : 'transparent' }}><strong>#{issue.number} {issue.title}</strong><br /><small>@{issue.author} · {issue.commentCount} comments</small></button></li>)}
      </ul>
    </section>
    {selected ? <section style={{ padding: 20, overflow: 'auto' }}>
      <h2>#{selected.number} {selected.title}</h2>
      <p><a href={selected.htmlUrl} target="_blank" rel="noreferrer">Open on GitHub</a></p>
      <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{selected.body || '(empty body)'}</pre>
      <h3>Comments</h3>
      {selected.comments.map(comment => <article key={comment.id} style={{ borderTop: '1px solid #e5e7eb', padding: '10px 0' }}><strong>@{comment.author}</strong><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{comment.body}</pre></article>)}
      <button type="button" onClick={() => { void fixIssue().catch(value => setError(value instanceof Error ? value.message : String(value))) }}>在新对话中修复</button>
    </section> : null}
  </div>
}

function PullRequestsView({ ctx, workspaceId, state }: { ctx: ClientContext; workspaceId: WorkspaceId; state: WorkspaceGitHubState }): ReactNode {
  const remote = ctx.remote as RemoteFace
  const [pulls, setPulls] = useState<GitHubPullRequest[]>([])
  const [files, setFiles] = useState<GitHubPullRequestFile[]>([])
  const [selected, setSelected] = useState<GitHubPullRequest>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    void remoteValue(() => remote.github.listPullRequests({ workspaceId, state: 'open', page: 1, perPage: 50 })).then(
      value => { if (active) setPulls(value) },
      value => { if (active) setError(value instanceof Error ? value.message : String(value)) },
    )
    return () => { active = false }
  }, [remote, workspaceId])
  const openPull = async (pull: GitHubPullRequest): Promise<void> => {
    try {
      setSelected(pull)
      setFiles(await remoteValue(() => remote.github.getPullRequestFiles({ workspaceId, number: pull.number })))
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    }
  }
  if (!state.authenticated) return <div style={{ padding: 20 }}>Configure and authorize the GitHub App in Settings first.</div>
  return <div style={{ display: 'grid', gridTemplateColumns: selected ? 'minmax(260px, 0.8fr) minmax(0, 1.2fr)' : '1fr', minHeight: 420 }}>
    <section><div style={{ padding: 12 }}><strong>Open pull requests</strong></div>{error ? <ErrorBox error={error} /> : null}<ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>{pulls.map(pull => <li key={pull.number}><button type="button" onClick={() => { void openPull(pull) }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 12, border: 0, borderTop: '1px solid #f0f0f0', background: selected?.number === pull.number ? '#f5f7ff' : 'transparent' }}><strong>#{pull.number} {pull.title}</strong><br /><small>{pull.sourceBranch} → {pull.baseBranch} · +{pull.additions}/-{pull.deletions}</small></button></li>)}</ul></section>
    {selected ? <section style={{ padding: 20, overflow: 'auto' }}><h2>#{selected.number} {selected.title}</h2><p><a href={selected.htmlUrl} target="_blank" rel="noreferrer">Open on GitHub</a></p><h3>Files changed</h3><ul>{files.map(file => <li key={file.filename}><code>{file.filename}</code> · {file.status} · +{file.additions}/-{file.deletions}</li>)}</ul></section> : null}
  </div>
}

function ChangesView({ ctx, workspaceId, state }: { ctx: ClientContext; workspaceId: WorkspaceId; state: WorkspaceGitHubState }): ReactNode {
  const remote = ctx.remote as RemoteFace
  const [status, setStatus] = useState<GitStatus>()
  const [diff, setDiff] = useState<GitDiff>()
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState('Fix GitHub issue')
  const [branch, setBranch] = useState(state.currentBranch ?? '')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [base, setBase] = useState(state.repository?.defaultBranch ?? 'main')
  const [error, setError] = useState<string>()
  const [pushFailed, setPushFailed] = useState(false)
  const [request, setRequest] = useState(0)
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nextStatus, nextDiff] = await Promise.all([
        remoteValue(() => remote.github.getGitStatus({ workspaceId })),
        remoteValue(() => remote.github.getGitDiff({ workspaceId })),
      ])
      setStatus(nextStatus)
      setDiff(nextDiff)
      setBranch(nextStatus.branch)
      setError(undefined)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    }
  }, [remote, workspaceId])
  useEffect(() => { void refresh() }, [refresh, request])
  const run = async (operation: () => Promise<unknown>, confirmation: string): Promise<void> => {
    if (!window.confirm(confirmation)) return
    try { await operation(); await refresh() } catch (value) { setError(value instanceof Error ? value.message : String(value)) }
  }
  const pushChanges = async (): Promise<void> => {
    if (!window.confirm('Push this branch to GitHub?')) return
    try {
      await remoteValue(() => remote.github.push({ workspaceId, branch }))
      setPushFailed(false)
      await refresh()
    } catch (value) {
      setPushFailed(true)
      setError(value instanceof Error ? value.message : String(value))
    }
  }
  const createPullRequest = async (): Promise<void> => {
    if (!window.confirm('Create this pull request on GitHub?')) return
    try {
      const pullRequest = await remoteValue(() => remote.github.createPullRequest({ workspaceId, title: prTitle, body: prBody, base, head: branch }))
      const sessionId = ctx.sessions.list.getSnapshot().current as SessionId | undefined
      const binding = state.binding
      if (sessionId !== undefined && binding !== undefined) {
        const existing = await remoteValue(() => remote.github.getSessionLink({ sessionId }))
        await remoteValue(() => remote.github.linkSession({
          ...(existing ?? { sessionId, workspaceId, repository: { owner: binding.owner, name: binding.repository } }),
          sessionId,
          workspaceId,
          repository: { owner: binding.owner, name: binding.repository },
          pullRequestNumber: pullRequest.number,
        }))
      }
      await refresh()
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    }
  }
  if (!state.bound) return <div style={{ padding: 20 }}>Bind this Workspace to a GitHub repository first.</div>
  return <section style={{ padding: 20, overflow: 'auto' }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><h2 style={{ marginRight: 'auto' }}>Local changes</h2><button type="button" onClick={() => setRequest(value => value + 1)}>Refresh</button></div>
    {error ? <ErrorBox error={error} /> : null}
    <p>Branch: <code>{status?.branch ?? state.currentBranch ?? '(unknown)'}</code></p>
    <ul>{status?.entries.map(entry => <li key={entry.path}><label><input type="checkbox" checked={selected.includes(entry.path)} onChange={event => setSelected(current => event.currentTarget.checked ? [...current, entry.path] : current.filter(path => path !== entry.path))} /> <code>{entry.path}</code> · {entry.status}</label></li>)}</ul>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" disabled={!state.capabilities.canWriteContents || selected.length === 0} onClick={() => { void run(() => remoteValue(() => remote.github.stage({ workspaceId, files: selected })), 'Stage the selected files?') }}>Stage selected</button>
      <input value={message} onChange={event => setMessage(event.currentTarget.value)} aria-label="Commit message" />
      <button type="button" disabled={!state.capabilities.canCommit} onClick={() => { void run(async () => remoteValue(() => remote.github.commit({ workspaceId, message })), 'Create a local commit with this message?') }}>Commit</button>
      <input value={branch} onChange={event => setBranch(event.currentTarget.value)} aria-label="Push branch" />
      <button type="button" disabled={!state.capabilities.canPush || !branch} onClick={() => { void pushChanges() }}>Push</button>
    </div>
    <h3>Create pull request</h3>
    <div style={{ display: 'grid', gap: 8, maxWidth: 700 }}>
      <input value={prTitle} onChange={event => setPrTitle(event.currentTarget.value)} placeholder="PR title" />
      <input value={base} onChange={event => setBase(event.currentTarget.value)} placeholder="Base branch" />
      <textarea value={prBody} onChange={event => setPrBody(event.currentTarget.value)} placeholder="PR body" rows={4} />
      <button type="button" disabled={!state.capabilities.canWritePullRequests || !prTitle || !branch || pushFailed} onClick={() => { void createPullRequest() }}>Create pull request</button>
      {pushFailed ? <small role="alert">Push failed; fix the remote error and retry Push before creating a PR.</small> : null}
    </div>
    <details style={{ marginTop: 20 }}><summary>Unified diff</summary><pre style={{ whiteSpace: 'pre-wrap', overflow: 'auto' }}>{diff?.unstaged || diff?.staged || diff?.head || '(no diff)'}</pre></details>
  </section>
}

function GitHubPanel({ ctx, controller }: { ctx: ClientContext; controller: PanelController }): ReactNode {
  const open = usePanelOpen(controller)
  const workspaceId = useWorkspaceId(ctx)
  const [tab, setTab] = useState<PanelTab>('issues')
  const [state, setState] = useState<WorkspaceGitHubState>()
  const [error, setError] = useState<string>()
  const remote = ctx.remote as RemoteFace
  const refreshState = useCallback(() => {
    if (!open || workspaceId === undefined) return
    void remoteValue(() => remote.github.getWorkspaceState({ workspaceId })).then(
      value => { setState(value); setError(undefined) },
      value => setError(value instanceof Error ? value.message : String(value)),
    )
  }, [open, remote, workspaceId])
  useEffect(() => {
    if (!open || workspaceId === undefined) return
    let active = true
    void remoteValue(() => remote.github.getWorkspaceState({ workspaceId })).then(
      value => { if (active) { setState(value); setError(undefined) } },
      value => { if (active) setError(value instanceof Error ? value.message : String(value)) },
    )
    return () => { active = false }
  }, [open, remote, workspaceId])
  if (!open) return null
  return <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'white', color: '#171717', overflow: 'auto', pointerEvents: 'auto' }} role="dialog" aria-label="GitHub integration">
    <PanelHeader tab={tab} setTab={setTab} onClose={() => controller.setOpen(false)} />
    {workspaceId === undefined ? <div style={{ padding: 20 }}>Select or create a Workspace first.</div> : error ? <ErrorBox error={error} /> : state === undefined ? <div style={{ padding: 20 }}>Loading…</div> : <><WorkspaceSummary state={state} /><WorkspaceAuthControl ctx={ctx} workspaceId={workspaceId} state={state} onSaved={refreshState} />{tab === 'issues' ? <IssuesView ctx={ctx} workspaceId={workspaceId} state={state} /> : tab === 'pulls' ? <PullRequestsView ctx={ctx} workspaceId={workspaceId} state={state} /> : <ChangesView ctx={ctx} workspaceId={workspaceId} state={state} />}</>}
  </div>
}

function GitHubSidebarAction({ wide, controller }: PropsRuntime<'sidebar.footer.action'> & { controller: PanelController }): ReactNode {
  return <button type="button" onClick={() => controller.setOpen(true)} title="GitHub" style={{ width: '100%', padding: '8px 10px' }}>
    {wide ? 'GitHub' : 'GH'}
  </button>
}

function GitHubSessionBadge({ sessionId, remote }: PropsRuntime<'conversation.session.header.actions'> & { sessionId: SessionId; remote: RemoteFace }): ReactNode {
  const [link, setLink] = useState<GitHubSessionLink | null>()
  useEffect(() => {
    let active = true
    void remoteValue(() => remote.github.getSessionLink({ sessionId })).then(value => { if (active) setLink(value) }, () => { if (active) setLink(null) })
    return () => { active = false }
  }, [remote, sessionId])
  if (link === undefined || link === null) return null
  const label = [
    link.issueNumber === undefined ? undefined : `Issue #${String(link.issueNumber)}`,
    link.pullRequestNumber === undefined ? undefined : `PR #${String(link.pullRequestNumber)}`,
  ].filter((value): value is string => value !== undefined).join(' · ')
  if (!label) return null
  return <span title="GitHub association" style={{ padding: '4px 8px', borderRadius: 999, background: '#eef2ff', fontSize: 12 }}>{label}</span>
}

function GitHubSettingsTab({ scope }: { scope: SettingsScope<GitHubAppSettings> }): ReactNode {
  const snapshot = useSyncExternalStore(scope.subscribe, scope.getSnapshot, scope.getSnapshot) as SettingsScopeSnapshot<GitHubAppSettings>
  const value = snapshot.value ?? DEFAULT_GITHUB_APP_SETTINGS
  const set = (field: keyof GitHubAppSettings, next: unknown): void => { void scope.set(field, next) }
  return <section style={{ display: 'grid', gap: 10, maxWidth: 640 }}>
    <h2>GitHub App</h2>
    <p>Only credential references are stored in Settings. The secret values remain in Harness credentials.</p>
    <label>App ID<input value={value.appId} onChange={event => set('appId', event.currentTarget.value)} /></label>
    <label>Client ID<input value={value.clientId} onChange={event => set('clientId', event.currentTarget.value)} /></label>
    <label>Client secret reference<input value={value.clientSecretRef} onChange={event => set('clientSecretRef', event.currentTarget.value)} /></label>
    <label>Private key reference<input value={value.privateKeyRef} onChange={event => set('privateKeyRef', event.currentTarget.value)} /></label>
    <label>User access token reference<input value={value.userAccessTokenRef} onChange={event => set('userAccessTokenRef', event.currentTarget.value)} /></label>
    <label>User refresh token reference<input value={value.userRefreshTokenRef} onChange={event => set('userRefreshTokenRef', event.currentTarget.value)} /></label>
    {snapshot.status === 'loading' ? <small>Loading settings…</small> : null}
  </section>
}

export const inject = ['slots', 'remote', 'connection', 'sessions', 'workspaces', 'settingsScope']

export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const remote = ctx.remote as RemoteFace
  const remoteDisposer = await ctx.remote.$mount(githubRemote)
  const controller = new PanelController()
  const settingsScope = ctx.settingsScope.bind<GitHubAppSettings>({ namespace: SETTINGS_NAMESPACE })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'github-integration',
    order: 40,
    inject: (props) => ({ ...props, controller }),
  }, GitHubSidebarAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'github-integration',
  }, () => <GitHubPanel ctx={ctx} controller={controller} />))
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'github-integration',
    order: -10,
    inject: (sessionId) => ({ sessionId, remote }),
  }, GitHubSessionBadge))
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'github-integration',
    order: 25,
    label: 'GitHub',
    inject: () => ({ scope: settingsScope }),
  }, GitHubSettingsTab))
  return async () => {
    await settingsScope.dispose()
    await remoteDisposer()
  }
}

export default apply
