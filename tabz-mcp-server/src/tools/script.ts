/**
 * Script Execution Tools
 *
 * Tool for executing JavaScript in browser tabs
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import type { ScriptResult } from "../types.js";
import { docsPointer } from "../descriptions.js";

// Input schema for tabz_execute_script
const ExecuteScriptSchema = z.object({
  code: z.string()
    .min(1, "Code is required")
    .max(50000, "Code must not exceed 50,000 characters")
    .describe("JavaScript to evaluate; the last expression's value returns."),
  tabId: z.number()
    .int()
    .optional(),
  allFrames: z.boolean()
    .default(false)
    .describe("All frames, but only on the whitelist fallback path.")
}).strict();

type ExecuteScriptInput = z.infer<typeof ExecuteScriptSchema>;

/**
 * Execute JavaScript in the browser via Extension API
 */
async function executeScript(options: {
  code: string;
  tabId?: number;
  allFrames?: boolean;
}): Promise<ScriptResult> {
  try {
    const response = await axios.post<ScriptResult>(
      `${BACKEND_URL}/api/browser/execute-script`,
      {
        code: options.code,
        tabId: options.tabId,
        allFrames: options.allFrames
      },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to execute script");
  }
}

/**
 * Register script tools with the MCP server
 */
export function registerScriptTools(server: McpServer, backendUrl: string): void {
  registerTabzTool(server,
    "tabz_execute_script",
    "Evaluate JavaScript through the debugger, or exact supported whitelist forms across all frames; returned values are bounded. Chrome may show its debugging bar. " + docsPointer("tabz_execute_script"),
    ExecuteScriptSchema,
    async (params: ExecuteScriptInput) => {
      try {
        const response = await executeScript({
          code: params.code,
          tabId: params.tabId,
          allFrames: params.allFrames
        });

        let resultText: string;
        if (response.success) {
          // Format the result nicely
          const resultStr = typeof response.result === 'string'
            ? response.result
            : JSON.stringify(response.result, null, 2);

          resultText = `## Script Executed Successfully

**Execution path:** ${response.executionPath || 'unknown'}${response.resultTruncated ? ' (result truncated)' : ''}
${response.warning ? `\n**Warning:** ${response.warning}\n` : ''}

**Result:**
\`\`\`json
${resultStr}
\`\`\``;
        } else {
          const timeoutDetails = response.timedOut
            ? `\n**Timed out:** yes\n**Outcome uncertain:** ${response.uncertain === true ? 'yes' : 'no'}\n**Termination attempted:** ${response.terminationAttempted === true ? 'yes' : 'no'}\n**Termination acknowledged:** ${response.terminationAcknowledged === true ? 'yes' : 'no'}\n`
            : '';
          resultText = `## Script Execution Failed

**Execution path:** ${response.executionPath || 'unknown'}
${response.warning ? `\n**Warning:** ${response.warning}\n` : ''}${timeoutDetails}

**Error:** ${response.error}

Common issues:
- Check for syntax errors in the code
- Make sure the tab is a regular web page (not chrome:// or extension pages)
- Ensure selectors match elements that exist on the page`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !response.success
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}
