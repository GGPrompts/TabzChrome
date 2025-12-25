/**
 * Omnibox and Navigation Tools
 *
 * Tools for opening URLs and triggering omnibox commands
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, setCurrentTabId, type OpenUrlResult } from "../shared.js";

/**
 * Open a URL in the browser via Extension API
 */
async function openUrl(options: {
  url: string;
  newTab?: boolean;
  background?: boolean;
  reuseExisting?: boolean;
}): Promise<OpenUrlResult> {
  try {
    const response = await axios.post<OpenUrlResult>(
      `${BACKEND_URL}/api/browser/open-url`,
      {
        url: options.url,
        newTab: options.newTab,
        background: options.background,
        reuseExisting: options.reuseExisting
      },
      { timeout: 10000 }
    );

    // Update current tab ID if successful
    if (response.data.success && response.data.tabId && !options.background) {
      setCurrentTabId(response.data.tabId);
    }

    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// URL settings cache (loaded from backend)
interface UrlSettings {
  allowAllUrls: boolean;
  customDomains: string;
}

let urlSettingsCache: UrlSettings | null = null;
let urlSettingsCacheTime = 0;
const URL_SETTINGS_CACHE_TTL = 5000; // 5 seconds

/**
 * Load URL settings from backend API
 */
async function loadUrlSettings(): Promise<UrlSettings> {
  const now = Date.now();
  if (urlSettingsCache && (now - urlSettingsCacheTime) < URL_SETTINGS_CACHE_TTL) {
    return urlSettingsCache;
  }

  try {
    const response = await fetch('http://localhost:8129/api/mcp-config');
    const data = await response.json();
    urlSettingsCache = {
      allowAllUrls: data.allowAllUrls || false,
      customDomains: data.customDomains || ''
    };
    urlSettingsCacheTime = now;
    return urlSettingsCache;
  } catch {
    // Return defaults if backend unavailable
    return { allowAllUrls: false, customDomains: '' };
  }
}

/**
 * Convert custom domain string to regex pattern
 */
function domainToPattern(domain: string): RegExp | null {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return null;

  // Handle wildcard subdomain: *.example.com
  if (trimmed.startsWith('*.')) {
    const base = trimmed.slice(2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^https?:\\/\\/[\\w.-]+\\.${base}(\\/.*)?$`, 'i');
  }

  // Handle domain with optional port: example.com or example.com:8080
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^https?:\\/\\/(www\\.)?${escaped}(\\/.*)?$`, 'i');
}

// Allowed URL patterns (same as in extension background.ts) - path is optional
const ALLOWED_URL_PATTERNS = [
  // Code Hosting
  /^https?:\/\/(www\.)?github\.com(\/.*)?$/i,
  /^https?:\/\/(www\.)?gitlab\.com(\/.*)?$/i,
  /^https?:\/\/(www\.)?bitbucket\.org(\/.*)?$/i,             // Bitbucket
  // Local Development
  /^https?:\/\/localhost(:\d+)?(\/.*)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/i,
  // Deployment Platforms
  /^https?:\/\/[\w-]+\.vercel\.app(\/.*)?$/i,                // Vercel preview/production
  /^https?:\/\/[\w.-]+\.vercel\.com(\/.*)?$/i,               // Vercel alternative domain
  /^https?:\/\/[\w-]+\.netlify\.app(\/.*)?$/i,               // Netlify
  /^https?:\/\/[\w-]+\.railway\.app(\/.*)?$/i,               // Railway
  /^https?:\/\/[\w-]+\.onrender\.com(\/.*)?$/i,              // Render
  /^https?:\/\/[\w-]+\.pages\.dev(\/.*)?$/i,                 // Cloudflare Pages
  /^https?:\/\/[\w-]+\.fly\.dev(\/.*)?$/i,                   // Fly.io
  // Developer Docs & References
  /^https?:\/\/developer\.mozilla\.org(\/.*)?$/i,            // MDN Web Docs
  /^https?:\/\/(www\.)?devdocs\.io(\/.*)?$/i,                // DevDocs
  /^https?:\/\/docs\.github\.com(\/.*)?$/i,                  // GitHub Docs
  /^https?:\/\/(www\.)?stackoverflow\.com(\/.*)?$/i,         // Stack Overflow
  /^https?:\/\/[\w-]+\.stackexchange\.com(\/.*)?$/i,         // Stack Exchange sites
  // Package Registries
  /^https?:\/\/(www\.)?npmjs\.com(\/.*)?$/i,                 // npm
  /^https?:\/\/(www\.)?pypi\.org(\/.*)?$/i,                  // PyPI
  /^https?:\/\/(www\.)?crates\.io(\/.*)?$/i,                 // Rust crates
  /^https?:\/\/pkg\.go\.dev(\/.*)?$/i,                       // Go packages
  // Frontend Playgrounds (no terminal access)
  /^https?:\/\/(www\.)?codepen\.io(\/.*)?$/i,                // CodePen
  /^https?:\/\/(www\.)?jsfiddle\.net(\/.*)?$/i,              // JSFiddle
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
  /^https?:\/\/(www\.)?gemini\.google\.com(\/.*)?$/i,        // Google Gemini
  /^https?:\/\/(www\.)?copilot\.microsoft\.com(\/.*)?$/i,    // Microsoft Copilot
  // AI/ML Platforms
  /^https?:\/\/(www\.)?huggingface\.co(\/.*)?$/i,            // Hugging Face
  /^https?:\/\/(www\.)?replicate\.com(\/.*)?$/i,             // Replicate
  /^https?:\/\/(www\.)?openrouter\.ai(\/.*)?$/i,             // OpenRouter
  /^https?:\/\/(www\.)?skillsmp\.com(\/.*)?$/i,              // SkillsMP (Claude Code skills)
  // Design & Assets
  /^https?:\/\/(www\.)?figma\.com(\/.*)?$/i,                 // Figma
  /^https?:\/\/(www\.)?dribbble\.com(\/.*)?$/i,              // Dribbble
  /^https?:\/\/(www\.)?unsplash\.com(\/.*)?$/i,              // Unsplash
  /^https?:\/\/(www\.)?iconify\.design(\/.*)?$/i,            // Iconify
];

/**
 * Check if URL is allowed (with settings support)
 */
function isAllowedUrl(url: string, settings?: UrlSettings): { allowed: boolean; normalizedUrl?: string } {
  let normalized = url.trim();

  // Add https:// if no protocol specified
  if (!normalized.match(/^https?:\/\//i)) {
    // For YOLO mode, always add https://
    if (settings?.allowAllUrls) {
      normalized = `https://${normalized}`;
    } else {
      // Known domains that can have https:// auto-added
      const knownDomains = [
        // Code hosting
        /^(www\.)?(github\.com|gitlab\.com|bitbucket\.org)/i,
        // Local
        /^(localhost|127\.0\.0\.1)/i,
        // Deployment platforms (*.vercel.app, *.netlify.app, etc.)
        /^[\w-]+\.(vercel\.app|vercel\.com|netlify\.app|railway\.app|onrender\.com|pages\.dev|fly\.dev)/i,
        // Developer docs
        /^(developer\.mozilla\.org|devdocs\.io|docs\.github\.com|stackoverflow\.com)/i,
        /^[\w-]+\.stackexchange\.com/i,
        // Package registries
        /^(www\.)?(npmjs\.com|pypi\.org|crates\.io|pkg\.go\.dev)/i,
        // Playgrounds
        /^(www\.)?(codepen\.io|jsfiddle\.net)/i,
        // AI Image
        /^(www\.)?(bing\.com|chatgpt\.com|sora\.chatgpt\.com|ideogram\.ai|leonardo\.ai|tensor\.art|playground\.com|lexica\.art)/i,
        // AI Chat
        /^(www\.)?(claude\.ai|perplexity\.ai|deepseek\.com|chat\.deepseek\.com|phind\.com|you\.com|gemini\.google\.com|copilot\.microsoft\.com)/i,
        // AI/ML platforms
        /^(www\.)?(huggingface\.co|replicate\.com|openrouter\.ai|skillsmp\.com)/i,
        // Design
        /^(www\.)?(figma\.com|dribbble\.com|unsplash\.com|iconify\.design)/i,
      ];

      const matchesKnown = knownDomains.some(pattern => pattern.test(normalized));
      if (matchesKnown) {
        normalized = `https://${normalized}`;
      } else {
        // Check custom domains for https:// addition
        if (settings?.customDomains) {
          const customPatterns = settings.customDomains
            .split('\n')
            .map(d => domainToPattern(d))
            .filter((p): p is RegExp => p !== null);

          // Try matching without protocol for custom domains
          const testUrl = `https://${normalized}`;
          const matchesCustom = customPatterns.some(p => p.test(testUrl));
          if (matchesCustom) {
            normalized = testUrl;
          } else {
            return { allowed: false };
          }
        } else {
          return { allowed: false };
        }
      }
    }
  }

  // YOLO mode: allow all URLs
  if (settings?.allowAllUrls) {
    return { allowed: true, normalizedUrl: normalized };
  }

  // Check against built-in allowed patterns
  for (const pattern of ALLOWED_URL_PATTERNS) {
    if (pattern.test(normalized)) {
      return { allowed: true, normalizedUrl: normalized };
    }
  }

  // Check against custom domains
  if (settings?.customDomains) {
    const customPatterns = settings.customDomains
      .split('\n')
      .map(d => domainToPattern(d))
      .filter((p): p is RegExp => p !== null);

    for (const pattern of customPatterns) {
      if (pattern.test(normalized)) {
        return { allowed: true, normalizedUrl: normalized };
      }
    }
  }

  return { allowed: false };
}

// Input schema for tabz_open_url
const OpenUrlSchema = z.object({
  url: z.string()
    .min(1)
    .describe("URL to open. Must be from allowed domains: github.com, gitlab.com, localhost, or 127.0.0.1"),
  newTab: z.boolean()
    .default(true)
    .describe("Open in new tab (default: true) or current tab"),
  background: z.boolean()
    .default(false)
    .describe("Open in background tab (default: false, opens in foreground)"),
  reuseExisting: z.boolean()
    .default(true)
    .describe("If a tab with this URL already exists, switch to it instead of opening a new one (default: true)")
}).strict();

type OpenUrlInput = z.infer<typeof OpenUrlSchema>;

/**
 * Register omnibox/navigation tools with the MCP server
 */
export function registerOmniboxTools(server: McpServer): void {
  // Open URL tool
  server.tool(
    "tabz_open_url",
    `Open a URL in the browser (supports allowed domains only).

Opens URLs from whitelisted domains in a new or current browser tab.
Useful for opening GitHub repositories, GitLab projects, Vercel deployments, AI tools, or localhost development servers.

**SMART TAB REUSE:** By default, if the URL is already open in a tab, this tool
switches to that existing tab instead of opening a duplicate. This prevents
tab accumulation over time. Use reuseExisting=false to force a new tab.

**Allowed Domains:**
- Code hosting: github.com, gitlab.com, bitbucket.org
- Local: localhost, 127.0.0.1
- Deployments: *.vercel.app, *.netlify.app, *.railway.app, *.onrender.com, *.pages.dev, *.fly.dev
- Dev docs: developer.mozilla.org, devdocs.io, docs.github.com, stackoverflow.com, *.stackexchange.com
- Packages: npmjs.com, pypi.org, crates.io, pkg.go.dev
- Playgrounds: codepen.io, jsfiddle.net
- AI Image: bing.com/images/create, chatgpt.com, ideogram.ai, leonardo.ai, tensor.art, playground.com, lexica.art
- AI Chat: claude.ai, perplexity.ai, deepseek.com, phind.com, you.com, gemini.google.com, copilot.microsoft.com
- AI/ML: huggingface.co, replicate.com, openrouter.ai, skillsmp.com
- Design: figma.com, dribbble.com, unsplash.com, iconify.design

Args:
  - url (required): URL to open (can omit https:// for allowed domains)
  - newTab: Open in new tab (default: true) or replace current tab
  - background: Open in background (default: false, opens in foreground)
  - reuseExisting: If URL is already open, switch to it instead of new tab (default: true)

Returns:
  - success: Whether the URL was opened
  - url: The normalized URL that was opened
  - tabId: The tab ID (for use with other tools)
  - error: Error message if failed

Examples:
  - Open GitHub repo: url="github.com/user/repo"
  - Open PR: url="https://github.com/user/repo/pull/123"
  - Open Vercel app: url="my-app-abc123.vercel.app"
  - Open localhost: url="localhost:3000"
  - Current tab: url="github.com/user/repo", newTab=false
  - Background: url="my-app.vercel.app", background=true
  - Force new tab: url="github.com/user/repo", reuseExisting=false

Error Handling:
  - "URL not allowed": Domain not in whitelist
  - "Extension not available": Backend not running or extension not connected

Security:
  Only whitelisted domains can be opened to prevent abuse.
  Cannot open arbitrary websites, file:// URLs, or chrome:// pages.`,
    OpenUrlSchema.shape,
    async (params: OpenUrlInput) => {
      try {
        // Load URL settings from backend
        const urlSettings = await loadUrlSettings();

        // Validate URL
        const validation = isAllowedUrl(params.url, urlSettings);
        if (!validation.allowed || !validation.normalizedUrl) {
          const customDomainsNote = urlSettings.customDomains
            ? `\n- Custom: ${urlSettings.customDomains.split('\n').filter(d => d.trim()).join(', ')}`
            : '';

          return {
            content: [{
              type: "text",
              text: `## URL Not Allowed

**Error:** The URL domain is not whitelisted.

**Provided URL:** ${params.url}

**Allowed domains:**
- Code hosting: github.com, gitlab.com, bitbucket.org
- Local: localhost, 127.0.0.1
- Deployments: *.vercel.app, *.netlify.app, *.railway.app, *.onrender.com, *.pages.dev, *.fly.dev
- Dev docs: developer.mozilla.org, devdocs.io, docs.github.com, stackoverflow.com
- Packages: npmjs.com, pypi.org, crates.io, pkg.go.dev
- Playgrounds: codepen.io, jsfiddle.net
- AI Image: bing.com/images/create, chatgpt.com, ideogram.ai, leonardo.ai, tensor.art, playground.com, lexica.art
- AI Chat: claude.ai, perplexity.ai, deepseek.com, phind.com, you.com, gemini.google.com, copilot.microsoft.com
- AI/ML: huggingface.co, replicate.com, openrouter.ai, skillsmp.com
- Design: figma.com, dribbble.com, unsplash.com, iconify.design${customDomainsNote}

Please provide a URL from one of the allowed domains, or add custom domains in Settings > MCP Tools > Open URL.`
            }],
            isError: true
          };
        }

        const normalizedUrl = validation.normalizedUrl;

        // Open URL via Chrome Extension API (no CDP required)
        const result = await openUrl({
          url: normalizedUrl,
          newTab: params.newTab,
          background: params.background,
          reuseExisting: params.reuseExisting
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Open URL

**Error:** ${result.error || 'Unknown error'}

**Make sure:**
1. TabzChrome backend is running
2. Chrome extension is installed and connected

**Attempted URL:** ${normalizedUrl}`
            }],
            isError: true
          };
        }

        // Handle reused tab case
        if (result.reused) {
          return {
            content: [{
              type: "text",
              text: `## Switched to Existing Tab

**URL already open!** Switched to existing tab instead of opening a new one.

**URL:** ${result.url || normalizedUrl}
**Tab ID:** ${result.tabId} (now Claude's current target)

Use \`tabz_list_tabs\` to see all tabs, or \`reuseExisting=false\` to force a new tab.`
            }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `## URL Opened

**Success!** Opened ${params.newTab ? 'in new tab' : 'in current tab'}${params.background ? ' (background)' : ''}.

**URL:** ${result.url || normalizedUrl}
**Tab ID:** ${result.tabId}${!params.background ? ' (now Claude\'s current target)' : ''}

Use \`tabz_list_tabs\` to see all tabs with the "← CURRENT" marker.`
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
