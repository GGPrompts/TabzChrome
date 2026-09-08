/**
 * Cookie Management Tools
 *
 * Tools for managing browser cookies - get, list, set, delete, and audit.
 * Uses Chrome's cookies API via the TabzChrome extension.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";
import { docsPointer } from "../descriptions.js";

// =====================================
// Input Schemas
// =====================================

const GetCookieSchema = z.object({
  url: z.string()
    .url()
    .describe("URL the cookie belongs to."),
  name: z.string(),
  revealValue: z.boolean()
    .default(false)
    .describe("Show the real value; auth-shaped names stay redacted.")
}).strict();

type GetCookieInput = z.infer<typeof GetCookieSchema>;

const ListCookiesSchema = z.object({
  domain: z.string()
    .optional(),
  url: z.string()
    .url()
    .optional()
    .describe("URL to filter by, path included."),
  name: z.string()
    .optional(),
  secure: z.boolean()
    .optional()
    .describe("Keep only secure, or only insecure."),
  session: z.boolean()
    .optional()
    .describe("Keep only session cookies."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type ListCookiesInput = z.infer<typeof ListCookiesSchema>;

const SetCookieSchema = z.object({
  url: z.string()
    .url(),
  name: z.string(),
  value: z.string()
    .describe("Cookie value; never echoed back."),
  domain: z.string()
    .optional()
    .describe("Domain; the URL host by default."),
  path: z.string()
    .optional()
    .describe("Path; '/' by default."),
  secure: z.boolean()
    .optional()
    .describe("HTTPS only."),
  httpOnly: z.boolean()
    .optional()
    .describe("Hide it from page JavaScript."),
  sameSite: z.enum(['no_restriction', 'lax', 'strict'])
    .optional(),
  expirationDate: z.number()
    .optional()
    .describe("Seconds since epoch; omit for a session cookie.")
}).strict();

type SetCookieInput = z.infer<typeof SetCookieSchema>;

const DeleteCookieSchema = z.object({
  url: z.string()
    .url(),
  name: z.string()
}).strict();

type DeleteCookieInput = z.infer<typeof DeleteCookieSchema>;

const AuditCookiesSchema = z.object({
  tabId: z.number()
    .int()
    .optional(),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
}).strict();

type AuditCookiesInput = z.infer<typeof AuditCookiesSchema>;

// =====================================
// Types
// =====================================

interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'no_restriction' | 'lax' | 'strict' | 'unspecified';
  expirationDate?: number;
  hostOnly: boolean;
  session: boolean;
  storeId: string;
}

interface CookieResult {
  success: boolean;
  cookie?: Cookie | null;
  error?: string;
}

interface CookiesListResult {
  success: boolean;
  cookies: Cookie[];
  error?: string;
}

interface CookieDeleteResult {
  success: boolean;
  removed?: { url: string; name: string };
  error?: string;
}

interface CookieAuditResult {
  success: boolean;
  url?: string;
  domain?: string;
  cookies?: Cookie[];
  firstParty?: Cookie[];
  thirdParty?: Cookie[];
  sessionCookies?: Cookie[];
  persistentCookies?: Cookie[];
  error?: string;
}

// Known tracking domains (partial list for demonstration)
const KNOWN_TRACKERS = new Set([
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'facebook.com',
  'fbcdn.net',
  'analytics.google.com',
  'googletagmanager.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'amplitude.com',
  'newrelic.com',
  'nr-data.net',
  'adsrvr.org',
  'criteo.com',
  'rubiconproject.com',
  'pubmatic.com',
  'amazon-adsystem.com',
  'taboola.com',
  'outbrain.com',
  'quantserve.com',
  'scorecardresearch.com'
]);

const REDACTED_VALUE = "[redacted]";
const AUTH_COOKIE_NAME_PATTERNS = [
  /^gcp_iap/i,
  /^__secure-/i,
  /^__host-/i,
  /session/i,
  /token/i,
  /^sb-.*-auth-token$/i
];

export function isAuthPatternCookieName(name: string): boolean {
  return AUTH_COOKIE_NAME_PATTERNS.some(pattern => pattern.test(name));
}

function redactCookieValues(cookies: Cookie[]): Omit<Cookie, "value">[] {
  return cookies.map(({ value: _value, ...rest }) => rest);
}

// =====================================
// Helper Functions
// =====================================

/**
 * Truncate cookie value for display (security - don't show full auth tokens)
 */
function truncateValue(value: string, maxLen: number = 20): string {
  if (value.length <= maxLen) return value;
  const start = value.slice(0, 8);
  const end = value.slice(-8);
  return `${start}...${end}`;
}

/**
 * Check if a domain is a known tracker
 */
function isKnownTracker(domain: string): boolean {
  const cleanDomain = domain.startsWith('.') ? domain.slice(1) : domain;
  for (const tracker of KNOWN_TRACKERS) {
    if (cleanDomain === tracker || cleanDomain.endsWith('.' + tracker)) {
      return true;
    }
  }
  return false;
}

/**
 * Format expiration date for display
 */
function formatExpiration(expirationDate?: number): string {
  if (!expirationDate) return 'Session';
  const date = new Date(expirationDate * 1000);
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff < 0) return 'Expired';
  if (diff < 3600000) return `${Math.round(diff / 60000)} minutes`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)} hours`;
  if (diff < 2592000000) return `${Math.round(diff / 86400000)} days`;
  return date.toLocaleDateString();
}

// =====================================
// API Functions
// =====================================

/**
 * Get a specific cookie
 */
async function getCookie(url: string, name: string): Promise<CookieResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/get`,
      { url, name },
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * List cookies with optional filters
 */
async function listCookies(filters: {
  domain?: string;
  url?: string;
  name?: string;
  secure?: boolean;
  session?: boolean;
}): Promise<CookiesListResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/list`,
      filters,
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, cookies: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Set a cookie
 */
async function setCookie(params: SetCookieInput): Promise<CookieResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/set`,
      params,
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a cookie
 */
async function deleteCookie(url: string, name: string): Promise<CookieDeleteResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/delete`,
      { url, name },
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Audit cookies for a page
 */
async function auditCookies(tabId?: number): Promise<CookieAuditResult> {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/audit`,
      { tabId },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// =====================================
// Tool Registration
// =====================================

/**
 * Register cookie management tools with the MCP server
 */
export function registerCookieTools(server: McpServer): void {
  // Get specific cookie
  registerTabzTool(server,
    "tabz_cookies_get",
    "Get one cookie by name and URL. Rule: the value is redacted unless you pass revealValue, and an auth-shaped name stays redacted. " +
    docsPointer("tabz_cookies_get"),
    GetCookieSchema,
    async (params: GetCookieInput) => {
      try {
        const result = await getCookie(params.url, params.name);

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        if (!result.cookie) {
          return {
            content: [{ type: "text", text: `Cookie "${params.name}" not found for URL: ${params.url}` }]
          };
        }

        const c = result.cookie;
        const displayValue = !params.revealValue || isAuthPatternCookieName(c.name)
          ? REDACTED_VALUE
          : c.value;
        const text = `## Cookie: ${c.name}

**Value:** \`${displayValue}\`
**Domain:** ${c.domain}
**Path:** ${c.path}
**Secure:** ${c.secure ? 'Yes' : 'No'}
**HttpOnly:** ${c.httpOnly ? 'Yes' : 'No'}
**SameSite:** ${c.sameSite}
**Expires:** ${formatExpiration(c.expirationDate)}
**Session:** ${c.session ? 'Yes' : 'No'}`;

        return {
          content: [{ type: "text", text }]
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

  // List cookies
  registerTabzTool(server,
    "tabz_cookies_list",
    "List cookies and their flags; pass domain or url to narrow it. Values come from tabz_cookies_get.",
    ListCookiesSchema,
    async (params: ListCookiesInput) => {
      try {
        const result = await listCookies({
          domain: params.domain,
          url: params.url,
          name: params.name,
          secure: params.secure,
          session: params.session
        });

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        const cookies = result.cookies || [];

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                cookies: redactCookieValues(cookies),
                total: cookies.length
              }, null, 2)
            }]
          };
        }

        if (cookies.length === 0) {
          return {
            content: [{ type: "text", text: "No cookies found matching the criteria." }]
          };
        }

        // Group by domain for markdown output
        const byDomain = new Map<string, Cookie[]>();
        for (const cookie of cookies) {
          const domain = cookie.domain;
          if (!byDomain.has(domain)) {
            byDomain.set(domain, []);
          }
          byDomain.get(domain)!.push(cookie);
        }

        const lines: string[] = [`# Cookies (${cookies.length} total)`, ''];

        for (const [domain, domainCookies] of byDomain) {
          lines.push(`## ${domain} (${domainCookies.length})`);
          lines.push('');
          for (const c of domainCookies) {
            const flags: string[] = [];
            if (c.secure) flags.push('🔒 Secure');
            if (c.httpOnly) flags.push('🚫 HttpOnly');
            if (c.session) flags.push('⏱️ Session');

            lines.push(`- **${c.name}**`);
            if (flags.length > 0) {
              lines.push(`  ${flags.join(' | ')}`);
            }
            if (!c.session && c.expirationDate) {
              lines.push(`  Expires: ${formatExpiration(c.expirationDate)}`);
            }
          }
          lines.push('');
        }

        return {
          content: [{ type: "text", text: lines.join('\n') }]
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

  // Set cookie
  registerTabzTool(server,
    "tabz_cookies_set",
    "Create or update a cookie. Rule: changing one can break the user's session; the value is never echoed back. " +
    docsPointer("tabz_cookies_set"),
    SetCookieSchema,
    async (params: SetCookieInput) => {
      try {
        const result = await setCookie(params);

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error setting cookie: ${result.error}` }],
            isError: true
          };
        }

        if (!result.cookie) {
          return {
            content: [{ type: "text", text: "Cookie set operation returned no cookie (may have failed silently)." }],
            isError: true
          };
        }

        const c = result.cookie;
        return {
          content: [{
            type: "text",
            text: `## Cookie Set Successfully

**Name:** ${c.name}
**Domain:** ${c.domain}
**Path:** ${c.path}
**Value length:** ${c.value.length} chars
**Secure:** ${c.secure ? 'Yes' : 'No'}
**HttpOnly:** ${c.httpOnly ? 'Yes' : 'No'}
**SameSite:** ${c.sameSite}
**Expires:** ${formatExpiration(c.expirationDate)}`
          }]
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

  // Delete cookie
  registerTabzTool(server,
    "tabz_cookies_delete",
    "Delete one cookie. Deleting an auth cookie signs the user out.",
    DeleteCookieSchema,
    async (params: DeleteCookieInput) => {
      try {
        const result = await deleteCookie(params.url, params.name);

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error deleting cookie: ${result.error}` }],
            isError: true
          };
        }

        if (!result.removed) {
          return {
            content: [{ type: "text", text: `Cookie "${params.name}" not found for URL: ${params.url}` }]
          };
        }

        return {
          content: [{
            type: "text",
            text: `## Cookie Deleted

**Name:** ${result.removed.name}
**URL:** ${result.removed.url}

The cookie has been successfully removed.`
          }]
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

  // Audit cookies
  registerTabzTool(server,
    "tabz_cookies_audit",
    "Audit one page's cookies: first or third party, session or persistent, trackers flagged. Values are never shown.",
    AuditCookiesSchema,
    async (params: AuditCookiesInput) => {
      try {
        const result = await auditCookies(params.tabId);

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        const cookies = result.cookies || [];
        const firstParty = result.firstParty || [];
        const thirdParty = result.thirdParty || [];
        const sessionCookies = result.sessionCookies || [];
        const persistentCookies = result.persistentCookies || [];

        if (params.response_format === ResponseFormat.JSON) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                url: result.url,
                domain: result.domain,
                total: cookies.length,
                firstParty: firstParty.length,
                thirdParty: thirdParty.length,
                session: sessionCookies.length,
                persistent: persistentCookies.length,
                cookies: redactCookieValues(cookies)
              }, null, 2)
            }]
          };
        }

        const lines: string[] = [
          `# Cookie Audit`,
          '',
          `**Page:** ${result.url}`,
          `**Domain:** ${result.domain}`,
          '',
          `## Summary`,
          '',
          `| Category | Count |`,
          `|----------|-------|`,
          `| Total Cookies | ${cookies.length} |`,
          `| First-Party | ${firstParty.length} |`,
          `| Third-Party | ${thirdParty.length} |`,
          `| Session | ${sessionCookies.length} |`,
          `| Persistent | ${persistentCookies.length} |`,
          ''
        ];

        // Check for known trackers
        const trackers = thirdParty.filter(c => isKnownTracker(c.domain));
        if (trackers.length > 0) {
          lines.push(`## ⚠️ Known Trackers (${trackers.length})`);
          lines.push('');
          for (const c of trackers) {
            lines.push(`- **${c.name}** (${c.domain})`);
          }
          lines.push('');
        }

        if (firstParty.length > 0) {
          lines.push(`## First-Party Cookies (${firstParty.length})`);
          lines.push('');
          for (const c of firstParty) {
            const flags: string[] = [];
            if (c.secure) flags.push('🔒');
            if (c.httpOnly) flags.push('🚫JS');
            if (c.session) flags.push('⏱️');
            lines.push(`- **${c.name}** ${flags.join(' ')}`);
          }
          lines.push('');
        }

        if (thirdParty.length > 0) {
          lines.push(`## Third-Party Cookies (${thirdParty.length})`);
          lines.push('');

          // Group by domain
          const byDomain = new Map<string, Cookie[]>();
          for (const c of thirdParty) {
            if (!byDomain.has(c.domain)) {
              byDomain.set(c.domain, []);
            }
            byDomain.get(c.domain)!.push(c);
          }

          for (const [domain, domainCookies] of byDomain) {
            const isTracker = isKnownTracker(domain);
            const trackerLabel = isTracker ? ' ⚠️ TRACKER' : '';
            lines.push(`### ${domain}${trackerLabel}`);
            for (const c of domainCookies) {
              lines.push(`- **${c.name}**`);
            }
            lines.push('');
          }
        }

        return {
          content: [{ type: "text", text: lines.join('\n') }]
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
