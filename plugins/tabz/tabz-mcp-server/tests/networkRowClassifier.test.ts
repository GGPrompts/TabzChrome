import { describe, expect, it } from "vitest";
import { classifyNetworkRequestRow } from "../src/tools/network.js";
import type { NetworkRequest } from "../src/types.js";

function req(overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    requestId: "1",
    url: "https://example.com/api",
    method: "GET",
    resourceType: "XHR",
    timestamp: Date.now(),
    tabId: 1,
    ...overrides,
  };
}

describe("classifyNetworkRequestRow", () => {
  it("classifies a request with no status yet as pending", () => {
    expect(classifyNetworkRequestRow(req({ status: undefined }))).toBe("pending");
  });

  it("classifies status 0 (blocked/aborted) as failed, not dropped by a truthy check", () => {
    expect(classifyNetworkRequestRow(req({ status: 0 }))).toBe("failed");
  });

  it("classifies 2xx as success", () => {
    expect(classifyNetworkRequestRow(req({ status: 200 }))).toBe("success");
    expect(classifyNetworkRequestRow(req({ status: 299 }))).toBe("success");
  });

  it("classifies 3xx as redirect", () => {
    expect(classifyNetworkRequestRow(req({ status: 301 }))).toBe("redirect");
    expect(classifyNetworkRequestRow(req({ status: 399 }))).toBe("redirect");
  });

  it("classifies 4xx and 5xx as error", () => {
    expect(classifyNetworkRequestRow(req({ status: 404 }))).toBe("error");
    expect(classifyNetworkRequestRow(req({ status: 500 }))).toBe("error");
  });

  it("every row lands in exactly one of the five rendered categories", () => {
    const rows = [
      req({ status: undefined }),
      req({ status: 0 }),
      req({ status: 200 }),
      req({ status: 302, redirectedTo: "https://example.com/next" }),
      req({ status: 404 }),
      req({ status: 503 }),
    ];
    const categories = rows.map(classifyNetworkRequestRow);
    expect(categories).toEqual(["pending", "failed", "success", "redirect", "error", "error"]);
  });
});
