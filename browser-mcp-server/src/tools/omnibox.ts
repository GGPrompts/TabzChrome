/**
 * Omnibox and Navigation Tools
 *
 * Tools for opening URLs and triggering omnibox commands
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getCdpBrowser } from "../client.js";

// Allowed URL patterns (same as in extension background.ts) - path is optional
const ALLOWED_URL_PATTERNS = [
  /^https?:\/\/(www\.)?github\.com(\/.*)?$/i,
  /^https?:\/\/(www\.)?gitlab\.com(\/.*)?$/i,
  /^https?:\/\/localhost(:\d+)?(\/.*)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/i,
  /^https?:\/\/[\w-]+\.vercel\.app(\/.*)?$/i,  // Vercel preview/production (e.g., my-app-abc123.vercel.app)
  /^https?:\/\/[\w.-]+\.vercel\.com(\/.*)?$/i, // Vercel alternative domain
  // Image/Video Generation AI
  /^https?:\/\/(www\.)?bing\.com\/images\/create(\/.*)?$/i,  // Bing Image Creator
  /^https?:\/\/(sora\.)?chatgpt\.com(\/.*)?$/i,              // ChatGPT + Sora
  /^https?:\/\/(www\.)?ideogram\.ai(\/.*)?$/i,               // Ideogram
  /^https?:\/\/(app\.)?leonardo\.ai(\/.*)?$/i,               // Leonardo.ai
  /^https?:\/\/(www\.)?tensor\.art(\/.*)?$/i,                // Tensor.Art
  /^https?:\/\/(www\.)?playground\.com(\/.*)?$/i,            // Playground
  /^https?:\/\/(www\.)?lexica\.art(\/.*)?$/i,                // Lexica
  // AI Chat/Search
  /^https?:\/\/(www\.)?claude\.ai(\/.*)?$/i,                 // Claude.ai
  /^https?:\/\/(www\.)?perplexity\.ai(\/.*)?$/i,             // Perplexity
  /^https?:\/\/(chat\.)?deepseek\.com(\/.*)?$/i,             // DeepSeek
  /^https?:\/\/(www\.)?phind\.com(\/.*)?$/i,                 // Phind
  /^https?:\/\/(www\.)?you\.com(\/.*)?$/i,                   // You.com
];

/**
 * Check if URL is allowed
 */
function isAllowedUrl(url: string): { allowed: boolean; normalizedUrl?: string } {
  let normalized = url.trim();

  // Add https:// if no protocol specified
  if (!normalized.match(/^https?:\/\//i)) {
    // Check if it looks like a domain (with or without www.)
    if (normalized.match(/^(www\.)?(github\.com|gitlab\.com|localhost|127\.0\.0\.1)/i)) {
      normalized = `https://${normalized}`;
    }
    // Check for Vercel domains (e.g., my-app.vercel.app)
    else if (normalized.match(/^[\w-]+\.vercel\.(app|com)/i)) {
      normalized = `https://${normalized}`;
    } else {
      return { allowed: false };
    }
  }

  // Check against allowed patterns
  for (const pattern of ALLOWED_URL_PATTERNS) {
    if (pattern.test(normalized)) {
      return { allowed: true, normalizedUrl: normalized };
    }
  }

  return { allowed: false };
}

// Input schema for browser_open_url
const OpenUrlSchema = z.object({
  url: z.string()
    .min(1)
    .describe("URL to open. Must be from allowed domains: github.com, gitlab.com, localhost, or 127.0.0.1"),
  newTab: z.boolean()
    .default(true)
    .describe("Open in new tab (default: true) or current tab"),
  background: z.boolean()
    .default(false)
    .describe("Open in background tab (default: false, opens in foreground)")
}).strict();

type OpenUrlInput = z.infer<typeof OpenUrlSchema>;

/**
 * Register omnibox/navigation tools with the MCP server
 */
export function registerOmniboxTools(server: McpServer): void {
  // Open URL tool
  server.tool(
    "browser_open_url",
    `Open a URL in the browser (supports allowed domains only).

Opens URLs from whitelisted domains in a new or current browser tab.
Useful for opening GitHub repositories, GitLab projects, Vercel deployments, AI tools, or localhost development servers.

**Allowed Domains:**
- github.com, gitlab.com
- *.vercel.app, *.vercel.com
- localhost, 127.0.0.1
- Image AI: bing.com/images/create, chatgpt.com, sora.chatgpt.com, ideogram.ai, leonardo.ai, tensor.art, playground.com, lexica.art
- Chat AI: claude.ai, perplexity.ai, deepseek.com, phind.com, you.com

Args:
  - url (required): URL to open (can omit https:// for allowed domains)
  - newTab: Open in new tab (default: true) or replace current tab
  - background: Open in background (default: false, opens in foreground)

Returns:
  - success: Whether the URL was opened
  - url: The normalized URL that was opened
  - error: Error message if failed

Examples:
  - Open GitHub repo: url="github.com/user/repo"
  - Open PR: url="https://github.com/user/repo/pull/123"
  - Open Vercel app: url="my-app-abc123.vercel.app"
  - Open localhost: url="localhost:3000"
  - Current tab: url="github.com/user/repo", newTab=false
  - Background: url="my-app.vercel.app", background=true

Error Handling:
  - "URL not allowed": Domain not in whitelist
  - "CDP not available": Chrome not running with --remote-debugging-port=9222

Security:
  Only whitelisted domains can be opened to prevent abuse.
  Cannot open arbitrary websites, file:// URLs, or chrome:// pages.`,
    OpenUrlSchema.shape,
    async (params: OpenUrlInput) => {
      try {
        // Validate URL
        const validation = isAllowedUrl(params.url);
        if (!validation.allowed || !validation.normalizedUrl) {
          return {
            content: [{
              type: "text",
              text: `## URL Not Allowed

**Error:** The URL domain is not whitelisted.

**Provided URL:** ${params.url}

**Allowed domains:**
- github.com, gitlab.com
- *.vercel.app, *.vercel.com
- localhost, 127.0.0.1
- Image AI: bing.com/images/create, chatgpt.com, ideogram.ai, leonardo.ai, tensor.art, playground.com, lexica.art
- Chat AI: claude.ai, perplexity.ai, deepseek.com, phind.com, you.com

Please provide a URL from one of the allowed domains.`
            }],
            isError: true
          };
        }

        const normalizedUrl = validation.normalizedUrl;

        // Open URL via CDP
        const browser = await getCdpBrowser();
        if (!browser) {
          return {
            content: [{
              type: "text",
              text: `## CDP Not Available

Cannot open URL without Chrome DevTools Protocol.

**Make sure:**
1. Chrome is running
2. Chrome was started with: \`--remote-debugging-port=9222\`
3. WSL2 bridge is running (if on WSL2)

**Attempted URL:** ${normalizedUrl}`
            }],
            isError: true
          };
        }

        const pages = await browser.pages();
        const currentPage = pages.find(p => !p.url().startsWith('chrome://')) || pages[0];

        if (params.newTab) {
          // Open in new tab
          const newPage = await browser.newPage();
          await newPage.goto(normalizedUrl, { waitUntil: 'domcontentloaded' });

          if (!params.background && currentPage) {
            // Bring to front if not background
            await newPage.bringToFront();
          }
        } else {
          // Navigate current tab
          if (currentPage) {
            await currentPage.goto(normalizedUrl, { waitUntil: 'domcontentloaded' });
          } else {
            // No page available, create new one
            const newPage = await browser.newPage();
            await newPage.goto(normalizedUrl, { waitUntil: 'domcontentloaded' });
          }
        }

        return {
          content: [{
            type: "text",
            text: `## URL Opened

**Success!** Opened ${params.newTab ? 'in new tab' : 'in current tab'}${params.background ? ' (background)' : ''}.

**URL:** ${normalizedUrl}

Use \`browser_get_page_info\` to verify the page loaded.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `## Failed to Open URL

**Error:** ${error instanceof Error ? error.message : String(error)}

**URL:** ${params.url}`
          }],
          isError: true
        };
      }
    }
  );
}
