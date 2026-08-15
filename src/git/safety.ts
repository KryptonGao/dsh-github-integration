import type { ToolExecution } from '@deepseek-ai/dsh-tools'

function commandOf(execution: Readonly<ToolExecution>): string | undefined {
  if (execution.name !== 'bash' && execution.name !== 'pwsh') return undefined
  const args = execution.arguments
  if (typeof args !== 'object' || args === null || !('command' in args)) return undefined
  const command = (args as { command?: unknown }).command
  return typeof command === 'string' ? command : undefined
}

/**
 * Host-owned monotonic policy for model-facing shell tools. The UI Gateway is
 * the only path for commit/push/PR actions, so an Agent cannot bypass its
 * confirmation steps through a shell command.
 */
export function gitSafetyGuard(execution: Readonly<ToolExecution>): string | undefined {
  const command = commandOf(execution)
  if (command === undefined) return undefined
  const normalized = command.replaceAll('\\', '/').replaceAll('\n', ' ')
  if (/\bgit\s+(?:commit|push|merge)\b/i.test(normalized)) {
    return 'Git commit, push, and merge are controlled by the GitHub Integration UI and require explicit confirmation.'
  }
  if (/\bgit\s+reset\b[^;|&]*\s--hard(?:\s|$)/i.test(normalized)) {
    return 'git reset --hard is blocked by the GitHub Integration safety policy.'
  }
  if (/\bgit\s+clean\b/i.test(normalized)) {
    return 'git clean is blocked by the GitHub Integration safety policy.'
  }
  if (/\bgit\s+branch\b[^;|&]*\s-[^-\s]*[Dd]\b/i.test(normalized) || /\bgit\s+branch\b[^;|&]*\s--delete\b/i.test(normalized)) {
    return 'Deleting a branch is blocked by the GitHub Integration safety policy.'
  }
  if (/\bgit\s+push\b[^;|&]*(?:--force|-f\b|--delete\b|\s:\S+)/i.test(normalized)) {
    return 'Force-push and remote branch deletion are blocked by the GitHub Integration safety policy.'
  }
  return undefined
}
