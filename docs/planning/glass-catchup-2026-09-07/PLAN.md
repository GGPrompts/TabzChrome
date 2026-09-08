# Bring the reusable Glass improvements back to TabzChrome

Prepared 2026-09-07. Research and proposed implementation sequence; no application code changed, issues created, commits made, builds run, or releases performed.

Follow-up: this historical design has now been prepared in Beads under **`tc-1qe`**. Use `bd show tc-1qe` and `bd ready --label ready -n 1000 --json` from the TabzChrome root for authoritative execution state and worker prompts. The current configured tracker is local Dolt via `bd`; older `ggbd`/Supabase instructions are stale. The original research sequence below is retained as design evidence, not a second status tracker. Implementation, browser acceptance and publication have not started.

Preparation corrections from deeper source inspection:

- Glass's final `backend/routes/browser.js` is a wrapper. Its reusable implementations are in `backend/routes/browser-core.js` and `browser-desktop.js`; adapt those behaviors into TabzChrome's existing routes without importing the companion architecture.
- `72444fc` changed only the removed Rust backend. Its BOM decoder is not a Node port candidate; the prepared Files issue covers the distinct working-directory actions.
- Closed TabzChrome issue `tc-ppdd` already reduced tool descriptions. Measure additional gains against the current TabzChrome baseline, not an older pre-reduction count. Glass's tracked `tabz-mcp-server/scripts/measure-tools.mjs` reports characters divided by four as an estimate, not tokenizer-measured counts. The prepared budget and workflow issues require explicit before/after evidence.
- Personal home pages and native launcher enhancements remain optional future work. They are not included in the prepared core catch-up epic.

## Recommendation

Port coherent feature slices from Glass's final source, using its Git history to identify dependencies and later corrections. Keep TabzChrome's identity, terminal experience, Bash-only contract, port 8129, existing profiles, and customization. Deliver the reliability foundations, saved Logins, modern MCP tools, and deterministic CLI first. Treat hosted chat and native messaging as separate future product decisions.

The unit of work should be a tested behavior, not one Glass commit. Many initial implementations have several subsequent review repairs. A bulk merge or replay would also import branding, customer setup, obsolete Rust work, removed TabzChrome features, and hosted OneOps dependencies.

## Evidence and limits

| Snapshot | Revision |
| --- | --- |
| TabzChrome HEAD | `ec502b143ad1db211a49c7015549a4f66d586950` |
| Glass HEAD | `b912abf24cee803d7fa78d994416985eff9d37fd` |
| Glass import of the TabzChrome working tree | `07c826a` (2026-08-28) |

These local histories have **no common commit**. Glass has 413 reachable commits, beginning August 28. Its seed was a working-tree import, not a Git fork preserving ancestry. The import already differs from TabzChrome HEAD in 41 shared files; 550 shared files are identical. At the current heads, 228 shared files are identical, 297 differ, 387 paths exist only in TabzChrome, and 394 exist only in Glass. These counts include documentation, assets, and generated output; they are not estimates of implementation work.

TabzChrome started this pass with 28 modified tracked files. Nine of those working files exactly match the Glass import, including FileTree, GitRepoCard, both MCP tool-doc sources, and four browser reference documents. Preserve these changes and compare three states: TabzChrome working tree, Glass import, and Glass final source. A HEAD-to-HEAD diff alone would misclassify some existing work as a new port.

Glass also has a modified MCP lockfile and untracked local artifacts. The inventory is pinned to committed source, not those uncommitted changes. Neither credential stores nor runtime logs were read.

Supporting artifacts:

- [commits.tsv](commits.tsv): all 413 commits with full SHA, date, subject, and changed paths (merge changes relative to first parent).
- [files.tsv](files.tsv): 1,306 union paths with blob IDs at all three snapshots, HEAD comparison, and tracked TabzChrome working-file comparisons. Empty working-file fields indicate absent/non-regular files. Paths present only in the historical import can appear here too.

This is a history and source inventory with targeted inspection of the MCP factory, CLI contracts, credential store, dashboard, page guards, and build configuration. It is not an exhaustive security review, a claim that every proposed port applies cleanly, or live Chrome acceptance. Source commit references below resolve in `/home/marci/oneops-gcp/oneops-glass`.

## Candidate families

| Family | Recommendation | Source history to inspect, including repairs | Main source surfaces |
| --- | --- | --- | --- |
| Local API trust and credential redaction | First foundation | `0bc680c`, `6e9d53e`, `baf7ea5`, `c37bdd8`, `f3bdb1e`, `6e74d9d` | `backend/server.js`, `backend/modules/auth-token.js`, `backend/routes/browser.js`, `extension/background/requestRedaction.ts`, inspection/cookie/network handlers |
| Agent-owned tab groups and cleanup | First foundation | `a9c0738`, `4ee5ab2`, `448b33e`, `333f192`, `403f8f2`, `ad64a55`, `516c636` | `browserMcp/tabGroups.ts`, `tabs.ts`, backend browser routes, MCP identity helpers |
| Debugger serialization and tool correctness | First foundation | `970b930`, `d6e7983`, `9105d16`, `0a1a163`, `2e9f8d3`, `91cc81e`, `1aad958`, `00100ab` | debugger, script, interaction, emulation, capture, backend dispatch |
| MCP factory, HTTP sessions, presets, schemas | Port with compatibility work | `cc32c47`, `b326821`, `09180ab`, `88c435b`, `985dbe8`, `ecbffab`, `70793e6`, `2f2490f` | `tabz-mcp-server/src/{server,http,register,shared}.ts`, tool catalog/presets, MCP settings, backend mount |
| Human login handoff and saved Logins | High-value complete slice | `ed89f19`, `b388c35`, `33c6caa`, `6e74d9d`, `c2e89b9`, `0f50fb0`, `65b31de`, `cbfda7d`, `c59d9e9` | `credential-store.js`, browser routes, `SettingsLogins.tsx`, `browserMcp/{login,loginState,logins,pageGuard,interaction}.ts`, MCP login/secret tools |
| Compact action/read/batch tools | High-value complete slice | `efb7382`, `4fdea66`, `2758092`, `00789f2`, `45dc28c`, `54110d8`, `f4d1473`, `31ed926`, `2885194`, `8b6f769`, `e296a93` | both action implementations, `pageRefs.ts`, `read-page.ts`, `batch.ts`, generated action catalog, typed result contracts |
| Screenshots and console capture | Port final implementation and tests | `6ea3d25`, `6616878`, `d06b273`, `01d04fc`, `a6b4e4b`, `9261565`, `28cfdc1`, `9f7c552`, `83b9d87`, `5c336e9`, `f1bf67f` | screenshot handlers/page scripts, MAIN-world console bridge, debugger queue, Vite entries |
| Deep network inspection | Port after debugger/redaction foundations | `dcb5767`, `a9050e2`, `f547f90`, `cee7e27`, `069ad1e`, `c5b9c9a` | `deepCapture.ts`, `networkCapture.ts`, MCP network tools, redaction and coverage tests |
| Deterministic CLI and workflow helpers | High-value slice after HTTP/results | `e296a93`, `b33771f`, `6e338e8`, `b834114`, `a115713` | `tabz-mcp-server/src/{cli,client}/`, package bin/exports, `docs/tabz-cli.md`, CLI/workflow tests |
| Terminal, file, notification fixes | Selective independent work | `f2d96e7`, `0b62340`, `409781b`, `72444fc`, `5ce943e`, `d409fd2`, `f33f4b6`, `2989eaa`, `403f8f2` | tmux spawning/config, setup/dev scripts, file decoding, Files UI, background permission-prompt polling |
| Chrome API maintenance | Port behavior; verify supported-version assumptions during implementation | `3653f98`, `72fc575`, `57f596a`, `4060af3`, `9220211`, `16d6387`, `b90bbfe` | side-panel toggle, network/geolocation emulation, save-page lifecycle, screenshot path setting |
| Repeatable checks and packaging | Port generic checks early | `d9c018b`, `b882998`, `0291590`, `dc176bb` | catalog/action generators, `check-tabz-mcp-sync.mjs`, package scripts, backend Vitest config |
| Personal pages and launcher refinements | Optional polish after core | `8da1b32`, `e0cc5da`, `e841ea8` | new-tab home-page selection, Pages UI, launcher update behavior; reimplement without OneOps launchers |
| Browser broker and no replay | Evaluate generic extraction after core | `74e0fd0`, `9785e80`, `0a0f5a4`, `d27ef67` | `backend/modules/browser-broker.js`, WS lifecycle and dispatch; avoid pulling companion-only branches |
| Native browser companion | Defer to separate proposal | `d222ca2`, `ecaf6c9`, `defd125`, `71fe14a`, `e7deab3` | `companion/`, `native-host/`, installer/runtime lifecycle |
| Studio-hosted chat, managed grants/trust | Exclude from catch-up | `e21e475`, `2fe22c1`, `09a829d`, subsequent Studio commits | `extension/chat/`, Studio controller, managed policy, chat build, platform auth |

References are history anchors, not a complete cherry-pick list.

## Proposed execution sequence

### Wave 0: Establish a safe porting baseline

Prepare an isolated implementation checkout that preserves or explicitly carries the current TabzChrome working changes. Record baseline test failures separately from port regressions. Adapt the generic catalog and MCP mirror checks while preserving existing TabzChrome tools. Keep canonical source in `tabz-mcp-server`, and keep the plugin distribution synchronized, including package manifests and lockfiles where appropriate.

Glass removed tracked generated MCP output; TabzChrome currently tracks it. Follow TabzChrome's `/rebuild` distribution behavior initially. Any change to generated-file policy should be its own reviewed choice, not an incidental result of copying Glass.

Acceptance: all initial dirty paths accounted for; existing tests characterized; checks exercise both MCP copies; no changed profile/storage defaults or tool removals.

### Wave 1: Browser safety and correctness

Port per-connection groups, owned-tab cleanup, persistent group recovery, debugger serialization, redaction, origin/token/WS validation, and backend field forwarding. Keep the existing external WebSocket protocol. Adapt internal dispatch fixes without blindly replacing `backend/server.js` or `backend/routes/browser.js`.

Acceptance: two concurrent agents cannot read/close each other's grouped tabs; reconnect recovers correctly; cleanup leaves unrelated user tabs alone; one click produces one activation; forged origins are rejected; credentials are absent from inspection, cookie outputs, capture and errors; debugger resources release after errors. Existing stdio clients and terminal WS sessions still work.

### Wave 2: MCP transport and configuration

Extract the transport-neutral factory; preserve stdio and add local Streamable HTTP on the TabzChrome backend. Port per-session preset selection, strict schemas, bounded requests, idle-session cleanup, generated catalog, and the known-tools upgrade behavior.

Defaults must use port **8129**, including CLI, tests, docs and launchers. Preserve user-disabled tools, custom presets and stored profile fields. Glass's profile-preset removal and legacy-tool retirement are not automatic TabzChrome requirements.

Acceptance: stdio and HTTP publish the intended tools; simultaneous HTTP sessions have independent identity/presets/backend context; unknown preset cannot broaden access; updated installs expose intended new tools without resetting user choices; stale sessions expire without closing unrelated tabs; backend starts cleanly when built MCP output is missing or mount initialization is delayed.

### Wave 3: Human-entered Logins and secret fill

Port the dashboard, metadata-only list/status/rotate/delete flow, host-matched store, manual-login handoff, guided terminal fallback, extension-page guard, protected credential-terminal behavior, request deadlines and verified fill results together. Use a TabzChrome-specific store directory/config override; never reuse or migrate `~/.oneops-glass` automatically. Use a TabzChrome-specific extension identity; do not copy the Glass manifest key.

Trusted typing needs the debugger foundation and repeated hostname/target/deadline checks. Include all credential-store review repairs, not just the feature's introduction. Test with synthetic credentials in a temporary isolated directory.

Acceptance: a person enters a synthetic login without its values reaching MCP results, logs, screenshots, DOM reads, errors or terminal capture; fill is refused for wrong host, wrong target type, expired request, wrong origin or unauthorized tab; navigation during fill fails safely; the Logins dashboard is outside the agent surface; rotate/delete work; metadata-only status fits normal client timeouts.

Product wording must say that this keeps values out of the supported AI tool flow. It is not an encrypted vault or isolation from unrestricted same-user shell access. The source enforces POSIX file modes; explicitly test the supported Linux/macOS/WSL environments and handle any native-Windows support gap before claiming portability. Do not transplant a `chmod`-only solution as universal cross-platform protection.

### Wave 4: Modern browser tools and better observation

Add `tabz_act`, compact `tabz_read_page` refs, sequential stop-on-error `tabz_batch`, typed structured results, bounded observations, inline images, correct screenshot coordinates/capture scheduling, reliable console sources and deep-network capture.

Keep existing TabzChrome tool names initially. Implement compatible adapters where useful, and omit redundant tools from the new compact preset instead of deleting tools existing users call. Preserve audio/TTS tools and customization that Glass removed. Decide any later deprecation in a separately documented release.

Acceptance: input editing handles selection, focus, checkboxes and Unicode; target handoffs are isolated; stale refs fail after reread/navigation/removal; screenshots match CSS click coordinates at different zoom/DPR; batch stops after the first failed operation; console output is attributed correctly and scoped to the caller; deep capture bounds/redacts bodies and preserves redirect/failure semantics. Controlled inputs must retain the intended fill before reporting success.

### Wave 5: CLI and deterministic workflows

Port the existing CLI and reusable client, bin/export configuration, typed helpers and tests. Point defaults to `http://localhost:8129/mcp/page-agent`. Replace NEMT examples with a generic local lookup and one-submit receipt fixture. Keep the same MCP tool implementation for AI and CLI callers.

Acceptance: discover/call/run work with no AI SDK; JSON stdout and stderr diagnostics stay separate; schema and required-tool checks happen before mutation; every run gets a fresh identity; timeout/lost-response mutation exits 4 and blocks replay; read-based reconciliation remains possible; cleanup closes only positively created tabs; interrupt and session cleanup are bounded. Test both repository invocation and installed executable packaging.

Keep limitations explicit: workflow modules are trusted Node code, not a sandbox; saved-secret fill remains a raw tool call in the source CLI; login/MFA requires a person; the helpers are not a scheduler, production portal adapter or exactly-once transaction engine. Download/MHTML paths remain experimental in the source CLI docs and need separate live acceptance.

### Wave 6: Desktop polish and release acceptance

Select portable tmux/environment, file decoding, working-directory, notification and screenshot-folder improvements. Preserve Bash when adapting commits that honor arbitrary `$SHELL` or add PowerShell support. Personal pages can follow if desired. Update CHANGELOG for user-visible changes and add lessons for non-obvious bugs; change CLAUDE.md only if architecture changes require it.

Run TabzChrome's `/rebuild` procedure after reviewing its actual destination, then separately record build, distribution sync, backend restart and human Chrome reload. Test upgrades using an existing profile/storage snapshot as well as a fresh install. Keep current theme, 3D/audio options, bookmarks, profiles and terminal behavior intact.

Acceptance: extension/MCP/backend checks pass; loaded Chrome validates logins, two-agent isolation, trusted fills, screenshots, CLI failure/reconciliation and terminal recovery; supported platforms receive explicit evidence. Builds/tests do not stand in for live browser proof. Commit/push/release are separate from this planning pass.

## Dependency shape and potential work splits

Wave 0 precedes implementation. Wave 1 precedes saved credentials and debugger/capture changes. Wave 2 enables both the Logins tool surface and CLI. Wave 4's typed results precede Wave 5. The terminal/file subset of Wave 6 can be developed independently after the baseline; release acceptance comes last.

Avoid simultaneous edits to `backend/server.js`, `backend/routes/browser.js`, `extension/background/browserMcp/index.ts`, shared tool catalogs and package/lockfiles. Those are integration bottlenecks. Independent tests, docs, CLI modules and terminal fixes are better work splits. This proposal does not authorize or start parallel workers.

Suggested issue boundaries for later backlog preparation: baseline/mirror checks; trust/redaction; tab ownership; debugger/dispatch correctness; HTTP factory/sessions; catalog/preset compatibility; credential store/routes; guarded Logins UI; trusted-fill integration; action/ref/batch contracts; screenshots/console; deep capture; CLI/client; generic workflow examples; terminal/file fixes; upgrade/live acceptance. Prepare exact worker prompts and verification commands after each slice's diff is inspected. This document is not yet a ready execution queue.

## Verification policy for implementation

- Run `npm test -- --run` for the extension, as required here. Inspect package scripts before choosing backend and MCP test commands; adapt their source suites into TabzChrome.
- Use `/rebuild`, not an ad hoc top-level build command. Do not copy Glass's release/publish scripts or Windows destination.
- Add behavioral regressions for ownership, credential leakage, timeouts, uncertain mutations and storage upgrades. Avoid copying tests that merely assert Glass branding or tool counts after its deletions.
- Review dependency deltas per feature. The Glass CLI uses the existing MCP SDK/Node tooling; it does not require the hosted chat AI dependencies. Regenerate coherent lockfiles from TabzChrome's dependency set and verify clean package installs during packaging acceptance.
- Recheck live official Chrome documentation when implementing API-version changes; this local-history pass did not revalidate current platform documentation.

## Explicit exclusions and decisions

Do not import Mountain Express branding, OneOps launchers/domains, customer examples/data, business-associate host policy, private download destinations, governed agent setup, fleet relay changes, hosted Studio auth/chat, or the abandoned Rust backend. Do not remove TabzChrome features merely because Glass removed them.

Before publishing any adapted job-specific material, establish that the selected code can be redistributed in TabzChrome. The useful technical scope is identified here; repository license labels alone do not resolve employer ownership. No publication is part of this plan.

Native messaging and backend-free chat could be worthwhile later, but they introduce installer, lifecycle and service dependencies beyond catching up the current local terminal extension. The proposed default is to finish Waves 0–6 first, then assess those separately.
