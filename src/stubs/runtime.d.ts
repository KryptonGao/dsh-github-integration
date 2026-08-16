export type SessionId = string
export type WorkspaceId = string
export interface SettingsScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable'
  value: T | undefined
}
export interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>
  subscribe(listener: () => void): () => void
  set(field: string, value: unknown): Promise<void>
  unset(field: string): Promise<void>
  dispose(): Promise<void>
}

export interface LocaleService {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): (key: string, params?: Record<string, unknown>) => string
}

export interface ClientContext {
  remote: any
  sessions: {
    list: {
      subscribe(listener: () => void): () => void
      getSnapshot(): { current?: string; byId: Record<string, { id: string }> }
    }
    binding(sessionId: string): any
    open(sessionId: string): void
  }
  workspaces: {
    list: {
      subscribe(listener: () => void): () => void
      getSnapshot(): { items: Array<{ workspaceId: string; sessionIds: string[] }>; recentWorkspaceId?: string }
    }
  }
  settingsScope: {
    bind<T>(spec: { namespace: string }): SettingsScope<T>
  }
  locale: LocaleService
  effect<T>(factory: () => T, label?: string): T
  slots: {
    inject(name: string, callback: () => unknown): unknown
    register(options: { inject?: (value: any) => any; [key: string]: any }, component: any): unknown
  }
  connection: any
  get(name: string): any
}
