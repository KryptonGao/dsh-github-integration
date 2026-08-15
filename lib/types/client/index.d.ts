import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
export declare const inject: string[];
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
export default apply;
//# sourceMappingURL=index.d.ts.map