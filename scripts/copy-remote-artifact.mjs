import { cp } from 'node:fs/promises'

await cp('lib/types/remote.js', 'lib/typert.remote-client.js')
await cp('lib/types/remote.d.ts', 'lib/typert.remote-client.d.ts')
await cp('lib/types/typert.host.d.ts', 'lib/typert.host.d.ts')
