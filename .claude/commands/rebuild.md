---
description: Build TabzChrome and MCP, verify plugin parity, and safely sync the Windows extension copy
---

This is the shared rebuild runbook for Codex and Claude. Run from the repository:

```bash
bash scripts/rebuild.sh
```

The script builds the extension and MCP server, copies MCP directory contents to
the repository's plugin copy, and verifies source/distribution/package parity.
It does not update installed plugin caches outside this repository.

On WSL with `/mnt/c`, it resolves the Windows Desktop through PowerShell, then
`cmd.exe`, with System32 fallbacks when interop executables are missing from PATH.
The default load folder is `Desktop/TabzChrome/dist-extension`. Verify that this
is the folder Chrome actually loads before syncing. To select another folder:

```bash
export TABZ_WIN_PATH="/mnt/c/Users/YourUsername/path/to/TabzChrome/dist-extension"
bash scripts/rebuild.sh
```

**Compatibility:** `TABZ_WIN_PATH` remains the exact extension load folder,
not its parent. No Glass launcher, chat variant, identity, or 8130 default is copied.

Every build/copy/sync result is checked explicitly; do not replace those checks
with a bare `set -e`. Windows sync refuses an unresolved, relative, root or
overlapping destination, an incomplete build, and a nonempty destination without
a matching extension manifest. It prints the directory actually written. A path
resolution failure must never flow into `rsync --delete`.

For a local build when Windows synchronization is outside the requested scope:

```bash
bash scripts/rebuild.sh --local-only
```

Native Linux and macOS skip Windows sync and load `dist-extension/` from the repo.

Report these outcomes separately:

1. Local extension/MCP builds and plugin parity.
2. Windows sync, including its actual destination, or why it was skipped.
3. Backend restart: separate action using `./scripts/dev.sh` or `cd backend && npm start`.
4. Chrome reload: the user reloads the intended copy at `chrome://extensions`.

A build or sync does not prove a running backend or Chrome loaded the changes.
Tabz's HTTP MCP endpoint is `http://localhost:8129/mcp`; after a backend restart,
clients may need to reconnect their expired sessions. Stdio hosts need to restart
their MCP process. Do not claim every open session refreshes automatically.
