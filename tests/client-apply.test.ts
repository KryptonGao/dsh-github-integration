import { describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.tsx'

describe('Client slot integration', () => {
  it('registers the sidebar, overlay, session badge, and settings contributions', async () => {
    const registrations: Array<{ name: string; id?: string }> = []
    const scope = {
      subscribe: () => () => undefined,
      getSnapshot: () => ({ value: undefined }),
      set: async () => undefined,
      dispose: async () => undefined,
    }
    const context = {
      remote: { $mount: async () => async () => undefined },
      settingsScope: { bind: () => scope },
      slots: {
        inject: (_name: string, callback: () => unknown) => { callback() },
        register: (options: { name: string; id?: string }) => {
          registrations.push({ name: options.name, ...(options.id === undefined ? {} : { id: options.id }) })
          return () => undefined
        },
      },
    }
    const dispose = await apply(context as never)
    expect(registrations).toEqual([
      { name: 'sidebar.footer.action', id: 'github-integration' },
      { name: 'shell.overlay', id: 'github-integration' },
      { name: 'conversation.session.header.actions', id: 'github-integration' },
      { name: 'settings.plugins.tab', id: 'github-integration' },
    ])
    await dispose()
  })
})
