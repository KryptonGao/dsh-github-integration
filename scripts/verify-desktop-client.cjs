#!/usr/bin/env node
// Exercise the shipped client factory without installing another DSH runtime.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

async function main() {
  const root = path.join(__dirname, '..')
  let client
  vm.runInNewContext(fs.readFileSync(path.join(root, 'lib/client.js'), 'utf8'), {
    window: { __ModuleLoader__: { load(registration) {
      assert.equal(registration.id, 'dsh-github-integration')
      client = registration.factory(name => {
        assert.ok(['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis'].includes(name), name)
        return {}
      })
    } } },
  })
  assert.ok(client.inject.includes('configForms'))
  const registrations = []
  let remoteDisposed = false
  let scopeDisposed = false
  const scope = { dispose: () => { scopeDisposed = true } }
  const dispose = await client.apply({
    effect: fn => fn(),
    locale: { register: () => () => {}, bind: () => key => key },
    get: () => ({}),
    remote: { $mount: async contribution => {
      assert.equal(contribution.descriptors.length, 21)
      for (const descriptor of contribution.descriptors) {
        const codecs = [descriptor.result, ...descriptor.parameters.map(p => p.codec)]
        for (const codec of codecs) {
          assert.equal(codec.mode, 'strict', descriptor.id)
          assert.equal(typeof codec.create, 'function', `${descriptor.id}: missing codec.create()`)
          assert.ok(codec.typeSymbol)
          const schema = codec.create()
          assert.equal(schema.safeParse({ workspaceId: 'workspace', files: ['a.txt'] }).success, true)
          assert.equal(schema.safeParse({ nonJson: () => {} }).success, false)
        }
        assert.equal(descriptor.result.create().safeParse(undefined).success, true)
      }
      return async () => { remoteDisposed = true }
    } },
    configForms: { get: id => {
      assert.equal(id, 'include:github-integration')
      return scope
    } },
    slots: { inject: (_name, fn) => fn(), register: entry => {
      registrations.push(entry)
      return () => {}
    } },
  })
  assert.deepEqual(registrations.map(entry => entry.name), [
    'conversation.view', 'conversation.session.header.actions', 'settings.plugins.tab',
  ])
  assert.equal(registrations[2].inject().scope, scope)
  await dispose()
  assert.equal(remoteDisposed, true)
  assert.equal(scopeDisposed, false, 'shared configForms scope must not be disposed by the plugin')

  // The auth path must read saved plugin configuration, not a retired settings.get().
  const host = fs.readFileSync(path.join(root, 'lib/index.js'), 'utf8')
  const readSource = host.match(/async function readSettings\(ctx\) \{[\s\S]*?\n\}/)?.[0]
  assert.ok(readSource)
  const readSettings = vm.runInNewContext(`(${readSource})`, {
    DEFAULT_GITHUB_APP_SETTINGS: { appId: 'default', clientId: 'default' },
  })
  const saved = await readSettings({ fiber: { effectiveConfig: { appId: 'saved' } } })
  assert.equal(saved.appId, 'saved')
  assert.equal(saved.clientId, 'default')
  console.log('PASS: 21 strict Remote codecs, GitHub settings tab, shared form lifecycle and saved Host configuration.')
}

main().catch(error => { console.error(error); process.exitCode = 1 })
