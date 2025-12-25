/**
 * Debugger Tools
 *
 * Tools for DevTools-level page inspection using Chrome debugger API.
 * Provides DOM tree inspection, performance profiling, and code coverage analysis.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import {
  ResponseFormat,
  type DOMTreeResult,
  type PerformanceResult,
  type CoverageResult,
  type SimplifiedDOMNode,
  type FileCoverage
} from "../types.js";
import { formatBytes } from "../utils.js";

/**
 * Get DOM tree via Extension API
 */
async function getDomTree(options: {
  tabId?: number;
  maxDepth?: number;
  selector?: string;
}): Promise<DOMTreeResult> {
  try {
    const response = await axios.post<DOMTreeResult>(
      `${BACKEND_URL}/api/browser/dom-tree`,
      {
        tabId: options.tabId,
        maxDepth: options.maxDepth,
        selector: options.selector
      },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get DOM tree");
  }
}

/**
 * Profile page performance via Extension API
 */
async function profilePerformance(options: {
  tabId?: number;
}): Promise<PerformanceResult> {
  try {
    const response = await axios.post<PerformanceResult>(
      `${BACKEND_URL}/api/browser/profile-performance`,
      { tabId: options.tabId },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to profile performance");
  }
}

/**
 * Get code coverage via Extension API
 */
async function getCoverage(options: {
  tabId?: number;
  type?: string;
}): Promise<CoverageResult> {
  try {
    const response = await axios.post<CoverageResult>(
      `${BACKEND_URL}/api/browser/coverage`,
      { tabId: options.tabId, type: options.type },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get coverage");
  }
}

// =====================================
// Input Schemas
// =====================================

const GetDomTreeSchema = z.object({
  tabId: z.number()
    .int()
    .optional()
    .describe("Chrome tab ID. Omit to use the currently active tab."),
  maxDepth: z.number()
    .int()
    .min(1)
    .max(10)
    .default(4)
    .describe("Maximum depth to traverse (1-10, default: 4). Higher values return more detail but take longer."),
  selector: z.string()
    .optional()
    .describe("CSS selector to get a specific subtree. Omit to get the full document."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable tree or 'json' for structured data")
}).strict();

type GetDomTreeInput = z.infer<typeof GetDomTreeSchema>;

const ProfilePerformanceSchema = z.object({
  tabId: z.number()
    .int()
    .optional()
    .describe("Chrome tab ID. Omit to use the currently active tab."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for categorized metrics or 'json' for raw data")
}).strict();

type ProfilePerformanceInput = z.infer<typeof ProfilePerformanceSchema>;

const GetCoverageSchema = z.object({
  tabId: z.number()
    .int()
    .optional()
    .describe("Chrome tab ID. Omit to use the currently active tab."),
  type: z.enum(['js', 'css', 'both'])
    .default('both')
    .describe("Coverage type: 'js' for JavaScript only, 'css' for CSS only, 'both' for both"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for summary with file list or 'json' for detailed data")
}).strict();

type GetCoverageInput = z.infer<typeof GetCoverageSchema>;

// =====================================
// Formatting Helpers
// =====================================

/**
 * Format DOM tree as indented text
 */
function formatDOMTree(node: SimplifiedDOMNode, indent: number = 0): string[] {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  // Text nodes
  if (node.tag === '#text') {
    if (node.text) {
      const truncatedText = node.text.length > 80 ? node.text.slice(0, 80) + '...' : node.text;
      lines.push(`${prefix}"${truncatedText}"`);
    }
    return lines;
  }

  // Element nodes
  let tagLine = `${prefix}<${node.tag}`;
  if (node.id) tagLine += ` id="${node.id}"`;
  if (node.classes && node.classes.length > 0) {
    tagLine += ` class="${node.classes.join(' ')}"`;
  }
  tagLine += '>';

  // Add child count indicator if we have childCount but no children expanded
  if (node.childCount && (!node.children || node.children.length === 0)) {
    tagLine += ` (${node.childCount} children)`;
  }

  lines.push(tagLine);

  // Process children
  if (node.children) {
    for (const child of node.children) {
      lines.push(...formatDOMTree(child, indent + 1));
    }
  }

  return lines;
}

/**
 * Format coverage file list
 */
function formatCoverageFiles(files: FileCoverage[], type: string): string[] {
  const lines: string[] = [];

  if (files.length === 0) {
    lines.push(`No ${type.toUpperCase()} files found.`);
    return lines;
  }

  lines.push(`| File | Used | Total | % |`);
  lines.push(`|------|------|-------|---|`);

  for (const file of files.slice(0, 20)) { // Top 20 files
    const filename = file.url.split('/').pop() || file.url;
    const truncatedName = filename.length > 40 ? filename.slice(0, 37) + '...' : filename;
    lines.push(`| ${truncatedName} | ${formatBytes(file.usedBytes)} | ${formatBytes(file.totalBytes)} | ${file.usedPercent}% |`);
  }

  if (files.length > 20) {
    lines.push(`\n... and ${files.length - 20} more files`);
  }

  return lines;
}

// =====================================
// Tool Registration
// =====================================

/**
 * Register debugger tools with the MCP server
 */
export function registerDebuggerTools(server: McpServer): void {

  // Get DOM Tree
  server.tool(
    "tabz_get_dom_tree",
    `Get the DOM tree structure of the current page using Chrome DevTools Protocol.

Uses chrome.debugger to attach to the page and extract the full DOM hierarchy.
This provides more detail than the scripting API, including shadow DOM.

**Note:** The user will see a "debugging" banner in Chrome while this runs.
The debugger automatically detaches after the operation completes.

Args:
  - tabId (optional): Chrome tab ID. Omit for active tab.
  - maxDepth: How deep to traverse (1-10, default: 4)
  - selector (optional): CSS selector to focus on a specific element
  - response_format: 'markdown' (default) or 'json'

Returns:
  - Simplified DOM tree with tag names, IDs, and classes
  - Node count for the returned tree
  - Child counts for truncated branches

Examples:
  - Full document (shallow): maxDepth=2
  - Navigation only: selector="nav"
  - Deep inspection: maxDepth=8, selector="main"

Use this tool when you need to understand the page structure deeply,
identify element hierarchies, or debug rendering issues.`,
    GetDomTreeSchema.shape,
    async (params: GetDomTreeInput) => {
      try {
        const result = await getDomTree({
          tabId: params.tabId,
          maxDepth: params.maxDepth,
          selector: params.selector
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Get DOM Tree\n\n**Error:** ${result.error}\n\n**Tip:** Make sure the page is fully loaded and not a chrome:// or extension page.`
            }],
            isError: true
          };
        }

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            tree: result.tree,
            nodeCount: result.nodeCount
          }, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# DOM Tree");
          lines.push("");

          if (params.selector) {
            lines.push(`**Selector:** \`${params.selector}\``);
          }
          lines.push(`**Max Depth:** ${params.maxDepth}`);
          lines.push(`**Nodes:** ${result.nodeCount || 0}`);
          lines.push("");
          lines.push("```html");

          if (result.tree) {
            lines.push(...formatDOMTree(result.tree));
          } else {
            lines.push("No DOM tree returned");
          }

          lines.push("```");
          lines.push("");
          lines.push("---");
          lines.push("**Note:** Use `selector` to focus on specific elements, or increase `maxDepth` for more detail.");

          resultText = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: resultText }]
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

  // Profile Performance
  server.tool(
    "tabz_profile_performance",
    `Profile the current page's performance metrics using Chrome DevTools Protocol.

Uses chrome.debugger to collect detailed performance data including:
- **Timing:** Task duration, script duration, layout time, etc.
- **Memory:** JS heap size, DOM size in memory
- **DOM:** Node counts, document counts, frame counts
- **Other:** Process-level metrics

**Note:** The user will see a "debugging" banner in Chrome while this runs.
The debugger automatically detaches after metrics are collected.

Args:
  - tabId (optional): Chrome tab ID. Omit for active tab.
  - response_format: 'markdown' (default) or 'json'

Returns:
  - Categorized performance metrics
  - Timing values in milliseconds
  - Memory values in megabytes
  - Raw metric names and values

Examples:
  - Check memory usage after interaction
  - Identify slow pages (high TaskDuration)
  - Count DOM nodes (Nodes metric)

Use this tool to diagnose performance issues, memory leaks, or DOM bloat.`,
    ProfilePerformanceSchema.shape,
    async (params: ProfilePerformanceInput) => {
      try {
        const result = await profilePerformance({
          tabId: params.tabId
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Profile Performance\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            timing: result.timing,
            memory: result.memory,
            dom: result.dom,
            other: result.other,
            rawMetrics: result.rawMetrics
          }, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Performance Metrics");
          lines.push("");

          // Timing section
          if (result.timing && Object.keys(result.timing).length > 0) {
            lines.push("## Timing (ms)");
            lines.push("");
            for (const [name, value] of Object.entries(result.timing)) {
              lines.push(`- **${name}:** ${value}ms`);
            }
            lines.push("");
          }

          // Memory section
          if (result.memory && Object.keys(result.memory).length > 0) {
            lines.push("## Memory (MB)");
            lines.push("");
            for (const [name, value] of Object.entries(result.memory)) {
              lines.push(`- **${name}:** ${value} MB`);
            }
            lines.push("");
          }

          // DOM section
          if (result.dom && Object.keys(result.dom).length > 0) {
            lines.push("## DOM Metrics");
            lines.push("");
            for (const [name, value] of Object.entries(result.dom)) {
              lines.push(`- **${name}:** ${value}`);
            }
            lines.push("");
          }

          // Other section
          if (result.other && Object.keys(result.other).length > 0) {
            lines.push("## Other Metrics");
            lines.push("");
            for (const [name, value] of Object.entries(result.other)) {
              lines.push(`- **${name}:** ${value}`);
            }
            lines.push("");
          }

          lines.push("---");
          lines.push("**Tip:** High TaskDuration indicates slow scripts. Large JSHeapUsedSize may indicate memory issues.");

          resultText = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: resultText }]
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

  // Get Coverage
  server.tool(
    "tabz_get_coverage",
    `Analyze JavaScript and/or CSS code coverage on the current page.

Uses chrome.debugger to track which code has been executed or which CSS rules have been applied.
This helps identify unused code that could be removed to improve performance.

**Note:** The user will see a "debugging" banner in Chrome while this runs.
Coverage data reflects code used since page load - interact with the page for fuller coverage.

Args:
  - tabId (optional): Chrome tab ID. Omit for active tab.
  - type: 'js' (JavaScript only), 'css' (CSS only), or 'both' (default)
  - response_format: 'markdown' (default) or 'json'

Returns:
  - Per-file coverage data with used/total bytes and percentage
  - Summary with overall usage across all files
  - Files sorted by total size (largest first)

Examples:
  - Find unused JavaScript: type='js'
  - Audit CSS bundle: type='css'
  - Full audit: type='both'

Use this tool to:
- Identify opportunities for code splitting
- Find dead CSS rules
- Measure actual code usage vs bundle size`,
    GetCoverageSchema.shape,
    async (params: GetCoverageInput) => {
      try {
        const result = await getCoverage({
          tabId: params.tabId,
          type: params.type
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Get Coverage\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            coverage: result.coverage,
            summary: result.summary
          }, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Code Coverage Report");
          lines.push("");

          // JS Coverage
          if (result.summary?.js) {
            const js = result.summary.js;
            lines.push("## JavaScript Coverage");
            lines.push("");
            lines.push(`- **Files:** ${js.files}`);
            lines.push(`- **Used:** ${formatBytes(js.usedBytes)} / ${formatBytes(js.totalBytes)} (${js.usedPercent}%)`);
            lines.push(`- **Unused:** ${formatBytes(js.totalBytes - js.usedBytes)}`);
            lines.push("");

            if (result.coverage?.js && result.coverage.js.length > 0) {
              lines.push("### Top Files by Size");
              lines.push("");
              lines.push(...formatCoverageFiles(result.coverage.js, 'js'));
              lines.push("");
            }
          }

          // CSS Coverage
          if (result.summary?.css) {
            const css = result.summary.css;
            lines.push("## CSS Coverage");
            lines.push("");
            lines.push(`- **Files:** ${css.files}`);
            lines.push(`- **Used:** ${formatBytes(css.usedBytes)} / ${formatBytes(css.totalBytes)} (${css.usedPercent}%)`);
            lines.push(`- **Unused:** ${formatBytes(css.totalBytes - css.usedBytes)}`);
            lines.push("");

            if (result.coverage?.css && result.coverage.css.length > 0) {
              lines.push("### Top Stylesheets by Size");
              lines.push("");
              lines.push(...formatCoverageFiles(result.coverage.css, 'css'));
              lines.push("");
            }
          }

          if (!result.summary?.js && !result.summary?.css) {
            lines.push("No coverage data collected. Make sure the page has loaded and has JS/CSS files.");
          }

          lines.push("---");
          lines.push("**Tip:** Low usage percentages indicate code that could be lazy-loaded or removed.");

          resultText = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: resultText }]
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
