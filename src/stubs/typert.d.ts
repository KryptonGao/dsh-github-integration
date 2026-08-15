import type { Context } from './cordis.d.ts'
export type RemoteResult<T> = {
  ok: true
  value: T
} | {
  ok: false
  error: { code: string; message: string }
}
export interface TypertRemoteContribution {
  package: string
  descriptors: readonly Record<string, unknown>[]
}
export interface TypertContribution {
  package: string
  face: 'host'
  schemas: readonly Record<string, unknown>[]
  model: { services: readonly unknown[]; events: readonly unknown[]; objects: readonly unknown[] }
  invocations: readonly Record<string, unknown>[]
}
export function Remote<This extends object, Args extends unknown[], Result>(
  method: (this: This, ...args: Args) => Result,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
): void
export class TypertRemoteService {
  protected readonly ctx: Context
  constructor(ctx: Context, name: string)
}
export interface TypertRemoteMap {}
export interface TypertRemoteNamespaceMap {}
