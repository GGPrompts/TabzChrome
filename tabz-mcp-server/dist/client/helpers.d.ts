import type { PageActAction } from "../tools/act-actions.js";
import type { TabzClient } from "./index.js";
import { TabzClientError } from "./errors.js";
export declare const TABZ_BROWSER_TOOLS: readonly ["tabz_open_url", "tabz_list_tabs", "tabz_switch_tab", "tabz_close_tab", "tabz_get_page_info", "tabz_get_element", "tabz_read_page", "tabz_fill", "tabz_act", "tabz_claude_group_status"];
export type TabzBrowserToolName = typeof TABZ_BROWSER_TOOLS[number];
export type TabzReadToolName = "tabz_list_tabs" | "tabz_get_page_info" | "tabz_get_element" | "tabz_read_page" | "tabz_claude_group_status";
export type TabzReadFailureStatus = "not_found" | "refused" | "transport_error" | "failed";
export interface TabzStructuredResult {
    status: string;
    text: string;
    error?: string;
    [key: string]: unknown;
}
export interface TabzOpenUrlResult extends TabzStructuredResult {
    status: "created";
    opened: true;
    reused: false;
    tabId: number;
    groupId: number;
    inClaudeGroup: boolean;
    url: string;
}
export interface TabzTabInfo {
    tabId: number;
    url?: string;
    title?: string;
    active?: boolean;
    inClaudeGroup?: boolean;
    customName?: string;
    [key: string]: unknown;
}
export interface TabzListTabsResult extends TabzStructuredResult {
    status: "found" | TabzReadFailureStatus;
    total: number;
    claudeCurrentTabId: number | null;
    tabs: TabzTabInfo[];
}
export interface TabzSwitchTabResult extends TabzStructuredResult {
    status: "switched";
    switched: true;
    tabId: number;
}
export interface TabzCloseTabResult extends TabzStructuredResult {
    status: "closed";
    closed: number[];
    refused: Array<{
        tabId: number;
        reason: string;
    }>;
    missing: number[];
    groupId: number | null;
}
export interface TabzPageInfoResult extends TabzStructuredResult {
    status: "found" | TabzReadFailureStatus;
    found: boolean;
    tabId: number | null;
    url: string | null;
    title: string | null;
    favIconUrl?: string | null;
}
export interface TabzElementResult extends TabzStructuredResult {
    status: "found" | TabzReadFailureStatus;
    found: boolean;
    selector: string;
    tagName?: string | null;
    innerText?: string;
    attributes?: Record<string, string>;
    bounds?: Record<string, number> | null;
    parentSelector?: string | null;
    childCount?: number | null;
}
export interface TabzFillResult extends TabzStructuredResult {
    status: "verified";
    dispatched: true;
    verified: true;
    verificationInterrupted: false;
    selector: string;
    tabId: number | null;
    sensitive: boolean;
    actualLength?: number;
    actualValue?: string | boolean;
}
export interface TabzActResult extends TabzStructuredResult {
    status: "completed" | "verified";
    action: string;
    success: true;
    verified?: true;
    trusted: boolean;
    protected?: boolean;
    sensitive?: boolean;
    actualValue?: string;
    tabId?: number | null;
    [key: string]: unknown;
}
export interface TabzActInput {
    tabId: number;
    action: PageActAction;
    ref?: string;
    selector?: string;
    text?: string;
    x?: number;
    y?: number;
    value?: string;
    key?: string;
    repeat?: number;
    modifiers?: string;
    direction?: "up" | "down" | "left" | "right";
    ticks?: number;
    toX?: number;
    toY?: number;
    toSelector?: string;
    x0?: number;
    y0?: number;
    x1?: number;
    y1?: number;
    fullPage?: boolean;
    outputPath?: string;
    seconds?: number;
    trusted?: boolean;
    observe?: boolean;
    waitTimeout?: number;
}
export interface TabzReadPageResult extends TabzStructuredResult {
    status: "completed" | TabzReadFailureStatus;
    success: boolean;
    outline?: string;
    tabId?: number;
    title?: string | null;
    url?: string | null;
    nodeCount?: number;
    refCount?: number;
    truncated?: boolean;
}
export interface TabzGroupStatusResult extends TabzStructuredResult {
    status: "active" | "not_created" | TabzReadFailureStatus;
    exists: boolean;
    groupId: number | null;
    group: Record<string, unknown> | null;
    tabCount: number;
    tabIds: number[];
}
export declare class TabzWorkflowAssertionError extends TabzClientError {
    constructor(message: string, options?: ErrorOptions);
}
export interface TabzAssertionMetadata {
    operation: string;
    targetLabel: string;
    startedAt?: number;
    attempts?: number;
}
/** Fails with exit 1 and reports metadata only. */
export declare function assert(condition: unknown, metadata: TabzAssertionMetadata): asserts condition;
export interface WaitForOptions extends TabzAssertionMetadata {
    operation: TabzReadToolName;
    /** Total wall-clock budget in milliseconds, measured from waitFor entry. */
    deadline: number;
    interval: number;
    maxAttempts: number;
    signal?: AbortSignal;
}
/** Polls only a classified read operation. */
export declare function waitFor<T>(readFn: () => Promise<T | false | null | undefined>, options: WaitForOptions): Promise<T>;
/** Typed, explicit-target wrappers for the page-agent workflow operations. */
export declare class TabzWorkflowClient {
    readonly client: TabzClient;
    constructor(client: TabzClient);
    openUrl(url: string, options?: {
        background?: boolean;
        groupId?: number;
    }): Promise<TabzOpenUrlResult>;
    listTabs(): Promise<TabzListTabsResult>;
    switchTab(tabId: number): Promise<TabzSwitchTabResult>;
    closeTab(tabId: number): Promise<TabzCloseTabResult>;
    closeOwnedTabAfterReconciliation(tabId: number): Promise<TabzCloseTabResult>;
    getPageInfo(tabId: number): Promise<TabzPageInfoResult>;
    getElement(input: {
        tabId: number;
        selector: string;
        includeStyles?: boolean;
        styleProperties?: string[];
    }): Promise<TabzElementResult>;
    readPage(input: {
        tabId: number;
        maxChars?: number;
    }): Promise<TabzReadPageResult>;
    fill(input: {
        tabId: number;
        selector: string;
        value: string | boolean;
    }): Promise<TabzFillResult>;
    act(input: TabzActInput): Promise<TabzActResult>;
    groupStatus(): Promise<TabzGroupStatusResult>;
    private read;
    private mutation;
    private mutationResult;
    private markUncertain;
}
//# sourceMappingURL=helpers.d.ts.map