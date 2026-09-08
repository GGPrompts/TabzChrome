import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type TabzExitCode = 1 | 2 | 3 | 4;

export class TabzClientError extends Error {
  constructor(
    message: string,
    readonly exitCode: TabzExitCode,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class TabzToolError extends TabzClientError {
  constructor(
    message: string,
    readonly result: CallToolResult
  ) {
    super(message, 1);
  }
}

export class TabzUsageError extends TabzClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 2, options);
  }
}

export class TabzTransportError extends TabzClientError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 3, options);
  }
}

export class TabzUncertainMutationError extends TabzClientError {
  constructor(
    message: string,
    readonly toolName: string,
    options?: ErrorOptions
  ) {
    super(message, 4, options);
  }
}
