import type { ToolExecution } from '@deepseek-ai/dsh-tools';
/**
 * Host-owned monotonic policy for model-facing shell tools. The UI Gateway is
 * the only path for commit/push/PR actions, so an Agent cannot bypass its
 * confirmation steps through a shell command.
 */
export declare function gitSafetyGuard(execution: Readonly<ToolExecution>): string | undefined;
//# sourceMappingURL=safety.d.ts.map