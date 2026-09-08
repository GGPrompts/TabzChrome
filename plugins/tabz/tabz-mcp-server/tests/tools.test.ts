/** Behavior tests for the current axios-backed MCP tool implementations. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("axios", () => ({
  default: { get: vi.fn(), post: vi.fn() },
  AxiosError: class MockAxiosError extends Error {}
}));

import axios from "axios";
import { registerConsoleTools } from "../src/tools/console.js";
import { registerPageTools } from "../src/tools/page.js";
import { registerTabTools } from "../src/tools/tabs.js";
import { registerInteractionTools } from "../src/tools/interaction.js";
import { registerInspectionTools } from "../src/tools/inspection.js";
import { registerScreenshotTools } from "../src/tools/screenshot.js";
import { registerCookieTools } from "../src/tools/cookies.js";

type RegisteredTool = { handler: (input: any) => Promise<any> };

function registeredServer(): [McpServer, Map<string, RegisteredTool>] {
  const tools = new Map<string, RegisteredTool>();
  const server = {
    registerTool: vi.fn((name: string, _config: unknown, handler: RegisteredTool["handler"]) => {
      tools.set(name, { handler });
    })
  } as unknown as McpServer;
  return [server, tools];
}

describe("current MCP tool behaviors", () => {
  let tools: Map<string, RegisteredTool>;

  beforeEach(() => {
    vi.clearAllMocks();
    const [server, registered] = registeredServer();
    tools = registered;
    registerConsoleTools(server, "http://localhost:8129");
    registerPageTools(server, "http://localhost:8129");
    registerTabTools(server);
    registerInteractionTools(server);
    registerInspectionTools(server);
    registerScreenshotTools(server);
    registerCookieTools(server);
  });

  it("registers the maintained read, action, screenshot, and cookie tools", () => {
    for (const name of [
      "tabz_get_console_logs", "tabz_get_page_info", "tabz_list_tabs", "tabz_click",
      "tabz_fill", "tabz_get_element", "tabz_screenshot", "tabz_screenshot_full",
      "tabz_download_image", "tabz_cookies_get", "tabz_cookies_list", "tabz_cookies_audit"
    ]) expect(tools.has(name)).toBe(true);
  });

  it("formats a synthetic page read through the backend adapter", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { url: "https://example.test/orders", title: "Synthetic orders", tabId: 41 }
    });
    const result = await tools.get("tabz_get_page_info")!.handler({ response_format: "json" });
    expect(JSON.parse(result.content[0].text)).toMatchObject({ title: "Synthetic orders", tabId: 41 });
    expect(axios.get).toHaveBeenCalledWith(
      "http://localhost:8129/api/browser/page-info",
      expect.objectContaining({ params: { tabId: undefined } })
    );
  });

  it("formats synthetic tabs and forwards an action without Chrome", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { success: true, tabs: [{ tabId: 41, url: "https://example.test", title: "Synthetic", active: true }] }
    });
    const listed = await tools.get("tabz_list_tabs")!.handler({});
    expect(listed.content[0].text).toContain("Synthetic");

    vi.mocked(axios.post).mockResolvedValue({ data: { success: true, tagName: "BUTTON" } });
    const clicked = await tools.get("tabz_click")!.handler({ selector: "#submit", tabId: 41 });
    expect(clicked.isError).toBe(false);
    expect(clicked.content[0].text).toContain("Click Successful");
    expect(axios.post).toHaveBeenCalledWith(
      "http://localhost:8129/api/browser/click-element",
      { selector: "#submit", tabId: 41 },
      expect.any(Object)
    );
  });

  it("returns backend errors as MCP errors", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { success: false, error: "synthetic selector missing" } });
    const result = await tools.get("tabz_fill")!.handler({ selector: "#email", value: "a@example.test" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("synthetic selector missing");
  });

  it("accepts only an explicitly verified fill as successful", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {
      success: true, verified: true, sensitive: false, actualLength: 6, actualValue: "Denver"
    } });
    const verified = await tools.get("tabz_fill")!.handler({ selector: "#city", value: "Denver" });
    expect(verified.isError).toBe(false);
    expect(verified.content[0].text).toContain('"Denver"');

    vi.mocked(axios.post).mockResolvedValueOnce({ data: {
      success: true, verified: false, sensitive: false, actualLength: 19, actualValue: "UNCONFIRMED-READBACK"
    } });
    const mismatch = await tools.get("tabz_fill")!.handler({ selector: "#zip", value: "requested" });
    expect(mismatch.isError).toBe(true);
    expect(mismatch.content[0].text).toContain("FAILED verification");
    expect(JSON.stringify(mismatch)).not.toContain("UNCONFIRMED-READBACK");

    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true } });
    const missing = await tools.get("tabz_fill")!.handler({ selector: "#legacy", value: "value" });
    expect(missing.isError).toBe(true);
    expect(missing.content[0].text).toContain("UNVERIFIED");
  });

  it("forwards and verifies boolean checkbox values without string coercion", async () => {
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {
      success: true, verified: true, sensitive: false, actualValue: true
    } });
    const result = await tools.get("tabz_fill")!.handler({ selector: "#agree", value: true, tabId: 41 });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain("**Value:** true");
    expect(axios.post).toHaveBeenCalledWith(
      "http://localhost:8129/api/browser/fill-input",
      { selector: "#agree", value: true, tabId: 41 },
      expect.any(Object)
    );
  });

  it("does not echo a verified read-back without explicit ordinary-field metadata", async () => {
    const value = "SENTINEL-UNKNOWN-SENSITIVITY";
    vi.mocked(axios.post).mockResolvedValueOnce({ data: {
      success: true, verified: true, actualLength: value.length, actualValue: value
    } });
    const result = await tools.get("tabz_fill")!.handler({ selector: "#unknown", value });
    expect(JSON.stringify(result)).not.toContain(value);
    expect(result.content[0].text).toContain("[redacted]");
  });

  it("redacts sensitive fill values and matching error text", async () => {
    const value = "SENTINEL-FILL-SECRET";
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { success: true, tagName: "input", inputType: "password", sensitive: true, verified: true, actualLength: value.length }
    });
    const filled = await tools.get("tabz_fill")!.handler({ selector: "#password", value });
    expect(filled.content[0].text).toContain("[redacted]");
    expect(JSON.stringify(filled)).not.toContain(value);

    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: false, error: `Rejected ${value}` } });
    const failed = await tools.get("tabz_fill")!.handler({ selector: "#password", value });
    expect(failed.content[0].text).toContain("Rejected [redacted]");
    expect(JSON.stringify(failed)).not.toContain(value);
  });

  it("redacts auth cookie values while retaining useful metadata", async () => {
    const value = "synthetic-secret-value";
    vi.mocked(axios.post).mockResolvedValue({ data: {
      success: true,
      cookie: { name: "__Secure-session", value, domain: "example.test", path: "/", secure: true, httpOnly: true }
    } });
    const result = await tools.get("tabz_cookies_get")!.handler({
      url: "https://example.test", name: "__Secure-session"
    });
    expect(result.content[0].text).toContain("[redacted]");
    expect(result.content[0].text).not.toContain(value);
    expect(result.content[0].text).toContain("example.test");
  });

  it("never emits cookie values from list, audit, or set results", async () => {
    const value = "SENTINEL-COOKIE-SECRET";
    const cookie = { name: "preference", value, domain: "example.test", path: "/", secure: true, httpOnly: false, sameSite: "lax", session: false };
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true, cookies: [cookie] } });
    const listed = await tools.get("tabz_cookies_list")!.handler({ response_format: "json" });
    expect(JSON.stringify(listed)).not.toContain(value);
    expect(JSON.parse(listed.content[0].text).cookies[0].value).toBeUndefined();

    vi.mocked(axios.post).mockResolvedValueOnce({ data: {
      success: true, url: "https://example.test", domain: "example.test", cookies: [cookie],
      firstParty: [cookie], thirdParty: [], sessionCookies: [], persistentCookies: [cookie]
    } });
    const audited = await tools.get("tabz_cookies_audit")!.handler({ response_format: "json" });
    expect(JSON.stringify(audited)).not.toContain(value);

    vi.mocked(axios.post).mockResolvedValueOnce({ data: { success: true, cookie } });
    const set = await tools.get("tabz_cookies_set")!.handler({ url: "https://example.test", name: cookie.name, value });
    expect(JSON.stringify(set)).not.toContain(value);
    expect(set.content[0].text).toContain(`${value.length} chars`);
  });
});
