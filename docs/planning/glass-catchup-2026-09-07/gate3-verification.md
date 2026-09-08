# Gate 3 verification

Verified locally on 2026-09-07 for `tc-1qe.11`, after the HTTP/session and catalog/preset issues. Beads is the execution-status authority.

| Check | Result |
| --- | --- |
| `npm test -- --run` | 47 files / 1,043 tests passed |
| `npm --prefix backend test` | 16 files / 168 tests passed |
| `npm --prefix tabz-mcp-server test` | 7 files / 60 tests passed |
| Plugin MCP full suite | 7 files / 60 tests passed |
| Extension TypeScript | Passed |
| Local `/rebuild`: extension, then MCP | Passed |
| Local `/rebuild`: canonical source/dist copied to plugin | Completed |
| MCP mirror check | 31 source / 164 generated files agree |
| Generated catalog worktree check | Current, 87 tools |
| Built MCP in-memory tools/list against generated catalog | Exact 87-tool parity; all top-level schemas strict |
| Built stdio synthetic baseline-selection smoke | 4 RPCs passed; 2 workflow backend requests; 0 unexpected requests |
| Whitespace check | Passed |

The review covered actual loopback peer and Host validation, no-Origin HTTP access, reserved identity rejection, AsyncLocalStorage isolation under concurrent callers, fixed initialization-time presets, failed-initialization disposal, bounded group/session cleanup, and preservation of legacy/audio registrations. Session disconnection is not treated as replay authorization. The factory retains stdio and uses the existing SDK; no runtime dependency was added in this gate.

Catalog review covered strict registration, unknown/custom preset filtering, the frozen pre-upgrade UI tool list, explicit disabled choices, read-only configuration GETs, authoritative save snapshots, built-in/custom collision handling, and the original Settings edits. Nonexistent aliases cannot delete a saved preset. Generated catalog checks compare local edits; committed-HEAD checking remains a publication-time check because this run has no commit authorization.

Backend test isolation needed another repair: CommonJS logger initialization resets the runtime unified log. Tests reached that import before discovery. A global test-only loader boundary now supplies an in-memory logger; a regression refuses filesystem creation/writes while importing and using it. The runtime log was not read or reconstructed. See `docs/lessons-learned/2026-09-07-commonjs-test-logging.md`.

The rebuilt stdio smoke deliberately selects the frozen original 86-tool catalog for comparable measurements; the separate built tools/list test verifies all 87 current tools. The frozen pre-port measurement is unchanged. Token-cost conclusions remain for the dedicated later budget gate.

Only the local build/sync steps in `.claude/commands/rebuild.md` were performed. No Windows folder sync, user service restart, browser reload, live Chrome interaction, commit or push occurred. Chunk-size/browser-dataset warnings are informational; no failing checks were waived. Logs and synthetic evidence are under `/tmp/tabz-execute/gate3-*`.
