export interface SubprocessHandle {
  collected: Record<string, { readFrom(offset: number): { text: string } } | undefined>
  done: Promise<{ exitCode: number | null }>
}
