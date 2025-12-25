/**
 * DOM Interaction Tools
 *
 * Tools for clicking elements and filling input fields
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";

// Input schema for tabz_click
const ClickSchema = z.object({
  selector: z.string()
    .min(1, "Selector is required")
    .describe("CSS selector for the element to click (e.g., 'button.submit', '#login-btn', 'a[href=\"/home\"]')"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target a specific tab by Chrome tab ID (from tabz_list_tabs). If not provided, uses the current tab.")
}).strict();

type ClickInput = z.infer<typeof ClickSchema>;

// Input schema for tabz_fill
const FillSchema = z.object({
  selector: z.string()
    .min(1, "Selector is required")
    .describe("CSS selector for the input field (e.g., 'input#email', 'textarea.message', 'input[name=\"username\"]')"),
  value: z.string()
    .describe("The value to type into the input field. Clears existing content first."),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target a specific tab by Chrome tab ID (from tabz_list_tabs). If not provided, uses the current tab.")
}).strict();

type FillInput = z.infer<typeof FillSchema>;

/**
 * Click an element via Chrome Extension API
 */
async function clickElement(selector: string, tabId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post<{ success: boolean; tagName?: string; error?: string }>(
      `${BACKEND_URL}/api/browser/click-element`,
      { selector, tabId },
      { timeout: 20000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Fill an input field via Chrome Extension API
 */
async function fillInput(selector: string, value: string, tabId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await axios.post<{ success: boolean; tagName?: string; error?: string }>(
      `${BACKEND_URL}/api/browser/fill-input`,
      { selector, value, tabId },
      { timeout: 20000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Register DOM interaction tools with the MCP server
 */
export function registerInteractionTools(server: McpServer): void {
  // Click tool
  server.tool(
    "tabz_click",
    `Click an element on the page.

Waits for the element to appear (up to 5 seconds) then clicks it.
Works with buttons, links, checkboxes, and any clickable element.

WARNING: This tool can trigger actions. Use carefully.

Args:
  - selector (required): CSS selector for the element to click

Returns:
  - success: Whether the click was performed
  - error: Error message if failed

Common Selectors:
  - By ID: "#submit-button"
  - By class: ".btn-primary"
  - By tag: "button"
  - By attribute: "button[type='submit']"
  - By text (partial): "button:contains('Login')" (Note: may need JS)
  - Nested: ".modal .close-btn"

Examples:
  - Click submit: selector="button[type='submit']"
  - Click link: selector="a.nav-link"
  - Click checkbox: selector="input[type='checkbox']#agree"

Error Handling:
  - "Element not found": Selector doesn't match any element within 5 seconds
  - "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129

After clicking, use tabz_get_page_info to check if page changed,
or tabz_execute_script to verify the result.`,
    ClickSchema.shape,
    async (params: ClickInput) => {
      try {
        const result = await clickElement(params.selector, params.tabId);

        let resultText: string;
        if (result.success) {
          resultText = `## Click Successful

Clicked element: \`${params.selector}\`

The click action was performed. Use these tools to verify the result:
- \`tabz_get_page_info\` - Check if page navigated
- \`tabz_execute_script\` - Check DOM changes
- \`tabz_screenshot\` - Capture current state`;
        } else {
          resultText = `## Click Failed

**Selector:** \`${params.selector}\`
**Error:** ${result.error}

Troubleshooting:
- Use tabz_execute_script to find elements: \`document.querySelector('${params.selector}')\`
- Try a more specific selector
- Element may be in an iframe (not yet supported)
- Element may be hidden or not clickable`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !result.success
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

  // Fill tool
  server.tool(
    "tabz_fill",
    `Fill an input field with text.

Waits for the element to appear (up to 5 seconds), clears any existing value,
then types the new value. Works with text inputs, textareas, and other form fields.

WARNING: This tool modifies form state. Use carefully.

Args:
  - selector (required): CSS selector for the input field
  - value (required): Text to type into the field

Returns:
  - success: Whether the fill was performed
  - error: Error message if failed

Common Selectors:
  - By ID: "#email"
  - By name: "input[name='username']"
  - By type: "input[type='password']"
  - By placeholder: "input[placeholder='Enter email']"
  - Textarea: "textarea#message"

Examples:
  - Fill email: selector="input[type='email']", value="user@example.com"
  - Fill password: selector="#password", value="secret123"
  - Fill search: selector="input[name='q']", value="search query"

Error Handling:
  - "Element not found": Selector doesn't match any input within 5 seconds
  - "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129

After filling, you may want to:
- Click a submit button: tabz_click with selector="button[type='submit']"
- Verify the value: tabz_execute_script with code="document.querySelector('${"{selector}"}').value"`,
    FillSchema.shape,
    async (params: FillInput) => {
      try {
        const result = await fillInput(params.selector, params.value, params.tabId);

        let resultText: string;
        if (result.success) {
          // Truncate value for display if too long
          const displayValue = params.value.length > 50
            ? params.value.slice(0, 47) + "..."
            : params.value;

          resultText = `## Fill Successful

**Field:** \`${params.selector}\`
**Value:** "${displayValue}"

The field was filled. Common next steps:
- Submit form: \`tabz_click\` with selector="button[type='submit']"
- Verify value: \`tabz_execute_script\` to check field value
- Fill another field: Call this tool again with a different selector`;
        } else {
          resultText = `## Fill Failed

**Selector:** \`${params.selector}\`
**Error:** ${result.error}

Troubleshooting:
- Use tabz_execute_script to find inputs: \`document.querySelectorAll('input')\`
- Try a more specific selector
- Ensure the element is an input, textarea, or contenteditable element
- Element may be in an iframe (not yet supported)`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          isError: !result.success
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
