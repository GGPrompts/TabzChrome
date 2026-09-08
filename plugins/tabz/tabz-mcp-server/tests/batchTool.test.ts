import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { dispatchRegisteredTabzTool, registerTabzTool, type ToolHandlerExtra } from "../src/register.js";
import { registerBatchTools } from "../src/tools/batch.js";

interface ConnectedServer {
  server: McpServer;
  client: Client;
}

const connected: ConnectedServer[] = [];

async function connect(server: McpServer): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "batchTool.test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  connected.push({ server, client });
  return client;
}

function textResult(text: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text }], isError };
}

afterEach(async () => {
  while (connected.length > 0) {
    const pair = connected.pop()!;
    await pair.client.close();
    await pair.server.close();
  }
});

describe("tabz_batch", () => {
  it("runs handlers sequentially and preserves interleaved image ordering", async () => {
    const server = new McpServer({ name: "batch-order", version: "0.0.0" });
    const order: string[] = [];
    registerTabzTool(server, "tabz_test_text", "test", z.object({ value: z.string() }).strict(), async ({ value }) => {
      order.push("text:start");
      await Promise.resolve();
      order.push("text:end");
      return textResult(value);
    });
    registerTabzTool(server, "tabz_test_image", "test", z.object({}).strict(), async () => {
      order.push("image");
      return {
        content: [
          { type: "text", text: "image metadata" },
          { type: "image", data: "aW1hZ2U=", mimeType: "image/png" }
        ]
      };
    });
    registerBatchTools(server);
    const client = await connect(server);

    const result = await client.callTool({
      name: "tabz_batch",
      arguments: {
        items: [
          { name: "tabz_test_text", input: { value: "first output" } },
          { name: "tabz_test_image", input: {} }
        ]
      }
    });

    expect(order).toEqual(["text:start", "text:end", "image"]);
    expect(result.structuredContent).toMatchObject({
      completed: 2,
      sections: [
        { index: 1, name: expect.any(String), text: expect.any(String), isError: false },
        { index: 2, name: expect.any(String), text: expect.any(String), isError: false }
      ]
    });
    expect(result.isError).not.toBe(true);
    expect(result.content).toMatchObject([
      { type: "text", text: "## 1. tabz_test_text" },
      { type: "text", text: "first output" },
      { type: "text", text: "## 2. tabz_test_image" },
      { type: "text", text: "image metadata" },
      { type: "image", data: "aW1hZ2U=", mimeType: "image/png" }
    ]);
  });

  it("stops on an isError result and does not run later items", async () => {
    const server = new McpServer({ name: "batch-error", version: "0.0.0" });
    let laterCalls = 0;
    registerTabzTool(server, "tabz_test_ok", "test", z.object({}).strict(), async () => textResult("ok"));
    registerTabzTool(server, "tabz_test_error", "test", z.object({}).strict(), async () => textResult("failed", true));
    registerTabzTool(server, "tabz_test_later", "test", z.object({}).strict(), async () => {
      laterCalls += 1;
      return textResult("too late");
    });
    registerBatchTools(server);
    const client = await connect(server);

    const result = await client.callTool({
      name: "tabz_batch",
      arguments: { items: [
        { name: "tabz_test_ok", input: {} },
        { name: "tabz_test_error", input: {} },
        { name: "tabz_test_later", input: {} }
      ] }
    });

    expect(result.isError).toBe(true);
    expect(laterCalls).toBe(0);
    expect(result.content).not.toContainEqual(expect.objectContaining({ text: expect.stringContaining("tabz_test_later") }));
  });

  it("stops on strict input errors, thrown errors, unavailable tools, and nesting", async () => {
    const cases = [
      { item: { name: "tabz_test_strict", input: { typo: "x" } }, expected: "Unknown argument 'typo'" },
      { item: { name: "tabz_test_throw", input: {} }, expected: "thrown failure" },
      { item: { name: "tabz_not_registered", input: {} }, expected: "not available in this session" },
      { item: { name: "tabz_batch", input: { items: [] } }, expected: "cannot call itself" }
    ];

    for (const testCase of cases) {
      const server = new McpServer({ name: `batch-refusal-${testCase.item.name}`, version: "0.0.0" });
      let laterCalls = 0;
      registerTabzTool(server, "tabz_test_strict", "test", z.object({ value: z.string() }).strict(), async () => textResult("strict"));
      registerTabzTool(server, "tabz_test_throw", "test", z.object({}).strict(), async () => { throw new Error("thrown failure"); });
      registerTabzTool(server, "tabz_test_later", "test", z.object({}).strict(), async () => {
        laterCalls += 1;
        return textResult("later");
      });
      registerBatchTools(server);
      const client = await connect(server);

      const result = await client.callTool({
        name: "tabz_batch",
        arguments: { items: [testCase.item, { name: "tabz_test_later", input: {} }] }
      });
      const text = (result.content as Array<{ type: string; text?: string }>).map(block => block.text ?? "").join("\n");

      expect(result.isError, testCase.item.name).toBe(true);
      expect(text, testCase.item.name).toContain(testCase.expected);
      expect(laterCalls, testCase.item.name).toBe(0);
    }
  });

  it("keeps handler tables isolated between server instances", async () => {
    const alphaServer = new McpServer({ name: "batch-alpha", version: "0.0.0" });
    registerTabzTool(alphaServer, "tabz_alpha_only", "test", z.object({}).strict(), async () => textResult("alpha"));
    registerBatchTools(alphaServer);
    const alphaClient = await connect(alphaServer);

    const betaServer = new McpServer({ name: "batch-beta", version: "0.0.0" });
    registerTabzTool(betaServer, "tabz_beta_only", "test", z.object({}).strict(), async () => textResult("beta"));
    registerBatchTools(betaServer);
    const betaClient = await connect(betaServer);

    const [alphaResult, betaResult] = await Promise.all([
      alphaClient.callTool({ name: "tabz_batch", arguments: { items: [{ name: "tabz_beta_only", input: {} }] } }),
      betaClient.callTool({ name: "tabz_batch", arguments: { items: [{ name: "tabz_alpha_only", input: {} }] } })
    ]);

    expect(alphaResult.isError).toBe(true);
    expect(betaResult.isError).toBe(true);
    expect(JSON.stringify(alphaResult.content)).toContain("not available in this session");
    expect(JSON.stringify(betaResult.content)).toContain("not available in this session");
  });

  it("does not dispatch a tool whose filtered registration returned undefined", async () => {
    const server = {
      registerTool: () => undefined
    } as unknown as McpServer;
    registerTabzTool(server, "tabz_disabled", "test", z.object({}).strict(), async () => textResult("should not run"));
    const result = await dispatchRegisteredTabzTool(
      server,
      "tabz_disabled",
      {},
      { signal: new AbortController().signal } as ToolHandlerExtra
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("not available in this session");
  });

  it("stops between items when the request is cancelled", async () => {
    let batchHandler: ((args: Record<string, unknown>, extra: ToolHandlerExtra) => Promise<CallToolResult>) | undefined;
    const fakeServer = {
      registerTool(name: string, _config: unknown, handler: typeof batchHandler) {
        if (name === "tabz_batch") batchHandler = handler;
        return {};
      }
    } as unknown as McpServer;
    const controller = new AbortController();
    let secondCalls = 0;
    registerTabzTool(fakeServer, "tabz_first", "test", z.object({}).strict(), async () => {
      controller.abort();
      return textResult("first complete");
    });
    registerTabzTool(fakeServer, "tabz_second", "test", z.object({}).strict(), async () => {
      secondCalls += 1;
      return textResult("must not run");
    });
    registerBatchTools(fakeServer);

    const result = await batchHandler!(
      { items: [{ name: "tabz_first", input: {} }, { name: "tabz_second", input: {} }] },
      { signal: controller.signal } as ToolHandlerExtra
    );

    expect(secondCalls).toBe(0);
    expect(result).toMatchObject({
      isError: true,
      structuredContent: { completed: 1, cancelled: true, cancelledAt: 1, cancelledTool: "tabz_second" }
    });
    expect(JSON.stringify(result.content)).toContain("was not started");
  });
});
