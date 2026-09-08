# Chrome lifecycle and settings fixes

`tc-1qe.25` adapts the remaining selected Chrome fixes using [current official API evidence](chrome-api-evidence.md), without copying Glass identity or raising the Chrome 116 minimum.

- The toolbar uses Chrome's native side-panel toggle. Existing popup/context-menu opens remain intact.
- MHTML loading installs completion and closure listeners before rechecking tab status. Every success/error/timeout removes listeners and the timer. Ownership, HTTP(S) eligibility and document identity are rechecked around the single capture attempt; previous Blob conversion and download behavior remain.
- Network emulation supplies required top-level `offline` parameters to apply, rollback and clear. Unsupported methods alone trigger the legacy fallback; policy errors remain errors.
- Geolocation clearing is forwarded through REST/WebSocket, and an allowlisted result projection preserves observed permission state. Coordinates do not grant permission. A granted observation is not presented as a tested page location request; missing evidence remains unknown.
- Screenshot settings load without writing defaults, save only explicitly chosen valid values, and report storage errors. Absent settings retain `Downloads/tabz/screenshots` and no connection subfolder. Explicit `outputPath` remains Downloads-relative. Paths reject traversal, nonportable/control characters and reserved names; generated connection segments are bounded and portable.

Required checks passed: background plus settings **43 files / 344 tests**, full backend **24 / 312**, canonical and plugin MCP **23 / 242 each**, and extension TypeScript. Focused settings/path checks passed **2 / 31**. MCP build and source/distribution synchronization passed. Logs are `/tmp/tabz-execute/chrome-fixes-*` and `settings-*`.

The geolocation description added 46 characters; input-schema shape did not change. The final measured artifact and settings estimate were refreshed. Full97 schema/startup text now totals 61,821 characters; page20 remains 19,403. Historical measurements are retained separately.

These are mocked/static checks on the current Linux host, not a live Chrome or platform matrix. Existing MHTML/download limitations remain for `tc-1qe.27`; no runtime reload, user tab, credential store, Windows sync or publication was used.
