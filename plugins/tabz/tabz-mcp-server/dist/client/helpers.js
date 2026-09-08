import { TabzClientError, TabzToolError, TabzTransportError, TabzUncertainMutationError, TabzUsageError } from "./errors.js";
export const TABZ_BROWSER_TOOLS = [
    "tabz_open_url",
    "tabz_list_tabs",
    "tabz_switch_tab",
    "tabz_close_tab",
    "tabz_get_page_info",
    "tabz_get_element",
    "tabz_read_page",
    "tabz_fill",
    "tabz_act",
    "tabz_claude_group_status"
];
export class TabzWorkflowAssertionError extends TabzClientError {
    constructor(message, options) {
        super(message, 1, options);
    }
}
/** Fails with exit 1 and reports metadata only. */
export function assert(condition, metadata) {
    if (condition)
        return;
    throw new TabzWorkflowAssertionError(metadataMessage("assertion failed", metadata));
}
/** Polls only a classified read operation. */
export async function waitFor(readFn, options) {
    positiveInteger(options.deadline, "deadline");
    positiveInteger(options.interval, "interval");
    positiveInteger(options.maxAttempts, "maxAttempts");
    if (!READ_TOOLS.has(options.operation)) {
        throw new TabzUsageError(`waitFor operation is not a classified read: ${options.operation}`);
    }
    const waitStartedAt = Date.now();
    const expiresAt = waitStartedAt + options.deadline;
    const metadataStartedAt = options.startedAt ?? waitStartedAt;
    let attempts = 0;
    while (attempts < options.maxAttempts && Date.now() - waitStartedAt < options.deadline) {
        options.signal?.throwIfAborted();
        attempts += 1;
        const observation = await readWithinDeadline(readFn, expiresAt, options.signal, options, metadataStartedAt, attempts);
        if (isStructured(observation)) {
            if (observation.status === "transport_error") {
                throw new TabzTransportError(metadataMessage("classified read backend failure", { ...options, startedAt: metadataStartedAt, attempts }));
            }
            if (observation.status === "refused") {
                throw new TabzWorkflowAssertionError(metadataMessage("classified read refused", { ...options, startedAt: metadataStartedAt, attempts }));
            }
            if (observation.status === "failed") {
                const kind = /^invalid selector\b/i.test(observation.error ?? "") ? "invalid selector" : "classified read failed";
                throw new TabzWorkflowAssertionError(metadataMessage(kind, { ...options, startedAt: metadataStartedAt, attempts }));
            }
            if (observation.status !== "not_found" && observation.status !== "not_created")
                return observation;
        }
        else if (observation) {
            return observation;
        }
        const remaining = options.deadline - (Date.now() - waitStartedAt);
        if (attempts >= options.maxAttempts || remaining <= 0)
            break;
        await delay(Math.min(options.interval, remaining), options.signal);
    }
    throw new TabzWorkflowAssertionError(metadataMessage("condition absent before wait limit", { ...options, startedAt: metadataStartedAt, attempts }));
}
/** Typed, explicit-target wrappers for the page-agent workflow operations. */
export class TabzWorkflowClient {
    client;
    constructor(client) {
        this.client = client;
    }
    async openUrl(url, options = {}) {
        const input = {
            url,
            newTab: true,
            background: options.background ?? false,
            reuseExisting: false,
            addToClaudeGroup: true,
            ...(options.groupId === undefined ? {} : { groupId: options.groupId })
        };
        return this.mutation("tabz_open_url", input, ["created"], OPEN_STATUSES, validateCreatedTab);
    }
    listTabs() {
        return this.read("tabz_list_tabs", { response_format: "json" }, value => LIST_STATUSES.has(value.status) && validateTabs(value));
    }
    switchTab(tabId) {
        return this.mutation("tabz_switch_tab", { tabId }, ["switched"], SWITCH_STATUSES, value => value.switched === true && value.tabId === tabId);
    }
    closeTab(tabId) {
        return this.mutation("tabz_close_tab", { tabIds: [tabId] }, ["closed"], CLOSE_STATUSES, value => Array.isArray(value.closed) && value.closed.length === 1 && value.closed[0] === tabId);
    }
    async closeOwnedTabAfterReconciliation(tabId) {
        const cleanup = this.client.closeOwnedTabAfterReconciliation;
        if (!cleanup)
            throw new TabzUsageError("this client build does not support reconciled owned-tab cleanup");
        const result = await cleanup.call(this.client, tabId);
        return this.mutationResult("tabz_close_tab", result, ["closed"], CLOSE_STATUSES, value => Array.isArray(value.closed) && value.closed.length === 1 && value.closed[0] === tabId);
    }
    getPageInfo(tabId) {
        return this.read("tabz_get_page_info", { tabId, response_format: "json" }, value => PAGE_STATUSES.has(value.status) && (value.status !== "found" || (value.found === true && Number.isSafeInteger(value.tabId) && value.tabId === tabId && typeof value.url === "string" && typeof value.title === "string")));
    }
    getElement(input) {
        return this.read("tabz_get_element", {
            ...input,
            includeStyles: input.includeStyles ?? false,
            response_format: "json"
        }, value => ELEMENT_STATUSES.has(value.status) && (value.status !== "found" || (value.found === true && value.selector === input.selector && typeof value.innerText === "string")));
    }
    readPage(input) {
        return this.read("tabz_read_page", input, value => READ_PAGE_STATUSES.has(value.status) &&
            (value.status !== "completed" || (value.success === true && value.tabId === input.tabId && typeof value.outline === "string" &&
                Number.isSafeInteger(value.nodeCount) && (value.nodeCount ?? -1) >= 0 &&
                Number.isSafeInteger(value.refCount) && (value.refCount ?? -1) >= 0 &&
                typeof value.truncated === "boolean")));
    }
    fill(input) {
        return this.mutation("tabz_fill", input, ["verified"], FILL_STATUSES, value => value.dispatched === true && value.verified === true && value.verificationInterrupted === false &&
            value.selector === input.selector && value.tabId === input.tabId &&
            (value.sensitive === true ? value.actualValue === undefined : value.sensitive === false && value.actualValue === input.value), ["unknown", "unverified", "verification_interrupted"]);
    }
    act(input) {
        const request = { ...input, trusted: input.trusted ?? false };
        return this.mutation("tabz_act", request, ["completed", "verified"], ACT_STATUSES, value => value.success === true && value.action === input.action && value.trusted === request.trusted && value.tabId === input.tabId &&
            (value.protected !== true || value.verified === true) &&
            (input.action !== "type" || (value.status === "verified" && value.verified === true &&
                (value.sensitive === true ? value.actualValue === undefined : value.sensitive === false && value.actualValue === input.value))), ["unknown", "unverified"]);
    }
    groupStatus() {
        return this.read("tabz_claude_group_status", { response_format: "json" }, value => GROUP_STATUSES.has(value.status) && typeof value.exists === "boolean" && Number.isSafeInteger(value.tabCount) && value.tabCount >= 0 &&
            Array.isArray(value.tabIds) && value.tabIds.every(tabId => Number.isSafeInteger(tabId) && tabId > 0));
    }
    async read(name, input, valid) {
        try {
            return structured(name, await this.client.callTool(name, input), false, valid);
        }
        catch (error) {
            if (error instanceof TabzToolError)
                return structured(name, error.result, false, valid);
            throw error;
        }
    }
    async mutation(name, input, accepted, known, valid, uncertain = ["unknown"]) {
        try {
            return this.mutationResult(name, await this.client.callTool(name, input), accepted, known, valid, uncertain);
        }
        catch (error) {
            if (error instanceof TabzToolError)
                return this.mutationResult(name, error.result, accepted, known, valid, uncertain);
            throw error;
        }
    }
    mutationResult(name, result, accepted, known, valid, uncertain = ["unknown"]) {
        let value;
        try {
            value = structured(name, result, true);
        }
        catch (error) {
            if (error instanceof TabzUncertainMutationError)
                this.markUncertain(name, error.message);
            throw error;
        }
        if (uncertain.includes(value.status)) {
            const status = safeLabel(value.status);
            this.markUncertain(name, `structured status ${status}`);
            throw new TabzUncertainMutationError(`${name} returned ${status}; outcome is uncertain and must be reconciled before retrying`, name);
        }
        if (!known.has(value.status)) {
            this.markUncertain(name, "invalid structured status");
            throw new TabzUncertainMutationError(`${name} returned an invalid structured status; outcome is uncertain`, name);
        }
        if (!accepted.includes(value.status)) {
            if (value.status === "mismatch")
                this.markUncertain(name, "structured verification mismatch");
            throw new TabzWorkflowAssertionError(`${name} returned ${safeLabel(value.status)}; operation was not verified`);
        }
        if (!valid(value)) {
            this.markUncertain(name, "invalid structured fields");
            throw new TabzUncertainMutationError(`${name} returned an invalid structured result; outcome is uncertain`, name);
        }
        return value;
    }
    markUncertain(name, message) {
        const mark = this.client.markMutationUncertain;
        mark?.call(this.client, name, message);
    }
}
function structured(name, result, mutation, valid) {
    const value = result.structuredContent;
    if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.status !== "string" || typeof value.text !== "string") {
        if (mutation)
            throw new TabzUncertainMutationError(`${name} returned no valid structured result; outcome is uncertain`, name);
        throw new TabzTransportError(`${name} returned no valid structured result`);
    }
    const typed = value;
    if (valid && !valid(typed)) {
        if (mutation)
            throw new TabzUncertainMutationError(`${name} returned an invalid structured result; outcome is uncertain`, name);
        throw new TabzTransportError(`${name} returned an invalid structured result`);
    }
    return typed;
}
function validateCreatedTab(value) {
    return value.opened === true && value.reused === false && value.inClaudeGroup === true &&
        Number.isSafeInteger(value.tabId) && value.tabId > 0 &&
        typeof value.groupId === "number" && Number.isSafeInteger(value.groupId) && value.groupId >= 0 &&
        typeof value.url === "string";
}
function validateTabs(value) {
    return Number.isSafeInteger(value.total) && value.total >= 0 && Array.isArray(value.tabs) &&
        value.total === value.tabs.length && value.tabs.every(tab => Number.isSafeInteger(tab.tabId) && tab.tabId > 0);
}
function isStructured(value) {
    return Boolean(value && typeof value === "object" && "status" in value && typeof value.status === "string");
}
function metadataMessage(message, metadata) {
    const elapsedMs = Math.max(0, Date.now() - (metadata.startedAt ?? Date.now()));
    return `${message}; operation=${safeLabel(metadata.operation)} target=${safeLabel(metadata.targetLabel)} elapsedMs=${elapsedMs}${metadata.attempts === undefined ? "" : ` attempts=${metadata.attempts}`}`;
}
function safeLabel(value) {
    return JSON.stringify(value.replace(/[\r\n]+/g, " ").slice(0, 160));
}
function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value <= 0)
        throw new TabzUsageError(`${name} must be a positive integer`);
}
function delay(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal?.reason ?? new TabzTransportError("classified read interrupted"));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, milliseconds);
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted)
            onAbort();
    });
}
function readWithinDeadline(readFn, expiresAt, signal, metadata, startedAt, attempts) {
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
        return Promise.reject(new TabzTransportError(metadataMessage("classified read exceeded wait deadline", { ...metadata, startedAt, attempts })));
    }
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (operation) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", onAbort);
            operation();
        };
        const onAbort = () => finish(() => reject(signal?.reason));
        const timer = setTimeout(() => finish(() => reject(new TabzTransportError(metadataMessage("classified read exceeded wait deadline", { ...metadata, startedAt, attempts })))), remaining);
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) {
            onAbort();
            return;
        }
        Promise.resolve().then(() => settled ? undefined : readFn()).then(value => Date.now() >= expiresAt
            ? finish(() => reject(new TabzTransportError(metadataMessage("classified read exceeded wait deadline", { ...metadata, startedAt, attempts }))))
            : finish(() => resolve(value)), error => finish(() => reject(error)));
    });
}
const READ_TOOLS = new Set([
    "tabz_list_tabs",
    "tabz_get_page_info",
    "tabz_get_element",
    "tabz_read_page",
    "tabz_claude_group_status"
]);
const READ_FAILURE_STATUSES = ["not_found", "refused", "transport_error", "failed"];
const LIST_STATUSES = new Set(["found", ...READ_FAILURE_STATUSES]);
const PAGE_STATUSES = new Set(["found", ...READ_FAILURE_STATUSES]);
const ELEMENT_STATUSES = new Set(["found", ...READ_FAILURE_STATUSES]);
const READ_PAGE_STATUSES = new Set(["completed", ...READ_FAILURE_STATUSES]);
const GROUP_STATUSES = new Set(["active", "not_created", ...READ_FAILURE_STATUSES]);
const OPEN_STATUSES = new Set(["created", "reused", "navigated", "refused", "not_found", "failed", "unknown"]);
const SWITCH_STATUSES = new Set(["switched", "refused", "not_found", "failed", "unknown"]);
const CLOSE_STATUSES = new Set(["closed", "partial", "refused", "not_found", "failed", "unknown"]);
const FILL_STATUSES = new Set(["verified", "normalized", "mismatch", "verification_interrupted", "verification_failed", "unverified", "refused", "not_found", "failed", "unknown"]);
const ACT_STATUSES = new Set(["completed", "verified", "mismatch", "verification_failed", "unverified", "refused", "not_found", "failed", "unknown"]);
//# sourceMappingURL=helpers.js.map