/** Compact page outline with opaque refs accepted by tabz_act. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import { z } from "zod";
import { registerTabzTool } from "../register.js";
import { BACKEND_URL } from "../shared.js";
import { readFailureStatus } from "./result-contract.js";
import { tabHeaderLine } from "./tab-context.js";
import { docsPointer, TAB_ID_DESC } from "../descriptions.js";

const ReadPageSchema = z.object({
  tabId: z.number().int().positive().optional()
    .describe(TAB_ID_DESC),
  maxChars: z.number().int().min(500).max(20_000).default(6000)
    .describe("Maximum outline characters; truncated output says how to request more.")
}).strict();

type ReadPageInput = z.infer<typeof ReadPageSchema>;

interface ReadPageResult {
  success: boolean;
  tabId?: number;
  text?: string;
  nodeCount?: number;
  refCount?: number;
  truncated?: boolean;
  title?: string;
  url?: string;
  error?: string;
}

function withPageHeader(outline: string, result: ReadPageResult): { text: string; title?: string; url?: string } {
  const lines = outline.split("\n");
  let title = result.title;
  let url = result.url;
  if (lines[0]?.startsWith("## Page: ")) {
    title = title ?? lines.shift()!.slice("## Page: ".length);
    if (lines[0]?.startsWith("URL: ")) url = url ?? lines.shift()!.slice("URL: ".length);
    if (lines[0] === "") lines.shift();
  }
  const header = tabHeaderLine(result.tabId, title, url);
  return { text: header ? [header, "", ...lines].join("\n") : lines.join("\n"), title, url };
}

async function readPage(params: ReadPageInput): Promise<ReadPageResult & { transportError?: boolean }> {
  try {
    return (await axios.post<ReadPageResult>(
      `${BACKEND_URL}/api/browser/read-page`,
      { tabId: params.tabId, maxChars: params.maxChars },
      { timeout: 20_000 }
    )).data;
  } catch (error) {
    return { success: false, transportError: true, error: error instanceof Error ? error.message : String(error) };
  }
}

export function registerReadPageTools(server: McpServer): void {
  registerTabzTool(
    server,
    "tabz_read_page",
    "Read a compact outline of visible interactive elements and get refs for tabz_act. A later read or navigation makes old refs stale. " +
      docsPointer("tabz_read_page"),
    ReadPageSchema,
    async (params: ReadPageInput): Promise<CallToolResult> => {
      const result = await readPage(params);
      if (!result.success) {
        const status = readFailureStatus(result.error, result.transportError === true);
        const text = `## tabz_read_page FAILED\n\n**Status:** ${status}\n**Error:** ${result.error ?? "unknown error"}`;
        return { content: [{ type: "text", text }], structuredContent: { status, success: false, error: result.error ?? "unknown error", text }, isError: true };
      }
      if (!Number.isInteger(result.tabId) || (result.tabId ?? 0) <= 0 || typeof result.text !== "string" ||
          !Number.isInteger(result.nodeCount) || (result.nodeCount ?? -1) < 0 ||
          !Number.isInteger(result.refCount) || (result.refCount ?? -1) < 0 || typeof result.truncated !== "boolean") {
        const error = "The browser returned an incomplete page outline; no successful read is reported.";
        const text = `## tabz_read_page FAILED\n\n**Status:** failed\n**Error:** ${error}`;
        return { content: [{ type: "text", text }], structuredContent: { status: "failed", success: false, error, text }, isError: true };
      }
      const page = withPageHeader(result.text ?? "Interactive elements:\n(none visible)", result);
      return {
        content: [{ type: "text", text: page.text }],
        structuredContent: {
          status: "completed",
          success: true,
          outline: page.text,
          tabId: result.tabId,
          title: page.title ?? null,
          url: page.url ?? null,
          nodeCount: result.nodeCount,
          refCount: result.refCount,
          truncated: result.truncated,
          text: page.text
        },
        isError: false
      };
    }
  );
}
