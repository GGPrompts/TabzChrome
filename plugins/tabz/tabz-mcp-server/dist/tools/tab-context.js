const MAX_TITLE = 80;
function trimTitle(title) {
    const trimmed = title?.trim();
    if (!trimmed)
        return undefined;
    return trimmed.length > MAX_TITLE ? `${trimmed.slice(0, MAX_TITLE - 3)}...` : trimmed;
}
export function tabHeaderLine(tabId, title, url) {
    if (tabId === undefined || tabId === null)
        return null;
    const name = trimTitle(title);
    return [`Tab ${tabId}`, name ? `"${name}"` : "", url ?? ""].filter(Boolean).join(" ");
}
export function tabContextLines(fields) {
    const lines = [];
    const header = tabHeaderLine(fields.tabId, fields.tabTitle, fields.tabUrl);
    if (header)
        lines.push(header);
    if (fields.openedTab) {
        const name = trimTitle(fields.openedTab.title);
        const where = fields.openedTab.active === false ? "in the background" : "and switched to it";
        lines.push(`Opened tab ${fields.openedTab.tabId}${name ? ` ("${name}")` : ""} ${where}`);
    }
    if (fields.navigatedTo)
        lines.push(`Navigated to ${fields.navigatedTo}`);
    return lines;
}
export function withTabContext(fields, body) {
    const lines = tabContextLines(fields);
    return lines.length === 0 ? body : `${lines.join("\n")}\n\n${body}`;
}
export function pickTabContext(fields) {
    const picked = {};
    if (fields.tabId !== undefined)
        picked.tabId = fields.tabId;
    if (fields.tabTitle !== undefined)
        picked.tabTitle = fields.tabTitle;
    if (fields.tabUrl !== undefined)
        picked.tabUrl = fields.tabUrl;
    if (fields.openedTab !== undefined)
        picked.openedTab = fields.openedTab;
    if (fields.navigatedTo !== undefined)
        picked.navigatedTo = fields.navigatedTo;
    return picked;
}
//# sourceMappingURL=tab-context.js.map