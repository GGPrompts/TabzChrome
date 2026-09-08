import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    interceptors: { request: { use: vi.fn() } }
  },
  AxiosError: class MockAxiosError extends Error {}
}));

import axios from "axios";
import { registerActTools } from "../src/tools/act.js";
import { registerInspectionTools } from "../src/tools/inspection.js";
import { registerInteractionTools } from "../src/tools/interaction.js";
import { registerOmniboxTools } from "../src/tools/omnibox.js";
import { registerPageTools } from "../src/tools/page.js";
import { readFailureStatus } from "../src/tools/result-contract.js";
import { registerTabGroupTools } from "../src/tools/tabGroups.js";
import { registerTabTools } from "../src/tools/tabs.js";

type Handler = (input: Record<string, unknown>) => Promise<any>;

function collect(register: (server: McpServer) => void): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  register({
    registerTool: vi.fn((name: string, _config: unknown, handler: Handler) => {
      handlers.set(name, handler);
      return {};
    })
  } as unknown as McpServer);
  return handlers;
}

describe("structured browser operation results", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ allowAllUrls: false, customDomains: "" })
    }));
  });

  it("distinguishes explicitly created, reused, and navigated open results", async () => {
    const open = collect(registerOmniboxTools).get("tabz_open_url")!;
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { success: true, created: true, tabId: 41, url: "http://localhost/receipt/41", groupId: 7, inClaudeGroup: true, reusedExisting: false } })
      .mockResolvedValueOnce({ data: { success: true, created: false, tabId: 41, url: "http://localhost/receipt/41", groupId: 7, inClaudeGroup: true, reusedExisting: true } })
      .mockResolvedValueOnce({ data: { success: true, created: false, tabId: 42, url: "http://localhost/receipt/42", groupId: 7, inClaudeGroup: true, reusedExisting: false } });

    const created = await open({ url: "http://localhost/receipt/41", newTab: true, background: false, reuseExisting: false });
    const reused = await open({ url: "http://localhost/receipt/41", newTab: true, background: false, reuseExisting: true });
    const navigated = await open({ url: "http://localhost/receipt/42", newTab: false, tabId: 42, background: false, reuseExisting: false });

    expect(created.structuredContent).toMatchObject({ status: "created", opened: true, reused: false, tabId: 41, groupId: 7 });
    expect(reused.structuredContent).toMatchObject({ status: "reused", opened: false, reused: true, tabId: 41, groupId: 7 });
    expect(navigated.structuredContent).toMatchObject({ status: "navigated", opened: false, reused: false, tabId: 42, groupId: 7 });
  });

  it("does not infer tab creation and keeps transport failures unknown", async () => {
    const open = collect(registerOmniboxTools).get("tabz_open_url")!;
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { success: true, tabId: 41, url: "http://localhost/receipt/41" } })
      .mockRejectedValueOnce(new Error("socket closed after send"));

    const unconfirmed = await open({ url: "http://localhost/receipt/41", newTab: true, background: false, reuseExisting: false });
    const transport = await open({ url: "http://localhost/receipt/42", newTab: true, background: false, reuseExisting: false });
    expect(unconfirmed).toMatchObject({ isError: true, structuredContent: { status: "unknown", opened: null, tabId: 41 } });
    expect(transport).toMatchObject({ isError: true, structuredContent: { status: "unknown", opened: null, tabId: null } });
  });

  it("returns typed list, switch, and partial close outcomes", async () => {
    const tools = collect(registerTabTools);
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { success: true, tabs: [{ tabId: 11, url: "https://example.test/receipt", title: "Receipt", active: true, inClaudeGroup: true }] }
    });
    const listed = await tools.get("tabz_list_tabs")!({ response_format: "markdown" });
    expect(listed.structuredContent).toMatchObject({ status: "found", total: 1, claudeCurrentTabId: 11 });
    expect(listed.structuredContent.tabs).toHaveLength(1);

    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
    const switched = await tools.get("tabz_switch_tab")!({ tabId: 11 });
    expect(switched.structuredContent).toMatchObject({ status: "switched", switched: true, tabId: 11 });

    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { success: true, closed: [11], refused: [{ tabId: 12, reason: "outside the target group" }], missing: [], groupId: 7 }
    });
    const closed = await tools.get("tabz_close_tab")!({ tabIds: [11, 12] });
    expect(closed).toMatchObject({ isError: true, structuredContent: { status: "partial", closed: [11], groupId: 7 } });
    expect(closed.structuredContent.refused).toEqual([{ tabId: 12, reason: "outside the target group" }]);
  });

  it("keeps switch and close transport outcomes unknown", async () => {
    const tools = collect(registerTabTools);
    vi.mocked(axios.post).mockRejectedValue(new Error("Request timed out"));
    const switched = await tools.get("tabz_switch_tab")!({ tabId: 11 });
    const closed = await tools.get("tabz_close_tab")!({ tabIds: [11] });
    expect(switched.structuredContent).toMatchObject({ status: "unknown", switched: null });
    expect(closed.structuredContent).toMatchObject({ status: "unknown", closed: null });
  });

  it("returns page fields and an explicit not-found result", async () => {
    const page = collect(server => registerPageTools(server, "http://backend.test")).get("tabz_get_page_info")!;
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { url: "https://example.test/receipt/17", title: "Receipt 17", tabId: 17 } })
      .mockResolvedValueOnce({ data: { url: "", title: "", tabId: -1, error: "No active tab found" } });

    const found = await page({ response_format: "markdown" });
    const missing = await page({ response_format: "markdown" });
    expect(found.structuredContent).toMatchObject({ status: "found", found: true, tabId: 17, title: "Receipt 17" });
    expect(missing).toMatchObject({ isError: true, structuredContent: { status: "not_found", found: false, tabId: null } });
  });

  it("projects useful element text while excluding credential-bearing fields", async () => {
    const element = collect(registerInspectionTools).get("tabz_get_element")!;
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: {
        success: true,
        tagName: "div",
        innerText: "Receipt SYNTHETIC-42 is complete",
        outerHTML: '<div value="credential">Receipt SYNTHETIC-42 is complete</div>',
        attributes: { id: "receipt-status", role: "status", value: "credential", "data-secret": "credential", href: "https://example.test/?token=credential" },
        bounds: { x: 1, y: 2, width: 3, height: 4, top: 2, right: 4, bottom: 6, left: 1 },
        parentSelector: "main",
        childCount: 0
      }
    });
    const result = await element({ selector: "#receipt-status", includeStyles: false, response_format: "markdown" });
    expect(result.structuredContent).toMatchObject({
      status: "found", found: true, innerText: "Receipt SYNTHETIC-42 is complete", attributes: { id: "receipt-status", role: "status" }
    });
    const { text: _legacyText, ...typedFields } = result.structuredContent;
    expect(JSON.stringify(typedFields)).not.toContain("credential");
    expect(result.structuredContent).not.toHaveProperty("outerHTML");
  });

  it("does not leak the transport marker into legacy JSON element text", async () => {
    const element = collect(registerInspectionTools).get("tabz_get_element")!;
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("socket closed"));
    const result = await element({ selector: "#receipt-status", includeStyles: false, response_format: "json" });
    expect(result.content[0].text).not.toContain("transportError");
    expect(result.structuredContent).toMatchObject({ status: "transport_error", found: false });
  });

  it("reports strict fill verification without weakening missing or false verdicts", async () => {
    const fill = collect(registerInteractionTools).get("tabz_fill")!;
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { success: true, verified: true, sensitive: false, actualValue: "SYNTHETIC-42", actualLength: 12, inputType: "text" } })
      .mockResolvedValueOnce({ data: { success: true, verified: false, sensitive: false, actualValue: "other", actualLength: 5, inputType: "text" } })
      .mockResolvedValueOnce({ data: { success: true, verifyError: "the page navigated before the field could be verified" } });

    const verified = await fill({ selector: "#receipt", value: "SYNTHETIC-42" });
    const mismatch = await fill({ selector: "#receipt", value: "wanted" });
    const missing = await fill({ selector: "#receipt", value: "wanted" });
    expect(verified).toMatchObject({ isError: false, structuredContent: { status: "verified", dispatched: true, verified: true } });
    expect(mismatch).toMatchObject({ isError: true, structuredContent: { status: "mismatch", dispatched: true, verified: false } });
    expect(missing).toMatchObject({ isError: true, structuredContent: { status: "unknown", dispatched: true, verified: null } });
  });

  it("redacts fill values and keeps transport dispatch unknown", async () => {
    const sentinel = "SENTINEL-SECRET-9274";
    const fill = collect(registerInteractionTools).get("tabz_fill")!;
    vi.mocked(axios.post).mockRejectedValueOnce(new Error(`socket closed after sending ${sentinel}`));
    const result = await fill({ selector: "#password", value: sentinel });
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(result.structuredContent).toMatchObject({ status: "unknown", dispatched: null, verified: null });
  });

  it("keeps legacy click post-dispatch uncertainty unknown", async () => {
    const click = collect(registerInteractionTools).get("tabz_click")!;
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { success: false, error: "Click outcome is unknown because the operation could not be verified; inspect before retrying." }
    });
    const result = await click({ selector: "#submit" });
    expect(result).toMatchObject({ isError: true, structuredContent: { status: "unknown", clicked: null } });
  });

  it("keeps compact act structured and transport mutation outcomes unknown", async () => {
    const act = collect(registerActTools).get("tabz_act")!;
    vi.mocked(axios.post).mockRejectedValueOnce(new Error("socket closed"));
    const result = await act({ action: "click", selector: "#submit", trusted: false, direction: "down" });
    expect(result).toMatchObject({ isError: true, structuredContent: { status: "unknown", action: "click", success: null } });
    expect(result.structuredContent.text).toBe(result.content[0].text);
  });

  it("returns the connection group lifecycle as typed data", async () => {
    const status = collect(registerTabGroupTools).get("tabz_claude_group_status")!;
    vi.mocked(axios.get)
      .mockResolvedValueOnce({ data: { success: true, exists: true, groupId: 7, group: { groupId: 7, title: "CLI", color: "blue", collapsed: false }, tabCount: 2, tabIds: [11, 12] } })
      .mockResolvedValueOnce({ data: { success: true, exists: false, groupId: null, tabCount: 0 } });
    const active = await status({ response_format: "markdown" });
    const absent = await status({ response_format: "markdown" });
    expect(active.structuredContent).toMatchObject({ status: "active", exists: true, groupId: 7, tabCount: 2, tabIds: [11, 12] });
    expect(absent.structuredContent).toMatchObject({ status: "not_created", exists: false, groupId: null, tabCount: 0, tabIds: [] });
  });

  it("does not mistake an invalid selector containing not found for a miss", () => {
    expect(readFailureStatus('Invalid selector: [data-label="not found"')).toBe("failed");
  });
});
