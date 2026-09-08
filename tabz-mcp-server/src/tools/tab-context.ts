export interface TabContextFields {
  tabId?: number;
  tabTitle?: string;
  tabUrl?: string;
  openedTab?: { tabId: number; title?: string; url?: string; active?: boolean };
  navigatedTo?: string;
}

const MAX_TITLE = 80;

function trimTitle(title: string | undefined): string | undefined {
  const trimmed = title?.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_TITLE ? `${trimmed.slice(0, MAX_TITLE - 3)}...` : trimmed;
}

export function tabHeaderLine(tabId: number | undefined, title?: string, url?: string): string | null {
  if (tabId === undefined || tabId === null) return null;
  const name = trimTitle(title);
  return [`Tab ${tabId}`, name ? `"${name}"` : "", url ?? ""].filter(Boolean).join(" ");
}

export function tabContextLines(fields: TabContextFields): string[] {
  const lines: string[] = [];
  const header = tabHeaderLine(fields.tabId, fields.tabTitle, fields.tabUrl);
  if (header) lines.push(header);
  if (fields.openedTab) {
    const name = trimTitle(fields.openedTab.title);
    const where = fields.openedTab.active === false ? "in the background" : "and switched to it";
    lines.push(`Opened tab ${fields.openedTab.tabId}${name ? ` ("${name}")` : ""} ${where}`);
  }
  if (fields.navigatedTo) lines.push(`Navigated to ${fields.navigatedTo}`);
  return lines;
}

export function withTabContext(fields: TabContextFields, body: string): string {
  const lines = tabContextLines(fields);
  return lines.length === 0 ? body : `${lines.join("\n")}\n\n${body}`;
}

export function pickTabContext(fields: TabContextFields): TabContextFields {
  const picked: TabContextFields = {};
  if (fields.tabId !== undefined) picked.tabId = fields.tabId;
  if (fields.tabTitle !== undefined) picked.tabTitle = fields.tabTitle;
  if (fields.tabUrl !== undefined) picked.tabUrl = fields.tabUrl;
  if (fields.openedTab !== undefined) picked.openedTab = fields.openedTab;
  if (fields.navigatedTo !== undefined) picked.navigatedTo = fields.navigatedTo;
  return picked;
}
