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
