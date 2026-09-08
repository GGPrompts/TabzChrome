import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { PageActAction } from "../tools/act-actions.js";
import type { TabzClient } from "./index.js";
import {
  TabzClientError,
  TabzToolError,
  TabzTransportError,
  TabzUncertainMutationError,
  TabzUsageError
} from "./errors.js";

export const TABZ_BROWSER_TOOLS = [
  "tabz_open_url",
  "tabz_list_tabs",
  "tabz_switch_tab",
  "tabz_close_tab",
  "tabz_get_page_info",
  "tabz_get_element",
  "tabz_read_page",
  "tabz_fill",
  "tabz_act",
  "tabz_claude_group_status"
] as const;

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
  refused: Array<{ tabId: number; reason: string }>;
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

export class TabzWorkflowAssertionError extends TabzClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 1, options);
  }
}

export interface TabzAssertionMetadata {
  operation: string;
  targetLabel: string;
  startedAt?: number;
  attempts?: number;
}

/** Fails with exit 1 and reports metadata only. */
export function assert(condition: unknown, metadata: TabzAssertionMetadata): asserts condition {
  if (condition) return;
  throw new TabzWorkflowAssertionError(metadataMessage("assertion failed", metadata));
}

export interface WaitForOptions extends TabzAssertionMetadata {
  operation: TabzReadToolName;
  /** Total wall-clock budget in milliseconds, measured from waitFor entry. */
  deadline: number;
  interval: number;
  maxAttempts: number;
  signal?: AbortSignal;
}

/** Polls only a classified read operation. */
export async function waitFor<T>(
  readFn: () => Promise<T | false | null | undefined>,
  options: WaitForOptions
): Promise<T> {
  positiveInteger(options.deadline, "deadline");
  positiveInteger(options.interval, "interval");
  positiveInteger(options.maxAttempts, "maxAttempts");
  if (!READ_TOOLS.has(options.operation)) {
    throw new TabzUsageError(`waitFor operation is not a classified read: ${options.operation}`);
  }

  const waitStartedAt = Date.now();
  const expiresAt = waitStartedAt + options.deadline;
  const metadataStartedAt = options.startedAt ?? waitStartedAt;
  let attempts = 0;
  while (attempts < options.maxAttempts && Date.now() - waitStartedAt < options.deadline) {
    options.signal?.throwIfAborted();
    attempts += 1;
    const observation = await readWithinDeadline(readFn, expiresAt, options.signal, options, metadataStartedAt, attempts);
    if (isStructured(observation)) {
      if (observation.status === "transport_error") {
        throw new TabzTransportError(metadataMessage("classified read backend failure", { ...options, startedAt: metadataStartedAt, attempts }));
      }
      if (observation.status === "refused") {
        throw new TabzWorkflowAssertionError(metadataMessage("classified read refused", { ...options, startedAt: metadataStartedAt, attempts }));
      }
      if (observation.status === "failed") {
        const kind = /^invalid selector\b/i.test(observation.error ?? "") ? "invalid selector" : "classified read failed";
        throw new TabzWorkflowAssertionError(metadataMessage(kind, { ...options, startedAt: metadataStartedAt, attempts }));
      }
      if (observation.status !== "not_found" && observation.status !== "not_created") return observation as T;
    } else if (observation) {
      return observation as T;
    }

    const remaining = options.deadline - (Date.now() - waitStartedAt);
    if (attempts >= options.maxAttempts || remaining <= 0) break;
    await delay(Math.min(options.interval, remaining), options.signal);
  }
  throw new TabzWorkflowAssertionError(metadataMessage("condition absent before wait limit", { ...options, startedAt: metadataStartedAt, attempts }));
}

/** Typed, explicit-target wrappers for the page-agent workflow operations. */
export class TabzWorkflowClient {
  constructor(readonly client: TabzClient) {}

  async openUrl(url: string, options: { background?: boolean; groupId?: number } = {}): Promise<TabzOpenUrlResult> {
    const input = {
      url,
      newTab: true,
      background: options.background ?? false,
      reuseExisting: false,
      addToClaudeGroup: true,
      ...(options.groupId === undefined ? {} : { groupId: options.groupId })
    };
    return this.mutation<TabzOpenUrlResult>("tabz_open_url", input, ["created"], OPEN_STATUSES, validateCreatedTab);
  }

  listTabs(): Promise<TabzListTabsResult> {
    return this.read<TabzListTabsResult>("tabz_list_tabs", { response_format: "json" }, value => LIST_STATUSES.has(value.status) && validateTabs(value));
  }

  switchTab(tabId: number): Promise<TabzSwitchTabResult> {
    return this.mutation<TabzSwitchTabResult>("tabz_switch_tab", { tabId }, ["switched"], SWITCH_STATUSES, value => value.switched === true && value.tabId === tabId);
  }

  closeTab(tabId: number): Promise<TabzCloseTabResult> {
    return this.mutation<TabzCloseTabResult>("tabz_close_tab", { tabIds: [tabId] }, ["closed"], CLOSE_STATUSES, value =>
      Array.isArray(value.closed) && value.closed.length === 1 && value.closed[0] === tabId
    );
  }

  async closeOwnedTabAfterReconciliation(tabId: number): Promise<TabzCloseTabResult> {
    const cleanup = (this.client as TabzClient & {
      closeOwnedTabAfterReconciliation?: (ownedTabId: number) => Promise<CallToolResult>;
    }).closeOwnedTabAfterReconciliation;
    if (!cleanup) throw new TabzUsageError("this client build does not support reconciled owned-tab cleanup");
    const result = await cleanup.call(this.client, tabId);
    return this.mutationResult<TabzCloseTabResult>("tabz_close_tab", result, ["closed"], CLOSE_STATUSES, value =>
      Array.isArray(value.closed) && value.closed.length === 1 && value.closed[0] === tabId
    );
  }

  getPageInfo(tabId: number): Promise<TabzPageInfoResult> {
    return this.read<TabzPageInfoResult>("tabz_get_page_info", { tabId, response_format: "json" }, value =>
      PAGE_STATUSES.has(value.status) && (value.status !== "found" || (value.found === true && Number.isSafeInteger(value.tabId) && value.tabId === tabId && typeof value.url === "string" && typeof value.title === "string"))
    );
  }

  getElement(input: { tabId: number; selector: string; includeStyles?: boolean; styleProperties?: string[] }): Promise<TabzElementResult> {
    return this.read<TabzElementResult>("tabz_get_element", {
      ...input,
      includeStyles: input.includeStyles ?? false,
      response_format: "json"
    }, value => ELEMENT_STATUSES.has(value.status) && (value.status !== "found" || (value.found === true && value.selector === input.selector && typeof value.innerText === "string")));
  }

  readPage(input: { tabId: number; maxChars?: number }): Promise<TabzReadPageResult> {
    return this.read<TabzReadPageResult>("tabz_read_page", input, value =>
      READ_PAGE_STATUSES.has(value.status) &&
      (value.status !== "completed" || (
        value.success === true && value.tabId === input.tabId && typeof value.outline === "string" &&
        Number.isSafeInteger(value.nodeCount) && (value.nodeCount ?? -1) >= 0 &&
        Number.isSafeInteger(value.refCount) && (value.refCount ?? -1) >= 0 &&
        typeof value.truncated === "boolean"
      ))
    );
  }

  fill(input: { tabId: number; selector: string; value: string | boolean }): Promise<TabzFillResult> {
    return this.mutation<TabzFillResult>("tabz_fill", input, ["verified"], FILL_STATUSES, value =>
      value.dispatched === true && value.verified === true && value.verificationInterrupted === false &&
      value.selector === input.selector && value.tabId === input.tabId &&
      (value.sensitive === true ? value.actualValue === undefined : value.sensitive === false && value.actualValue === input.value),
      ["unknown", "unverified", "verification_interrupted"]
    );
  }

  act(input: TabzActInput): Promise<TabzActResult> {
    const request = { ...input, trusted: input.trusted ?? false };
    return this.mutation<TabzActResult>("tabz_act", request, ["completed", "verified"], ACT_STATUSES, value =>
      value.success === true && value.action === input.action && value.trusted === request.trusted && value.tabId === input.tabId &&
      (value.protected !== true || value.verified === true) &&
      (input.action !== "type" || (value.status === "verified" && value.verified === true &&
        (value.sensitive === true ? value.actualValue === undefined : value.sensitive === false && value.actualValue === input.value))),
      ["unknown", "unverified"]
    );
  }

  groupStatus(): Promise<TabzGroupStatusResult> {
    return this.read<TabzGroupStatusResult>("tabz_claude_group_status", { response_format: "json" }, value =>
      GROUP_STATUSES.has(value.status) && typeof value.exists === "boolean" && Number.isSafeInteger(value.tabCount) && value.tabCount >= 0 &&
        Array.isArray(value.tabIds) && value.tabIds.every(tabId => Number.isSafeInteger(tabId) && tabId > 0)
    );
  }

  private async read<T extends TabzStructuredResult>(
    name: TabzReadToolName,
    input: Record<string, unknown>,
    valid: (value: T) => boolean
  ): Promise<T> {
    try {
      return structured<T>(name, await this.client.callTool(name, input), false, valid);
    } catch (error) {
      if (error instanceof TabzToolError) return structured<T>(name, error.result, false, valid);
      throw error;
    }
  }

  private async mutation<T extends TabzStructuredResult>(
    name: TabzBrowserToolName,
    input: Record<string, unknown>,
    accepted: readonly string[],
    known: ReadonlySet<string>,
    valid: (value: T) => boolean,
    uncertain: readonly string[] = ["unknown"]
  ): Promise<T> {
    try {
      return this.mutationResult<T>(name, await this.client.callTool(name, input), accepted, known, valid, uncertain);
    } catch (error) {
      if (error instanceof TabzToolError) return this.mutationResult<T>(name, error.result, accepted, known, valid, uncertain);
      throw error;
    }
  }

  private mutationResult<T extends TabzStructuredResult>(
    name: TabzBrowserToolName,
    result: CallToolResult,
    accepted: readonly string[],
    known: ReadonlySet<string>,
    valid: (value: T) => boolean,
    uncertain: readonly string[] = ["unknown"]
  ): T {
    let value: T;
    try {
      value = structured<T>(name, result, true);
    } catch (error) {
      if (error instanceof TabzUncertainMutationError) this.markUncertain(name, error.message);
      throw error;
    }
    if (uncertain.includes(value.status)) {
      const status = safeLabel(value.status);
      this.markUncertain(name, `structured status ${status}`);
      throw new TabzUncertainMutationError(`${name} returned ${status}; outcome is uncertain and must be reconciled before retrying`, name);
    }
    if (!known.has(value.status)) {
      this.markUncertain(name, "invalid structured status");
      throw new TabzUncertainMutationError(`${name} returned an invalid structured status; outcome is uncertain`, name);
    }
    if (!accepted.includes(value.status)) {
      if (value.status === "mismatch") this.markUncertain(name, "structured verification mismatch");
      throw new TabzWorkflowAssertionError(`${name} returned ${safeLabel(value.status)}; operation was not verified`);
    }
    if (!valid(value)) {
      this.markUncertain(name, "invalid structured fields");
      throw new TabzUncertainMutationError(`${name} returned an invalid structured result; outcome is uncertain`, name);
    }
    return value;
  }

  private markUncertain(name: TabzBrowserToolName, message: string): void {
    const mark = (this.client as TabzClient & {
      markMutationUncertain?: (toolName: string, reason: string) => void;
    }).markMutationUncertain;
    mark?.call(this.client, name, message);
  }
}

function structured<T extends TabzStructuredResult>(
  name: TabzBrowserToolName,
  result: CallToolResult,
  mutation: boolean,
  valid?: (value: T) => boolean
): T {
  const value = result.structuredContent;
  if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.status !== "string" || typeof value.text !== "string") {
    if (mutation) throw new TabzUncertainMutationError(`${name} returned no valid structured result; outcome is uncertain`, name);
    throw new TabzTransportError(`${name} returned no valid structured result`);
  }
  const typed = value as T;
  if (valid && !valid(typed)) {
    if (mutation) throw new TabzUncertainMutationError(`${name} returned an invalid structured result; outcome is uncertain`, name);
    throw new TabzTransportError(`${name} returned an invalid structured result`);
  }
  return typed;
}

function validateCreatedTab(value: TabzOpenUrlResult): boolean {
  return value.opened === true && value.reused === false && value.inClaudeGroup === true &&
    Number.isSafeInteger(value.tabId) && value.tabId > 0 &&
    typeof value.groupId === "number" && Number.isSafeInteger(value.groupId) && value.groupId >= 0 &&
    typeof value.url === "string";
}

function validateTabs(value: TabzListTabsResult): boolean {
  return Number.isSafeInteger(value.total) && value.total >= 0 && Array.isArray(value.tabs) &&
    value.total === value.tabs.length && value.tabs.every(tab => Number.isSafeInteger(tab.tabId) && tab.tabId > 0);
}

function isStructured(value: unknown): value is TabzStructuredResult {
  return Boolean(value && typeof value === "object" && "status" in value && typeof (value as { status?: unknown }).status === "string");
}

function metadataMessage(message: string, metadata: TabzAssertionMetadata): string {
  const elapsedMs = Math.max(0, Date.now() - (metadata.startedAt ?? Date.now()));
  return `${message}; operation=${safeLabel(metadata.operation)} target=${safeLabel(metadata.targetLabel)} elapsedMs=${elapsedMs}${metadata.attempts === undefined ? "" : ` attempts=${metadata.attempts}`}`;
}

function safeLabel(value: string): string {
  return JSON.stringify(value.replace(/[\r\n]+/g, " ").slice(0, 160));
}

function positiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TabzUsageError(`${name} must be a positive integer`);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new TabzTransportError("classified read interrupted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function readWithinDeadline<T>(
  readFn: () => Promise<T>,
  expiresAt: number,
  signal: AbortSignal | undefined,
  metadata: TabzAssertionMetadata,
  startedAt: number,
  attempts: number
): Promise<T> {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) {
    return Promise.reject(new TabzTransportError(metadataMessage("classified read exceeded wait deadline", { ...metadata, startedAt, attempts })));
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (operation: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      operation();
    };
    const onAbort = () => finish(() => reject(signal?.reason));
    const timer = setTimeout(() => finish(() => reject(
      new TabzTransportError(metadataMessage("classified read exceeded wait deadline", { ...metadata, startedAt, attempts }))
    )), remaining);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    Promise.resolve().then(() => settled ? undefined as never : readFn()).then(
      value => Date.now() >= expiresAt
        ? finish(() => reject(new TabzTransportError(metadataMessage("classified read exceeded wait deadline", { ...metadata, startedAt, attempts }))))
        : finish(() => resolve(value)),
      error => finish(() => reject(error))
    );
  });
}

const READ_TOOLS = new Set<TabzReadToolName>([
  "tabz_list_tabs",
  "tabz_get_page_info",
  "tabz_get_element",
  "tabz_read_page",
  "tabz_claude_group_status"
]);

const READ_FAILURE_STATUSES = ["not_found", "refused", "transport_error", "failed"];
const LIST_STATUSES = new Set(["found", ...READ_FAILURE_STATUSES]);
const PAGE_STATUSES = new Set(["found", ...READ_FAILURE_STATUSES]);
const ELEMENT_STATUSES = new Set(["found", ...READ_FAILURE_STATUSES]);
const READ_PAGE_STATUSES = new Set(["completed", ...READ_FAILURE_STATUSES]);
const GROUP_STATUSES = new Set(["active", "not_created", ...READ_FAILURE_STATUSES]);
const OPEN_STATUSES = new Set(["created", "reused", "navigated", "refused", "not_found", "failed", "unknown"]);
const SWITCH_STATUSES = new Set(["switched", "refused", "not_found", "failed", "unknown"]);
const CLOSE_STATUSES = new Set(["closed", "partial", "refused", "not_found", "failed", "unknown"]);
const FILL_STATUSES = new Set(["verified", "normalized", "mismatch", "verification_interrupted", "verification_failed", "unverified", "refused", "not_found", "failed", "unknown"]);
const ACT_STATUSES = new Set(["completed", "verified", "mismatch", "verification_failed", "unverified", "refused", "not_found", "failed", "unknown"]);
