# Final automated gate and handoff

`tc-1qe.26` completes the authorized automated implementation wave on `feat/glass-catchup`. Work remains uncommitted at base `ec502b143ad1db211a49c7015549a4f66d586950`; this run does not authorize publication or the separate loaded-Chrome gate. Pinned source: Glass `b912abf24cee803d7fa78d994416985eff9d37fd`, import anchor `07c826a`.

| Final check | Result |
| --- | --- |
| Full root suite | 84 files / 1,334 tests passed |
| Full backend suite | 24 files / 312 tests passed |
| Canonical MCP suite | 23 files / 242 tests passed |
| Plugin MCP suite | 23 files / 242 tests passed |
| Extension TypeScript | Passed |
| `/rebuild` local extension build | Passed; existing large-chunk advisory remains |
| `/rebuild` MCP build and plugin distribution copy | Passed |
| Canonical/plugin source, distribution and package metadata | Match: 44 source / 212 distribution files |
| Generated action enum and worktree tool catalog | Current; 97 unique tools |
| Final actual stdio schema/startup and workflow measurements | Byte-identical to the recorded worktree artifacts |
| Clean isolated lockfile installs | Root 509, backend 192, canonical/mirror 167 packages each; all passed offline |
| Final local tarball install, executable and client/helper imports | Passed; stdio entry, declarations and generic examples present |
| Manifest identity and referenced assets | Original name/version/key absence retained; all four direct build assets present |
| Whitespace | Passed |

Commands/logs are `/tmp/tabz-execute/gate8-*`. Clean installs used Node 24.12.0/npm 11.6.2 and `npm ci --offline --ignore-scripts --no-audit --no-fund` in four task-owned directories; final manifest/lock hashes still match those checked installs. This verifies dependency resolution and lock coherence, not native-addon lifecycle scripts or other operating systems. The final packed package contains 309 entries; tarball SHA-1 is `5072b6c5c46269f9b60acf6118d421a679acde12`. The installed symlink executable and `tabz-mcp-server/client` import were checked under `/tmp/tabz-execute/final-package`, with no global installation.

## Port and compatibility review

Independent source review found no remaining concrete compatibility blocker. Production defaults remain 8129, with `/mcp/page-agent` for the CLI. Other-port strings occur only in negative tests. Bash remains the terminal shell. Legacy browser tools, audio, profiles, plugins and terminal tools remain published. The 3D and audio UI trees are unchanged from the base revision.

The original profile JSON, shared profile/storage contracts, migration fixtures and inheritance tests remain unchanged, including theme and audio override upgrades. Named custom tool presets and explicit disabled tools retain their upgrade semantics. Screenshot folders default to `Downloads/tabz/screenshots` with connection subfolders off; explicit output paths retain their previous Downloads-relative meaning.

Manifest changes are limited to the minimum Chrome 116 baseline, `webNavigation`, and the early isolated console bridge. No Glass key or identity was copied; neither the original nor current manifest declares a stable key. Existing host permissions and externally-connectable origins are retained. Current official Chrome evidence is in `chrome-api-evidence.md`.

The only added runtime dependency is pinned backend `tldts@7.0.17`, needed for private-public-suffix host matching in the saved-login boundary. CLI/client additions use existing dependencies; no model/AI SDK, hosted chat, Studio, native companion, Rust, customer data or source-product runtime was introduced. Pre-existing dirty work was kept in the shared checkout and amended only where the authorized integration required it; no blanket reset or staging was used.

## Measured outcome

Final full catalog: **97 tools, 60,653 schema characters + 1,168 startup characters = 61,821**, or 15,456 estimated tokens at `ceil(chars/4)`. This is **25.44% less combined text** than the same 97-tool catalog before the description pass. Compact page-agent: **20 tools, 19,403 combined characters**, estimated 4,851 tokens. These are serialized size estimates, not billing measurements; original and intermediate snapshots are preserved in `tool-overhead-verification.md`.

For the identical known-target synthetic read/click task, compact batching uses one outer workflow MCP call instead of two. Every mode still performs one backend read and one action. Result payload sizes are 461 bytes for the frozen minimal baseline, 1,114 current legacy, 1,007 compact separate, and 750 batch. Typed results and compact outlines carry different evidence; no universal response-size, model-call or latency savings are claimed. See `workflow-measurement.md` and the raw protocol artifact.

## Remaining acceptance and earlier incidents

`tc-1qe.27` and the epic remain open for an explicitly authorized loaded-Chrome walkthrough using a temporary synthetic credential store and task-owned tabs. Extension reload, backend restart, Windows folder synchronization, native/platform checks, actual MHTML files, visual behavior and human sign-in/MFA were not performed by this gate. The updated checklist is `loaded-chrome-acceptance.md`.

Native Windows saved-login storage remains unsupported; WSL requires its Linux filesystem. The store is plaintext under private permissions and does not isolate arbitrary processes running as the same user. Trusted keyboard credential fill intentionally protects the whole tab until closure; browser-wide history/download/session/cookie metadata has separate provenance limits. See `docs/saved-logins.md` before live acceptance.

Earlier in this run, baseline tests briefly created a real `Claude Test` tmux session, which was removed only after matching its exact creation time. A separate CommonJS logger import reset the runtime unified log; its old contents were not read or reconstructed. Those incidents were disclosed and recorded in `baseline-verification.md` and `gate3-verification.md`. Process/logging test boundaries and append-only logger initialization now prevent the observed side effects. Later gates used synthetic process/logging boundaries and test-owned ephemeral HTTP servers.

No commit, Git/Beads remote push, PR, deployment, global installation or publication was performed. Review the worktree and complete the human gate before treating this as a released or live-verified port.
