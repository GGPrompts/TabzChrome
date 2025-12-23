/**
 * Client Module - Backward Compatibility Re-exports
 *
 * This file re-exports all functionality from the modular client/ directory.
 * Existing imports from "./client.js" continue to work unchanged.
 *
 * For new code, consider importing directly from specific modules:
 *   import { listTabs, switchTab } from "./client/core.js"
 *   import { takeScreenshot } from "./client/screenshot.js"
 */

export * from "./client/index.js";
