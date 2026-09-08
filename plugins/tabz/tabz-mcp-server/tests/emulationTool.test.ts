import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

vi.mock("axios", () => ({
  default: { post: vi.fn() },
  AxiosError: class MockAxiosError extends Error {}
}));

import axios from "axios";
import { registerEmulationTools } from "../src/tools/emulation.js";

type ToolHandler = (input: Record<string, unknown>) => Promise<any>;

function registerTools(): Map<string, ToolHandler> {
  const tools = new Map<string, ToolHandler>();
  const server = {
    registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
      tools.set(name, handler);
    })
  } as unknown as McpServer;
  registerEmulationTools(server);
  return tools;
}

describe("geolocation emulation MCP result", () => {
  let handler: ToolHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = registerTools().get("tabz_emulate_geolocation")!;
  });

  it("forwards clear and reports only the clear outcome", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { success: true, message: "Geolocation override cleared" }
    });

    const result = await handler({ clear: true, tabId: 41, response_format: "markdown" });

    expect(axios.post).toHaveBeenCalledWith(
      "http://localhost:8129/api/browser/emulate/geolocation",
      { tabId: 41, latitude: undefined, longitude: undefined, accuracy: undefined, clear: true },
      { timeout: 15000 }
    );
    expect(result.content[0].text).toContain("Geolocation Override Cleared");
    expect(result.content[0].text).not.toContain("Location permission");
  });

  it("shows the observed permission without claiming an override granted it", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        success: true,
        latitude: 39.7392,
        longitude: -104.9903,
        accuracy: 20,
        permissionGranted: false,
        permissionState: "prompt",
        permissionNote: "Location is NOT granted; grant it yourself in Chrome."
      }
    });

    const result = await handler({
      latitude: 39.7392,
      longitude: -104.9903,
      accuracy: 20,
      response_format: "markdown"
    });

    expect(result.content[0].text).toContain("Site Permission Not Granted");
    expect(result.content[0].text).toContain("**Location permission:** prompt");
    expect(result.content[0].text).toContain("grant it yourself in Chrome");
    expect(result.content[0].text).not.toContain("permission granted by");
  });

  it("preserves permission evidence in JSON output", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        success: true,
        latitude: 1,
        longitude: 2,
        accuracy: 100,
        permissionGranted: true,
        permissionState: "granted",
        permissionNote: "Location is already granted."
      }
    });

    const result = await handler({
      latitude: 1,
      longitude: 2,
      response_format: "json"
    });

    expect(JSON.parse(result.content[0].text)).toMatchObject({
      permissionGranted: true,
      permissionState: "granted",
      permissionNote: "Location is already granted."
    });
  });

  it("treats a missing permission observation as unknown", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { success: true, latitude: 1, longitude: 2, accuracy: 100 }
    });

    const result = await handler({
      latitude: 1,
      longitude: 2,
      response_format: "markdown"
    });

    expect(result.content[0].text).toContain("Site Permission Unknown");
    expect(result.content[0].text).toContain("not confirmed");
    expect(result.content[0].text).not.toContain("# Geolocation Override Active");
  });
});
