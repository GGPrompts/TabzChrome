/**
 * Shared types for Browser MCP Server
 */

export type ConsoleLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export interface ConsoleLogEntry {
  level: ConsoleLogLevel;
  message: string;
  timestamp: number;
  url: string;
  tabId: number;
  stack?: string;
}

export interface ConsoleLogsResponse {
  logs: ConsoleLogEntry[];
  total: number;
}

export interface ScriptResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface PageInfo {
  url: string;
  title: string;
  tabId: number;
  favIconUrl?: string;
  error?: string;
}

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

// Network monitoring types
export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  timestamp: number;
  tabId: number;

  // Request details
  requestHeaders?: Record<string, string>;
  postData?: string;

  // Response details (filled when response received)
  status?: number;
  statusText?: string;
  responseHeaders?: Record<string, string>;
  mimeType?: string;

  // Timing (filled when loading finished)
  responseTime?: number;  // Duration in ms
  encodedDataLength?: number;

  // Response body (filled on demand)
  responseBody?: string;
  responseBodyTruncated?: boolean;
}

export interface NetworkRequestsResponse {
  requests: NetworkRequest[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
  captureActive: boolean;
}

export interface NetworkResponseResult {
  success: boolean;
  request?: NetworkRequest;
  error?: string;
}
