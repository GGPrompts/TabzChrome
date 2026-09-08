# Gate 5: modern browser tools and observations

`tc-1qe.19` integrates compact actions/reads/batches, screenshots and observation, console/network capture, protected document boundaries and background prompt notifications. Scoped evidence is in `compact-tools-verification.md`, `capture-verification.md` and `permission-notifications-verification.md`.

Integration repaired the server's deep-capture whitelist, which had lagged behind the settings catalog. Actual factory/preset `tools/list` now verifies that those tools are published. The legacy registration test compares its result with the complete current whitelist instead of a stale count.

| Check | Result |
| --- | --- |
| Full extension/root suite | 79 files / 1,299 tests passed |
| Full backend suite | 24 files / 310 tests passed |
| Canonical and plugin MCP suites | 19 files / 173 tests passed in each copy |
| Extension TypeScript | Passed, including `/rebuild` compilation |
| `/rebuild`: extension build | Passed |
| `/rebuild`: canonical MCP build and plugin copy | Passed |
| Canonical/plugin sync | 39 source / 196 distribution files and package metadata match |
| Action enum / worktree catalog | Current; 97 tools |
| Packaged console bridge | MAIN IIFE parses without imports; manifest scripts exist and early all-frame relay is present |
| Identity / whitespace | Extension name and key preserved; diff-check passed |

The build reports its existing large-chunk advisory for dashboard/3D bundles. No threshold was changed. Logs are under `/tmp/tabz-execute/gate5-*`.

The new isolated pre-description-pass artifact records the actual built full catalog (97 tools, 81,742 schema characters/UTF-8 bytes) and page-agent preset (23 tools, 23,885 schema characters/bytes), each with 1,168 characters of initialize instructions. `mcp-before-description-pass.json` includes full protocol responses and hashes. This is a new comparison point for `.20`; the original 86-tool/66,951-character baseline stays frozen. Token figures are explicitly `ceil(chars/4)` estimates.

These are automated fixtures and local packaging checks. Loaded Chrome, native input, real download geometry and notification timing remain pending human acceptance. Windows folder synchronization, extension reload, backend restart and publication were not performed.
