/**
 * Credential store tools
 *
 * The backend keeps a local, ssh-style credential store (~/.tabzchrome:
 * a Host-matched config plus 0600 key files) and plays the ssh-agent role: it
 * uses a secret when asked and never discloses it. These two tools are the
 * whole agent-facing surface:
 *
 *   tabz_secret_request  ask the user to save a login for a host (the
 *                        dashboard Logins page by default, a terminal prompt
 *                        when no Chrome is connected, the raw editor on
 *                        request), then wait a short while
 *   tabz_secret_status   read-only: is that entry filled in yet? spawns nothing
 *   tabz_fill_secret     type a saved field (username, password, or any named
 *                        Field / SecretFile) into the page
 *
 * No result ever carries a saved value: status, host, hasUsername, and field
 * NAMES only.
 * The user's typing happens on the Logins page or in a TabzChrome terminal pane
 * the model is not reading.
 *
 * WAIT WINDOW. One call uses a bounded budget (45 s by default, 50 s at most)
 * and returns pending when the user still has the editor open. The caller can
 * poll with tabz_secret_status or call again; the surface stays open.
 */
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, CREDENTIAL_GUIDANCE, PROTECTED_LOGIN_DOCUMENT_GUIDANCE, SECRET_STORE_GUIDANCE, NEVER_ASK_FOR_CREDENTIALS, USE_SAVED_LOGIN, NEVER_READ_STORE } from "../shared.js";
import { docsPointer } from "../descriptions.js";
/** The clauses of the credential rule that bind every credential-store tool. */
const STORE_TOOL_RULES = `${NEVER_ASK_FOR_CREDENTIALS} ${USE_SAVED_LOGIN} ${NEVER_READ_STORE}`;
/** Default overall budget for one tool call. */
export const DEFAULT_SECRET_TIMEOUT_MS = 45000;
/** Hard cap on one call. Keep waiting by calling again. */
export const MAX_SECRET_TIMEOUT_MS = 50000;
export const DEFAULT_SECRET_POLL_INTERVAL_MS = 1500;
/** Consecutive failed status probes (backend gone) before giving up. */
const MAX_CONSECUTIVE_PROBE_ERRORS = 3;
const CLEANUP_RESERVE_MS = 500;
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$/i;
const SecretRequestSchema = z.object({
    host: z.string()
        .min(1)
        .max(253)
        .regex(HOSTNAME_PATTERN, "host must be a hostname such as app.example.com (no scheme, no path)")
        .describe("Hostname the login belongs to, e.g. 'app.example.com'."),
    reason: z.string()
        .max(200)
        .optional()
        .describe("One sentence shown to the user; never credentials."),
    surface: z.enum(["page", "terminal", "editor"])
        .optional()
        .describe("Where the user types (default page)."),
    timeoutMs: z.number()
        .int()
        .min(5000)
        .max(MAX_SECRET_TIMEOUT_MS)
        .default(DEFAULT_SECRET_TIMEOUT_MS)
        .describe("This call's wait; default 45000, max 50000.")
}).strict();
const SecretStatusSchema = z.object({
    host: z.string()
        .min(1)
        .max(253)
        .regex(HOSTNAME_PATTERN, "host must be a hostname such as app.example.com (no scheme, no path)")
        .describe("Hostname to check.")
}).strict();
const FillSecretSchema = z.object({
    selector: z.string()
        .min(1)
        .describe("CSS selector of the input or select to fill."),
    field: z.string()
        .min(1)
        .max(64)
        .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, "field must be username, password, or a saved field name")
        .describe("'username', 'password', or a saved field name."),
    tabId: z.number()
        .int()
        .optional()
        .describe("Chrome tab ID; its hostname picks the entry."),
    host: z.string()
        .min(1)
        .max(253)
        .regex(HOSTNAME_PATTERN, "host must be a hostname")
        .optional()
        .describe("Disambiguates when several entries match the tab."),
    trusted: z.boolean().default(false)
        .describe("Use trusted CDP typing only when the normal synthetic fill cannot work. This protects the whole tab until it closes, including every fresh navigation.")
}).strict();
/**
 * Extract the fields a result may carry. Anything else the backend might add
 * is dropped here, so a careless backend change cannot leak through the tool.
 */
function summarize(data) {
    return {
        host: typeof data.host === "string" ? data.host : "",
        hasUsername: data.hasUsername === true
    };
}
/** The Host patterns the entry matched through (names only, never content). */
function patternsOf(data) {
    return Array.isArray(data.patterns) ? data.patterns.filter((p) => typeof p === "string") : [];
}
/** Names only, never values. */
function namesOf(value) {
    return Array.isArray(value) ? value.filter((p) => typeof p === "string") : [];
}
/**
 * The field names the agent may pass to tabz_fill_secret for this entry:
 * the two built-ins plus every declared Field and SecretFile.
 */
function fillableFields(data) {
    const fields = namesOf(data.fields);
    const secretFiles = namesOf(data.secretFiles);
    return { fields, secretFiles, fillable: ["username", "password", ...fields, ...secretFiles] };
}
function fillGuidance(fillable) {
    const extras = fillable.filter(name => name !== "username" && name !== "password");
    return `Fill it with tabz_fill_secret: field="username" into the username input, field="password" into the password input` +
        (extras.length > 0 ? `, and the saved extra fields ${extras.map(name => `field="${name}"`).join(", ")} into their inputs or <select>s (a named Field picks the matching option; a SecretFile only goes into a password input)` : "") +
        ". Then submit only through a prepublished element reference already supplied by a tool response; when none is available, ask the user to submit or navigate. Arbitrary selector clicks are refused.";
}
/** Backend URL used by the loopback-only surfaces; the Logins page URL is the extension's own. */
function surfaceOf(data) {
    return data.surface === "page" || data.surface === "terminal" || data.surface === "editor" ? data.surface : undefined;
}
/** The chmod the backend asks the user to run when the key file mode is wrong (a command, never content). */
function fixOf(data) {
    return typeof data.fix === "string" && /^chmod 600 /.test(data.fix) ? data.fix : "";
}
/** Lowercase and drop any :port; the backend matches on URL.hostname. */
function normalizeHost(host) {
    return host.trim().toLowerCase().replace(/:\d{1,5}$/, "");
}
function errorMessage(error) {
    if (axios.isAxiosError?.(error) && error.response?.data) {
        const data = error.response.data;
        if (typeof data.error === "string")
            return data.error;
    }
    return error instanceof Error ? error.message : String(error);
}
function requestTimeout(workDeadline, cap) {
    const remaining = workDeadline - Date.now();
    return remaining > 0 ? Math.max(1, Math.min(cap, remaining)) : undefined;
}
async function requestSecret(host, reason, surface, workDeadline) {
    const timeout = requestTimeout(workDeadline, 30000);
    if (!timeout)
        return { success: false, error: "The secret request budget expired before the editor could open" };
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/secret-request`, { host, reason, ...(surface ? { surface } : {}) }, { timeout });
        return response.data;
    }
    catch (error) {
        return { success: false, error: errorMessage(error) };
    }
}
async function probeSecretStatus(host, workDeadline = Number.POSITIVE_INFINITY) {
    const timeout = requestTimeout(workDeadline, 10000);
    if (!timeout)
        return { success: false, error: "The secret request wait window ended" };
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/secret-status`, { host }, { timeout });
        return response.data;
    }
    catch (error) {
        return { success: false, error: errorMessage(error) };
    }
}
/** What the user should do, per surface; the Logins page URL is included so the notification points at it. */
function surfaceInstruction(surface, loginsUrl) {
    if (surface === "terminal")
        return "Answer the prompts in the TabzChrome terminal that just opened (username, password, any extra fields). The agent is waiting.";
    if (surface === "editor")
        return "Type the secret into the TabzChrome terminal that just opened, save, and close the editor. The agent is waiting.";
    return `Save it on the TabzChrome dashboard Logins page that just opened${loginsUrl ? ` (${loginsUrl})` : " (Dashboard > Logins)"}: username, password, and any extra fields the form needs. The agent is waiting.`;
}
async function showNotification(host, reason, surface, loginsUrl, workDeadline) {
    const timeout = requestTimeout(workDeadline, 10000);
    if (!timeout)
        return undefined;
    const title = `Save the login for ${host}`.slice(0, 100);
    const detail = reason?.trim();
    const message = ((detail ? `${detail} ` : "") + surfaceInstruction(surface, loginsUrl)).slice(0, 500);
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/notification/show`, { title, message, type: "basic", priority: 2 }, { timeout });
        return response.data.success ? response.data.notificationId : undefined;
    }
    catch {
        return undefined;
    }
}
async function clearNotification(notificationId, absoluteDeadline = Number.POSITIVE_INFINITY) {
    if (!notificationId)
        return;
    const timeout = requestTimeout(absoluteDeadline, CLEANUP_RESERVE_MS);
    if (!timeout)
        return;
    try {
        await axios.post(`${BACKEND_URL}/api/browser/notification/clear`, { notificationId }, { timeout });
    }
    catch {
        // Best effort: a stale notification is harmless.
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
function errorResult(text) {
    return { content: [{ type: "text", text }], isError: true };
}
async function preflightProtectedFill(tabId) {
    try {
        const response = await axios.get(`${BACKEND_URL}/api/browser/page-info`, {
            params: { tabId },
            timeout: 10000
        });
        const data = response.data;
        if (data?.protectedFillVersion !== 1 || !Number.isInteger(data.tabId) || (data.tabId ?? 0) <= 0) {
            return {
                success: false,
                error: "Saved-login document protection is unavailable. Rebuild/restart the backend and reload the TabzChrome extension before trying again."
            };
        }
        return { success: true, tabId: data.tabId };
    }
    catch {
        return {
            success: false,
            error: "Saved-login document protection could not be confirmed. Ensure the updated backend and TabzChrome extension are running before trying again."
        };
    }
}
/**
 * Register the credential store tools with the MCP server
 */
export function registerSecretTools(server, options = {}) {
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_SECRET_POLL_INTERVAL_MS;
    registerTabzTool(server, "tabz_secret_request", "Ask the user to save a login for a host, then wait briefly. Answers a status and the saved field NAMES, never a value; " +
        "status deferred means an editor is already open, so ask the user to close it and call again. " +
        STORE_TOOL_RULES + " " + docsPointer("tabz_secret_request"), SecretRequestSchema, async (params) => {
        const startedAt = Date.now();
        const absoluteDeadline = startedAt + params.timeoutMs;
        const workDeadline = absoluteDeadline - CLEANUP_RESERVE_MS;
        let notificationId;
        try {
            const host = normalizeHost(params.host);
            const started = await requestSecret(host, params.reason, params.surface, workDeadline);
            if (!started.success) {
                return errorResult(`## Secret Request Failed\n\n**Error:** ${started.error || "unknown error"}\n\nMake sure the TabzChrome backend is running.`);
            }
            if (started.configEditDeferred === true) {
                // The backend wrote nothing (an editor may hold the config open), so
                // there is nothing to wait for: no notification, no polling.
                const deferred = summarize(started);
                const deferredPatterns = patternsOf(started);
                const summary = { status: "deferred", host: deferred.host || host, hasUsername: deferred.hasUsername, patterns: deferredPatterns };
                const reason = typeof started.message === "string" && started.message
                    ? started.message
                    : "A credential editor is open on the config, so the backend deferred this request.";
                return {
                    content: [{
                            type: "text",
                            text: `## Secret Request Deferred

**Status:** deferred
**Host:** ${summary.host}
**Username saved:** ${summary.hasUsername ? "yes" : "no"}
**Patterns:** ${deferredPatterns.length > 0 ? deferredPatterns.join(", ") : "(none yet)"}

${reason} Ask the user to finish typing in the open TabzChrome credential editor, save, and close it; then call tabz_secret_request again. Do not poll, and do not open another editor. ${CREDENTIAL_GUIDANCE}

\`\`\`json
${JSON.stringify(summary)}
\`\`\``
                        }],
                    isError: false
                };
            }
            let latest = summarize(started);
            let patterns = patternsOf(started);
            let names = fillableFields(started);
            let fix = fixOf(started);
            const surface = surfaceOf(started) ?? params.surface ?? "page";
            const loginsUrl = typeof started.loginsUrl === "string" ? started.loginsUrl : "";
            let status = started.status === "ready" ? "ready" : started.status === "bad_mode" ? "bad_mode" : undefined;
            if (status === undefined) {
                notificationId = await showNotification(host, params.reason, surface, loginsUrl, workDeadline);
                let consecutiveErrors = 0;
                while (status === undefined && Date.now() < workDeadline) {
                    await sleep(Math.min(pollIntervalMs, Math.max(0, workDeadline - Date.now())));
                    if (Date.now() >= workDeadline)
                        break;
                    const state = await probeSecretStatus(host, workDeadline);
                    if (!state.success) {
                        consecutiveErrors++;
                        if (consecutiveErrors >= MAX_CONSECUTIVE_PROBE_ERRORS) {
                            return errorResult(`## Secret Request Failed\n\n**Error:** The backend stopped answering: ${state.error || "unknown error"}`);
                        }
                        continue;
                    }
                    consecutiveErrors = 0;
                    latest = summarize(state);
                    if (patternsOf(state).length > 0)
                        patterns = patternsOf(state);
                    names = fillableFields(state);
                    if (state.status === "ready")
                        status = "ready";
                    if (state.status === "bad_mode") {
                        // Waiting cannot fix a file mode; the user has to run the chmod.
                        status = "bad_mode";
                        fix = fixOf(state);
                    }
                }
                status ??= "pending";
            }
            const waitedSeconds = Math.round((Date.now() - startedAt) / 1000);
            const summary = { status, host: latest.host || host, hasUsername: latest.hasUsername, patterns, fields: names.fields, secretFiles: names.secretFiles, surface, ...(loginsUrl ? { loginsUrl } : {}), ...(status === "bad_mode" && fix ? { fix } : {}) };
            const matched = patterns.length > 0 ? ` (matched Host pattern${patterns.length > 1 ? "s" : ""}: ${patterns.join(", ")})` : "";
            const where = surface === "page"
                ? `The TabzChrome dashboard Logins page${loginsUrl ? ` (${loginsUrl})` : ""} is open with the host prefilled`
                : surface === "terminal"
                    ? "The guided prompt is open in a TabzChrome terminal"
                    : "The editor terminal is open";
            const guidance = status === "ready"
                ? `The login for ${summary.host} is saved${summary.hasUsername ? " with a username" : ""}${matched}. Saved fields: ${names.fillable.join(", ")}. ${fillGuidance(names.fillable)}`
                : status === "bad_mode"
                    ? `The key file for ${summary.host}${matched} has the wrong file mode, so the backend refuses to use it (the same rule ssh applies to private keys). Ask the user to run this in a shell, then call tabz_secret_request again: ${fix || "chmod 600 on the key file named by the backend"}. Do not run it yourself and do not read the file. ${SECRET_STORE_GUIDANCE}`
                    : `The login for ${summary.host}${matched} was not saved yet after ${waitedSeconds} seconds. ${where} and the user may still be typing. Poll with tabz_secret_status (host="${summary.host}"), which spawns nothing, or call tabz_secret_request again; the same surface is reused. ${CREDENTIAL_GUIDANCE}`;
            return {
                content: [{
                        type: "text",
                        text: `## Secret Request ${status === "pending" ? "Still Pending" : "Finished"}

**Status:** ${summary.status}
**Host:** ${summary.host}
**Username saved:** ${summary.hasUsername ? "yes" : "no"}
**Patterns:** ${patterns.length > 0 ? patterns.join(", ") : "(none yet)"}
**Fields:** ${names.fillable.join(", ")}
**Surface:** ${surface}${loginsUrl ? ` (${loginsUrl})` : ""}${status === "bad_mode" && fix ? `\n**Fix (user runs it):** \`${fix}\`` : ""}

${guidance}

\`\`\`json
${JSON.stringify(summary)}
\`\`\``
                    }],
                isError: false
            };
        }
        catch (error) {
            return errorResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            await clearNotification(notificationId, absoluteDeadline);
        }
    });
    registerTabzTool(server, "tabz_secret_status", "Check whether a saved login is filled in yet. Read-only, so it is the safe poller for a pending tabz_secret_request. " +
        STORE_TOOL_RULES + " " + docsPointer("tabz_secret_status"), SecretStatusSchema, async (params) => {
        try {
            const host = normalizeHost(params.host);
            const state = await probeSecretStatus(host);
            if (!state.success) {
                return errorResult(`## Secret Status Failed\n\n**Error:** ${state.error || "unknown error"}\n\nMake sure the TabzChrome backend is running.`);
            }
            const latest = summarize(state);
            const patterns = patternsOf(state);
            const names = fillableFields(state);
            const fix = fixOf(state);
            const status = state.status === "ready"
                ? "ready"
                : state.status === "bad_mode" ? "bad_mode" : "pending";
            const nearMiss = status === "pending" ? namesOf(state.nearMiss) : [];
            const summary = { status, host: latest.host || host, hasUsername: latest.hasUsername, patterns, fields: names.fields, secretFiles: names.secretFiles, ...(nearMiss.length > 0 ? { nearMiss } : {}), ...(status === "bad_mode" && fix ? { fix } : {}) };
            const matched = patterns.length > 0 ? ` (matched Host pattern${patterns.length > 1 ? "s" : ""}: ${patterns.join(", ")})` : "";
            const guidance = status === "ready"
                ? `The login for ${summary.host} is saved${summary.hasUsername ? " with a username" : ""}${matched}. Saved fields: ${names.fillable.join(", ")}. ${fillGuidance(names.fillable)}`
                : status === "bad_mode"
                    ? `The key file for ${summary.host}${matched} has the wrong file mode, so the backend refuses to use it (the same rule ssh applies to private keys). Ask the user to run this in a shell, then check again: ${fix || "chmod 600 on the key file named by the backend"}. Do not run it yourself and do not read the file. ${SECRET_STORE_GUIDANCE}`
                    : nearMiss.length > 0
                        ? `No saved login matches ${summary.host}. A block exists for ${nearMiss.join(", ")}; ask the user to re-save it for this host on the Logins page (tabz_secret_request). ${CREDENTIAL_GUIDANCE}`
                        : `The login for ${summary.host}${matched} is not saved yet. If the Logins page or a credential terminal is open the user is still typing; wait a little and call tabz_secret_status again. If nothing was ever opened for this host, call tabz_secret_request. ${CREDENTIAL_GUIDANCE}`;
            return {
                content: [{
                        type: "text",
                        text: `## Secret Status

**Status:** ${summary.status}
**Host:** ${summary.host}
**Username saved:** ${summary.hasUsername ? "yes" : "no"}
**Patterns:** ${patterns.length > 0 ? patterns.join(", ") : "(none yet)"}
**Fields:** ${names.fillable.join(", ")}${nearMiss.length > 0 ? `\n**Near-miss patterns:** ${nearMiss.join(", ")}` : ""}${status === "bad_mode" && fix ? `\n**Fix (user runs it):** \`${fix}\`` : ""}

${guidance}

\`\`\`json
${JSON.stringify(summary)}
\`\`\``
                    }],
                isError: false
            };
        }
        catch (error) {
            return errorResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    registerTabzTool(server, "tabz_fill_secret", "Fill a saved field without disclosing its value. Match by the tab hostname. " +
        STORE_TOOL_RULES + " " + PROTECTED_LOGIN_DOCUMENT_GUIDANCE +
        " Use the default synthetic fill first. trusted=true protects the whole tab until it closes, including fresh navigation. " +
        docsPointer("tabz_fill_secret"), FillSecretSchema, async (params) => {
        try {
            const preflight = await preflightProtectedFill(params.tabId);
            if (!preflight.success)
                return errorResult(`## Fill Secret Refused\n\n**Reason:** ${preflight.error}`);
            const response = await axios.post(`${BACKEND_URL}/api/browser/fill-secret`, {
                selector: params.selector,
                field: params.field,
                tabId: preflight.tabId,
                host: params.host ? normalizeHost(params.host) : undefined,
                trusted: params.trusted === true
            }, { timeout: 30000, validateStatus: () => true });
            const data = response.data ?? { filled: false, error: `HTTP ${response.status}` };
            const verified = data.verified === true;
            const protectedDocument = data.protected === true;
            const summary = { filled: Boolean(data.filled) && verified && protectedDocument, verified, protected: protectedDocument, ...(params.trusted === true ? { trusted: true } : {}), field: params.field, ...(typeof data.kind === "string" ? { kind: data.kind } : {}), ...(data.selected === true ? { selected: true } : {}), ...summarize(data), ...(data.normalized === true ? { normalized: true } : {}) };
            if (!summary.filled) {
                const reason = data.filled && !verified
                    ? "The saved field fill was not verified."
                    : data.filled && !protectedDocument
                        ? "The saved field fill did not confirm document protection."
                        : typeof data.error === "string" && data.error ? data.error : `HTTP ${response.status}`;
                return errorResult(`## Fill Secret Refused

**Field:** ${params.field}
**Verified:** no
**Reason:** ${reason}

This response means no verified protected success was confirmed. Partial typing may have occurred; filled=false is not proof that the page stayed unchanged. Do not automatically retry or replay the saved-field fill.

${reason.includes("No saved login") || reason.includes("empty") || reason.includes("no User")
                    ? "Call tabz_secret_request for this host so the user can save the login, then try again."
                    : reason.includes("has no field")
                        ? "The entry does not have that field. Use one of the names listed in the reason, or call tabz_secret_request so the user can add it on the Logins page."
                        : reason.includes("mode is")
                            ? "The key file has the wrong mode. Ask the user to run the chmod 600 command named in the reason (never run it or read the file yourself), then try again."
                            : reason.includes("no option")
                                ? "The <select> has no option matching the saved value by value or label. Ask the user to check the saved field on the Logins page against the form's options."
                                : "Inspect the form with tabz_get_dom_tree and target the right <input> (or <select> for a named Field); a password or SecretFile only goes into type=\"password\"."} ${CREDENTIAL_GUIDANCE}`);
            }
            return {
                content: [{
                        type: "text",
                        text: `## Secret Filled

**Field:** ${summary.field}${summary.kind ? ` (${summary.kind})` : ""}${summary.selected ? "\n**Selected:** a <select> option was picked" : ""}
**Verified:** yes
**Document protection:** confirmed
**Protection scope:** ${params.trusted ? "whole tab until it closes (fresh navigation stays blocked)" : "this document, including same-document navigation"}
**Host:** ${summary.host}
**Username saved:** ${summary.hasUsername ? "yes" : "no"}${summary.normalized ? "\n**Note:** surrounding whitespace in the saved value was stripped before typing" : ""}

The value was typed into the page and never returned here. Submit only through a prepublished element reference already supplied by a tool response; when none is available, ask the user to submit or navigate. Do not use an arbitrary selector click. ${params.trusted ? "Because trusted CDP typing was used, content inspection stays blocked for the lifetime of this tab, including after fresh navigation, for every MCP connection and browser agent." : PROTECTED_LOGIN_DOCUMENT_GUIDANCE}

\`\`\`json
${JSON.stringify(summary)}
\`\`\``
                    }],
                isError: false
            };
        }
        catch (error) {
            return errorResult(`Error: ${errorMessage(error)}`);
        }
    });
}
//# sourceMappingURL=secrets.js.map