import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
interface GeneratedPullRequestDraft {
    title: string;
    body: string;
}
export declare function extractGeneratedPullRequestDraft(snapshot: unknown): GeneratedPullRequestDraft | undefined;
export declare function toggleSelectedPath(current: string[], path: string, checked: boolean): string[];
export declare const inject: string[];
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
export {};
//# sourceMappingURL=index.d.ts.map