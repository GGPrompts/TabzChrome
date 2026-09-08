import { describe, expect, it } from "vitest";
import {
  formatNetworkRequestsMarkdown,
  formatResponseBodyMarkdown,
  type GetNetworkRequestsInput,
} from "../src/tools/network.js";
import {
  ResponseFormat,
  type NetworkRequest,
  type NetworkRequestsResponse,
  type NetworkResponseBodyPage
} from "../src/types.js";

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

const DEFAULT_PARAMS: GetNetworkRequestsInput = {
  method: "all",
  resourceType: "all",
  source: "both",
  limit: 50,
  offset: 0,
  response_format: ResponseFormat.MARKDOWN,
};

describe("formatNetworkRequestsMarkdown", () => {
  it("renders every counted row across all five sections, including status 0 and pending", () => {
    const requests: NetworkRequest[] = [
      req({ requestId: "a", status: undefined }),
      req({ requestId: "b", status: 0, statusText: "net::ERR_BLOCKED_BY_CLIENT" }),
      req({ requestId: "c", status: 200 }),
      req({ requestId: "d", status: 302, redirectedTo: "https://example.com/next", redirectHop: 1 }),
      req({ requestId: "e", status: 404 }),
      req({ requestId: "f", status: 500 }),
    ];

    const response: NetworkRequestsResponse = {
      requests,
      total: requests.length,
      hasMore: false,
      captureActive: true,
    };

    const markdown = formatNetworkRequestsMarkdown(response, DEFAULT_PARAMS);

    expect(markdown).toContain("**Found:** 6 requests");
    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      expect(markdown).toContain(`\`${id}\``);
    }
    expect(markdown).toContain("Pending / Failed (2)");
    expect(markdown).toContain("Errors (2)");
    expect(markdown).toContain("Successful (1)");
    expect(markdown).toContain("Redirects (1)");
  });

  it("renders redirectedTo and redirectHop when present", () => {
    const requests: NetworkRequest[] = [
      req({ requestId: "r1", status: 302, redirectedTo: "https://example.com/final" }),
      req({ requestId: "r1:r1", status: 302, redirectedTo: "https://example.com/hop2", redirectHop: 1 }),
    ];

    const response: NetworkRequestsResponse = {
      requests,
      total: requests.length,
      hasMore: false,
      captureActive: true,
    };

    const markdown = formatNetworkRequestsMarkdown(response, DEFAULT_PARAMS);

    expect(markdown).toContain("**Redirected To:** https://example.com/final");
    expect(markdown).toContain("**Redirected To:** https://example.com/hop2");
    expect(markdown).toContain("**Redirect Hop:** 1");
  });

  it("shows the failed status as 'failed' rather than the raw 0", () => {
    const requests: NetworkRequest[] = [req({ requestId: "z", status: 0, statusText: "net::ERR_FAILED" })];
    const response: NetworkRequestsResponse = {
      requests,
      total: 1,
      hasMore: false,
      captureActive: true,
    };

    const markdown = formatNetworkRequestsMarkdown(response, DEFAULT_PARAMS);
    expect(markdown).toContain("**Status:** failed net::ERR_FAILED");
  });
});

describe("formatResponseBodyMarkdown", () => {
  it("renders stream path, pagination, and continuation details", () => {
    const response: NetworkResponseBodyPage = {
      success: true,
      requestId: "deep-1",
      tabId: 7,
      kind: "event-stream",
      text: '{"event":"message","data":"hello"}',
      streamCapture: "eventsource",
      offset: 0,
      length: 34,
      totalLength: 100,
      hasMore: true,
      nextOffset: 34,
      dropped: 2
    };

    const markdown = formatResponseBodyMarkdown(response);
    expect(markdown).toContain("# Event Stream Messages");
    expect(markdown).toContain("eventsource");
    expect(markdown).toContain("Dropped Entries:** 2");
    expect(markdown).toContain("offset: 34");
  });

  it("renders an unavailable body as an error", () => {
    const response: NetworkResponseBodyPage = {
      success: false,
      requestId: "missing",
      offset: 0,
      length: 0,
      totalLength: 0,
      hasMore: false,
      error: "not found"
    };
    expect(formatResponseBodyMarkdown(response)).toContain("**Error:** not found");
  });
});
