import { randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import {
  ErrorCode,
  McpError,
  type CallToolResult,
  type Tool
} from "@modelcontextprotocol/sdk/types.js";
import type { JsonSchemaType } from "@modelcontextprotocol/sdk/validation";
import {
  TabzToolError,
  TabzTransportError,
  TabzUncertainMutationError,
  TabzUsageError
} from "./errors.js";

export * from "./errors.js";
export * from "./helpers.js";

export const DEFAULT_TABZ_ENDPOINT = "http://localhost:8129/mcp/page-agent";
export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_CLEANUP_TIMEOUT_MS = 2_000;

const READ_ONLY_TOOLS = new Set([
  "tabz_list_tabs",
  "tabz_get_page_info",
  "tabz_get_element",
  "tabz_read_page",
  "tabz_claude_group_status"
]);

const UNCERTAIN_MUTATION_STATUSES = new Set([
  "unknown",
  "unverified",
  "verification_interrupted"
]);

export interface TabzClientOptions {
  endpoint?: string | URL;
  preset?: string;
  workflow: string;
  timeoutMs?: number;
  cleanupTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
}

export interface TabzCallOptions {
  timeoutMs?: number;
}

export interface TabzMutationUncertainty {
  toolName: string;
  message: string;
}

export function createAgentIdentity(workflow: string): string {
  const readable = workflow
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workflow";
  return `cli:${readable}:${randomBytes(12).toString("hex")}`;
}

export function resolveEndpoint(endpoint: string | URL = DEFAULT_TABZ_ENDPOINT, preset?: string): URL {
  let url: URL;
  try {
    url = endpoint instanceof URL ? new URL(endpoint) : new URL(endpoint);
  } catch (error) {
    throw new TabzUsageError("invalid MCP endpoint URL", { cause: error });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TabzUsageError("MCP endpoint must use http: or https:");
  }
  if (url.username || url.password) {
    throw new TabzUsageError("MCP endpoint must not contain credentials");
  }
  if (preset !== undefined) {
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(preset)) {
      throw new TabzUsageError("preset must be 1-64 letters, numbers, dots, underscores, or hyphens");
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const mcpIndex = segments.lastIndexOf("mcp");
    if (mcpIndex >= 0) segments.splice(mcpIndex + 1);
    segments.push(preset);
    url.pathname = `/${segments.join("/")}`;
  }
  return url;
}

export function isMutationTool(name: string, input: Record<string, unknown>): boolean {
  if (READ_ONLY_TOOLS.has(name)) return false;
  // Raw tools are deliberately conservative. A caller must know that an
  // unclassified timeout can represent a completed browser action.
  return true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRequestTimeout(error: unknown): boolean {
  return error instanceof McpError && error.code === ErrorCode.RequestTimeout;
}

export class TabzClient {
  readonly endpoint: URL;
  readonly agentIdentity: string;

  private readonly timeoutMs: number;
  private readonly cleanupTimeoutMs: number;
  private readonly fetchFn: typeof globalThis.fetch;
  private readonly transport: StreamableHTTPClientTransport;
  private readonly sdkClient: Client;
  private readonly validator = new AjvJsonSchemaValidator();
  private tools?: Tool[];
  private connected = false;
  private closing?: Promise<void>;
  private uncertainty?: TabzMutationUncertainty;
  private fatal?: TabzTransportError;
  private activeMutation?: string;
  private callActive = false;
  private workflowTools?: ReadonlySet<string>;
  private readonly ownedTabs = new Map<number, number>();

  constructor(options: TabzClientOptions) {
    this.endpoint = resolveEndpoint(options.endpoint, options.preset);
    this.agentIdentity = createAgentIdentity(options.workflow);
    this.timeoutMs = positiveInteger(options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, "timeoutMs");
    this.cleanupTimeoutMs = positiveInteger(options.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS, "cleanupTimeoutMs");
    this.fetchFn = options.fetch ?? globalThis.fetch;
    this.transport = new StreamableHTTPClientTransport(this.endpoint, {
      requestInit: { headers: { "X-Tabz-Agent": this.agentIdentity } },
      fetch: options.fetch,
      reconnectionOptions: {
        initialReconnectionDelay: 1,
        maxReconnectionDelay: 1,
        reconnectionDelayGrowFactor: 1,
        maxRetries: 0
      }
    });
    this.sdkClient = new Client({ name: "tabz-cli", version: "1.0.0" });
  }

  get sessionId(): string | undefined {
    return this.transport.sessionId;
  }

  get mutationUncertainty(): TabzMutationUncertainty | undefined {
    return this.uncertainty ? { ...this.uncertainty } : undefined;
  }

  get activeMutationTool(): string | undefined {
    return this.activeMutation;
  }

  markMutationUncertain(toolName: string, reason = "workflow helper could not verify the structured mutation result"): void {
    if (!toolName.trim()) throw new TabzUsageError("uncertain mutation tool name must not be empty");
    this.uncertainty ??= { toolName, message: reason };
  }

  async connect(): Promise<void> {
    this.assertSessionUsable();
    if (this.connected) return;
    try {
      await this.sdkClient.connect(this.transport, { timeout: this.timeoutMs });
      this.connected = true;
    } catch (error) {
      throw this.failSession("could not connect to MCP endpoint", error);
    }
  }

  async discover(refresh = false): Promise<Tool[]> {
    this.assertSessionUsable();
    await this.connect();
    if (this.tools && !refresh) return this.tools;
    try {
      this.tools = (await this.sdkClient.listTools(undefined, { timeout: this.timeoutMs })).tools;
      return this.tools;
    } catch (error) {
      throw this.failSession("tools/list failed because the MCP session is unavailable", error);
    }
  }

  async requireTools(names: readonly string[]): Promise<void> {
    const tools = await this.discover();
    const available = new Set(tools.map(tool => tool.name));
    const missing = [...new Set(names)].filter(name => !available.has(name));
    if (missing.length > 0) {
      throw new TabzUsageError(`required tool${missing.length === 1 ? " is" : "s are"} absent from preset: ${missing.join(", ")}`);
    }
  }

  async bindWorkflowTools(names: readonly string[]): Promise<void> {
    if (this.workflowTools) {
      throw new TabzUsageError("workflow tools are already bound");
    }
    const unique = [...new Set(names)];
    await this.requireTools(unique);
    this.workflowTools = new Set(unique);
  }

  async callTool(
    name: string,
    input: Record<string, unknown>,
    options: TabzCallOptions = {}
  ): Promise<CallToolResult> {
    this.assertToolAllowed(name);
    if (this.callActive) {
      throw new TabzUsageError("one TabzClient permits only one active tool call");
    }
    this.callActive = true;
    try {
      return await this.callToolOnce(name, input, options);
    } finally {
      this.callActive = false;
    }
  }

  async closeOwnedTabAfterReconciliation(tabId: number): Promise<CallToolResult> {
    this.assertToolAllowed("tabz_close_tab");
    if (!this.uncertainty) {
      throw new TabzUsageError("owned-tab reconciliation cleanup requires a prior uncertain mutation");
    }
    if (!Number.isInteger(tabId) || !this.ownedTabs.has(tabId)) {
      throw new TabzUsageError("reconciliation cleanup requires an exact tab ID positively created by this client");
    }
    if (this.callActive) {
      throw new TabzUsageError("one TabzClient permits only one active tool call");
    }
    this.callActive = true;
    try {
      const result = await this.callToolOnce(
        "tabz_close_tab",
        { tabIds: [tabId] },
        {},
        true
      );
      const structured = result.structuredContent;
      if (structured?.status === "closed" &&
          Array.isArray(structured.closed) &&
          structured.closed.includes(tabId)) {
        this.ownedTabs.delete(tabId);
      }
      return result;
    } finally {
      this.callActive = false;
    }
  }

  private async callToolOnce(
    name: string,
    input: Record<string, unknown>,
    options: TabzCallOptions,
    allowOwnedCleanup = false
  ): Promise<CallToolResult> {
    const tools = await this.discover();
    const tool = tools.find(candidate => candidate.name === name);
    if (!tool) {
      throw new TabzUsageError(`required tool is absent from preset: ${name}`);
    }

    const mutation = isMutationTool(name, input);
    if (mutation && this.uncertainty && !allowOwnedCleanup) {
      throw new TabzUncertainMutationError(
        `mutation ${name} blocked: ${this.uncertainty.toolName} has an uncertain outcome; reconcile with a read before starting a new workflow`,
        this.uncertainty.toolName
      );
    }

    let validated: ReturnType<ReturnType<AjvJsonSchemaValidator["getValidator"]>>;
    try {
      validated = this.validator.getValidator(tool.inputSchema as JsonSchemaType)(input);
    } catch (error) {
      throw new TabzUsageError(`could not validate arguments for ${name}: ${errorMessage(error)}`, { cause: error });
    }
    if (!validated.valid) {
      throw new TabzUsageError(`invalid arguments for ${name}: ${validated.errorMessage}`);
    }

    if (mutation) this.activeMutation = name;
    try {
      const result = await this.sdkClient.callTool(
        { name, arguments: validated.data as Record<string, unknown> },
        undefined,
        { timeout: positiveInteger(options.timeoutMs ?? this.timeoutMs, "timeoutMs") }
      ) as CallToolResult;
      const typedVerdict = inspectTypedMutationResult(name, input, result);
      if (mutation && typedVerdict?.kind === "uncertain") {
        this.uncertainty ??= { toolName: name, message: typedVerdict.reason };
        throw new TabzUncertainMutationError(
          `${name} did not return trustworthy typed mutation evidence: ${typedVerdict.reason}; reconcile with a read before starting another mutation`,
          name
        );
      }
      if (mutation && typedVerdict?.kind === "mismatch") {
        this.uncertainty ??= { toolName: name, message: typedVerdict.reason };
        throw new TabzToolError(`${name} returned a verification mismatch`, result);
      }
      const resultStatus = result.structuredContent?.status;
      if (mutation && typeof resultStatus === "string" && UNCERTAIN_MUTATION_STATUSES.has(resultStatus)) {
        this.uncertainty ??= { toolName: name, message: `tool reported mutation status ${resultStatus}` };
        throw new TabzUncertainMutationError(
          `${name} reported mutation status ${resultStatus}; reconcile with a read before starting another mutation`,
          name
        );
      }
      if (result.isError) {
        throw new TabzToolError(`${name} returned isError`, result);
      }
      this.recordOwnedTab(name, result);
      return result;
    } catch (error) {
      if (error instanceof TabzUncertainMutationError) throw error;
      if (error instanceof TabzToolError) throw error;
      if (mutation && isRequestTimeout(error)) {
        this.uncertainty = { toolName: name, message: "request timed out after dispatch" };
        throw new TabzUncertainMutationError(
          `${name} timed out after it was sent; outcome is uncertain and must be reconciled before retrying`,
          name,
          { cause: error }
        );
      }
      if (isRequestTimeout(error)) {
        throw this.failSession(`${name} timed out`, error);
      }
      if (error instanceof McpError && error.code === ErrorCode.InvalidParams) {
        throw new TabzUsageError(`invalid arguments for ${name}`, { cause: error });
      }
      if (isExpiredSession(error)) {
        throw this.failSession(`${name} stopped because the MCP session was lost`, error);
      }
      if (error instanceof McpError && error.code === ErrorCode.ConnectionClosed) {
        const fatal = this.failSession(`${name} stopped because the MCP session was lost`, error);
        if (!mutation) throw fatal;
        this.uncertainty ??= { toolName: name, message: "connection closed after the request was sent" };
        throw new TabzUncertainMutationError(
          `${name} lost its MCP connection after it was sent; outcome is uncertain and must not be replayed`,
          name,
          { cause: error }
        );
      }
      if (mutation) {
        this.uncertainty ??= { toolName: name, message: "response was lost, malformed, or rejected at the protocol boundary" };
        throw new TabzUncertainMutationError(
          `${name} was sent but did not return a definite mutation result; outcome is uncertain and must be reconciled before retrying`,
          name,
          { cause: error }
        );
      }
      throw this.failSession(`${name} returned an invalid MCP response`, error);
    } finally {
      if (this.activeMutation === name) this.activeMutation = undefined;
    }
  }

  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = this.closeOnce();
    return this.closing;
  }

  private async closeOnce(): Promise<void> {
    const sessionId = this.transport.sessionId;
    const deadline = Date.now() + this.cleanupTimeoutMs;
    let cleanupError: unknown;
    if (sessionId) {
      const controller = new AbortController();
      const abortTimer = setTimeout(() => controller.abort(), remainingMs(deadline));
      try {
        const response = await settleBefore(
          this.fetchFn(this.endpoint, {
            method: "DELETE",
            headers: { "Mcp-Session-Id": sessionId, "X-Tabz-Agent": this.agentIdentity },
            signal: controller.signal
          }),
          deadline,
          "session DELETE timed out"
        );
        if (response.body) {
          await settleBefore(response.body.cancel(), deadline, "session DELETE body cleanup timed out");
        }
        if (!response.ok && response.status !== 404 && response.status !== 405) {
          cleanupError = new Error(`session DELETE returned HTTP ${response.status}`);
        }
      } catch (error) {
        cleanupError = error;
      } finally {
        clearTimeout(abortTimer);
      }
    }
    try {
      await settleBefore(this.sdkClient.close(), deadline, "MCP client close timed out");
    } catch (error) {
      cleanupError ??= error;
    } finally {
      this.connected = false;
    }
    if (cleanupError) {
      throw new TabzTransportError(`session cleanup failed: ${errorMessage(cleanupError)}`, { cause: cleanupError });
    }
  }

  private assertSessionUsable(): void {
    if (this.fatal) throw this.fatal;
  }

  private failSession(message: string, cause: unknown): TabzTransportError {
    this.connected = false;
    this.fatal ??= new TabzTransportError(message, { cause });
    return this.fatal;
  }

  private assertToolAllowed(name: string): void {
    if (this.workflowTools && !this.workflowTools.has(name)) {
      throw new TabzUsageError(`workflow did not declare required tool: ${name}`);
    }
  }

  private recordOwnedTab(name: string, result: CallToolResult): void {
    if (name !== "tabz_open_url" || result.isError) return;
    const structured = result.structuredContent;
    const tabId = structured?.tabId;
    const groupId = structured?.groupId;
    // The MCP adapter publishes status=created and opened=true only from an
    // explicit backend created=true receipt. Never infer ownership from the
    // requested newTab/reuseExisting options or from a returned tab ID alone.
    if (structured?.status === "created" &&
        structured.opened === true &&
        structured.reused !== true &&
        structured.inClaudeGroup === true &&
        typeof tabId === "number" && Number.isSafeInteger(tabId) && tabId > 0 &&
        typeof groupId === "number" && Number.isSafeInteger(groupId) && groupId >= 0) {
      this.ownedTabs.set(tabId, groupId);
    }
  }
}

function isExpiredSession(error: unknown): boolean {
  return error instanceof StreamableHTTPError && error.code === 404;
}

type TypedMutationVerdict =
  | { kind: "uncertain"; reason: string }
  | { kind: "mismatch"; reason: string };

function inspectTypedMutationResult(
  name: string,
  input: Record<string, unknown>,
  result: CallToolResult
): TypedMutationVerdict | undefined {
  if (name !== "tabz_fill" && name !== "tabz_act" && name !== "tabz_open_url") return undefined;
  const fields = result.structuredContent;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return { kind: "uncertain", reason: "structuredContent is missing" };
  }
  const status = fields.status;
  if (typeof status !== "string") {
    return { kind: "uncertain", reason: "the typed status is missing" };
  }

  if (name === "tabz_fill") {
    if (fields.actualValue !== undefined && fields.sensitive !== false) {
      return { kind: "uncertain", reason: "the fill result exposed a value without an ordinary-field verdict" };
    }
    if (status === "mismatch") {
      return fields.verified === false && fields.dispatched === true
        ? { kind: "mismatch", reason: "the dispatched fill did not retain the requested value" }
        : { kind: "uncertain", reason: "the mismatch verdict is malformed" };
    }
    if (status === "verified") {
      return fields.verified === true && fields.dispatched === true && typeof fields.sensitive === "boolean"
        ? undefined
        : { kind: "uncertain", reason: "the verified fill verdict is incomplete" };
    }
    if (UNCERTAIN_MUTATION_STATUSES.has(status)) {
      return { kind: "uncertain", reason: `tool reported mutation status ${status}` };
    }
    return fields.dispatched === false && result.isError
      ? undefined
      : { kind: "uncertain", reason: `unexpected fill status ${status}` };
  }

  if (name === "tabz_act") {
    if (fields.action !== input.action ||
        (typeof fields.success !== "boolean" && fields.success !== null) ||
        (fields.actualValue !== undefined && fields.sensitive === true)) {
      return { kind: "uncertain", reason: "the action identity or result fields are inconsistent" };
    }
    if (status === "unknown" || fields.success === null) {
      return { kind: "uncertain", reason: "the action outcome is unknown" };
    }
    if (status === "mismatch") {
      return fields.success === false && fields.verified === false
        ? { kind: "mismatch", reason: "the dispatched action did not retain the requested value" }
        : { kind: "uncertain", reason: "the action mismatch verdict is malformed" };
    }
    if ((status === "completed" || status === "verified") && fields.success === true) {
      return status !== "verified" || fields.verified === true
        ? undefined
        : { kind: "uncertain", reason: "the verified action verdict is incomplete" };
    }
    return fields.success === false && result.isError
      ? undefined
      : { kind: "uncertain", reason: `unexpected action status ${status}` };
  }

  const tabId = fields.tabId;
  const positiveTabId = typeof tabId === "number" && Number.isSafeInteger(tabId) && tabId > 0;
  if (status === "unknown") return { kind: "uncertain", reason: "the open outcome is unknown" };
  if (status === "created") {
    return fields.opened === true && fields.reused === false && positiveTabId && !result.isError
      ? undefined
      : { kind: "uncertain", reason: "the created-tab receipt is incomplete" };
  }
  if (status === "reused") {
    return fields.opened === false && fields.reused === true && positiveTabId && !result.isError
      ? undefined
      : { kind: "uncertain", reason: "the reused-tab receipt is incomplete" };
  }
  if (status === "navigated") {
    return fields.opened === false && fields.reused === false && positiveTabId && !result.isError
      ? undefined
      : { kind: "uncertain", reason: "the navigated-tab receipt is incomplete" };
  }
  return fields.opened === false && result.isError
    ? undefined
    : { kind: "uncertain", reason: `unexpected open status ${status}` };
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TabzUsageError(`${name} must be a positive integer`);
  }
  return value;
}

function remainingMs(deadline: number): number {
  return Math.max(1, deadline - Date.now());
}

function settleBefore<T>(promise: Promise<T>, deadline: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), remainingMs(deadline));
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
