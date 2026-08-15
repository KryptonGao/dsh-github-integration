import type { Context } from '@deepseek-ai/cordis'
import type { SubprocessHandle } from '@deepseek-ai/dsh-subprocess'
import type {
  GitDiff,
  GitStatus,
  GitStatusEntry,
} from '../types.ts'
import { MAX_DIFF_BYTES } from '../types.ts'
import { parseGitHubRemote, safeBranchName } from './remote.ts'

interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

const MAX_COMMAND_OUTPUT = 2_000_000

function readCollected(handle: SubprocessHandle, stream: 'stdout' | 'stderr'): string {
  return handle.collected[stream]?.readFrom(0).text ?? ''
}

/** Run git without a shell. Every caller supplies an argv array and a validated cwd. */
export async function runGit(
  ctx: Context,
  cwd: string,
  args: readonly string[],
  signal?: AbortSignal,
): Promise<CommandResult> {
  const subprocess = ctx.get('subprocess')
  if (subprocess === undefined) throw new Error('GitHub integration requires the Host subprocess service')
  const handle = subprocess.spawn({
    argv: ['git', ...args],
    cwd,
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: MAX_COMMAND_OUTPUT },
      stderr: { maxBytes: 128_000 },
    },
    graceMs: 2_000,
    signal,
    env: {
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      PAGER: 'cat',
      NO_COLOR: '1',
    },
  })
  const outcome = await handle.done
  return {
    stdout: readCollected(handle, 'stdout'),
    stderr: readCollected(handle, 'stderr'),
    exitCode: outcome.exitCode,
  }
}

function commandFailure(args: readonly string[], result: CommandResult): Error {
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${String(result.exitCode)}`
  return new Error(`git ${args.join(' ')} failed: ${detail.slice(0, 4_000)}`)
}

async function requireGit(ctx: Context, cwd: string, args: readonly string[], signal?: AbortSignal): Promise<string> {
  const result = await runGit(ctx, cwd, args, signal)
  if (result.exitCode !== 0) throw commandFailure(args, result)
  return result.stdout
}

function workspacePath(ctx: Context, workspaceId: string): string {
  const registry = ctx.get('workspaceRegistry') as { get?: (id: string) => { path?: string } | undefined } | undefined
  const workspace = registry?.get?.(workspaceId)
  if (workspace?.path === undefined || workspace.path.length === 0) {
    throw new Error(`workspace not found: ${workspaceId}`)
  }
  return workspace.path
}

function assertRelativePath(path: string): void {
  if (!path || path.includes('\0') || path.startsWith('/') || path.startsWith('\\')) {
    throw new Error(`unsafe repository path: ${path}`)
  }
  const segments = path.replaceAll('\\', '/').split('/')
  if (segments.some(segment => segment === '..' || segment === '')) {
    throw new Error(`unsafe repository path: ${path}`)
  }
}

function parseStatusLine(line: string): GitStatusEntry | undefined {
  if (line.length < 3) return undefined
  const index = line[0]
  const worktree = line[1]
  const path = line.slice(3)
  if (index === undefined || worktree === undefined || !path) return undefined
  const code = index === '?' && worktree === '?' ? 'untracked' : index === 'R' || worktree === 'R'
    ? 'renamed'
    : index === 'A' || worktree === 'A'
      ? 'added'
      : index === 'D' || worktree === 'D'
        ? 'deleted'
        : index === 'C' || worktree === 'C'
          ? 'copied'
          : index === 'M' || worktree === 'M'
            ? 'modified'
            : 'unknown'
  return { path, index, worktree, status: code }
}

function parseHeader(header: string): Pick<GitStatus, 'branch' | 'upstream' | 'ahead' | 'behind'> {
  const value = header.replace(/^##\s*/, '')
  const [branchPart = '', trackingPart] = value.split('...', 2)
  const branch = branchPart.split(' ', 1)[0] || '(detached)'
  const tracking = trackingPart?.match(/^([^ ]+)(?: \[([^\]]+)\])?$/)
  const counts = tracking?.[2] ?? ''
  return {
    branch,
    ...(tracking?.[1] === undefined ? {} : { upstream: tracking[1] }),
    ahead: Number(counts.match(/ahead (\d+)/)?.[1] ?? 0),
    behind: Number(counts.match(/behind (\d+)/)?.[1] ?? 0),
  }
}

/** Parse `git status --porcelain=v1 -z --branch` into a safe UI shape. */
export function parseGitStatus(output: string): GitStatus {
  const tokens = output.split('\0').filter(Boolean)
  const header = tokens.shift() ?? '## (detached)'
  const entries: GitStatusEntry[] = []
  for (let index = 0; index < tokens.length; index += 1) {
    const entry = parseStatusLine(tokens[index] ?? '')
    if (entry === undefined) continue
    if (entry.status === 'renamed' && tokens[index + 1] !== undefined && !tokens[index + 1]!.startsWith(' ')) {
      entry.oldPath = tokens[index + 1]!
      index += 1
    }
    entries.push(entry)
  }
  return {
    ...parseHeader(header),
    entries,
    clean: entries.length === 0,
  }
}

function boundedDiff(text: string): { text: string; truncated: boolean } {
  const bytes = new TextEncoder().encode(text)
  if (bytes.byteLength <= MAX_DIFF_BYTES) return { text, truncated: false }
  return { text: new TextDecoder().decode(bytes.slice(0, MAX_DIFF_BYTES)) + '\n\n[diff truncated]', truncated: true }
}

export class GitService {
  constructor(private readonly ctx: Context) {}

  async detectRepository(workspaceId: string, signal?: AbortSignal) {
    const cwd = workspacePath(this.ctx, workspaceId)
    const remoteUrl = (await requireGit(this.ctx, cwd, ['remote', 'get-url', 'origin'], signal)).trim()
    return parseGitHubRemote(remoteUrl)
  }

  async currentBranch(workspaceId: string, signal?: AbortSignal): Promise<string> {
    const cwd = workspacePath(this.ctx, workspaceId)
    return (await requireGit(this.ctx, cwd, ['branch', '--show-current'], signal)).trim() || '(detached)'
  }

  async status(workspaceId: string, signal?: AbortSignal): Promise<GitStatus> {
    const cwd = workspacePath(this.ctx, workspaceId)
    return parseGitStatus(await requireGit(this.ctx, cwd, ['status', '--porcelain=v1', '-z', '--branch'], signal))
  }

  async diff(workspaceId: string, signal?: AbortSignal): Promise<GitDiff> {
    const cwd = workspacePath(this.ctx, workspaceId)
    const status = await this.status(workspaceId, signal)
    const [unstaged, staged, head] = await Promise.all([
      requireGit(this.ctx, cwd, ['diff', '--no-ext-diff', '--unified=3'], signal),
      requireGit(this.ctx, cwd, ['diff', '--cached', '--no-ext-diff', '--unified=3'], signal),
      requireGit(this.ctx, cwd, ['diff', 'HEAD', '--no-ext-diff', '--unified=3'], signal),
    ])
    let combinedUnstaged = unstaged
    for (const entry of status.entries.filter(candidate => candidate.status === 'untracked')) {
      assertRelativePath(entry.path)
      const untracked = await runGit(this.ctx, cwd, ['diff', '--no-index', '--no-ext-diff', '--unified=3', '--', '/dev/null', entry.path], signal)
      if (untracked.stdout) combinedUnstaged += `\n${untracked.stdout}`
    }
    const bounded: [{ text: string; truncated: boolean }, { text: string; truncated: boolean }, { text: string; truncated: boolean }] = [
      boundedDiff(combinedUnstaged), boundedDiff(staged), boundedDiff(head),
    ]
    return {
      unstaged: bounded[0].text,
      staged: bounded[1].text,
      head: bounded[2].text,
      truncated: bounded.some(value => value.truncated),
    }
  }

  async createBranch(workspaceId: string, name: string, signal?: AbortSignal): Promise<void> {
    const cwd = workspacePath(this.ctx, workspaceId)
    await requireGit(this.ctx, cwd, ['switch', '-c', safeBranchName(name)], signal)
  }

  async stage(workspaceId: string, files: string[], signal?: AbortSignal): Promise<void> {
    if (files.length === 0) throw new Error('at least one file is required to stage')
    for (const file of files) assertRelativePath(file)
    const cwd = workspacePath(this.ctx, workspaceId)
    await requireGit(this.ctx, cwd, ['add', '--', ...files], signal)
  }

  async commit(workspaceId: string, message: string, signal?: AbortSignal): Promise<string> {
    const normalized = message.trim()
    if (!normalized) throw new Error('commit message is required')
    if (normalized.length > 200) throw new Error('commit message is too long')
    const cwd = workspacePath(this.ctx, workspaceId)
    await requireGit(this.ctx, cwd, ['commit', '-m', normalized], signal)
    return (await requireGit(this.ctx, cwd, ['rev-parse', 'HEAD'], signal)).trim()
  }

  async push(workspaceId: string, branch: string, signal?: AbortSignal): Promise<void> {
    const cwd = workspacePath(this.ctx, workspaceId)
    await requireGit(this.ctx, cwd, ['push', '--set-upstream', 'origin', safeBranchName(branch)], signal)
  }
}
