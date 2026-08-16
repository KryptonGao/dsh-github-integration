import { defineConfig } from 'tsdown'
import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'

const isClient = (value: unknown): boolean => {
  if (value === 'client') return true
  if (value === undefined || value === 'host') return false
  throw new Error(`DSH_BUILD_FACE must be host or client, received ${String(value)}`)
}

export default defineConfig(({ env }) => {
  const client = isClient(env?.DSH_BUILD_FACE)
  return {
    entry: client ? { client: 'lib/types/client/index.js' } : ['lib/types/index.js', 'lib/types/typert.host.js'],
    outDir: 'lib',
    format: client ? ['cjs'] : ['esm'],
    platform: client ? 'browser' : 'node',
    target: 'es2024',
    dts: false,
    clean: false,
    fixedExtension: false,
    external: client
      ? ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis']
      : [/^@deepseek-ai\//],
    ...(client ? {
      deps: {
        alwaysBundle: ['zod'],
      },
      outputOptions: {
        entryFileNames: 'client.js',
        banner: 'window.__ModuleLoader__.load({ id: "dsh-github-integration", factory: (require) => { const module = { exports: {} }; const exports = module.exports;',
        footer: 'return module.exports; } });',
      },
    } : {
      plugins: [typertPlugin({ mode: 'package', faces: ['host'] })],
    }),
  }
})
