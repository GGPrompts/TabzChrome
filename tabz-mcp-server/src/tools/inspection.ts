/**
 * Element Inspection Tools
 *
 * Tools for inspecting DOM elements - HTML, styles, bounds, attributes
 * Ideal for CSS debugging and recreating UI elements
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, type ElementInfo } from "../shared.js";
import { ResponseFormat } from "../types.js";

// Input schema for tabz_get_element
const GetElementSchema = z.object({
  selector: z.string()
    .min(1, "Selector is required")
    .describe("CSS selector for the element to inspect (e.g., '.card', '#header', 'button.primary')"),
  includeStyles: z.boolean()
    .default(true)
    .describe("Include computed CSS styles (default: true)"),
  styleProperties: z.array(z.string())
    .optional()
    .describe("Specific CSS properties to extract. If not provided, extracts common layout/typography/visual properties."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type GetElementInput = z.infer<typeof GetElementSchema>;

/**
 * Get detailed information about an element via Chrome Extension API
 */
async function getElementInfo(
  selector: string,
  options: {
    includeStyles?: boolean;
    styleProperties?: string[];
    tabId?: number;
  } = {}
): Promise<ElementInfo> {
  try {
    const response = await axios.post<ElementInfo>(
      `${BACKEND_URL}/api/browser/get-element-info`,
      {
        selector,
        tabId: options.tabId,
        includeStyles: options.includeStyles,
        styleProperties: options.styleProperties
      },
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Format element info as markdown for easy reading
 */
function formatElementAsMarkdown(info: ElementInfo, selector: string): string {
  if (!info.success) {
    return `## Element Not Found

**Selector:** \`${selector}\`
**Error:** ${info.error}

Try using tabz_execute_script to find elements:
\`\`\`javascript
document.querySelectorAll('${selector}').length
\`\`\``;
  }

  const lines: string[] = [];

  lines.push(`## Element: \`${selector}\``);
  lines.push("");

  // Basic info
  lines.push(`**Tag:** \`<${info.tagName}>\` | **Children:** ${info.childCount} | **Parent:** \`${info.parentSelector}\``);
  lines.push("");

  // Bounds
  if (info.bounds) {
    lines.push(`### Dimensions`);
    lines.push(`- **Size:** ${info.bounds.width}px × ${info.bounds.height}px`);
    lines.push(`- **Position:** (${info.bounds.x}, ${info.bounds.y})`);
    lines.push("");
  }

  // Attributes
  if (info.attributes && Object.keys(info.attributes).length > 0) {
    lines.push(`### Attributes`);
    for (const [key, value] of Object.entries(info.attributes)) {
      const displayValue = value.length > 60 ? value.slice(0, 57) + '...' : value;
      lines.push(`- \`${key}\`: "${displayValue}"`);
    }
    lines.push("");
  }

  // Styles (grouped by category)
  if (info.styles && Object.keys(info.styles).length > 0) {
    lines.push(`### Computed Styles`);

    // Group styles by category
    const categories: Record<string, string[]> = {
      'Layout': ['display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'boxSizing', 'overflow', 'overflowX', 'overflowY'],
      'Spacing': ['margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'],
      'Flexbox': ['flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignContent', 'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'gap'],
      'Grid': ['gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow', 'gridGap'],
      'Typography': ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'textAlign', 'textDecoration', 'textTransform', 'letterSpacing', 'color'],
      'Background': ['background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition'],
      'Border': ['border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius', 'borderTop', 'borderRight', 'borderBottom', 'borderLeft'],
      'Effects': ['boxShadow', 'opacity', 'transform', 'transition', 'zIndex', 'cursor', 'pointerEvents']
    };

    for (const [category, props] of Object.entries(categories)) {
      const categoryStyles = props.filter(p => info.styles![p]);
      if (categoryStyles.length > 0) {
        lines.push(`\n**${category}:**`);
        lines.push('```css');
        for (const prop of categoryStyles) {
          const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
          lines.push(`${cssProp}: ${info.styles![prop]};`);
        }
        lines.push('```');
      }
    }
    lines.push("");
  }

  // HTML (truncated if very long)
  if (info.outerHTML) {
    lines.push(`### HTML`);
    const html = info.outerHTML.length > 2000
      ? info.outerHTML.slice(0, 2000) + '\n... (truncated)'
      : info.outerHTML;
    lines.push('```html');
    lines.push(html);
    lines.push('```');
  }

  // Inner text preview
  if (info.innerText && info.innerText.trim()) {
    lines.push(`\n### Text Content (preview)`);
    lines.push(`> ${info.innerText.slice(0, 200)}${info.innerText.length > 200 ? '...' : ''}`);
  }

  return lines.join("\n");
}

/**
 * Register element inspection tools with the MCP server
 */
export function registerInspectionTools(server: McpServer): void {
  server.tool(
    "tabz_get_element",
    `Get detailed information about a DOM element for CSS debugging or recreation.

Returns the element's HTML, computed styles, bounding box, and attributes.
Perfect for understanding how an element is styled or recreating it in another project.

Args:
  - selector (required): CSS selector for the element
  - includeStyles (optional): Include computed CSS styles (default: true)
  - styleProperties (optional): Specific CSS properties to extract
  - response_format: 'markdown' (default) or 'json'

Returns:
  - tagName: Element tag (div, button, etc.)
  - attributes: All HTML attributes (class, id, data-*, etc.)
  - bounds: Position and dimensions (x, y, width, height)
  - styles: Computed CSS styles (layout, typography, colors, etc.)
  - outerHTML: Complete HTML including the element
  - html: Inner HTML content
  - innerText: Text content (first 500 chars)
  - parentSelector: Selector hint for parent element
  - childCount: Number of child elements

Default Style Categories Extracted:
  - Layout: display, position, width, height, overflow
  - Spacing: margin, padding
  - Flexbox: flex-direction, justify-content, align-items, gap
  - Grid: grid-template-columns, grid-template-rows
  - Typography: font-family, font-size, font-weight, color, line-height
  - Background: background-color, background-image
  - Border: border, border-radius
  - Effects: box-shadow, opacity, transform, transition

Examples:
  - Inspect a card: selector=".card"
  - Get button styles: selector="button.primary"
  - Check header layout: selector="#main-header"
  - Just HTML, no styles: selector=".modal", includeStyles=false

Use Cases:
  - Debug CSS issues: Compare expected vs actual styles
  - Recreate elements: Get all styles needed to rebuild in another project
  - Understand layout: See flexbox/grid properties and dimensions

Error Handling:
  - "Element not found": Selector doesn't match any element
  - "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129`,
    GetElementSchema.shape,
    async (params: GetElementInput) => {
      try {
        const result = await getElementInfo(params.selector, {
          includeStyles: params.includeStyles,
          styleProperties: params.styleProperties
        });

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          resultText = formatElementAsMarkdown(result, params.selector);
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
