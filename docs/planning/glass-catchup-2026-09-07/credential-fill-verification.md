# Protected credential fill verification

`tc-1qe.14` passed scoped verification on 2026-09-07.

| Check | Result |
| --- | --- |
| Required trusted-fill, host, select and verification suites | 4 files / 21 tests passed |
| Required backend secret and result-forwarding suites | 2 files / 31 tests passed |
| Required MCP secret and guidance suites | 2 files / 39 tests passed |
| Background integration | 22 files / 165 tests passed |
| Parent capture boundary and real-core integration | 3 files / 19 tests passed |
| Final manual handoff extension / backend suites | 12 / 6 tests passed |
| Worker MCP handoff, secret, guidance and compatibility suites | 5 files / 74 tests passed in each copy |
| Extension and canonical/plugin MCP TypeScript | Passed |
| Scoped source parity and whitespace | Passed |

Parent logs: `/tmp/tabz-execute/credential-fill-final.log`, `credential-fill-backend-final.log`, `credential-fill-mcp-final.log`, and `credential-capture-parent.log`. Full suites and rebuilt artifacts belong to Gate 4.

Saved fill verifies the responding extension capability, actual tab and host before store access. Synthetic mutations use exact Chrome document identities. Protected outcomes expose booleans and fixed failures, never stored values, readback, lengths or page errors. Trusted input permanently protects the entire tab until close because CDP typing cannot bind to an exact document. An uncertain outcome must not be replayed automatically.

The persisted document boundary covers script, DOM, screenshots, coverage, exports, metadata, console and network capture. Admission is serialized separately from debugger access; navigation epochs, frame membership and final checks reject stale reads. Protection prunes buffered capture and historical document IDs remain protected across restoration. Manual handoffs reserve protection before focus/notification, across redirects and pending responses, and retire that reservation only after final-document protection. Relative deadlines prevent a queued late completion from clearing protection.

All verification used synthetic stores, mocked Chrome and test-owned servers. Loaded Chrome, BFCache, real keyboard behavior and platform acceptance remain pending in `loaded-chrome-acceptance.md`. No actual credentials, browser actions, reload, Windows sync, commit or push were used. The store remains plaintext with private filesystem permissions; unrestricted same-user shell/filesystem access is outside this boundary. Native Windows storage is unsupported. Capture may drop early events until a current frame tree is verified; issue `.17` tracks lifecycle-safe refresh and diagnostics coverage.
