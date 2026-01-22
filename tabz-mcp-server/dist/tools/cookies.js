/**
 * Cookie Management Tools
 *
 * Tools for managing browser cookies - get, list, set, delete, and audit.
 * Uses Chrome's cookies API via the TabzChrome extension.
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";
// =====================================
// Input Schemas
// =====================================
const GetCookieSchema = z.object({
    url: z.string()
        .url()
        .describe("URL to get cookie for (determines domain/path matching)"),
    name: z.string()
        .describe("Name of the cookie to retrieve")
}).strict();
const ListCookiesSchema = z.object({
    domain: z.string()
        .optional()
        .describe("Filter by domain (e.g., 'github.com')"),
    url: z.string()
        .url()
        .optional()
        .describe("Filter by URL (includes path matching)"),
    name: z.string()
        .optional()
        .describe("Filter by cookie name"),
    secure: z.boolean()
        .optional()
        .describe("Filter by secure flag"),
    session: z.boolean()
        .optional()
        .describe("Filter session cookies (no expiration)"),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' or 'json'")
}).strict();
const SetCookieSchema = z.object({
    url: z.string()
        .url()
        .describe("URL to associate cookie with"),
    name: z.string()
        .describe("Cookie name"),
    value: z.string()
        .describe("Cookie value"),
    domain: z.string()
        .optional()
        .describe("Cookie domain (defaults to URL host)"),
    path: z.string()
        .optional()
        .describe("Cookie path (defaults to '/')"),
    secure: z.boolean()
        .optional()
        .describe("Secure flag (HTTPS only)"),
    httpOnly: z.boolean()
        .optional()
        .describe("HttpOnly flag (not accessible to JS)"),
    sameSite: z.enum(['no_restriction', 'lax', 'strict'])
        .optional()
        .describe("SameSite attribute"),
    expirationDate: z.number()
        .optional()
        .describe("Expiration as seconds since epoch (omit for session cookie)")
}).strict();
const DeleteCookieSchema = z.object({
    url: z.string()
        .url()
        .describe("URL the cookie is associated with"),
    name: z.string()
        .describe("Name of the cookie to delete")
}).strict();
const AuditCookiesSchema = z.object({
    tabId: z.number()
        .int()
        .optional()
        .describe("Tab ID to audit (defaults to active tab)"),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
        .describe("Output format: 'markdown' or 'json'")
}).strict();
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
// =====================================
// Helper Functions
// =====================================
/**
 * Truncate cookie value for display (security - don't show full auth tokens)
 */
function truncateValue(value, maxLen = 20) {
    if (value.length <= maxLen)
        return value;
    const start = value.slice(0, 8);
    const end = value.slice(-8);
    return `${start}...${end}`;
}
/**
 * Check if a domain is a known tracker
 */
function isKnownTracker(domain) {
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
function formatExpiration(expirationDate) {
    if (!expirationDate)
        return 'Session';
    const date = new Date(expirationDate * 1000);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    if (diff < 0)
        return 'Expired';
    if (diff < 3600000)
        return `${Math.round(diff / 60000)} minutes`;
    if (diff < 86400000)
        return `${Math.round(diff / 3600000)} hours`;
    if (diff < 2592000000)
        return `${Math.round(diff / 86400000)} days`;
    return date.toLocaleDateString();
}
// =====================================
// API Functions
// =====================================
/**
 * Get a specific cookie
 */
async function getCookie(url, name) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/get`, { url, name }, { timeout: 5000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * List cookies with optional filters
 */
async function listCookies(filters) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/list`, filters, { timeout: 5000 });
        return response.data;
    }
    catch (error) {
        return { success: false, cookies: [], error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Set a cookie
 */
async function setCookie(params) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/set`, params, { timeout: 5000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Delete a cookie
 */
async function deleteCookie(url, name) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/delete`, { url, name }, { timeout: 5000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Audit cookies for a page
 */
async function auditCookies(tabId) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/cookies/audit`, { tabId }, { timeout: 10000 });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
// =====================================
// Tool Registration
// =====================================
/**
 * Register cookie management tools with the MCP server
 */
export function registerCookieTools(server) {
    // Get specific cookie
    server.tool("tabz_cookies_get", `Get a specific browser cookie by name and URL.

Uses Chrome's cookies.get() API to retrieve a single cookie that matches
the given URL and name.

Args:
  - url (required): URL to get cookie for (determines domain/path matching)
  - name (required): Name of the cookie to retrieve

Returns:
  - Cookie object with name, value, domain, path, flags, expiration
  - null if cookie not found

Examples:
  - Get session cookie: url="https://github.com", name="user_session"
  - Get auth token: url="https://api.example.com", name="auth_token"

Security note: Cookie values are shown in full. Be careful with auth tokens.

Error Handling:
  - "Cannot connect": Ensure TabzChrome backend is running at localhost:8129
  - null result: Cookie doesn't exist or URL doesn't match cookie's domain`, GetCookieSchema.shape, async (params) => {
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
            const text = `## Cookie: ${c.name}

**Value:** \`${truncateValue(c.value, 50)}\`
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
    // List cookies
    server.tool("tabz_cookies_list", `List browser cookies with optional filtering.

Uses Chrome's cookies.getAll() API to retrieve cookies matching the given criteria.
At least one filter (domain or url) should be provided for targeted results.

Args:
  - domain (optional): Filter by domain (e.g., 'github.com')
  - url (optional): Filter by URL (includes path matching)
  - name (optional): Filter by cookie name
  - secure (optional): Filter by secure flag
  - session (optional): Filter session cookies only
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "cookies": [
      { "name": "...", "value": "...", "domain": "...", ... }
    ],
    "total": 5
  }

Examples:
  - List GitHub cookies: domain="github.com"
  - List secure cookies: domain="example.com", secure=true
  - List session cookies: domain="example.com", session=true

Security note: Cookie values are truncated in markdown output.

Error Handling:
  - "Cannot connect": Ensure TabzChrome backend is running
  - Empty list: No cookies match the filter criteria`, ListCookiesSchema.shape, async (params) => {
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
                                cookies: cookies,
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
            const byDomain = new Map();
            for (const cookie of cookies) {
                const domain = cookie.domain;
                if (!byDomain.has(domain)) {
                    byDomain.set(domain, []);
                }
                byDomain.get(domain).push(cookie);
            }
            const lines = [`# Cookies (${cookies.length} total)`, ''];
            for (const [domain, domainCookies] of byDomain) {
                lines.push(`## ${domain} (${domainCookies.length})`);
                lines.push('');
                for (const c of domainCookies) {
                    const flags = [];
                    if (c.secure)
                        flags.push('🔒 Secure');
                    if (c.httpOnly)
                        flags.push('🚫 HttpOnly');
                    if (c.session)
                        flags.push('⏱️ Session');
                    lines.push(`- **${c.name}**: \`${truncateValue(c.value)}\``);
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
    // Set cookie
    server.tool("tabz_cookies_set", `Create or update a browser cookie.

Uses Chrome's cookies.set() API to create a new cookie or update an existing one.
The URL determines the default domain if not explicitly provided.

SECURITY WARNING: Modifying cookies can break authentication or cause unexpected
behavior. Use with caution, especially for auth-related cookies.

Args:
  - url (required): URL to associate cookie with
  - name (required): Cookie name
  - value (required): Cookie value
  - domain (optional): Cookie domain (defaults to URL host)
  - path (optional): Cookie path (defaults to '/')
  - secure (optional): Secure flag (HTTPS only)
  - httpOnly (optional): HttpOnly flag (not accessible to JS)
  - sameSite (optional): 'no_restriction', 'lax', or 'strict'
  - expirationDate (optional): Seconds since epoch (omit for session cookie)

Returns:
  - The created/updated cookie object
  - Error if the operation fails

Examples:
  - Set session cookie: url="https://example.com", name="test", value="123"
  - Set persistent cookie: url="https://example.com", name="pref", value="dark",
                          expirationDate=1735689600
  - Set secure cookie: url="https://example.com", name="token", value="abc",
                       secure=true, httpOnly=true, sameSite="strict"

Error Handling:
  - "Cannot connect": Ensure TabzChrome backend is running
  - Failed set: Domain mismatch, invalid URL, or permission denied`, SetCookieSchema.shape, async (params) => {
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
**Value:** \`${truncateValue(c.value, 30)}\`
**Secure:** ${c.secure ? 'Yes' : 'No'}
**HttpOnly:** ${c.httpOnly ? 'Yes' : 'No'}
**SameSite:** ${c.sameSite}
**Expires:** ${formatExpiration(c.expirationDate)}`
                    }]
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
    // Delete cookie
    server.tool("tabz_cookies_delete", `Delete a specific browser cookie.

Uses Chrome's cookies.remove() API to delete a cookie matching the given
URL and name.

SECURITY WARNING: Deleting auth cookies will log the user out of websites.
Use with caution.

Args:
  - url (required): URL the cookie is associated with
  - name (required): Name of the cookie to delete

Returns:
  - Confirmation of deletion with URL and name
  - Error if cookie not found or deletion fails

Examples:
  - Delete tracking cookie: url="https://example.com", name="_ga"
  - Clear session: url="https://github.com", name="user_session"

Error Handling:
  - "Cannot connect": Ensure TabzChrome backend is running
  - null result: Cookie doesn't exist or URL mismatch`, DeleteCookieSchema.shape, async (params) => {
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
    // Audit cookies
    server.tool("tabz_cookies_audit", `Audit cookies for the current page, categorizing them by type.

Analyzes all cookies associated with the current page and categorizes them:
- First-party vs third-party
- Session vs persistent
- Known trackers flagged

This is useful for:
- Debugging authentication issues
- Identifying tracking cookies
- Understanding cookie usage on a page
- Privacy audits

Args:
  - tabId (optional): Tab ID to audit (defaults to active tab)
  - response_format: 'markdown' (default) or 'json'

Returns:
  - Page URL and domain
  - List of all cookies categorized
  - First-party cookies (same domain as page)
  - Third-party cookies (different domain)
  - Known trackers highlighted
  - Session vs persistent breakdown

Examples:
  - Audit current page: (no args needed)
  - Audit specific tab: tabId=123456

Error Handling:
  - "Cannot connect": Ensure TabzChrome backend is running
  - "No active tab": No tab found or tab has no URL`, AuditCookiesSchema.shape, async (params) => {
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
                                cookies: cookies
                            }, null, 2)
                        }]
                };
            }
            const lines = [
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
                    const flags = [];
                    if (c.secure)
                        flags.push('🔒');
                    if (c.httpOnly)
                        flags.push('🚫JS');
                    if (c.session)
                        flags.push('⏱️');
                    lines.push(`- **${c.name}** ${flags.join(' ')}`);
                    lines.push(`  Value: \`${truncateValue(c.value)}\``);
                }
                lines.push('');
            }
            if (thirdParty.length > 0) {
                lines.push(`## Third-Party Cookies (${thirdParty.length})`);
                lines.push('');
                // Group by domain
                const byDomain = new Map();
                for (const c of thirdParty) {
                    if (!byDomain.has(c.domain)) {
                        byDomain.set(c.domain, []);
                    }
                    byDomain.get(c.domain).push(c);
                }
                for (const [domain, domainCookies] of byDomain) {
                    const isTracker = isKnownTracker(domain);
                    const trackerLabel = isTracker ? ' ⚠️ TRACKER' : '';
                    lines.push(`### ${domain}${trackerLabel}`);
                    for (const c of domainCookies) {
                        lines.push(`- **${c.name}**: \`${truncateValue(c.value)}\``);
                    }
                    lines.push('');
                }
            }
            return {
                content: [{ type: "text", text: lines.join('\n') }]
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
//# sourceMappingURL=cookies.js.map