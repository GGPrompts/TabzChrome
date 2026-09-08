import http, { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { DEFAULT_TABZ_ENDPOINT, TabzClient } from "../dist/client/index.js";

const cliPath = resolve("dist/cli/index.js");
const workflowPath = resolve("tests/fixtures/cli-workflow.mjs");
const missingWorkflowPath = resolve("tests/fixtures/cli-missing-workflow.mjs");
const reconcileWorkflowPath = resolve("tests/fixtures/cli-reconcile-workflow.mjs");
const concurrentWorkflowPath = resolve("tests/fixtures/cli-concurrent-workflow.mjs");
const pausedWorkflowPath = resolve("tests/fixtures/cli-paused-workflow.mjs");
const undeclaredWorkflowPath = resolve("tests/fixtures/cli-undeclared-workflow.mjs");
const ownedCleanupWorkflowPath = resolve("tests/fixtures/cli-owned-cleanup-workflow.mjs");
const verificationUncertainWorkflowPath = resolve("tests/fixtures/cli-verification-uncertain-workflow.mjs");

interface Invocation {
  name: string;
  arguments: Record<string, unknown>;
  sessionId: string;
  agent: string;
}

interface MockState {
  agents: string[];
  deleteAgents: string[];
  deletes: string[];
  invocations: Invocation[];
  paths: string[];
}

const tools = [
  tool("read_tool", { type: "object", properties: {}, additionalProperties: false }),
  tool("mutate_tool", {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false
  }),
  tool("error_tool", { type: "object", properties: {}, additionalProperties: false }),
  tool("malformed_mutation", { type: "object", properties: {}, additionalProperties: false }),
  tool("slow_mutation", { type: "object", properties: {}, additionalProperties: false }),
  tool("binary_tool", { type: "object", properties: {}, additionalProperties: false }),
  tool("tabz_get_page_info", {
    type: "object",
    properties: { mode: { type: "string", enum: ["lost", "expired", "malformed", "slow"] } },
    additionalProperties: false
  }),
  tool("tabz_read_page", {
    type: "object",
    properties: {},
    additionalProperties: false
  }),
  tool("tabz_open_url", {
    type: "object",
    properties: {
      url: { type: "string" },
      newTab: { type: "boolean" },
      reuseExisting: { type: "boolean" }
    },
    required: ["url"],
    additionalProperties: false
  }),
  tool("tabz_act", {
    type: "object",
    properties: { action: { type: "string" } },
    required: ["action"],
    additionalProperties: false
  }),
  tool("tabz_close_tab", {
    type: "object",
    properties: {
      tabIds: { type: "array", items: { type: "number" }, minItems: 1 }
    },
    required: ["tabIds"],
    additionalProperties: false
  }),
  tool("tabz_fill", {
    type: "object",
    properties: {
      selector: { type: "string" },
      value: { anyOf: [{ type: "string" }, { type: "boolean" }] }
    },
    required: ["selector", "value"],
    additionalProperties: false
  }),
  tool("protocol_mutation", { type: "object", properties: {}, additionalProperties: false }),
  tool("rejected_mutation", { type: "object", properties: {}, additionalProperties: false }),
  tool("expired_mutation", { type: "object", properties: {}, additionalProperties: false }),
  tool("unverified_mutation", { type: "object", properties: {}, additionalProperties: false }),
  tool("verification_interrupted_mutation", { type: "object", properties: {}, additionalProperties: false })
];

function tool(name: string, inputSchema: Record<string, unknown>) {
  return { name, description: `Mock ${name}`, inputSchema };
}

function listen(server: Server): Promise<number> {
  return new Promise(resolvePort => {
    server.listen(0, "127.0.0.1", () => resolvePort((server.address() as AddressInfo).port));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolveClose => {
    server.close(() => resolveClose());
    server.closeAllConnections();
  });
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function rpc(res: ServerResponse, id: unknown, result: unknown, sessionId?: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  if (sessionId) res.setHeader("Mcp-Session-Id", sessionId);
  res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

function rpcError(res: ServerResponse, id: unknown, code: number, message: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
}

function startMock(): { server: Server; state: MockState } {
  let nextSession = 1;
  const state: MockState = { agents: [], deleteAgents: [], deletes: [], invocations: [], paths: [] };
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    state.paths.push(url.pathname);
    const sessionId = String(req.headers["mcp-session-id"] ?? "");
    if (req.method === "GET") {
      res.statusCode = 405;
      res.end();
      return;
    }
    if (req.method === "DELETE") {
      state.deletes.push(sessionId);
      state.deleteAgents.push(String(req.headers["x-tabz-agent"] ?? ""));
      if (url.pathname.endsWith("/cleanup-hang")) return;
      if (url.pathname.endsWith("/cleanup-error")) {
        res.statusCode = 500;
        res.end();
        return;
      }
      res.statusCode = 200;
      res.end();
      return;
    }
    const message = await body(req);
    if (message.method === "initialize") {
      const created = `session-${nextSession++}`;
      state.agents.push(String(req.headers["x-tabz-agent"] ?? ""));
      rpc(res, message.id, {
        protocolVersion: "2025-03-26",
        capabilities: { tools: {} },
        serverInfo: { name: "cli-mock", version: "1.0.0" }
      }, created);
      return;
    }
    if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
      res.statusCode = 202;
      res.end();
      return;
    }
    if (message.method === "tools/list") {
      const published = url.pathname.endsWith("/missing")
        ? tools.filter(entry => entry.name !== "mutate_tool")
        : tools;
      rpc(res, message.id, { tools: published });
      return;
    }
    if (message.method !== "tools/call") {
      res.statusCode = 400;
      res.end();
      return;
    }
    const params = message.params as { name: string; arguments?: Record<string, unknown> };
    state.invocations.push({
      name: params.name,
      arguments: params.arguments ?? {},
      sessionId,
      agent: String(req.headers["x-tabz-agent"] ?? "")
    });
    if (params.name === "tabz_open_url") {
      if (params.arguments?.url === "https://example.test/ambiguous") {
        rpc(res, message.id, {
          content: [{ type: "text", text: "ambiguous" }],
          structuredContent: {
            opened: true,
            reused: false,
            tabId: 78,
            groupId: 9,
            inClaudeGroup: true
          }
        });
        return;
      }
      rpc(res, message.id, {
        content: [{ type: "text", text: "created" }],
        structuredContent: {
          status: "created",
          opened: true,
          reused: false,
          tabId: 77,
          groupId: 9,
          inClaudeGroup: true,
          url: "https://example.test"
        }
      });
      return;
    }
    if (params.name === "tabz_fill") {
      const selector = params.arguments?.selector;
      const status = selector === "#verified" || selector === "#missing-verified" || selector === "#sensitive-value"
        ? "verified"
        : selector === "#mismatch"
          ? "mismatch"
          : "unknown";
      const sensitive = selector === "#sensitive-value";
      rpc(res, message.id, {
        content: [{ type: "text", text: status }],
        structuredContent: {
          status,
          dispatched: true,
          ...(selector === "#missing-verified" ? {} : { verified: status === "verified" ? true : status === "mismatch" ? false : null }),
          sensitive,
          ...(sensitive ? { actualValue: "SYNTHETIC-SHOULD-NOT-SURVIVE" } : {}),
          selector,
          tabId: 77
        },
        isError: status !== "verified"
      });
      return;
    }
    if (params.name === "tabz_act") {
      if (params.arguments?.action === "missing-evidence") {
        rpc(res, message.id, { content: [{ type: "text", text: "possibly acted" }] });
        return;
      }
      if (params.arguments?.action === "wrong-action") {
        rpc(res, message.id, {
          content: [{ type: "text", text: "possibly acted" }],
          structuredContent: { status: "completed", action: "click", success: true }
        });
        return;
      }
      rpc(res, message.id, {
        content: [{ type: "text", text: "backend timeout" }],
        structuredContent: { status: "unknown", action: "click", success: null },
        isError: true
      });
      return;
    }
    if (params.name === "tabz_close_tab") {
      rpc(res, message.id, {
        content: [{ type: "text", text: "closed" }],
        structuredContent: { status: "closed", closed: params.arguments?.tabIds, refused: [], missing: [] }
      });
      return;
    }
    if (params.name === "protocol_mutation") {
      rpcError(res, message.id, -32603, "mock protocol failure");
      return;
    }
    if (params.name === "rejected_mutation") {
      rpcError(res, message.id, -32602, "mock invalid params");
      return;
    }
    if (params.name === "expired_mutation") {
      res.statusCode = 404;
      res.end("Session not found");
      return;
    }
    if (params.name === "unverified_mutation" || params.name === "verification_interrupted_mutation") {
      const status = params.name === "unverified_mutation" ? "unverified" : "verification_interrupted";
      rpc(res, message.id, {
        content: [{ type: "text", text: status }],
        structuredContent: { status },
        isError: true
      });
      return;
    }
    if (params.name === "tabz_get_page_info") {
      if (params.arguments?.mode === "lost") {
        req.socket.destroy();
        return;
      }
      if (params.arguments?.mode === "expired") {
        res.statusCode = 404;
        res.end("Session not found");
        return;
      }
      if (params.arguments?.mode === "malformed") {
        rpc(res, message.id, "malformed");
        return;
      }
      if (params.arguments?.mode === "slow") {
        setTimeout(() => {
          if (!res.destroyed) rpc(res, message.id, { content: [{ type: "text", text: "late read" }] });
        }, 250).unref();
        return;
      }
      rpc(res, message.id, {
        content: [{ type: "text", text: "receipt found" }],
        structuredContent: { status: "found", found: true, tabId: 77 }
      });
      return;
    }
    if (params.name === "tabz_read_page") {
      rpc(res, message.id, {
        content: [{ type: "text", text: "receipt found" }],
        structuredContent: {
          status: "completed",
          success: true,
          outline: "Receipt SYNTHETIC-42",
          tabId: 77,
          nodeCount: 1,
          refCount: 0,
          truncated: false
        }
      });
      return;
    }
    if (params.name === "malformed_mutation") {
      rpc(res, message.id, "malformed");
      return;
    }
    if (params.name === "slow_mutation") {
      setTimeout(() => {
        if (!res.destroyed) rpc(res, message.id, { content: [{ type: "text", text: "late" }] });
      }, 250).unref();
      return;
    }
    if (params.name === "error_tool") {
      rpc(res, message.id, { content: [{ type: "text", text: "mock refusal" }], isError: true });
      return;
    }
    if (params.name === "binary_tool") {
      rpc(res, message.id, {
        content: [
          { type: "text", text: "mock screenshot" },
          { type: "image", mimeType: "image/png", data: Buffer.from("mock-png").toString("base64") }
        ]
      });
      return;
    }
    rpc(res, message.id, {
      content: [{ type: "text", text: params.name === "read_tool" ? "read-ok" : "mutated" }]
    });
  });
  return { server, state };
}

async function runCli(
  endpoint: string,
  args: string[],
  input = ""
): Promise<{ code: number; stdout: string; stderr: string }> {
  const child = spawnCli(endpoint, args, input);
  const timeout = setTimeout(() => child.kill("SIGKILL"), 5_000);
  timeout.unref();
  try {
    return await collect(child);
  } finally {
    clearTimeout(timeout);
  }
}

function parseStdout(result: { stdout: string }): unknown {
  return JSON.parse(result.stdout.trim());
}

let server: Server;
let endpoint: string;
let state: MockState;

beforeEach(async () => {
  const mock = startMock();
  server = mock.server;
  state = mock.state;
  endpoint = `http://127.0.0.1:${await listen(server)}/mcp/page-agent`;
});

afterEach(async () => {
  await closeServer(server);
});

describe("tabz executable against Streamable HTTP", () => {
  it("defaults to the local page-agent endpoint on port 8129", () => {
    expect(DEFAULT_TABZ_ENDPOINT).toBe("http://localhost:8129/mcp/page-agent");
  });

  it("discovers tools, uses the preset as a URL segment, and deletes its session", async () => {
    const result = await runCli(endpoint.replace("/page-agent", ""), ["--preset", "tiny", "discover"]);
    expect(result.code).toBe(0);
    expect((parseStdout(result) as { tools: unknown[] }).tools).toHaveLength(tools.length);
    expect(state.paths).toContain("/mcp/tiny");
    expect(state.deletes).toEqual(["session-1"]);
    expect(state.agents[0]).toMatch(/^cli:discover:[a-f0-9]{24}$/);
    expect(state.deleteAgents).toEqual([state.agents[0]]);
  });

  it("accepts JSON arguments only through stdin or a file and validates before mutation", async () => {
    const ok = await runCli(endpoint, ["call", "mutate_tool"], JSON.stringify({ value: "from-stdin" }));
    expect(ok.code).toBe(0);
    expect(state.invocations.at(-1)?.arguments).toEqual({ value: "from-stdin" });

    const directory = await mkdtemp(join(tmpdir(), "tabz-cli-input-"));
    try {
      const path = join(directory, "arguments.json");
      await writeFile(path, JSON.stringify({ value: "from-file" }));
      const fromFile = await runCli(endpoint, ["call", "mutate_tool", "--input", path]);
      expect(fromFile.code).toBe(0);
      expect(state.invocations.at(-1)?.arguments).toEqual({ value: "from-file" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    const invalid = await runCli(endpoint, ["call", "mutate_tool"], JSON.stringify({ typo: "never-send" }));
    expect(invalid.code).toBe(2);
    expect(parseStdout(invalid)).toMatchObject({ ok: false, code: 2 });
    expect(state.invocations).toHaveLength(2);
  });

  it("preflights absent workflow tools before any mutation", async () => {
    const result = await runCli(endpoint, ["--preset", "missing", "run", missingWorkflowPath]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("missing_tool, mutate_tool");
    expect(state.invocations).toHaveLength(0);
  });

  it("refuses tools omitted from the workflow requiredTools declaration", async () => {
    const result = await runCli(endpoint, ["run", undeclaredWorkflowPath]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("did not declare required tool: mutate_tool");
    expect(state.invocations).toHaveLength(0);
  });

  it("runs a trusted module with one session", async () => {
    const result = await runCli(endpoint, ["run", workflowPath]);
    expect(result.code).toBe(0);
    expect(parseStdout(result)).toMatchObject({ workflow: "ok" });
    expect(result.stdout).not.toContain("workflow import diagnostic");
    expect(result.stdout).not.toContain("workflow import direct stdout");
    expect(result.stderr.match(/workflow emitted a console diagnostic/g)).toHaveLength(2);
    expect(result.stderr.match(/workflow attempted direct stdout output/g)).toHaveLength(2);
    expect(new Set(state.invocations.map(call => call.sessionId)).size).toBe(1);
    expect(new Set(state.invocations.map(call => call.agent))).toEqual(new Set([state.agents[0]]));
    expect(state.deletes).toHaveLength(1);
    expect(state.deleteAgents.at(-1)).toBe(state.agents[0]);
  });

  it("maps tool isError to exit 1 while preserving its JSON result", async () => {
    const result = await runCli(endpoint, ["call", "error_tool"], "{}");
    expect(result.code).toBe(1);
    expect(parseStdout(result)).toMatchObject({ isError: true });
    expect(result.stderr).toContain("returned isError");
  });

  it("maps a typed unknown mutation to exit 4 before generic isError handling", async () => {
    const result = await runCli(endpoint, ["call", "tabz_act"], JSON.stringify({ action: "click" }));
    expect(result.code).toBe(4);
    expect(parseStdout(result)).toMatchObject({ ok: false, code: 4, uncertain: true, tool: "tabz_act" });
    expect(state.invocations.map(call => call.name)).toEqual(["tabz_act"]);
  });

  it.each([
    ["#mismatch", "mismatch", 1],
    ["#missing", "unknown", 4]
  ])("classifies and latches a tabz_fill %s verdict", async (selector, status, exitCode) => {
    const result = await runCli(endpoint, ["call", "tabz_fill"], JSON.stringify({ selector, value: "synthetic" }));
    expect(result.code).toBe(exitCode);
    if (exitCode === 1) {
      expect(parseStdout(result)).toMatchObject({ structuredContent: { status: "mismatch", verified: false } });
      expect(result.stderr).toContain("verification mismatch");
    } else {
      expect(parseStdout(result)).toMatchObject({ ok: false, code: 4, uncertain: true, tool: "tabz_fill" });
      expect(result.stderr).toContain(`mutation status ${status}`);
    }
    expect(state.invocations.map(call => call.name)).toEqual(["tabz_fill"]);
  });

  it("accepts only a verified tabz_fill verdict as success", async () => {
    const result = await runCli(endpoint, ["call", "tabz_fill"], JSON.stringify({ selector: "#verified", value: true }));
    expect(result.code).toBe(0);
    expect(parseStdout(result)).toMatchObject({ structuredContent: { status: "verified", verified: true } });
    expect(state.invocations.map(call => call.name)).toEqual(["tabz_fill"]);
  });

  it.each(["#missing-verified", "#sensitive-value"])(
    "treats malformed tabz_fill evidence from %s as uncertain",
    async selector => {
      const result = await runCli(endpoint, ["call", "tabz_fill"], JSON.stringify({ selector, value: "synthetic" }));
      expect(result.code).toBe(4);
      expect(parseStdout(result)).toMatchObject({ ok: false, code: 4, uncertain: true, tool: "tabz_fill" });
      expect(result.stdout).not.toContain("SYNTHETIC-SHOULD-NOT-SURVIVE");
      expect(state.invocations.map(call => call.name)).toEqual(["tabz_fill"]);
    }
  );

  it.each(["missing-evidence", "wrong-action"])(
    "treats malformed tabz_act %s as uncertain",
    async action => {
      const result = await runCli(endpoint, ["call", "tabz_act"], JSON.stringify({ action }));
      expect(result.code).toBe(4);
      expect(parseStdout(result)).toMatchObject({ ok: false, code: 4, uncertain: true, tool: "tabz_act" });
      expect(state.invocations.map(call => call.name)).toEqual(["tabz_act"]);
    }
  );

  it.each(["unverified_mutation", "verification_interrupted_mutation"])(
    "maps %s verification status to exit 4 before generic isError handling",
    async name => {
      const result = await runCli(endpoint, ["call", name], "{}");
      expect(result.code).toBe(4);
      expect(parseStdout(result)).toMatchObject({ ok: false, code: 4, uncertain: true, tool: name });
      expect(state.invocations.map(call => call.name)).toEqual([name]);
    }
  );

  it("keeps verification uncertainty sticky while permitting reconciliation reads", async () => {
    const result = await runCli(endpoint, ["run", verificationUncertainWorkflowPath]);
    expect(result.code).toBe(0);
    expect(parseStdout(result)).toMatchObject({
      first: 1,
      blocked: 4,
      receipt: { status: "completed" },
      uncertainty: { toolName: "tabz_fill" }
    });
    expect(state.invocations.map(call => call.name)).toEqual(["tabz_fill", "tabz_read_page"]);
  });

  it("treats remaining mutation protocol errors as uncertain except invalid params and session loss", async () => {
    const protocol = await runCli(endpoint, ["call", "protocol_mutation"], "{}");
    expect(protocol.code).toBe(4);
    expect(parseStdout(protocol)).toMatchObject({ ok: false, code: 4, uncertain: true });

    const invalid = await runCli(endpoint, ["call", "rejected_mutation"], "{}");
    expect(invalid.code).toBe(2);
    expect(parseStdout(invalid)).toMatchObject({ ok: false, code: 2 });

    const expired = await runCli(endpoint, ["call", "expired_mutation"], "{}");
    expect(expired.code).toBe(3);
    expect(parseStdout(expired)).toMatchObject({ ok: false, code: 3 });
    expect(state.invocations.map(call => call.name)).toEqual([
      "protocol_mutation",
      "rejected_mutation",
      "expired_mutation"
    ]);
  });

  it("allows only exact positively owned cleanup after read reconciliation", async () => {
    const result = await runCli(endpoint, ["run", ownedCleanupWorkflowPath]);
    expect(result.code).toBe(0);
    expect(parseStdout(result)).toMatchObject({
      uncertain: 4,
      unrelated: 2,
      replay: 4,
      receipt: { status: "found" },
      closed: { status: "closed", closed: [77] },
      uncertainty: { toolName: "tabz_act" }
    });
    expect(state.invocations.map(call => call.name)).toEqual([
      "tabz_open_url",
      "tabz_act",
      "tabz_get_page_info",
      "tabz_close_tab"
    ]);
    expect(state.invocations.at(-1)?.arguments).toEqual({ tabIds: [77] });
  });

  it("does not ledger an open result missing its explicit created status", async () => {
    const client = new TabzClient({ endpoint, workflow: "ambiguous-open" });
    try {
      await expect(client.callTool("tabz_open_url", {
        url: "https://example.test/ambiguous",
        newTab: true,
        reuseExisting: false
      })).rejects.toMatchObject({ exitCode: 4, toolName: "tabz_open_url" });
      await client.callTool("tabz_read_page", {});
      await expect(client.closeOwnedTabAfterReconciliation(78)).rejects.toMatchObject({ exitCode: 2 });
      expect(state.invocations.map(call => call.name)).toEqual(["tabz_open_url", "tabz_read_page"]);
    } finally {
      await client.close();
    }
  });

  it("latches ConnectionClosed after mutation dispatch and poisons the lost session", async () => {
    const client = new TabzClient({ endpoint, workflow: "connection-closed" });
    try {
      await client.discover();
      (client as unknown as { sdkClient: { callTool(): Promise<never> } }).sdkClient.callTool = async () => {
        throw new McpError(ErrorCode.ConnectionClosed, "synthetic closed transport");
      };
      await expect(client.callTool("mutate_tool", { value: "synthetic" })).rejects.toMatchObject({
        exitCode: 4,
        toolName: "mutate_tool"
      });
      await expect(client.callTool("tabz_read_page", {})).rejects.toMatchObject({ exitCode: 3 });
      expect(client.mutationUncertainty).toMatchObject({ toolName: "mutate_tool" });
    } finally {
      await client.close().catch(() => {});
    }
  });

  it("maps transport loss, expiry, and malformed read responses to exit 3 without replay", async () => {
    for (const mode of ["lost", "expired", "malformed"]) {
      const before = state.invocations.length;
      const result = await runCli(endpoint, ["--timeout", "100", "call", "tabz_get_page_info"], JSON.stringify({ mode }));
      expect(result.code, mode).toBe(3);
      expect(parseStdout(result), mode).toMatchObject({ ok: false, code: 3 });
      expect(state.invocations.slice(before).map(call => call.name), mode).toEqual(["tabz_get_page_info"]);
    }
  });

  it("maps mutation timeout and malformed mutation response to exit 4 without replay", async () => {
    for (const name of ["slow_mutation", "malformed_mutation"]) {
      const before = state.invocations.length;
      const result = await runCli(endpoint, ["--timeout", "100", "call", name], "{}");
      expect(result.code, name).toBe(4);
      expect(parseStdout(result), name).toMatchObject({ ok: false, code: 4, uncertain: true, tool: name });
      expect(state.invocations.slice(before).filter(call => call.name === name), name).toHaveLength(1);
    }
  });

  it("allows read reconciliation after uncertainty but blocks another mutation", async () => {
    const result = await runCli(endpoint, ["run", reconcileWorkflowPath]);
    expect(result.code).toBe(0);
    expect(parseStdout(result)).toMatchObject({
      first: 4,
      blocked: 4,
      uncertainty: { toolName: "slow_mutation" }
    });
    expect(state.invocations.map(call => call.name)).toEqual(["slow_mutation", "tabz_read_page"]);
  });

  it("rejects concurrent calls on one workflow session", async () => {
    const result = await runCli(endpoint, ["run", concurrentWorkflowPath]);
    expect(result.code).toBe(0);
    expect(parseStdout(result)).toEqual([
      { status: "fulfilled" },
      { status: "rejected", exitCode: 2 }
    ]);
    expect(state.invocations.map(call => call.name)).toEqual(["tabz_get_page_info"]);
  });

  it("assigns distinct 96-bit identities to concurrent runs", async () => {
    const [one, two] = await Promise.all([
      runCli(endpoint, ["discover"]),
      runCli(endpoint, ["discover"])
    ]);
    expect(one.code).toBe(0);
    expect(two.code).toBe(0);
    expect(state.agents).toHaveLength(2);
    expect(state.agents[0]).toMatch(/^cli:discover:[a-f0-9]{24}$/);
    expect(state.agents[1]).toMatch(/^cli:discover:[a-f0-9]{24}$/);
    expect(new Set(state.agents).size).toBe(2);
  });

  it("omits inline binary data unless an explicit bounded output path is provided", async () => {
    const omitted = await runCli(endpoint, ["call", "binary_tool"], "{}");
    expect(omitted.code).toBe(0);
    expect(omitted.stdout).not.toContain(Buffer.from("mock-png").toString("base64"));
    const omittedResult = parseStdout(omitted) as { content: Array<{ type: string; text?: string }> };
    expect(omittedResult.content.at(-1)?.text).toContain('"omitted":true');

    const directory = await mkdtemp(join(tmpdir(), "tabz-cli-test-"));
    try {
      const path = join(directory, "shot.png");
      const saved = await runCli(endpoint, ["call", "binary_tool", "--output", path], "{}");
      expect(saved.code).toBe(0);
      expect(await readFile(path, "utf8")).toBe("mock-png");
      expect(saved.stdout).toContain(path);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects non-regular and oversized argument files without reading or dispatching them", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tabz-cli-large-input-"));
    try {
      const special = await runCli(endpoint, ["call", "mutate_tool", "--input", directory]);
      expect(special.code).toBe(2);
      expect(special.stderr).toContain("regular file");

      const path = join(directory, "large.json");
      await writeFile(path, Buffer.alloc(1024 * 1024 + 1, 0x20));
      const large = await runCli(endpoint, ["call", "mutate_tool", "--input", path]);
      expect(large.code).toBe(2);
      expect(large.stderr).toContain("exceeds 1048576 bytes");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
    expect(state.invocations).toHaveLength(0);
  });

  it("uses the injected fetch implementation for session DELETE", async () => {
    const methods: string[] = [];
    const routedFetch: typeof fetch = async (input, init) => {
      methods.push(init?.method ?? "GET");
      return fetch(input, init);
    };
    const client = new TabzClient({ endpoint, workflow: "custom-fetch", fetch: routedFetch });
    await client.discover();
    await client.close();
    expect(methods).toContain("DELETE");
    expect(state.deletes).toHaveLength(1);
  });

  it("bounds a stalled DELETE and a stalled SDK close", async () => {
    const deleteClient = new TabzClient({
      endpoint: endpoint.replace("/page-agent", "/cleanup-hang"),
      workflow: "bounded-delete",
      cleanupTimeoutMs: 50
    });
    await deleteClient.discover();
    const deleteStart = Date.now();
    await expect(deleteClient.close()).rejects.toThrow("session cleanup failed");
    expect(Date.now() - deleteStart).toBeLessThan(500);

    const closeClient = new TabzClient({ endpoint, workflow: "bounded-sdk-close", cleanupTimeoutMs: 50 });
    await closeClient.discover();
    (closeClient as unknown as { sdkClient: { close(): Promise<void> } }).sdkClient.close = () => new Promise(() => {});
    const closeStart = Date.now();
    await expect(closeClient.close()).rejects.toThrow("MCP client close timed out");
    expect(Date.now() - closeStart).toBeLessThan(500);
  });

  it("preserves the primary tool failure when session cleanup also fails", async () => {
    const result = await runCli(endpoint.replace("/page-agent", "/cleanup-error"), ["call", "error_tool"], "{}");
    expect(result.code).toBe(1);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(parseStdout(result)).toMatchObject({ isError: true });
    expect(result.stderr).toContain("returned isError");
    expect(result.stderr).toContain("session cleanup failed");
  });

  it.each(["SIGINT", "SIGTERM"] as const)("deletes the session on %s and reports an uncertain mutation", async signal => {
    const before = state.deletes.length;
    const invocationCount = state.invocations.length;
    const child = spawnCli(endpoint, ["--timeout", "5000", "call", "slow_mutation"], "{}");
    await waitFor(() => state.invocations.length > invocationCount && state.invocations.at(-1)?.name === "slow_mutation");
    child.kill(signal);
    const result = await collect(child);
    expect(result.code).toBe(4);
    expect(parseStdout(result)).toMatchObject({ ok: false, code: 4, uncertain: true, tool: "slow_mutation" });
    expect(state.deletes).toHaveLength(before + 1);
  });

  it("maps interruption of an in-flight read to exit 3", async () => {
    const invocationCount = state.invocations.length;
    const child = spawnCli(endpoint, ["--timeout", "5000", "call", "tabz_get_page_info"], JSON.stringify({ mode: "slow" }));
    await waitFor(() => state.invocations.length > invocationCount && state.invocations.at(-1)?.name === "tabz_get_page_info");
    child.kill("SIGTERM");
    const result = await collect(child);
    expect(result.code).toBe(3);
    expect(parseStdout(result)).toMatchObject({ ok: false, code: 3 });
  });

  it("emits one JSON result when SIGTERM interrupts a paused workflow", async () => {
    const agentCount = state.agents.length;
    const child = spawnCli(endpoint, ["run", pausedWorkflowPath], "");
    await waitFor(() => state.agents.length > agentCount);
    child.kill("SIGTERM");
    const result = await collect(child);
    expect(result.code).toBe(3);
    expect(result.stdout.trim().split("\n")).toHaveLength(1);
    expect(parseStdout(result)).toMatchObject({ ok: false, code: 3 });
  });
});

function spawnCli(endpointUrl: string, args: string[], input: string): ChildProcessWithoutNullStreams {
  const child = spawn(
    process.execPath,
    [cliPath, "--endpoint", endpointUrl, ...args],
    { cwd: process.cwd(), stdio: "pipe" }
  );
  child.stdin.end(input);
  return child;
}

function collect(child: ChildProcessWithoutNullStreams): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolveResult => {
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("close", code => resolveResult({ code: code ?? -1, stdout, stderr }));
  });
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition timed out");
    await new Promise(resolveWait => setTimeout(resolveWait, 10));
  }
}
