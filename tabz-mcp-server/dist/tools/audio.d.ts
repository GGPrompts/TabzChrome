/**
 * Audio Tools
 *
 * Tools for text-to-speech announcements through the browser.
 * Uses edge-tts neural voices via the TabzChrome backend.
 *
 * The extension automatically applies user-configured audio settings
 * (voice, rate, pitch, volume) from Chrome storage, so Claude doesn't
 * need to specify these unless overriding for a specific purpose.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
/**
 * Register audio tools with the MCP server
 */
export declare function registerAudioTools(server: McpServer): void;
//# sourceMappingURL=audio.d.ts.map