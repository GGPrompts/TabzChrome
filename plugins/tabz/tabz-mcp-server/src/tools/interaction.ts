/**
 * DOM Interaction Tools
 *
 * Tools for clicking elements and filling input fields
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, NEVER_ASK_FOR_CREDENTIALS } from "../shared.js";
import { mutationFailureStatus, structuredToolResult } from "./result-contract.js";
import { docsPointer, TAB_ID_DESC } from "../descriptions.js";

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
    .min(1, "Selector is required"),
  value: z.union([z.string(), z.boolean()])
    .describe("Text to set. Checkbox/radio: boolean or true/false/on/off/1/0."),
  tabId: z.number()
    .int()
    .optional()
    .describe(TAB_ID_DESC)
}).strict();

type FillInput = z.infer<typeof FillSchema>;

interface FillResult {
  success: boolean;
  tagName?: string;
  inputType?: string;
  sensitive?: boolean;
  selected?: boolean;
  host?: string;
  /** True only when the extension read the field back and it matched. */
  verified?: boolean;
  verifyError?: string;
  actualLength?: number;
  /** Never present for a sensitive field. */
  actualValue?: string | boolean;
  error?: string;
  transportError?: boolean;
}

type FillValue = string | boolean;

function redactSubmittedValue(text: string | undefined, value: FillValue): string | undefined {
  if (!text || typeof value !== "string" || !value) return text;
  return text.split(value).join("[redacted]");
}

function sanitizeFillResult(result: FillResult, value: FillValue): FillResult {
  const safe: FillResult = {
    ...result,
    actualValue: typeof result.actualValue === "string"
      ? redactSubmittedValue(result.actualValue, value)
      : undefined,
    error: redactSubmittedValue(result.error, value),
    verifyError: redactSubmittedValue(result.verifyError, value)
  };
  if (
    result.success === true &&
    result.verified === true &&
    result.sensitive === false &&
    (typeof result.actualValue === "string" || typeof result.actualValue === "boolean")
  ) {
    safe.actualValue = result.actualValue;
  } else {
    delete safe.actualValue;
  }
  return safe;
}

function displayValue(value: FillValue): string {
  if (typeof value === "boolean") return String(value);
  return `"${value.length > 50 ? value.slice(0, 47) + "..." : value}"`;
}

function displayRedactedLength(value: FillValue): string {
  return typeof value === "string" ? `${value.length} chars` : "boolean value";
}

/** Render only a confirmed read-back as success. */
export function describeFillResult(
  selector: string,
  requested: FillValue,
  result: FillResult
): { text: string; isError: boolean } {
  if (!result.success) {
    return {
      isError: true,
      text: `## Fill Failed

**Selector:** \`${selector}\`
**Error:** ${result.error || "Unknown fill error"}

Troubleshooting:
- Use tabz_execute_script to find inputs: \`document.querySelectorAll('input')\`
- Try a more specific selector
- Ensure the element is an input, textarea, or contenteditable element
- Element may be in an iframe (not yet supported)`
    };
  }

  const held = result.sensitive || result.verified !== true || result.actualValue === undefined
    ? `[redacted] (${result.actualLength ?? "?"} chars)`
    : displayValue(result.actualValue);

  if (result.verified === true) {
    return {
      isError: false,
      text: `## Fill Successful

**Field:** \`${selector}\`
**Value:** ${held}

The field was read back after the write and holds the requested value. Common next steps:
- Submit form: \`tabz_click\` with selector="button[type='submit']"
- Fill another field: Call this tool again with a different selector`
    };
  }

  if (result.verified === false) {
    return {
      isError: true,
      text: `## Fill FAILED verification

**Field:** \`${selector}\`
**Field now holds:** ${held}
**Requested:** ${result.sensitive ? `[redacted] (${displayRedactedLength(requested)})` : displayValue(requested)}

The write happened but the field did not keep the requested value, so do NOT submit this form as if it were filled. The field may be controlled, readonly, masked, or length-limited.`
    };
  }

  return {
    isError: true,
    text: `## Fill UNVERIFIED

**Field:** \`${selector}\`
**Reason:** ${result.verifyError || "the extension reported no read-back verdict"}

The write was attempted but its result could not be confirmed, so treat the field as NOT filled. Check it before submitting anything.`
  };
}

/**
 * Click an element via Chrome Extension API
 */
interface ClickResult {
  success: boolean;
  tagName?: string;
  error?: string;
  transportError?: boolean;
}

async function clickElement(selector: string, tabId?: number): Promise<ClickResult> {
  try {
    const response = await axios.post<{ success: boolean; tagName?: string; error?: string }>(
      `${BACKEND_URL}/api/browser/click-element`,
      { selector, tabId },
      { timeout: 20000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, transportError: true, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Fill an input field via Chrome Extension API
 */
async function fillInput(selector: string, value: FillValue, tabId?: number): Promise<FillResult> {
  try {
    const response = await axios.post<FillResult>(
      `${BACKEND_URL}/api/browser/fill-input`,
      { selector, value, tabId },
      { timeout: 20000 }
    );
    return sanitizeFillResult(response.data, value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, transportError: true, error: redactSubmittedValue(message, value) };
  }
}

/**
 * Register DOM interaction tools with the MCP server
 */
export function registerInteractionTools(server: McpServer): void {
  // Click tool
  registerTabzTool(server,
    "tabz_click",
    "LEGACY: prefer tabz_act. Click one element by CSS selector. " + docsPointer("tabz_click"),
    ClickSchema,
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

        const status = result.success
          ? "completed"
          : mutationFailureStatus(result.error, result.transportError === true);
        return structuredToolResult(resultText, status, {
          clicked: result.success ? true : status === "unknown" ? null : false,
          selector: params.selector,
          tabId: params.tabId ?? null,
          tagName: result.tagName ?? null,
          ...(result.error ? { error: result.error } : {})
        }, !result.success);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return structuredToolResult(`Error: ${message}`, "unknown", {
          clicked: null,
          selector: params.selector,
          tabId: params.tabId ?? null,
          tagName: null,
          error: message
        }, true);
      }
    }
  );

  // Fill tool
  registerTabzTool(server,
    "tabz_fill",
    "Set and verify a form value. " +
    "Rule: submit only after \"Fill Successful\"; otherwise stop. Sensitive fields are never echoed back. " +
    NEVER_ASK_FOR_CREDENTIALS + " " + docsPointer("tabz_fill"),
    FillSchema,
    async (params: FillInput) => {
      try {
        const result = await fillInput(params.selector, params.value, params.tabId);

        const { text: resultText, isError } = describeFillResult(params.selector, params.value, result);

        const status = result.success !== true
          ? mutationFailureStatus(result.error, result.transportError === true)
          : result.verified === true
            ? "verified"
            : result.verified === false
              ? "mismatch"
              : "unknown";
        return structuredToolResult(resultText, status, {
          dispatched: status === "unknown" ? (result.transportError === true ? null : true) : result.success,
          verified: typeof result.verified === "boolean" ? result.verified : null,
          verificationInterrupted: false,
          selector: params.selector,
          tabId: params.tabId ?? null,
          tagName: result.tagName ?? null,
          inputType: result.inputType ?? null,
          sensitive: result.sensitive === true,
          ...(result.selected === true ? { selected: true } : {}),
          ...(result.actualLength !== undefined ? { actualLength: result.actualLength } : {}),
          ...(result.sensitive === false && result.verified === true && result.actualValue !== undefined ? { actualValue: result.actualValue } : {}),
          ...(result.error ? { error: result.error } : {}),
          ...(result.verifyError ? { verifyError: result.verifyError } : {})
        }, isError);
      } catch (error) {
        const message = redactSubmittedValue(error instanceof Error ? error.message : String(error), params.value) ?? "Unknown fill error";
        return structuredToolResult(`Error: ${message}`, "unknown", {
          dispatched: null,
          verified: null,
          verificationInterrupted: false,
          selector: params.selector,
          tabId: params.tabId ?? null,
          sensitive: false,
          error: message
        }, true);
      }
    }
  );
}
