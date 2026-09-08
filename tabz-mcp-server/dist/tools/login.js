import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, CREDENTIAL_GUIDANCE, PROTECTED_LOGIN_DOCUMENT_GUIDANCE, NEVER_ASK_FOR_CREDENTIALS, defaultAddToClaudeGroup, getAgentLabel, setCurrentTabId } from "../shared.js";
import { docsPointer } from "../descriptions.js";
export const DEFAULT_LOGIN_TIMEOUT_MS = 45000;
export const MAX_LOGIN_TIMEOUT_MS = 50000;
export const DEFAULT_LOGIN_POLL_INTERVAL_MS = 1500;
const CLEAR_OBSERVATIONS_REQUIRED = 2;
const MAX_CONSECUTIVE_PROBE_ERRORS = 3;
const CLEANUP_RESERVE_MS = 500;
const RequestLoginSchema = z.object({
    tabId: z.number().int().min(1).optional().describe("Tab showing the login page; your active tab by default."),
    url: z.string().min(1).optional().describe("Sign-in URL to open first, inside your group."),
    reason: z.string().max(200).optional().describe("One sentence shown to the user; never credentials."),
    timeoutMs: z.number().int().min(5000).max(MAX_LOGIN_TIMEOUT_MS).default(DEFAULT_LOGIN_TIMEOUT_MS)
        .describe("This call's wait; call again to keep waiting.")
}).strict();
function normalizeLoginUrl(raw) {
    const trimmed = raw.trim();
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed))
        return trimmed;
    return /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}`;
}
function sanitizedPageUrl(raw) {
    if (typeof raw !== "string" || !raw)
        return "";
    try {
        const url = new URL(raw);
        url.username = "";
        url.password = "";
        return url.origin === "null" ? "" : url.origin;
    }
    catch {
        return "";
    }
}
export function isOnLogin(state) {
    return Boolean(state.hasLoginForm || state.hasPasswordField || state.authUrl);
}
/** Only a completed, successfully probed page can count as prompt-free evidence. */
export function isClearLoginObservation(state) {
    return state.success === true && state.probed === true && state.tabStatus === "complete" && !isOnLogin(state);
}
function requestTimeout(workDeadline, cap) {
    const remaining = workDeadline - Date.now();
    return remaining > 0 ? Math.max(1, Math.min(cap, remaining)) : undefined;
}
async function openUrl(url, workDeadline) {
    const timeout = requestTimeout(workDeadline, 10000);
    if (!timeout)
        return { success: false, error: "The login handoff budget expired before the URL could open" };
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/open-url`, {
            url, newTab: true, background: true, reuseExisting: false,
            addToClaudeGroup: defaultAddToClaudeGroup(), claudeGroupTitle: getAgentLabel()
        }, { timeout });
        return response.data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function switchTab(tabId, workDeadline) {
    const timeout = requestTimeout(workDeadline, 5000);
    if (!timeout)
        return { success: false, error: "The login handoff budget expired before the tab could be focused" };
    try {
        return (await axios.post(`${BACKEND_URL}/api/browser/switch-tab`, { tabId }, { timeout })).data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function probeLoginState(tabId, workDeadline) {
    const timeout = requestTimeout(workDeadline, 15000);
    if (!timeout)
        return { success: false, error: "The login handoff wait window ended" };
    try {
        return (await axios.post(`${BACKEND_URL}/api/browser/login-state`, { tabId }, { timeout })).data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function beginLoginHandoff(tabId, workDeadline) {
    const timeout = requestTimeout(workDeadline, 10000);
    if (!timeout)
        return { success: false, error: "The login handoff wait window ended" };
    const requestTimeoutMs = Math.max(1, timeout - 250);
    try {
        return (await axios.post(`${BACKEND_URL}/api/browser/login-state`, { tabId, beginHandoff: true, requestTimeoutMs }, { timeout })).data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function completeLoginHandoff(tabId, workDeadline) {
    const timeout = requestTimeout(workDeadline, 10000);
    if (!timeout)
        return { success: false, error: "The login handoff wait window ended before protection could be completed" };
    const requestTimeoutMs = Math.max(1, timeout - 250);
    try {
        return (await axios.post(`${BACKEND_URL}/api/browser/login-state`, { tabId, completeHandoff: true, requestTimeoutMs }, { timeout })).data;
    }
    catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
async function showNotification(host, reason, workDeadline) {
    const timeout = requestTimeout(workDeadline, 10000);
    if (!timeout)
        return undefined;
    const title = `Sign in to ${host || "the site"}`.slice(0, 100);
    const detail = reason?.trim();
    const message = (detail ? `${detail} The agent is waiting.` : "The agent is waiting for you to sign in.").slice(0, 500);
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/notification/show`, { title, message, type: "basic", priority: 2 }, { timeout });
        return response.data.success ? response.data.notificationId : undefined;
    }
    catch {
        return undefined;
    }
}
async function clearNotification(notificationId, absoluteDeadline) {
    if (!notificationId)
        return;
    const remaining = absoluteDeadline - Date.now();
    if (remaining <= 0)
        return;
    try {
        await axios.post(`${BACKEND_URL}/api/browser/notification/clear`, { notificationId }, { timeout: Math.max(1, Math.min(CLEANUP_RESERVE_MS, remaining)) });
    }
    catch { /* best effort */ }
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function errorResult(text) { return { content: [{ type: "text", text }], isError: true }; }
function statusGuidance(status, waitedSeconds, startedOnLogin) {
    if (status === "signed_in") {
        return `${startedOnLogin ? "" : "Note: no login form was detected when the wait started.\n\n"}` +
            "Two completed probes found no login prompt. This is only evidence that the prompt is absent; it does not prove the site authenticated the user. Verify the site's authenticated state before continuing. " + PROTECTED_LOGIN_DOCUMENT_GUIDANCE;
    }
    if (status === "still_on_login") {
        return `The page still shows a sign-in step after ${waitedSeconds} seconds. The tab remains open and focused. Tell the user the browser is waiting, then call tabz_request_login again to keep waiting. ${CREDENTIAL_GUIDANCE} ${PROTECTED_LOGIN_DOCUMENT_GUIDANCE}`;
    }
    return `No clear result was observed within ${waitedSeconds} seconds because the page was loading, could not be probed, or remained on an auth route. The tab is still open; call tabz_request_login again. ${CREDENTIAL_GUIDANCE} ${PROTECTED_LOGIN_DOCUMENT_GUIDANCE}`;
}
export function registerLoginTools(server, options = {}) {
    const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_LOGIN_POLL_INTERVAL_MS;
    registerTabzTool(server, "tabz_request_login", "Hand a tab to the user to sign in, then wait briefly. Two clear probes show only that the prompt is absent, not proven authentication. " +
        NEVER_ASK_FOR_CREDENTIALS + " " + PROTECTED_LOGIN_DOCUMENT_GUIDANCE + " " + docsPointer("tabz_request_login"), RequestLoginSchema, async (params) => {
        const startedAt = Date.now();
        const absoluteDeadline = startedAt + params.timeoutMs;
        const workDeadline = absoluteDeadline - CLEANUP_RESERVE_MS;
        let notificationId;
        try {
            if (params.url && params.tabId !== undefined) {
                return errorResult("## Login Handoff Failed\n\n**Error:** Pass either url or tabId, not both. No tab was opened or focused.");
            }
            let targetTabId = params.tabId;
            if (params.url) {
                const normalized = normalizeLoginUrl(params.url);
                try {
                    new URL(normalized);
                }
                catch {
                    return errorResult("## Login Handoff Failed\n\n**Error:** The requested sign-in URL is invalid");
                }
                const opened = await openUrl(normalized, workDeadline);
                if (!opened.success || !opened.tabId)
                    return errorResult(`## Login Handoff Failed\n\n**Error:** Could not open the requested sign-in URL: ${opened.error || "unknown error"}`);
                targetTabId = opened.tabId;
            }
            const protectedResult = await beginLoginHandoff(targetTabId, workDeadline);
            if (!protectedResult.success || protectedResult.protected !== true || !protectedResult.tabId) {
                return errorResult(`## Login Handoff Failed\n\n**Error:** The login document could not be protected before handoff: ${protectedResult.error || "protection was not confirmed"}`);
            }
            targetTabId = protectedResult.tabId;
            const switched = await switchTab(targetTabId, workDeadline);
            if (!switched.success)
                return errorResult(`## Login Handoff Failed\n\n**Error:** Could not focus tab ${targetTabId}: ${switched.error || "unknown error"}`);
            setCurrentTabId(targetTabId);
            const initial = await probeLoginState(targetTabId, workDeadline);
            if (!initial.success)
                return errorResult(`## Login Handoff Failed\n\n**Error:** ${initial.error || "Could not read the tab state"}\n\nMake sure the TabzChrome backend is running and the extension is connected.`);
            if (targetTabId === undefined && typeof initial.tabId === "number" && initial.tabId > 0)
                targetTabId = initial.tabId;
            const startedOnLogin = isOnLogin(initial);
            const startHost = initial.host || "";
            notificationId = await showNotification(startHost, params.reason, workDeadline);
            let latest = initial;
            let clearObservations = isClearLoginObservation(initial) ? 1 : 0;
            let consecutiveErrors = 0;
            let status;
            while (!status && Date.now() < workDeadline) {
                await sleep(Math.min(pollIntervalMs, Math.max(0, workDeadline - Date.now())));
                if (Date.now() >= workDeadline)
                    break;
                const state = await probeLoginState(targetTabId, workDeadline);
                if (!state.success) {
                    consecutiveErrors++;
                    if (consecutiveErrors >= MAX_CONSECUTIVE_PROBE_ERRORS) {
                        return errorResult(`## Login Handoff Failed\n\n**Error:** The login tab became unreachable: ${state.error || "unknown error"}\n\nIt may have been closed. Call tabz_list_tabs to check.`);
                    }
                    clearObservations = 0;
                    continue;
                }
                consecutiveErrors = 0;
                latest = state;
                clearObservations = isClearLoginObservation(state) ? clearObservations + 1 : 0;
                if (clearObservations >= CLEAR_OBSERVATIONS_REQUIRED) {
                    const completed = await completeLoginHandoff(targetTabId, workDeadline);
                    if (!completed.success || completed.protected !== true) {
                        return errorResult(`## Login Handoff Failed\n\n**Error:** The final login document could not be protected before completing the handoff: ${completed.error || "protection was not confirmed"}. The manual protection reservation remains active; call tabz_request_login again.`);
                    }
                    status = "signed_in";
                }
            }
            status ??= isOnLogin(latest) ? "still_on_login" : "pending";
            const url = sanitizedPageUrl(latest.url || initial.url);
            const host = latest.host || startHost;
            const summary = status === "signed_in"
                ? { status, evidence: "login_prompt_absent", authenticationConfirmed: false, handoffProtectionEstablished: true, url, host }
                : { status, handoffProtectionEstablished: true, url, host };
            const waitedSeconds = Math.round((Date.now() - startedAt) / 1000);
            return { content: [{ type: "text", text: `## Login Wait Finished

**Status:** ${status}
**URL:** ${url || "(unknown)"}
**Host:** ${host || "(unknown)"}${status === "signed_in" ? "\n**Authentication confirmed:** no" : ""}

${statusGuidance(status, waitedSeconds, startedOnLogin)}

\`\`\`json
${JSON.stringify(summary)}
\`\`\`` }], isError: false };
        }
        catch (error) {
            return errorResult(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            await clearNotification(notificationId, absoluteDeadline);
        }
    });
}
//# sourceMappingURL=login.js.map