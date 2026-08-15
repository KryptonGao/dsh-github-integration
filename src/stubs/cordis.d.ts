export class Context {
  get<T = any>(name: string): T
  inject(dependencies: readonly string[], callback: (ctx: any) => void): unknown
  effect(callback: () => unknown, label?: string): () => void
}
export class Service {
  protected readonly ctx: Context
  constructor(ctx: Context, name: string)
}
