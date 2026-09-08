import { spawn } from "node:child_process";
import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabzClient } from "../src/client/index.js";
import {
  TabzToolError,
  TabzTransportError,
  TabzUncertainMutationError
} from "../src/client/errors.js";
import {
  TabzWorkflowAssertionError,
  TabzWorkflowClient,
  assert as assertWorkflow,
  waitFor
} from "../src/client/helpers.js";

const SENTINEL = "SYNTHETIC-PAGE-VALUE-MUST-NOT-APPEAR";

function result(status: string, fields: Record<string, unknown> = {}, isError = false): CallToolResult {
  const text = `synthetic ${status}`;
  return { content: [{ type: "text", text }], structuredContent: { status, ...fields, text }, isError };
}

class MockTransportClient {
  readonly calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  mutationUncertainty?: { toolName: string; message: string };
  readonly cleanupCalls: number[] = [];

  constructor(readonly handler: (name: string, input: Record<string, unknown>) => Promise<CallToolResult>) {}

  async callTool(name: string, input: Record<string, unknown>): Promise<CallToolResult> {
    this.calls.push({ name, input });
    return this.handler(name, input);
  }

  markMutationUncertain(toolName: string, message: string): void {
    this.mutationUncertainty ??= { toolName, message };
  }

  async closeOwnedTabAfterReconciliation(tabId: number): Promise<CallToolResult> {
    this.cleanupCalls.push(tabId);
    return result("closed", { closed: [tabId], refused: [], missing: [], groupId: 0 });
  }
}

function browser(client: MockTransportClient): TabzWorkflowClient {
  return new TabzWorkflowClient(client as unknown as TabzClient);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("workflow helpers", () => {
  it("waits for classified reads and accepts a compact page read", async () => {
    let attempts = 0;
    const found = await waitFor(async () => {
      attempts += 1;
      return attempts < 3
        ? { status: "not_found", text: "synthetic", found: false }
        : { status: "found", text: "synthetic", found: true, innerText: "ready" };
    }, {
      operation: "tabz_get_element",
      targetLabel: "synthetic status",
      deadline: 200,
      interval: 1,
      maxAttempts: 5
    });
    expect(found).toMatchObject({ status: "found", innerText: "ready" });
    expect(attempts).toBe(3);

    const client = new MockTransportClient(async () => result("completed", {
      success: true,
      outline: "Interactive elements:\n- button \"Save\" [ref=ref_synthetic_1]",
      tabId: 41,
      nodeCount: 1,
      refCount: 1,
      truncated: false
    }));
    await expect(browser(client).readPage({ tabId: 41, maxChars: 900 }))
      .resolves.toMatchObject({ status: "completed", tabId: 41, refCount: 1 });
  });

  it("rejects mutation polling and reports absence without page content", async () => {
    await expect(waitFor(async () => true, {
      operation: "tabz_act" as never,
      targetLabel: "synthetic action",
      deadline: 10,
      interval: 1,
      maxAttempts: 1
    })).rejects.toMatchObject({ exitCode: 2 });

    const pending = waitFor(async () => ({ status: "not_found", text: SENTINEL }), {
      operation: "tabz_get_element",
      targetLabel: "receipt marker",
      deadline: 100,
      interval: 1,
      maxAttempts: 2
    });
    await expect(pending).rejects.toMatchObject({ exitCode: 1 });
    await expect(pending).rejects.not.toThrow(SENTINEL);
  });

  it.each([
    ["failed", "Invalid selector: [", TabzWorkflowAssertionError, 1, "invalid selector"],
    ["refused", "outside the target group", TabzWorkflowAssertionError, 1, "classified read refused"],
    ["transport_error", "backend unavailable", TabzTransportError, 3, "backend failure"]
  ])("classifies %s read failures without returning observed text", async (status, error, ErrorClass, exitCode, message) => {
    const pending = waitFor(async () => ({ status, text: SENTINEL, error }), {
      operation: "tabz_get_element",
      targetLabel: "synthetic selector",
      deadline: 100,
      interval: 1,
      maxAttempts: 2
    });
    await expect(pending).rejects.toBeInstanceOf(ErrorClass);
    await expect(pending).rejects.toMatchObject({ exitCode });
    await expect(pending).rejects.toThrow(message);
    await expect(pending).rejects.not.toThrow(SENTINEL);
  });

  it("bounds total elapsed time and rejects a success settled after the fixed deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    let resolveRead!: (value: { status: string; text: string; found: boolean }) => void;
    const pending = waitFor(() => new Promise(resolve => { resolveRead = resolve; }), {
      operation: "tabz_get_element",
      targetLabel: "late synthetic read",
      deadline: 25,
      interval: 1,
      maxAttempts: 1
    });
    await vi.advanceTimersByTimeAsync(24);
    vi.setSystemTime(1_026);
    resolveRead({ status: "found", text: "synthetic", found: true });
    await expect(pending).rejects.toMatchObject({ exitCode: 3 });
  });

  it("does not start a read when its signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new TabzTransportError("workflow interrupted"));
    const read = vi.fn(async () => true);
    await expect(waitFor(read, {
      operation: "tabz_get_element",
      targetLabel: "aborted synthetic read",
      deadline: 100,
      interval: 1,
      maxAttempts: 1,
      signal: controller.signal
    })).rejects.toMatchObject({ exitCode: 3 });
    expect(read).not.toHaveBeenCalled();
  });

  it("keeps assertion output metadata-only", () => {
    expect(() => assertWorkflow(false, {
      operation: "assert synthetic status",
      targetLabel: "item status"
    })).toThrow('operation="assert synthetic status" target="item status"');
  });

  it("requires exact ordinary and boolean fill evidence without adding source-only input fields", async () => {
    const client = new MockTransportClient(async (_name, input) => result("verified", {
      dispatched: true,
      verified: true,
      verificationInterrupted: false,
      selector: input.selector,
      tabId: input.tabId,
      sensitive: false,
      actualValue: input.value
    }));
    await expect(browser(client).fill({ tabId: 41, selector: "#name", value: "synthetic" }))
      .resolves.toMatchObject({ status: "verified", actualValue: "synthetic" });
    await expect(browser(client).fill({ tabId: 41, selector: "#enabled", value: true }))
      .resolves.toMatchObject({ status: "verified", actualValue: true });
    expect(client.calls).toEqual([
      { name: "tabz_fill", input: { tabId: 41, selector: "#name", value: "synthetic" } },
      { name: "tabz_fill", input: { tabId: 41, selector: "#enabled", value: true } }
    ]);
  });

  it("rejects mismatched or leaked fill evidence and latches malformed outcomes", async () => {
    const mismatchPayload = result("mismatch", {
      dispatched: true,
      verified: false,
      verificationInterrupted: false,
      selector: "#name",
      tabId: 41,
      sensitive: false,
      actualValue: SENTINEL
    }, true);
    const mismatch = new MockTransportClient(async () => {
      throw new TabzToolError("fill mismatch", mismatchPayload);
    });
    const mismatchError = browser(mismatch).fill({ tabId: 41, selector: "#name", value: "expected" });
    await expect(mismatchError).rejects.toMatchObject({ exitCode: 1 });
    await expect(mismatchError).rejects.not.toBeInstanceOf(TabzToolError);
    await expect(mismatchError).rejects.not.toThrow(SENTINEL);
    expect(mismatch.mutationUncertainty).toMatchObject({ toolName: "tabz_fill" });

    const leaked = new MockTransportClient(async () => result("verified", {
      dispatched: true,
      verified: true,
      verificationInterrupted: false,
      selector: "#password",
      tabId: 41,
      sensitive: true,
      actualValue: SENTINEL
    }));
    await expect(browser(leaked).fill({ tabId: 41, selector: "#password", value: "expected" }))
      .rejects.toMatchObject({ exitCode: 4, toolName: "tabz_fill" });
    expect(leaked.mutationUncertainty).toMatchObject({ toolName: "tabz_fill" });
  });

  it("requires action identity, tab identity, and protected verification", async () => {
    const valid = new MockTransportClient(async () => result("completed", {
      action: "click",
      success: true,
      trusted: false,
      tabId: 41
    }));
    await expect(browser(valid).act({ tabId: 41, action: "click", selector: "#save" }))
      .resolves.toMatchObject({ status: "completed", success: true });

    for (const fields of [
      { action: "hover", success: true, trusted: false, tabId: 41 },
      { action: "click", success: true, trusted: true, tabId: 41 },
      { action: "click", success: true, trusted: false, tabId: 42 },
      { action: "click", success: true, trusted: false, tabId: 41, protected: true, verified: false }
    ]) {
      const invalid = new MockTransportClient(async () => result("completed", fields));
      await expect(browser(invalid).act({ tabId: 41, action: "click", selector: "#save" }))
        .rejects.toMatchObject({ exitCode: 4, toolName: "tabz_act" });
    }
  });

  it("keeps an action verification mismatch at exit 1 with sticky uncertainty", async () => {
    const mismatchPayload = result("mismatch", {
      action: "type",
      success: false,
      trusted: false,
      tabId: 41,
      verified: false,
      sensitive: false,
      actualValue: SENTINEL
    }, true);
    const client = new MockTransportClient(async () => {
      throw new TabzToolError("action mismatch", mismatchPayload);
    });
    const pending = browser(client).act({ tabId: 41, action: "type", selector: "#name", value: "expected" });
    await expect(pending).rejects.toMatchObject({ exitCode: 1 });
    await expect(pending).rejects.not.toThrow(SENTINEL);
    expect(client.mutationUncertainty).toMatchObject({ toolName: "tabz_act" });
  });
});

describe("generic synthetic workflows", () => {
  const previousFixtureUrl = process.env.TABZ_FIXTURE_URL;

  afterEach(() => {
    if (previousFixtureUrl === undefined) delete process.env.TABZ_FIXTURE_URL;
    else process.env.TABZ_FIXTURE_URL = previousFixtureUrl;
  });

  it("reconciles a dropped submit response with one submit and keeps uncertainty latched during cleanup", async () => {
    process.env.TABZ_FIXTURE_URL = "http://127.0.0.1:49152/synthetic-workflow-fixture.html";
    let receiptReads = 0;
    const client = oneSubmitClient(async input => {
      receiptReads += 1;
      return receiptReads === 1
        ? result("not_found", { found: false, selector: input.selector }, true)
        : result("found", { found: true, selector: input.selector, innerText: "Receipt SYNTHETIC-REQUEST-900; submissions: 1" });
    });
    const module = await import("../examples/synthetic-one-submit.mjs");
    const output = await module.default(client, { signal: new AbortController().signal });
    expect(output).toMatchObject({ submitAttempts: 1, reconciledAfterDroppedResponse: true, receipt: { present: true } });
    expect(client.calls.filter(call => call.name === "tabz_act")).toHaveLength(1);
    expect(client.cleanupCalls).toEqual([41]);
    expect(client.mutationUncertainty).toMatchObject({ toolName: "tabz_act" });
  });

  it("does not replay or clean up an absent receipt", async () => {
    vi.useFakeTimers();
    process.env.TABZ_FIXTURE_URL = "http://127.0.0.1:49152/synthetic-workflow-fixture.html";
    const client = oneSubmitClient(async input => result("not_found", { found: false, selector: input.selector }, true));
    const module = await import("../examples/synthetic-one-submit.mjs");
    const pending = module.default(client, { signal: new AbortController().signal });
    const rejection = expect(pending).rejects.toMatchObject({ exitCode: 4 });
    await vi.runAllTimersAsync();
    await rejection;
    expect(client.calls.filter(call => call.name === "tabz_act")).toHaveLength(1);
    expect(client.cleanupCalls).toEqual([]);
  });

  it("does not replay or clean up a mismatched receipt", async () => {
    process.env.TABZ_FIXTURE_URL = "http://127.0.0.1:49152/synthetic-workflow-fixture.html";
    const client = oneSubmitClient(async input => result("found", {
      found: true,
      selector: input.selector,
      innerText: "Receipt SYNTHETIC-REQUEST-900; submissions: 2"
    }));
    const module = await import("../examples/synthetic-one-submit.mjs");
    await expect(module.default(client, { signal: new AbortController().signal })).rejects.toMatchObject({ exitCode: 1 });
    expect(client.calls.filter(call => call.name === "tabz_act")).toHaveLength(1);
    expect(client.cleanupCalls).toEqual([]);
  });

  it("does not replay or clean up a receipt that settles after the workflow deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    process.env.TABZ_FIXTURE_URL = "http://127.0.0.1:49152/synthetic-workflow-fixture.html";
    const client = oneSubmitClient(async input => {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 2_100));
      return result("found", {
        found: true,
        selector: input.selector,
        innerText: "Receipt SYNTHETIC-REQUEST-900; submissions: 1"
      });
    });
    const module = await import("../examples/synthetic-one-submit.mjs");
    const pending = module.default(client, { signal: new AbortController().signal });
    const rejection = expect(pending).rejects.toMatchObject({ exitCode: 3 });
    await vi.advanceTimersByTimeAsync(2_100);
    await rejection;
    expect(client.calls.filter(call => call.name === "tabz_act")).toHaveLength(1);
    expect(client.cleanupCalls).toEqual([]);
  });

  it("does not replay or clean up after receipt transport failure", async () => {
    process.env.TABZ_FIXTURE_URL = "http://127.0.0.1:49152/synthetic-workflow-fixture.html";
    const client = oneSubmitClient(async () => {
      throw new TabzTransportError("receipt transport failed");
    });
    const module = await import("../examples/synthetic-one-submit.mjs");
    await expect(module.default(client, { signal: new AbortController().signal })).rejects.toMatchObject({ exitCode: 3 });
    expect(client.calls.filter(call => call.name === "tabz_act")).toHaveLength(1);
    expect(client.cleanupCalls).toEqual([]);
  });

  it("preserves a primary error when cleanup also fails", async () => {
    process.env.TABZ_FIXTURE_URL = "http://127.0.0.1:49152/synthetic-workflow-fixture.html";
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const client = new MockTransportClient(async name => {
      if (name === "tabz_open_url") return createdResult();
      if (name === "tabz_fill") throw new TabzTransportError("primary session loss");
      if (name === "tabz_close_tab") throw new TabzTransportError("cleanup failure");
      throw new Error(`unexpected tool ${name}`);
    });
    const module = await import("../examples/synthetic-lookup.mjs");
    await expect(module.default(client, { signal: new AbortController().signal })).rejects.toThrow("primary session loss");
    expect(stderr).toHaveBeenCalledWith(expect.stringContaining('operation="close owned synthetic tab"'));
  });
});

describe("helper errors through the CLI", () => {
  it("does not print page-derived mismatch payloads", async () => {
    const server = startMetadataMock();
    const port = await listen(server);
    try {
      const child = spawn(process.execPath, [
        resolve("dist/cli/index.js"),
        "--endpoint", `http://127.0.0.1:${port}/mcp/page-agent`,
        "run", resolve("tests/fixtures/cli-helper-metadata-workflow.mjs")
      ], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
      const completed = await collect(child);
      expect(completed.code).toBe(1);
      expect(completed.stdout).not.toContain(SENTINEL);
      expect(completed.stderr).not.toContain(SENTINEL);
      expect(JSON.parse(completed.stdout)).toMatchObject({ ok: false, code: 1 });
    } finally {
      await closeServer(server);
    }
  });
});

function createdResult(): CallToolResult {
  return result("created", {
    opened: true,
    reused: false,
    tabId: 41,
    groupId: 0,
    inClaudeGroup: true,
    url: process.env.TABZ_FIXTURE_URL
  });
}

function verifiedFill(input: Record<string, unknown>): CallToolResult {
  return result("verified", {
    dispatched: true,
    verified: true,
    verificationInterrupted: false,
    selector: input.selector,
    tabId: 41,
    sensitive: false,
    actualValue: input.value
  });
}

function oneSubmitClient(receipt: (input: Record<string, unknown>) => Promise<CallToolResult>): MockTransportClient {
  const client = new MockTransportClient(async (name, input) => {
    if (name === "tabz_open_url") return createdResult();
    if (name === "tabz_fill") return verifiedFill(input);
    if (name === "tabz_act") {
      client.mutationUncertainty = { toolName: name, message: "response dropped after dispatch" };
      throw new TabzUncertainMutationError("response dropped after dispatch", name);
    }
    if (name === "tabz_get_element") return receipt(input);
    throw new Error(`unexpected tool ${name}`);
  });
  return client;
}

function startMetadataMock(): Server {
  return http.createServer(async (request, response) => {
    if (request.method === "GET") {
      response.statusCode = 405;
      response.end();
      return;
    }
    if (request.method === "DELETE") {
      response.statusCode = 200;
      response.end();
      return;
    }
    const message = await requestBody(request);
    if (message.method === "initialize") {
      rpc(response, message.id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "workflow-helper-mock", version: "1.0.0" }
      }, "workflow-helper-session");
      return;
    }
    if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
      response.statusCode = 202;
      response.end();
      return;
    }
    if (message.method === "tools/list") {
      rpc(response, message.id, { tools: [{
        name: "tabz_fill",
        description: "synthetic fill",
        inputSchema: {
          type: "object",
          properties: { selector: { type: "string" }, value: { type: "string" }, tabId: { type: "number" } },
          required: ["selector", "value", "tabId"],
          additionalProperties: false
        }
      }] });
      return;
    }
    if (message.method === "tools/call") {
      rpc(response, message.id, {
        content: [{ type: "text", text: SENTINEL }],
        structuredContent: {
          status: "mismatch",
          text: SENTINEL,
          dispatched: true,
          verified: false,
          verificationInterrupted: false,
          selector: "#synthetic-field",
          tabId: 41,
          sensitive: false,
          actualValue: SENTINEL
        },
        isError: true
      });
      return;
    }
    response.statusCode = 400;
    response.end();
  });
}

async function requestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function rpc(response: ServerResponse, id: unknown, rpcResult: unknown, sessionId?: string): void {
  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json");
  if (sessionId) response.setHeader("Mcp-Session-Id", sessionId);
  response.end(JSON.stringify({ jsonrpc: "2.0", id, result: rpcResult }));
}

function listen(server: Server): Promise<number> {
  return new Promise(resolvePort => server.listen(0, "127.0.0.1", () => resolvePort((server.address() as AddressInfo).port)));
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolveClose => {
    server.close(() => resolveClose());
    server.closeAllConnections();
  });
}

function collect(child: ReturnType<typeof spawn>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolveChild, reject) => {
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", code => resolveChild({ code, stdout, stderr }));
  });
}
