#!/usr/bin/env node
import { TabzClient } from "../client/index.js";
export interface TabzWorkflowContext {
    signal: AbortSignal;
}
export type TabzWorkflow = (client: TabzClient, context: TabzWorkflowContext) => unknown | Promise<unknown>;
export declare function main(argv?: string[], env?: NodeJS.ProcessEnv): Promise<number>;
//# sourceMappingURL=index.d.ts.map