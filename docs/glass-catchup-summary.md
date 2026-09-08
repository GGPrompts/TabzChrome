# Glass catch-up summary — September 7, 2026

TabzChrome now includes the reusable browser automation, Saved Logins, CLI, and reliability improvements ported from OneOps Glass. The implementation was pushed as [`f2984d9`](https://github.com/GGPrompts/TabzChrome/commit/f2984d95a2ca5b2e8f5c82e0d284f71c3639cb24) on `feat/glass-catchup`. Loaded-Chrome acceptance remains pending for laptop testing.

## Browser tools and smaller tool context

- Added `tabz_read_page` for compact page outlines and document-bound element references, `tabz_act` for actions, and `tabz_batch` for sequential operations in one MCP call.
- Actions verify settled values and report uncertain outcomes explicitly. A lost response or timeout does not trigger an automatic repeat of a mutation.
- Each MCP caller works within its own tab group. Target selection, console attribution, reconnects, group release, and cleanup respect that ownership.
- Shared presets and a generated catalog keep Settings and server tool selection aligned. Legacy tools, saved custom/profile presets, and disabled-tool choices remain supported.

The measured schema and startup text for the **same 97 tools** fell from 82,910 to 61,821 characters: **25.44% less tool context**. The compact `page-agent` preset publishes **20 tools**, totaling 19,403 characters. These are serialized text measurements, not measured billing savings.

In a synthetic read-and-click comparison, batching reduced outer workflow MCP calls from two to one. All modes still performed one backend read and one action; response size varied with the evidence returned. See [tool measurements](planning/glass-catchup-2026-09-07/tool-overhead-verification.md) and [workflow measurements](planning/glass-catchup-2026-09-07/workflow-measurement.md).

## Saved Logins and human sign-in

- Added a dashboard Logins page and protected human entry prompts for creating, rotating, and deleting host-matched credentials and named fields.
- Agents request a fill by host and field name. Saved-login responses expose metadata and verification results, without returning saved values or repopulating edit forms.
- Unsaved form changes are protected during dashboard navigation and incoming login requests.
- Added a bounded manual sign-in handoff for password managers, SSO, and MFA.
- Credential entry protects the affected document from subsequent page reads, scripts, screenshots, and diagnostic capture. Trusted keyboard filling applies a stricter restriction lasting until that tab closes.

The store uses **local plaintext files with private filesystem permissions**, not encryption. Same-user shell/file tools can still access those files, and browser-wide metadata tools have separate limits. Native Windows storage is unsupported; WSL storage must stay on its Linux filesystem. See [Saved Logins](saved-logins.md) for host matching, protected submit refs, and the full boundaries.

## CLI, client, and local MCP transport

- Added the `tabz` CLI, a reusable client, bounded workflow helpers, and synthetic examples.
- CLI commands support JSON file/stdin input, structured output, and distinct exit codes for tool failure, transport failure, and uncertain mutations.
- Added local Streamable HTTP MCP at `http://localhost:8129/mcp` and named preset routes, alongside stdio. Sessions isolate caller state and have bounded cleanup.
- The CLI defaults to `/mcp/page-agent`; cleanup closes only tabs with an explicit creation receipt from that client.

See [CLI usage and examples](tabz-cli.md) and [local browser trust and transport setup](local-browser-trust.md).

## Capture, Chrome, and terminal fixes

- Added early attributed console capture, bounded deep network inspection, inline screenshot metadata, cropped zoom captures, and optional post-action observation.
- Capture and result paths redact credential-shaped values and enforce protected-document and caller-ownership checks.
- Fixed toolbar side-panel toggling, MHTML load/close races, network emulation parameters, and geolocation clearing and permission reporting.
- Added configurable screenshot folders and optional per-connection folders. The upgrade default remains `Downloads/tabz/screenshots`.
- Permission/question notifications work with the side panel closed and respect preferences, visible terminal focus, and protected credential terminals.
- Files now distinguishes **Browse Here** from **Set as Working Dir**; early directory changes persist correctly.
- Fixed terminal launches inside tmux, optional TPM plugin failures, nested development attachments, macOS node-pty helper diagnostics, and logger initialization that previously reset existing logs.

## Rebuild and compatibility

`/rebuild` now uses the shared [rebuild script](../scripts/rebuild.sh), checks build/copy failures, and verifies the repository's MCP plugin copy. On WSL it resolves the actual Windows Desktop and refuses unsafe sync destinations. `TABZ_WIN_PATH` is the exact extension load folder. Build, Windows sync, backend restart, and Chrome reload are reported separately.

TabzChrome retains its identity, port **8129**, Bash terminals, legacy tools, audio/3D features, and existing profile/storage contracts. The manifest now requires Chrome 116 and adds `webNavigation` and the early console bridge. The port does not introduce Glass branding, hosted Studio/chat, or customer-specific workflows.

## Verification and laptop handoff

The automated implementation wave (`tc-1qe.1`–`.26`) is complete. Before the implementation push:

| Check | Result |
| --- | --- |
| Root suite, including the rebuild tests | 85 files / 1,338 tests passed |
| Backend suite | 24 files / 312 tests passed |
| Canonical MCP and plugin MCP suites | Each 23 files / 242 tests passed |
| Extension TypeScript, generated catalog/actions, MCP parity | Passed |
| Local `/rebuild` extension and MCP builds | Passed |
| Isolated offline installs and local CLI/client package smoke | Passed; install lifecycle scripts were disabled |

These results cover the integration worktree. Seven unrelated pre-existing file edits were preserved locally and excluded from the implementation commit. The [final automated gate](planning/glass-catchup-2026-09-07/gate8-verification.md) records the earlier 1,334-test count before four rebuild tests were added; its uncommitted/no-push statements describe that earlier checkpoint.

For laptop testing:

1. Fetch and switch to `feat/glass-catchup`, and install dependencies for the root, backend, and MCP package if needed.
2. Configure `TABZ_EXTENSION_IDS` with the actual unpacked extension ID, following [local connection setup](local-browser-trust.md).
3. Run `/rebuild` (or `bash scripts/rebuild.sh`). On WSL, confirm the destination is the folder Chrome loads. Use `--local-only` to skip Windows sync.
4. Restart the backend with `./scripts/dev.sh` and reload the intended extension at `chrome://extensions`. Reconnect HTTP sessions or restart stdio MCP processes as applicable.
5. Follow the [loaded-Chrome acceptance checklist](planning/glass-catchup-2026-09-07/loaded-chrome-acceptance.md), using synthetic credentials and task-owned tabs.

The implementation run did not perform Windows sync, backend restart, Chrome reload, human sign-in/MFA, or native platform acceptance. **`tc-1qe.27` and the epic remain open** for that testing; a successful build and push do not establish live acceptance.
