# Catch-up baseline evidence

Baseline revision: `ec502b143ad1db211a49c7015549a4f66d586950`, branch `feat/glass-catchup`.
Source reference: Glass `b912abf24cee803d7fa78d994416985eff9d37fd`.

`initial-worktree.json` records SHA-256 hashes of all 28 pre-existing modified tracked files and the three initial planning artifacts. All matched after the initial root harness repairs. Work proceeds in the existing checkout with disjoint worker scopes, retaining the existing edits in place. No additional worktree was opened. Beads is authoritative for execution state.

## Initial observations

- Root `npm test -- --run`: 32 files, 946 tests passed. Tests currently use relative imports, so the obsolete `@` alias pointing at nonexistent `src` did not cause a baseline failure. The alias and coverage paths now point at `extension`; all 946 tests still pass.
- Extension `tsc --noEmit --project tsconfig.extension.json`: passed before repairs.
- Backend baseline tests launched actual PTYs. That run was interrupted; it does not count as a passing baseline. Tests must isolate PTY/child-process interactions before another run.
- No production behavior or dependency additions are part of this baseline issue.

## Mirror-check proof

`node scripts/check-tabz-mcp-sync.mjs` passed against the existing canonical and plugin copies: 28 source files and 152 generated files, plus matching package manifests, lockfiles and TypeScript configuration.

An isolated temporary fixture exercised the same script from a temporary working directory:

| Fixture | Exit |
| --- | --- |
| Identical source, generated files and package metadata | 0 |
| Modified plugin source | 1 |
| Modified plugin package-lock | 1 |
| Missing plugin generated file | 1 |

The fixtures were removed after the checks. The script reads files only and does not synchronize or overwrite either tree.

## Local build evidence

The orchestrator read `.claude/commands/rebuild.md` and ran its extension build, MCP TypeScript build, and repository source/dist mirror copy. All passed; the post-build mirror check passed. Windows-folder sync and loaded-extension reload were excluded by the prepared execution scope. Build output includes existing large-chunk and stale browser-dataset warnings; these are not build failures or live browser acceptance.

## Repaired backend and MCP harness

Backend registry/spawn tests now install an in-memory CommonJS process boundary before importing production modules. All 102 tests in four files pass. The helper restores the loader after each suite and rejects unsupported process operations. The interrupted run's `Claude Test` tmux session was identified by exact name and creation time (`2026-09-07T17:39:18Z`) and removed; no unrelated session was changed.

Obsolete MCP client/Puppeteer tests were replaced with current axios-backed tool behavior checks. All five tests pass. The synthetic cookie exposure observed here belongs to the already-prepared redaction issue; the baseline records existing behavior without changing the product. The separate MCP baseline artifacts record the stdio catalog and synthetic read/action exchanges.
