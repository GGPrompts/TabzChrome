# Codex Code Review Report — 2025-12-15

Project: `TabzChrome`

## What’s Working Well

- Clear product vision + unusually thorough docs (`README.md`, `docs/`, `PLAN.md`); makes the project easy to understand and operate.
- Backend reliability work is thoughtful: global crash guards, spawn dedupe window, and WS auth token design (`backend/server.js:93`, `backend/server.js:500`).
- Extension-to-backend plumbing is solid: background fetches the WS token then connects (`extension/background/background.ts:846`), and the sidepanel architecture is cleanly hook-driven (`extension/sidepanel/sidepanel.tsx:1`).

## High-Priority: Security/Privacy

- Backend appears to bind on all interfaces by default (`server.listen(PORT)` with no host in `backend/server.js:1283`). For a tool that can spawn shells + read files, default should be loopback-only (127.0.0.1).
- `app.use(cors())` is fully open (`backend/server.js:128`), and many powerful endpoints don’t appear to require auth (notably `backend/routes/api.js`, `backend/routes/browser.js:111`, `backend/routes/files.js:118`). As written, any website can potentially:
  - Call browser automation endpoints (e.g. `POST /api/browser/execute-script`) and drive the extension (`backend/routes/browser.js:111`).
  - Read arbitrary local files via `/api/files/read` unless `RESTRICT_TO_HOME=true` is set (`backend/routes/files.js:118`).
  - Fetch the WS token via `/api/auth/token` (`backend/server.js:136`) and then connect/auth to WS (`backend/server.js:505`).
  Recommendation: treat localhost as an attack surface—add a single auth middleware (token/header + Origin checks) and apply it broadly, plus restrict CORS to an explicit allowlist (extension origin + trusted local pages).
- External page → extension messaging can spawn terminals without an additional shared secret/consent flow (`extension/background/background.ts:1759`). If any allowed origin is compromised, it becomes “remote command execution by webpage.” Recommendation: require a per-install secret (stored in `chrome.storage`) and/or a user confirmation gate.

## Extension Recommendations

- Permission minimization: `debugger` and `webRequest` are declared but don’t appear used in code (`extension/manifest.json:6`, and no `chrome.debugger`/`chrome.webRequest` references found). Dropping unused permissions materially improves trust/reviewability.
- Content script sends functions in messages (`action: () => { ... }`), which won’t survive structured cloning (`extension/content/content.ts:45`). If this feature “works”, it’s probably not using `action`; if it doesn’t, this is a bug to clean up.
- CSP sandbox includes `'unsafe-eval'`/`'unsafe-inline'` (`extension/manifest.json:34`). If you can remove those, it’s a meaningful hardening win (even if only for sandboxed pages).

## DevEx / Maintainability

- Test config mismatch: `vitest.config.ts` targets a `src/` tree that doesn’t seem to exist in this repo layout (`vitest.config.ts:9`, `vitest.config.ts:32`). Recommendation: align aliases/coverage globs to `extension/` (or move shared logic into a testable `src/`), otherwise coverage signals will be misleading.
- `extension/background/background.ts` is doing a lot (WS, downloads, MCP handlers, external messaging). Splitting into modules (ws client, mcp handlers, downloads, message routing) would pay off quickly in readability and safer change-making.

