/**
 * Script Execution Tools
 *
 * Tool for executing JavaScript in browser tabs
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
// Input schema for tabz_execute_script
const ExecuteScriptSchema = z.object({
    code: z.string()
        .min(1, "Code is required")
        .max(50000, "Code must not exceed 50,000 characters")
        .describe("JavaScript code to execute in the browser. The result of the last expression is returned."),
    tabId: z.number()
        .int()
        .optional()
        .describe("Target tab ID. If not specified, executes in the active tab."),
    allFrames: z.boolean()
        .default(false)
        .describe("Execute in all frames of the page (default: false, main frame only)")
}).strict();
/**
 * Execute JavaScript in the browser via Extension API
 */
async function executeScript(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/execute-script`, {
            code: options.code,
            tabId: options.tabId,
            allFrames: options.allFrames
        }, { timeout: 30000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to execute script");
    }
}
/**
 * Register script tools with the MCP server
 */
export function registerScriptTools(server, backendUrl) {
    server.tool("tabz_execute_script", `Execute JavaScript in a browser tab's context. Returns last expression value. Has access to document, window, localStorage, etc. Use tabz_get_skill for detailed docs.`, ExecuteScriptSchema.shape, async (params) => {
        try {
            const response = await executeScript({
                code: params.code,
                tabId: params.tabId,
                allFrames: params.allFrames
            });
            let resultText;
            if (response.success) {
                // Format the result nicely
                const resultStr = typeof response.result === 'string'
                    ? response.result
                    : JSON.stringify(response.result, null, 2);
                resultText = `## Script Executed Successfully

**Result:**
\`\`\`json
${resultStr}
\`\`\``;
            }
            else {
                resultText = `## Script Execution Failed

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
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=script.js.map