#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BACKEND_URL } from "./shared.js";
import { ALL_TOOL_IDS, createTabzServer } from "./server.js";
async function main() {
    const { server, enabledTools } = await createTabzServer();
    await server.connect(new StdioServerTransport());
    console.error("Tabz MCP server running via stdio");
    console.error(`Backend URL: ${BACKEND_URL}`);
    console.error(`Enabled tools: ${enabledTools.size} of ${ALL_TOOL_IDS.length}`);
}
main().catch(error => {
    console.error("Server error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map