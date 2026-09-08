/** Run enabled tabz handlers sequentially in one MCP call. */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ContentBlock } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { dispatchRegisteredTabzTool, registerTabzTool } from "../register.js";
import { docsPointer } from "../descriptions.js";

const BatchItemSchema = z.object({
  name: z.string().min(1).describe("Enabled tabz tool name; tabz_batch is refused."),
  input: z.record(z.unknown()).describe("Arguments for that tool's strict schema.")
}).strict();

const BatchSchema = z.object({
  items: z.array(BatchItemSchema).min(1).max(20)
    .describe("Calls in execution order; stops on the first error.")
}).strict();

function heading(index: number, name: string): ContentBlock {
  return { type: "text", text: `## ${index + 1}. ${name}` };
}

export function registerBatchTools(server: McpServer): void {
  registerTabzTool(
    server,
    "tabz_batch",
    "Run enabled tabz calls sequentially in one round trip; stop on the first error. Cannot be nested. " +
    docsPointer("tabz_batch"),
    BatchSchema,
    async ({ items }, extra): Promise<CallToolResult> => {
      const content: ContentBlock[] = [];
      const sections: Array<{ index: number; name: string; text: string; isError: boolean }> = [];
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (extra.signal.aborted) {
          const message = `Batch cancelled before item ${index + 1} (${item.name}); it was not started.`;
          content.push({ type: "text", text: message });
          return {
            content,
            isError: true,
            structuredContent: {
              completed: index,
              cancelled: true,
              cancelledAt: index,
              cancelledTool: item.name,
              sections
            }
          };
        }
        const result = await dispatchRegisteredTabzTool(server, item.name, item.input, extra);
        content.push(heading(index, item.name), ...result.content);
        sections.push({
          index: index + 1,
          name: item.name,
          text: result.content.filter(block => block.type === "text").map(block => (block as { text: string }).text).join("\n"),
          isError: result.isError === true
        });
        if (result.isError === true) {
          return { content, isError: true, structuredContent: { completed: index, failedIndex: index, failedTool: item.name, sections } };
        }
      }
      return { content, structuredContent: { completed: items.length, sections } };
    }
  );
}
