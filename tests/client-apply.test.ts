import { describe, expect, it } from 'vitest'
import { apply, extractGeneratedPullRequestDraft, toggleSelectedPath } from '../src/client/index.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

describe('Client slot integration', () => {
  it('toggles selected files without depending on a pooled React event', () => {
    expect(toggleSelectedPath([], 'src/app.ts', true)).toEqual(['src/app.ts'])
    expect(toggleSelectedPath(['src/app.ts'], 'src/app.ts', true)).toEqual(['src/app.ts'])
    expect(toggleSelectedPath(['src/app.ts', 'README.md'], 'src/app.ts', false)).toEqual(['README.md'])
  })

  it('extracts generated pull request content from finalized and partial session snapshots', () => {
    expect(extractGeneratedPullRequestDraft({
      nodes: [{ kind: 'assistant', blocks: [{ kind: 'text', text: '{"title":"Fix filters","body":"## Summary\\n- Fix"}' }] }],
    })).toEqual({ title: 'Fix filters', body: '## Summary\n- Fix' })
    expect(extractGeneratedPullRequestDraft({
      partial: { blocks: [{ kind: 'text', text: '{"title":"Fix filters","body":"## Testing\\nNot run"}' }] },
    })).toEqual({ title: 'Fix filters', body: '## Testing\nNot run' })
  })

  it('registers the GitHub view, session badge, and settings contributions', async () => {
    const registrations: Array<{ name: string; id?: string; order?: number; label?: string; locale?: string }> = []
    let activeLocale: 'zh' | 'en' = 'zh'
    const registeredDictionaries: Array<{ namespace: string; dictionaries: unknown }> = []
    const translate = (key: string): string => {
      const dictionaries = activeLocale === 'zh' ? zh : en
      return dictionaries[key as keyof typeof zh] ?? key
    }
    const scope = {
      subscribe: () => () => undefined,
      getSnapshot: () => ({ value: undefined }),
      set: async () => undefined,
      dispose: async () => undefined,
    }
    const context = {
      effect: (factory: () => unknown) => factory(),
      locale: {
        register: (namespace: string, dictionaries: unknown) => {
          registeredDictionaries.push({ namespace, dictionaries })
          return () => undefined
        },
        bind: () => translate,
      },
      remote: { $mount: async () => async () => undefined },
      settingsScope: { bind: () => scope },
      get: (name: string) => name === 'connection' ? { api: {} } : undefined,
      slots: {
        inject: (_name: string, callback: () => unknown) => { callback() },
        register: (options: { name: string; id?: string; order?: number; label?: string | (() => string); locale?: string }) => {
          registrations.push({
            name: options.name,
            ...(options.id === undefined ? {} : { id: options.id }),
            ...(options.order === undefined ? {} : { order: options.order }),
            ...(options.label === undefined ? {} : { label: typeof options.label === 'function' ? options.label() : options.label }),
            ...(options.locale === undefined ? {} : { locale: options.locale }),
          })
          return () => undefined
        },
      },
    }
    const dispose = await apply(context as never)
    expect(registrations).toEqual([
      { name: 'conversation.view', id: 'github', order: 20, label: 'GitHub', locale: NS },
      { name: 'conversation.session.header.actions', id: 'github-integration', order: -10, locale: NS },
      { name: 'settings.plugins.tab', id: 'github-integration', order: 25, label: 'GitHub', locale: NS },
    ])
    expect(registeredDictionaries).toEqual([{ namespace: NS, dictionaries: { zh, en } }])
    activeLocale = 'en'
    expect(translate('tab.issues')).toBe('Issues')
    await dispose()
  })
})
