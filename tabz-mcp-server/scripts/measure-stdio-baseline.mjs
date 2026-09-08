#!/usr/bin/env node
/**
 * Measure the current stdio MCP catalog against a synthetic local backend.
 * It never connects to Chrome or the user's backend/configuration.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ALL_TOOL_IDS = [
  "tabz_list_tabs", "tabz_switch_tab", "tabz_rename_tab", "tabz_get_page_info", "tabz_click", "tabz_fill", "tabz_screenshot", "tabz_screenshot_full", "tabz_download_image", "tabz_get_element", "tabz_open_url", "tabz_get_console_logs", "tabz_execute_script", "tabz_enable_network_capture", "tabz_get_network_requests", "tabz_clear_network_requests", "tabz_download_file", "tabz_get_downloads", "tabz_cancel_download", "tabz_save_page", "tabz_get_bookmark_tree", "tabz_search_bookmarks", "tabz_save_bookmark", "tabz_create_folder", "tabz_move_bookmark", "tabz_delete_bookmark", "tabz_get_dom_tree", "tabz_profile_performance", "tabz_get_coverage", "tabz_list_groups", "tabz_create_group", "tabz_update_group", "tabz_add_to_group", "tabz_ungroup_tabs", "tabz_claude_group_add", "tabz_claude_group_remove", "tabz_claude_group_status", "tabz_list_windows", "tabz_create_window", "tabz_update_window", "tabz_close_window", "tabz_get_displays", "tabz_tile_windows", "tabz_popout_terminal", "tabz_speak", "tabz_list_voices", "tabz_play_audio", "tabz_history_search", "tabz_history_visits", "tabz_history_recent", "tabz_history_delete_url", "tabz_history_delete_range", "tabz_sessions_recently_closed", "tabz_sessions_restore", "tabz_sessions_devices", "tabz_cookies_get", "tabz_cookies_list", "tabz_cookies_set", "tabz_cookies_delete", "tabz_cookies_audit", "tabz_emulate_device", "tabz_emulate_clear", "tabz_emulate_geolocation", "tabz_emulate_network", "tabz_emulate_media", "tabz_emulate_vision", "tabz_notification_show", "tabz_notification_update", "tabz_notification_clear", "tabz_notification_list", "tabz_list_profiles", "tabz_list_categories", "tabz_spawn_profile", "tabz_get_profile", "tabz_create_profile", "tabz_update_profile", "tabz_delete_profile", "tabz_list_plugins", "tabz_list_skills", "tabz_get_skill", "tabz_plugins_health", "tabz_toggle_plugin", "tabz_list_terminals", "tabz_send_keys", "tabz_capture_terminal", "tabz_docs"
];

function json(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  response.end(text);
}

async function syntheticBackend() {
  const requestCounts = { configuration: 0, read: 0, action: 0, unexpected: 0 };
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/api/mcp-config") {
      requestCounts.configuration++;
      return json(response, 200, { enabledTools: ALL_TOOL_IDS });
    }
    if (url.pathname === "/api/browser/page-info") {
      requestCounts.read++;
      return json(response, 200, { url: "https://example.test/orders", title: "Synthetic orders", tabId: 41 });
    }
    if (url.pathname === "/api/browser/click-element") {
      requestCounts.action++;
      return json(response, 200, { success: true, tagName: "BUTTON" });
    }
    requestCounts.unexpected++;
    return json(response, 404, { error: `Unexpected synthetic request: ${request.method} ${url.pathname}` });
  });
  await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
  const address = server.address();
  return { server, requestCounts, url: `http://127.0.0.1:${address.port}` };
}

async function measure() {
  const fixture = await syntheticBackend();
  const child = spawn(process.execPath, ["dist/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      BACKEND_URL: fixture.url,
      TABZ_AGENT_LABEL: "synthetic-baseline",
      TABZ_TERMINAL_ID: "",
      TMUX: "",
      TMUX_PANE: "",
      MCP_PRESET: ""
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const pending = new Map();
  const stderr = [];
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    const resolvePending = pending.get(message.id);
    if (resolvePending) { pending.delete(message.id); resolvePending(message); }
  });
  createInterface({ input: child.stderr }).on("line", (line) => stderr.push(line));
  let roundTrips = 0;
  const rpc = (id, method, params) => new Promise((resolveRpc, reject) => {
    const request = { jsonrpc: "2.0", id, method, params };
    const timeout = setTimeout(() => reject(new Error(`${method} timed out; stderr: ${stderr.join(" | ")}`)), 10_000);
    pending.set(id, (response) => {
      clearTimeout(timeout);
      roundTrips++;
      if (response.error) return reject(new Error(`${method} RPC error: ${response.error.message || JSON.stringify(response.error)}`));
      resolveRpc({ request, response });
    });
    child.stdin.write(`${JSON.stringify(request)}\n`);
  });
  try {
    const initialize = await rpc(1, "initialize", {
      protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "tabz-baseline-measure", version: "1.0.0" }
    });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
    const listed = await rpc(2, "tools/list", {});
    const page = await rpc(3, "tools/call", { name: "tabz_get_page_info", arguments: { response_format: "json" } });
    const click = await rpc(4, "tools/call", { name: "tabz_click", arguments: { selector: "#submit", tabId: 41 } });
    for (const [name, exchange] of [["page read", page], ["click action", click]]) {
      if (exchange.response.result?.isError) throw new Error(`${name} fixture returned isError`);
    }
    const tools = listed.response.result.tools;
    const stringify = (value) => JSON.stringify(value);
    const transaction = (entry) => ({ requestBytes: Buffer.byteLength(stringify(entry.request)), responseBytes: Buffer.byteLength(stringify(entry.response)), responseChars: stringify(entry.response).length });
    return {
      revision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
      measurementMethod: "Spawned the already-built stdio server with BACKEND_URL pointed to an ephemeral 127.0.0.1 synthetic HTTP fixture; no Chrome, user backend, configuration, or credential store was contacted.",
      configuration: { backendUrl: "ephemeral loopback fixture", enabledToolIds: ALL_TOOL_IDS, enabledToolCount: ALL_TOOL_IDS.length },
      initialize: { instructions: initialize.response.result.instructions || "", ...transaction(initialize) },
      catalog: { publishedToolNames: tools.map((tool) => tool.name).sort(), toolCount: tools.length, schemaBytes: Buffer.byteLength(stringify(tools)), schemaChars: stringify(tools).length, ...transaction(listed) },
      syntheticResults: { pageRead: transaction(page), clickAction: transaction(click) },
      protocolEvidence: {
        initializeResponse: initialize.response,
        toolsListResponse: listed.response,
        syntheticToolCalls: {
          pageRead: { request: page.request, response: page.response },
          clickAction: { request: click.request, response: click.response }
        }
      },
      backendRequests: {
        configuration: fixture.requestCounts.configuration,
        workflowRead: fixture.requestCounts.read,
        workflowAction: fixture.requestCounts.action,
        workflowTotal: fixture.requestCounts.read + fixture.requestCounts.action,
        unexpected: fixture.requestCounts.unexpected
      },
      stdioRoundTrips: roundTrips
    };
  } finally {
    child.kill();
    await new Promise((resolveClose) => fixture.server.close(resolveClose));
  }
}

measure().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
  process.stderr.write(`measure-stdio-baseline: ${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
