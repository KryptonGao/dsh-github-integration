import type { TypertContribution } from '@deepseek-ai/dsh-typert-protocol'
import { TYPERT_REMOTE } from './remote.ts'

/** Hand-authored reflection companion for the standalone bundle package. */
export const TYPERT: TypertContribution = {
  package: 'dsh-github-integration',
  face: 'host',
  schemas: [],
  model: { services: [], events: [], objects: [] },
  invocations: TYPERT_REMOTE.descriptors,
}

export default TYPERT
