# Configure the local extension connection

The backend uses `TABZ_EXTENSION_IDS` to recognize the TabzChrome extension. Unpacked installations can have different IDs; the repository does not impose a new manifest key.

1. Open `chrome://extensions` and copy the ID shown for your TabzChrome installation.
2. Set `TABZ_EXTENSION_IDS` to that ID in the environment used to start the backend. Multiple IDs can be separated with commas.
3. Start the backend through the normal development workflow, then reload TabzChrome.

For example, replace the placeholder before running:

```bash
export TABZ_EXTENSION_IDS="YOUR_TABZCHROME_EXTENSION_ID"
./scripts/dev.sh
```

A valid ID has 32 letters from `a` through `p`. An unset or invalid list does not trust arbitrary installed extensions. No-origin local tools continue to use the local API; arbitrary web pages and unconfigured extensions cannot fetch the authentication token or upgrade a WebSocket connection. A page served on another localhost port is a separate origin.

This separates browser pages and extensions. It does not isolate the backend from programs running as the same operating-system user: those programs can set HTTP headers and access that user's files. Saved-login protections and browser acceptance have their own checks; configuring an extension ID does not establish those results.

## MCP connection identity

Each stdio MCP process sends a stable caller identity with its browser requests. It uses `TABZ_AGENT_LABEL` when supplied, otherwise `TABZ_TERMINAL_ID`, otherwise the tmux session and pane, and finally a random process ID. Give independent callers distinct labels. Reusing a label intentionally reconnects to that caller's group; labels are coordination identifiers, not authentication secrets.

New connections establish their group with `tabz_open_url`. Tab lists and implicit targets stay within that group, and explicit targets cannot name another caller's grouped tab. `tabz_close_tab` closes owned tabs; `POST /api/browser/claude-group/release` with the caller's `agent` ungroups its tabs without closing them. Console entries retain their capture-time owner when tabs move.

## Local HTTP MCP transport

After `/rebuild` and a normal backend restart, non-browser MCP clients can connect to `http://localhost:8129/mcp`. The endpoint requires both a loopback TCP peer and a strictly parsed loopback Host, and refuses every request containing an Origin header. Browser pages use their existing dashboard APIs.

Each initialized HTTP session gets its own server, identity, backend context, tab target and custom names. `X-Tabz-Agent` chooses a stable group identity; omit it for a unique session identity. Reusing a label intentionally shares group ownership, including release on session cleanup. The reserved `__default__` label is rejected.

Use `/mcp/<preset>` or `X-Tabz-Preset` to select tools when initializing. The route wins over the header. Bare `/mcp` uses the saved MCP configuration and ignores the backend process's `MCP_PRESET`; an unknown preset exposes only Core. Existing sessions retain their original tool set until reinitialized.

Explicit session deletion, idle expiry after 30 minutes, and backend shutdown attempt to release owned groups without closing tabs. Dropping an HTTP connection does not imply that an operation was cancelled. Cleanup is bounded; an unavailable extension can prevent immediate group release, which is reported in backend lifecycle diagnostics. A missing MCP build returns a JSON-RPC 503 with `/rebuild` guidance.

## Tool presets and configuration upgrades

Built-in presets cover page automation (`page-agent`), broader browser QA (`browser-qa`), Chrome management (`chrome-ops`), and Tabz terminals, profiles, plugins and audio (`tabz-ops`). Saved custom and profile presets remain supported. A preset advertises only tools present in the catalog; unavailable names never add capabilities.

The shared preset definitions and generated `extension/shared/mcpToolCatalog.json` keep Settings and backend selection aligned. After changing `extension/shared/mcpTools.ts`, run `npm run generate:mcp-catalog` and `npm run check:mcp-catalog`. The direct generator's `--check` mode verifies committed HEAD; `--check-worktree` checks local edits before a commit.
