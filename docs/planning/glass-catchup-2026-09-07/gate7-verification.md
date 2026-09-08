# Gate 7: deterministic CLI and workflows

`tc-1qe.24` verifies the integrated client, executable, typed helpers, synthetic examples and workflow measurements.

| Check | Result |
| --- | --- |
| Full root suite | 79 files / 1,299 tests passed |
| Full backend suite | 24 files / 310 tests passed |
| Canonical and plugin MCP suites | 22 files / 238 tests passed in each copy |
| Extension TypeScript | Passed |
| `/rebuild` extension and MCP build steps | Passed |
| Canonical/plugin source, generated output and package metadata | Match: 44 source / 212 generated files |
| Action enum and worktree catalog | Current; 97 tools |
| Actual workflow measurement, both copies | Byte-identical to the recorded artifact |
| Installed tarball executable and helper/client imports | Passed in a new isolated offline install |
| Whitespace | Passed |

All four package manifests/lockfiles also completed clean isolated `npm ci --offline --ignore-scripts --no-audit --no-fund` installs. Root: 509 packages; backend: 192; canonical/mirror: 167 each. Metadata hashes are recorded under `/tmp/tabz-execute/clean-lockfiles`. This verifies lockfile coherence with Node 24.12.0/npm 11.6.2 on the current Linux host; skipped lifecycle scripts do not prove a native-addon/platform install.

The installed package under `/tmp/tabz-execute/cli-helpers-installed` runs the symlinked `tabz --help` and imports `TabzClient`, `TabzWorkflowClient`, `waitFor`, and `assert` through `tabz-mcp-server/client` without a connection. The stdio entry remains present.

Active browser documentation now matches enforced ownership, protected login handoffs, verified-only continuation and no replay after uncertainty. Source anchors and predecessor acceptance are recorded in `cli-verification.md` and `workflow-helpers-verification.md`. Exact schema and workflow numbers remain separate in their measurement artifacts.

Logs: `/tmp/tabz-execute/gate7-*`. The existing extension large-chunk advisory remains unchanged. Browserless checks, generated bundles and package imports do not establish loaded-Chrome behavior. No user runtime, Windows sync, commit, push or publication was performed at this gate.
