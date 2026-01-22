/**
 * Emulation Tools
 *
 * Tools for Chrome DevTools Protocol Emulation domain.
 * Provides device emulation, network throttling, geolocation spoofing,
 * media emulation, and vision deficiency simulation.
 *
 * Note: CDP emulation settings persist while the debugger is attached.
 * The debugger banner will appear in Chrome while emulation is active.
 * Use tabz_emulate_clear to reset all emulation and detach.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Register emulation tools with the MCP server
 */
export declare function registerEmulationTools(server: McpServer): void;
//# sourceMappingURL=emulation.d.ts.map