/**
 * Shared types for Browser MCP Server
 */

export type ConsoleLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export type ConsoleLogOrigin = 'page' | 'unknown' | `extension:${string}`;

export interface ConsoleLogEntry {
  source?: 'page' | 'extension';
  origin?: ConsoleLogOrigin;
  count?: number;
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
  error?: string;
}

export interface ScriptResult {
  success: boolean;
  result?: unknown;
  executionPath?: 'debugger' | 'whitelist-fallback' | 'whitelist-all-frames';
  resultTruncated?: true;
  warning?: string;
  timedOut?: true;
  uncertain?: true;
  terminationAttempted?: true;
  terminationAcknowledged?: boolean;
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

  // Set on a request that answered with a redirect: where it went, and
  // which hop of the chain this record is (the live record has no hop).
  redirectedTo?: string;
  redirectHop?: number;

  // Capture layer and deep-capture summary fields. Response payloads remain
  // behind tabz_get_response_body so request lists stay bounded.
  source?: 'webrequest' | 'deep' | 'both';
  deep?: boolean;
  webRequestId?: string;
  bodyAvailable?: boolean;
  base64Encoded?: boolean;
  responseBodyByteLength?: number;
  bodyRedacted?: boolean;
  streamCapture?: 'eventsource' | 'data-received-final-body';
  streamMessageCount?: number;
  droppedStreamMessages?: number;
  dataReceivedChunkCount?: number;
  dataReceivedBytes?: number;
  webSocketFrameCount?: number;
  webSocketFramesSent?: number;
  webSocketFramesReceived?: number;
  droppedWebSocketFrames?: number;
  webSocketClosed?: boolean;
}

export interface NetworkRequestsResponse {
  requests: NetworkRequest[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
  captureActive: boolean;
  webRequestCaptureActive?: boolean;
  deepCaptureActive?: boolean;
  error?: string;
}

export interface NetworkResponseBodyPage {
  success: boolean;
  requestId: string;
  tabId?: number;
  kind?: 'body' | 'event-stream' | 'websocket';
  text?: string;
  base64Encoded?: boolean;
  truncated?: boolean;
  redacted?: boolean;
  streamCapture?: 'eventsource' | 'data-received-final-body';
  offset: number;
  length: number;
  totalLength: number;
  hasMore: boolean;
  nextOffset?: number;
  dropped?: number;
  error?: string;
}

// Download types
export type DownloadState = 'in_progress' | 'complete' | 'interrupted';
export type ConflictAction = 'uniquify' | 'overwrite' | 'prompt';

export interface DownloadItem {
  id: number;
  url: string;
  filename: string;
  state: DownloadState;
  bytesReceived: number;
  totalBytes: number;
  startTime: string;
  endTime?: string;
  error?: string;
  mime?: string;
  // Dual paths for WSL compatibility
  windowsPath?: string;
  wslPath?: string;
}

export interface DownloadResult {
  success: boolean;
  downloadId?: number;
  filename?: string;
  windowsPath?: string;
  wslPath?: string;
  fileSize?: number;
  error?: string;
}

export interface DownloadListResponse {
  downloads: DownloadItem[];
  total: number;
}

export interface CancelDownloadResult {
  success: boolean;
  error?: string;
}

// Bookmark types
export interface BookmarkNode {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  index?: number;
  dateAdded?: number;
  children?: BookmarkNode[];
}

export interface BookmarkTreeResult {
  success: boolean;
  tree?: BookmarkNode[];
  error?: string;
}

export interface BookmarkSearchResult {
  success: boolean;
  bookmarks?: BookmarkNode[];
  error?: string;
}

export interface BookmarkCreateResult {
  success: boolean;
  bookmark?: BookmarkNode;
  error?: string;
}

export interface BookmarkFolderResult {
  success: boolean;
  folder?: BookmarkNode;
  error?: string;
}

export interface BookmarkMoveResult {
  success: boolean;
  bookmark?: BookmarkNode;
  error?: string;
}

export interface BookmarkDeleteResult {
  success: boolean;
  error?: string;
}

// Page capture types
export interface SavePageResult {
  success: boolean;
  filename?: string;
  windowsPath?: string;
  wslPath?: string;
  fileSize?: number;
  mimeType?: string;
  error?: string;
}

// Debugger types (DOM Tree, Performance, Coverage)

export interface SimplifiedDOMNode {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  children?: SimplifiedDOMNode[];
  childCount?: number;
}

export interface DOMTreeResult {
  success: boolean;
  tree?: SimplifiedDOMNode;
  nodeCount?: number;
  error?: string;
}

export interface PerformanceMetrics {
  timing: Record<string, number>;      // Timing metrics in ms
  memory: Record<string, number>;      // Memory metrics in MB
  dom: Record<string, number>;         // DOM node counts
  other: Record<string, number>;       // Other metrics
  rawMetrics: Array<{ name: string; value: number }>;
}

export interface PerformanceResult {
  success: boolean;
  timing?: Record<string, number>;
  memory?: Record<string, number>;
  dom?: Record<string, number>;
  other?: Record<string, number>;
  rawMetrics?: Array<{ name: string; value: number }>;
  error?: string;
}

export interface FileCoverage {
  url: string;
  usedBytes: number;
  totalBytes: number;
  usedPercent: number;
  unusedRanges?: number;  // JS only
}

export interface CoverageSummary {
  files: number;
  totalBytes: number;
  usedBytes: number;
  usedPercent: number;
}

export interface CoverageResult {
  success: boolean;
  coverage?: {
    js?: FileCoverage[];
    css?: FileCoverage[];
  };
  summary?: {
    js?: CoverageSummary;
    css?: CoverageSummary;
  };
  error?: string;
}
