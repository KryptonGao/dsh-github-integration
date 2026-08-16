import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type {
  GitHubAuthMode,
  GitHubAuthStatus,
  GitHubInstallationAccess,
  GitHubSessionLink,
  GitHubUserProfile,
} from '../types.ts'

export interface StoredAuthState {
  status: GitHubAuthStatus
  installations: GitHubInstallationAccess[]
  user?: GitHubUserProfile
  expiresAt?: number
  refreshTokenExpiresAt?: number
}

interface StoredState {
  bindings: Record<string, { authMode: GitHubAuthMode; installationId?: number }>
  sessions: Record<string, GitHubSessionLink>
  auth: StoredAuthState
}

const EMPTY_STATE: StoredState = {
  bindings: {},
  sessions: {},
  auth: { status: 'disconnected', installations: [] },
}

function storagePath(): string {
  const root = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(root, 'github-integration', 'state.json')
}

/** Small serialized JSON store for plugin-owned Workspace and Session links. */
export class GitHubStateStore {
  private state: StoredState = structuredClone(EMPTY_STATE)
  private loaded = false
  private tail: Promise<void> = Promise.resolve()

  async load(): Promise<void> {
    if (this.loaded) return
    this.loaded = true
    try {
      const raw = await readFile(storagePath(), 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoredState>
      this.state = {
        bindings: parsed.bindings ?? {},
        sessions: parsed.sessions ?? {},
        auth: {
          status: parsed.auth?.status ?? 'disconnected',
          installations: parsed.auth?.installations ?? [],
          ...(parsed.auth?.user === undefined ? {} : { user: parsed.auth.user }),
          ...(parsed.auth?.expiresAt === undefined ? {} : { expiresAt: parsed.auth.expiresAt }),
          ...(parsed.auth?.refreshTokenExpiresAt === undefined ? {} : { refreshTokenExpiresAt: parsed.auth.refreshTokenExpiresAt }),
        },
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }

  binding(workspaceId: string): StoredState['bindings'][string] | undefined {
    return this.state.bindings[workspaceId]
  }

  async setBinding(workspaceId: string, value: StoredState['bindings'][string]): Promise<void> {
    this.state.bindings[workspaceId] = value
    await this.persist()
  }

  session(sessionId: string): GitHubSessionLink | undefined {
    return this.state.sessions[sessionId]
  }

  async setSession(value: GitHubSessionLink): Promise<void> {
    this.state.sessions[value.sessionId] = value
    await this.persist()
  }

  auth(): StoredAuthState {
    return structuredClone(this.state.auth)
  }

  async setAuth(value: StoredAuthState): Promise<void> {
    this.state.auth = structuredClone(value)
    await this.persist()
  }

  async clearAuth(): Promise<void> {
    this.state.auth = { status: 'disconnected', installations: [] }
    await this.persist()
  }

  private persist(): Promise<void> {
    this.tail = this.tail.then(async () => {
      const path = storagePath()
      const temp = `${path}.tmp`
      await mkdir(dirname(path), { recursive: true })
      await writeFile(temp, `${JSON.stringify(this.state, null, 2)}\n`, { mode: 0o600 })
      await rename(temp, path)
    })
    return this.tail
  }
}

export type StoredBinding = NonNullable<ReturnType<GitHubStateStore['binding']>>
