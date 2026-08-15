import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { GitService } from '../src/git/service.ts'

function fakeSubprocess() {
  return {
    spawn(options: { argv: string[]; cwd: string; env?: Record<string, string> }) {
      const child = spawn(options.argv[0]!, options.argv.slice(1), {
        cwd: options.cwd,
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout?.on('data', chunk => { stdout += String(chunk) })
      child.stderr?.on('data', chunk => { stderr += String(chunk) })
      const done = new Promise<{ exitCode: number | null }>(resolve => {
        child.on('close', code => resolve({ exitCode: code }))
      })
      return {
        collected: {
          stdout: { readFrom: () => ({ text: stdout }) },
          stderr: { readFrom: () => ({ text: stderr }) },
        },
        done,
      }
    },
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: 'ignore' })
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`git ${args.join(' ')} exited ${String(code)}`)))
  })
}

describe('GitService integration', () => {
  it('stages, commits, and pushes through the workspace-bound service', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-github-integration-'))
    const bare = join(root, 'remote.git')
    const worktree = join(root, 'worktree')
    try {
      await mkdir(worktree)
      await mkdir(bare)
      await git(bare, 'init', '--bare')
      await git(worktree, 'init', '-b', 'main')
      await git(worktree, 'config', 'user.email', 'test@example.com')
      await git(worktree, 'config', 'user.name', 'Test User')
      await writeFile(join(worktree, 'README.md'), 'initial\n')
      await git(worktree, 'add', '--', 'README.md')
      await git(worktree, 'commit', '-m', 'initial')
      await git(worktree, 'remote', 'add', 'origin', bare)

      const ctx = {
        get(name: string) {
          if (name === 'subprocess') return fakeSubprocess()
          if (name === 'workspaceRegistry') return { get: () => ({ path: worktree }) }
          return undefined
        },
      }
      const service = new GitService(ctx as never)
      await service.createBranch('workspace-1', 'agent/issue-7-fix', new AbortController().signal)
      await writeFile(join(worktree, 'fix.txt'), 'safe fix\n')
      const before = await service.status('workspace-1')
      expect(before.entries.map(entry => entry.path)).toContain('fix.txt')
      await service.stage('workspace-1', ['fix.txt'])
      const commit = await service.commit('workspace-1', 'fix: resolve issue')
      await service.push('workspace-1', before.branch)
      const pushed = await new Promise<string>((resolve, reject) => {
        const child = spawn('git', ['--git-dir', bare, 'rev-parse', before.branch], { stdio: ['ignore', 'pipe', 'pipe'] })
        let output = ''
        child.stdout?.on('data', chunk => { output += String(chunk) })
        child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error('remote ref missing')))
      })
      expect(pushed).toBe(commit)
      expect(await readFile(join(worktree, 'fix.txt'), 'utf8')).toBe('safe fix\n')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
