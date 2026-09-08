# Gate 2 verification

Verified locally on 2026-09-07 for Beads `tc-1qe.8`, following the trust, ownership, debugger, Files, and tmux implementations. Beads remains the execution-status authority.

| Check | Result |
| --- | --- |
| `npm test -- --run` | 44 files, 1,030 tests passed |
| `npm --prefix backend test` | 12 files, 146 tests passed |
| `npm --prefix tabz-mcp-server test` | 4 files, 22 tests passed |
| `npm --prefix plugins/tabz/tabz-mcp-server test` | 4 files, 22 tests passed |
| Extension TypeScript check | Passed |
| Local `/rebuild`: extension build | Passed |
| Local `/rebuild`: MCP TypeScript build | Passed |
| Local `/rebuild`: source and dist copied to plugin distribution | Completed |
| `node scripts/check-tabz-mcp-sync.mjs` | Passed: 28 source files and 152 generated files per copy |
| `bash -n scripts/dev.sh` and `git diff --check` | Passed |

The `/rebuild` commands came from `.claude/commands/rebuild.md`. Windows folder sync, backend restart, extension reload, MCP restart, and browser acceptance were not performed.

The review covered single-recipient browser dispatch, caller-owned explicit/implicit targets, group lifecycle races and compensation, capture-time console ownership, debugger queue and attachment cleanup, one activation per click, verified and sensitive fill results, operation deadlines, and no fallback replay after script evaluation begins. The API/type collision in window creation was repaired with `windowType` forwarding and a route regression. Coverage descriptions disclose its reload behavior.

Original dirty work remains accounted for: 15 of the original 28 tracked dirty files are byte-identical to the execution snapshot. The other 13 contain scoped FileTree/documentation changes or regenerated tool-doc output; their original edits were reviewed and retained. The three original research files remain byte-identical. No original snapshot file is missing. Package dependency sets, extension identity, existing profile defaults, port 8129, Bash-only terminals, and legacy/audio/3D features remain intact.

Build warnings about large chunks and stale browser datasets remain informational. No test or typecheck failures were skipped. These are synthetic/static checks, not loaded-Chrome or native-platform acceptance. Experimental script termination remains best-effort; timed-out execution is reported as uncertain.

Session logs are under `/tmp/tabz-execute/gate2-*.log`. The frozen pre-port MCP baseline was not overwritten; later budget gates will measure the additional token-overhead changes against it.

Additional built-stdio smoke: `node tabz-mcp-server/scripts/measure-stdio-baseline.mjs` passed against its test-owned ephemeral fixture with the frozen baseline tool selection. It completed initialize, tools/list, a page read and a click (4 RPCs; 2 workflow backend requests; 0 unexpected requests). The child uses a synthetic agent label and cleared tmux environment. Output is `/tmp/tabz-execute/gate2-stdio-smoke.json`; the frozen pre-port baseline remains unchanged.
