import axios from "axios";
import { z } from "zod";
import { registerTabzTool } from "../register.js";
import { BACKEND_URL } from "../shared.js";
import { ACT_ACTIONS, PAGE_ACT_ACTIONS } from "./act-actions.js";
import { takeScreenshot, screenshotToolResult } from "./screenshot.js";
import { mutationFailureStatus, structuredToolResult } from "./result-contract.js";
import { docsPointer, TAB_ID_DESC, OUTPUT_PATH_DESC } from "../descriptions.js";
export { ACT_ACTIONS, PAGE_ACT_ACTIONS } from "./act-actions.js";
const ActSchema = z.object({
    action: z.enum(ACT_ACTIONS).describe("Page action, screenshot, cropped zoom, or local wait."),
    ref: z.string().min(1).optional().describe("Opaque target from the latest tabz_read_page for this tab."),
    selector: z.string().min(1).optional().describe("CSS selector target."),
    text: z.string().min(1).optional().describe("Visible-text target, exact before contains."),
    x: z.number().optional().describe("Viewport x in CSS px, as measured on a screenshot; with y, the element there."),
    y: z.number().optional(),
    value: z.string().max(4000).optional().describe("Text to append. Never pass a credential obtained from the user."),
    key: z.string().min(1).optional().describe("Space-separated key names."),
    repeat: z.number().int().min(1).max(100).optional(),
    modifiers: z.string().optional().describe("Modifiers held, joined by '+'."),
    direction: z.enum(["up", "down", "left", "right"]).default("down"),
    ticks: z.number().int().min(1).max(10).optional(),
    toX: z.number().optional(),
    toY: z.number().optional(),
    toSelector: z.string().min(1).optional(),
    observe: z.boolean().default(false).describe("Include the resulting viewport inline without saving it."),
    x0: z.number().nonnegative().optional(),
    y0: z.number().nonnegative().optional(),
    x1: z.number().nonnegative().optional(),
    y1: z.number().nonnegative().optional(),
    fullPage: z.boolean().optional().describe("Screenshot the full page."),
    outputPath: z.string().optional().describe(OUTPUT_PATH_DESC),
    seconds: z.number().min(0).max(10).optional().describe("Local wait duration; wait action only."),
    trusted: z.boolean().default(false).describe("true: real input via the debugger; shows the debugging bar, not chrome://."),
    tabId: z.number().int().positive().optional().describe(TAB_ID_DESC),
    waitTimeout: z.number().int().min(100).max(10_000).optional().describe("Maximum target wait for a page action, in milliseconds.")
}).strict();
function targetModes(params) {
    return Number(params.ref !== undefined) + Number(params.selector !== undefined) +
        Number(params.text !== undefined) + Number(params.x !== undefined && params.y !== undefined);
}
export function validateActInput(params) {
    if ((params.x === undefined) !== (params.y === undefined))
        return "x and y go together";
    if ((params.toX === undefined) !== (params.toY === undefined))
        return "toX and toY go together";
    if (targetModes(params) > 1)
        return "choose one target: ref, selector, text, or x and y";
    const pageAction = PAGE_ACT_ACTIONS.includes(params.action);
    if (!pageAction && params.waitTimeout !== undefined)
        return "waitTimeout belongs to a page action";
    if (!pageAction && params.trusted)
        return "trusted belongs to a page action";
    if (!["screenshot", "zoom"].includes(params.action) && params.outputPath !== undefined)
        return "outputPath belongs to screenshot or zoom";
    if (params.action !== "screenshot" && params.fullPage !== undefined)
        return "fullPage belongs to screenshot";
    if (params.action !== "zoom" && [params.x0, params.y0, params.x1, params.y1].some(v => v !== undefined))
        return "clip coordinates belong to zoom";
    if (params.action === "zoom") {
        if (targetModes(params) > 0)
            return "zoom uses only x0, y0, x1, y1";
        if ([params.x0, params.y0, params.x1, params.y1].some(v => v === undefined))
            return "zoom needs x0, y0, x1, y1";
        if (params.x1 <= params.x0 || params.y1 <= params.y0)
            return "zoom needs positive width and height";
        return null;
    }
    if (params.action === "screenshot") {
        if (params.text !== undefined || params.x !== undefined)
            return "screenshot uses ref, selector or viewport";
        if (params.fullPage && (params.ref !== undefined || params.selector !== undefined))
            return "fullPage cannot also target an element";
        return null;
    }
    if (params.action === "wait") {
        if (params.seconds === undefined)
            return "wait needs seconds (0-10)";
        if (targetModes(params) > 0 || params.value !== undefined || params.key !== undefined)
            return "wait does not take a page target or input";
        return null;
    }
    if (params.seconds !== undefined)
        return "seconds belongs to wait";
    switch (params.action) {
        case "click":
        case "right_click":
        case "double_click":
        case "triple_click":
        case "hover":
            return targetModes(params) === 1 ? null : `${params.action} needs a target`;
        case "type":
            return params.value === undefined ? "type needs value" : null;
        case "key":
            return params.key === undefined ? "key needs key" : null;
        case "drag":
            if (targetModes(params) !== 1)
                return "drag needs a start target";
            if (params.toSelector === undefined && params.toX === undefined)
                return "drag needs an end: toX and toY, or toSelector";
            if (params.toSelector !== undefined && params.toX !== undefined)
                return "choose one drag end: toSelector or toX and toY";
            return null;
        case "scroll":
        case "scroll_to":
            return null;
    }
}
function redactValue(message, value) {
    return value ? message.split(value).join("[redacted]") : message;
}
function targetLabel(params, target) {
    if (target?.description)
        return `${target.description}${target.x !== undefined ? ` at (${target.x}, ${target.y})` : ""}`;
    if (params.ref)
        return `ref \`${params.ref}\``;
    if (params.selector)
        return `\`${params.selector}\``;
    if (params.text)
        return `text "${params.text}"`;
    if (params.x !== undefined)
        return `(${params.x}, ${params.y})`;
    return "the focused element";
}
function recoveryText(recovery) {
    if (!recovery)
        return [];
    const lines = [];
    if (recovery.url)
        lines.push(`**Page:** ${recovery.url}${recovery.title ? ` (${recovery.title})` : ""}`);
    if (recovery.covering)
        lines.push(`**Covered by:** ${recovery.covering.description}`);
    if (recovery.suggestions?.length) {
        lines.push("**Nearest interactive elements:**");
        for (const item of recovery.suggestions)
            lines.push(`- ${item.role}${item.name ? ` "${item.name}"` : ""} [ref=${item.ref}]`);
    }
    return lines;
}
async function postAct(params) {
    const payload = {};
    for (const key of ["action", "ref", "selector", "text", "x", "y", "value", "key", "repeat", "modifiers", "direction", "ticks", "toX", "toY", "toSelector", "trusted", "tabId", "waitTimeout", "observe"]) {
        if (params[key] !== undefined)
            payload[key] = params[key];
    }
    try {
        return (await axios.post(`${BACKEND_URL}/api/browser/act`, payload, {
            timeout: params.trusted ? 30_000 : 20_000
        })).data;
    }
    catch (error) {
        return {
            success: false,
            transportError: true,
            error: redactValue(error instanceof Error ? error.message : String(error), params.value)
        };
    }
}
function resultStatus(params, result) {
    if ((typeof result.success !== "boolean" && result.success !== null) ||
        result.action !== params.action || result.trusted !== params.trusted) {
        return { status: "unknown", success: null, isError: true };
    }
    if (result.success === null || result.status === "unknown") {
        return { status: "unknown", success: null, isError: true };
    }
    if (!result.success) {
        const status = result.transportError === true || result.timedOut === true || result.uncertain === true
            ? "unknown"
            : mutationFailureStatus(result.error);
        return { status, success: status === "unknown" ? null : false, isError: true };
    }
    if (result.protected === true && result.verified !== true)
        return { status: "unknown", success: null, isError: true };
    if (params.action !== "type")
        return { status: "completed", success: true, isError: false };
    if (result.verified === true)
        return { status: "verified", success: true, isError: false };
    if (result.verified === false)
        return { status: "mismatch", success: false, isError: true };
    return { status: "unknown", success: null, isError: true };
}
function describe(params, result, status) {
    const lines = [`## tabz_act ${params.action}${result.success && status !== "mismatch" && status !== "unknown" ? "" : " FAILED"}`, "", `**Target:** ${targetLabel(params, result.target)}`, `**Path:** ${params.trusted ? "trusted debugger input" : "synthetic events"}`, `**Status:** ${status}`];
    if (result.events?.length)
        lines.push(`**Events:** ${result.events.join(", ")}`);
    if (result.scroll)
        lines.push(`**Window scroll now:** (${result.scroll.x}, ${result.scroll.y})`);
    if (status === "verified")
        lines.push(`**Verified:** the field holds the typed text${result.sensitive ? ` ([redacted], ${result.actualLength ?? "?"} chars)` : result.actualValue !== undefined ? `: "${result.actualValue.slice(0, 50)}"` : ""}.`);
    if (status === "mismatch")
        lines.push("**Verification mismatch:** the field did not retain the requested text. Do not treat this action as successful or automatically replay it.");
    if (status === "unknown")
        lines.push("**Outcome unknown:** the action may have changed the page. Do not automatically replay it; read the current state first.");
    if (result.error)
        lines.push(`**Error:** ${result.error}`);
    const recovery = recoveryText(result.recovery);
    if (recovery.length)
        lines.push("", ...recovery);
    return lines.join("\n");
}
export function registerActTools(server) {
    registerTabzTool(server, "tabz_act", "Act on the page: one verb per call, from the action enum. Target by ref from tabz_read_page, CSS selector, visible text, or viewport x/y. " +
        "Rule: never type a credential you asked for; tabz_fill SETS a form value with a read-back, tabz_fill_secret fills a saved login. " +
        docsPointer("tabz_act"), ActSchema, async (params) => {
        const invalid = validateActInput(params);
        if (invalid)
            return structuredToolResult(`## tabz_act ${params.action} FAILED\n\n**Status:** refused\n**Error:** ${invalid}`, "refused", { action: params.action, success: false, error: invalid }, true);
        if (params.action === "wait") {
            const seconds = params.seconds ?? 0;
            await new Promise(resolve => setTimeout(resolve, seconds * 1000));
            const waited = structuredToolResult(`## tabz_act wait\n\nPaused ${seconds} second${seconds === 1 ? "" : "s"}.`, "completed", { action: "wait", success: true, seconds }, false);
            if (!params.observe)
                return waited;
            const shot = screenshotToolResult(await takeScreenshot({ tabId: params.tabId, inlineOnly: true }), { inlineOnly: true, tabId: params.tabId });
            return { ...waited, content: [...waited.content, ...shot.content], structuredContent: { ...waited.structuredContent, observed: !shot.isError, observation: shot.structuredContent } };
        }
        if (params.action === "screenshot" || params.action === "zoom") {
            const clip = params.action === "zoom" ? { x0: params.x0, y0: params.y0, x1: params.x1, y1: params.y1 } : undefined;
            const result = await takeScreenshot({ tabId: params.tabId, ref: params.ref, selector: params.selector, outputPath: params.outputPath, fullPage: params.fullPage, clip });
            return screenshotToolResult(result, { action: params.action, tabId: params.tabId });
        }
        const raw = await postAct(params);
        const result = raw.protected === true
            ? {
                success: raw.success,
                status: raw.status,
                action: raw.action,
                trusted: raw.trusted,
                tabId: raw.tabId,
                protected: true,
                verified: raw.verified === true,
                error: raw.success === true && raw.verified === true
                    ? undefined
                    : raw.success === null || raw.status === "unknown" || raw.transportError === true || raw.timedOut === true || raw.uncertain === true
                        ? "Protected document action outcome is unknown; do not automatically retry."
                        : "Protected document action was refused or could not be verified.",
                transportError: raw.transportError === true,
                timedOut: raw.timedOut === true,
                uncertain: raw.uncertain === true
            }
            : {
                ...raw,
                actualValue: raw.sensitive !== false || raw.verified !== true ? undefined : raw.actualValue,
                error: raw.error ? redactValue(raw.error, params.value) : undefined
            };
        const verdict = resultStatus(params, result);
        const text = describe(params, result, verdict.status);
        const output = structuredToolResult(text, verdict.status, {
            action: params.action,
            success: verdict.success,
            trusted: params.trusted,
            tabId: result.tabId ?? null,
            ...(result.protected === true ? { protected: true } : { target: result.target ?? null }),
            verified: result.verified ?? null,
            ...(result.protected !== true && result.events?.length ? { events: result.events } : {}),
            ...(result.protected !== true && result.scroll ? { scroll: result.scroll } : {}),
            ...(result.protected !== true && result.sensitive === true ? { sensitive: true, actualLength: result.actualLength ?? null } : result.protected !== true && result.actualValue !== undefined ? { sensitive: false, actualValue: result.actualValue } : {}),
            ...(result.protected !== true && result.recovery ? { recovery: result.recovery } : {}),
            ...(result.timedOut ? { timedOut: true } : {}),
            ...(result.uncertain ? { uncertain: true } : {}),
            ...(result.executionPath ? { executionPath: result.executionPath } : {}),
            ...(result.error ? { error: result.error } : {})
        }, verdict.isError);
        if (params.observe && result.protected !== true) {
            const shot = screenshotToolResult({ ...result, success: result.observed === true, error: result.observationError }, { inlineOnly: true, tabId: result.tabId });
            output.content.push(...shot.content);
            output.structuredContent = { ...output.structuredContent, observed: !shot.isError, observation: shot.structuredContent };
        }
        return output;
    });
}
//# sourceMappingURL=act.js.map