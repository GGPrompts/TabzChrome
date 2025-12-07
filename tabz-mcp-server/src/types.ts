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
