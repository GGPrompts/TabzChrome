# Capture integration verification

`tc-1qe.17` ports screenshot geometry, attributed early console capture, and bounded deep network diagnostics. Beads is the execution-state authority.

Screenshots use one document admission and one globally scheduled transaction. Every capture, including a scroll/stitch fallback strip, targets the intended debugger tab. CSS geometry is reconciled with capture pixel dimensions, and fallback cleanup restores scroll/sticky state on failure. Inline images carry MIME type, dimensions and byte count; saved screenshots require a confirmed path, while inline-only requests require actual image data. Legacy canvas image capture prepares inline data from the admitted document-produced data URL without a new remote fetch. Ordinary direct image downloads may remain file-only.

Post-action observation runs inside the action's existing document admission. It neither reacquires the admission nor replays the action when capture fails. Protected documents refuse observation; their prepublished ref submit remains a boolean-only synthetic click. Late reads quarantine their exact document against subsequent secret entry.

The early MAIN console bridge preserves original methods and uses bounded buffering/serialization and an isolated-world relay. Chrome sender metadata supplies document and tab identity. Non-HTTP(S) sender documents are refused; HTTP page logs can still identify extension-origin stack frames. Ownership epochs fence in-flight logs against pruning. Backend deduplication preserves distinct page, extension and unknown origins.

Network capture state belongs to each caller/tab, retains capture-time ownership, and redacts before storage. Deep capture adds bounded response and stream pages, redirect/failure rows, and explicit debugger cleanup. Navigation/protection/ownership transitions invalidate capture; deep capture requires explicit re-enable on a fresh readable document. Internal group changes invalidate captures and refs before changing membership. Events before trusted document admission are intentionally omitted.

Deep capture caps retained request count and lifetime, pending event count/bytes, response bytes and returned page size. UTF-8 truncation preserves the byte budget. Base64 bodies are decoded and accepted only as redactable JSON objects/arrays; opaque bodies and binary WebSocket payloads are suppressed. Redirect hops have distinct IDs and status metadata. CSS coverage stops tracking and disables enabled domains in failure cleanup without detaching another persistent debugger owner.

Compatibility: every legacy MCP registration remains, with 97 tools in the current generated catalog. The default screenshot location remains `Downloads/tabz/screenshots/<file>`, connection subfolders are opt-in, and explicit outputPath remains Downloads-relative. Configurable screenshot settings are integrated by `tc-1qe.25`.

The manifest adds `webNavigation` and a Chrome 116 minimum. Official documentation places document identity/lifecycle support at Chrome 106; existing Tabz `sidePanel.open` calls already require Chrome 116. These requirements were checked through Google's Developer Knowledge documentation on 2026-09-07: [webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation), [Chrome 116 extension APIs](https://developer.chrome.com/blog/chrome-116-beta-whats-new-for-extensions). The manifest key and extension identity remain unchanged.

| Check | Result |
| --- | --- |
| Final background suite | 36 files / 293 tests passed |
| Backend suite | 24 files / 308 tests passed |
| Canonical and plugin MCP suites | 19 files / 172 tests passed in each copy |
| Extension and both MCP TypeScript projects | Passed |
| Generated action enum and worktree catalog | Current; 97 tools |
| Canonical/plugin source parity | Passed |
| Whitespace check | Passed |

Logs: `/tmp/tabz-execute/capture-*-final.log`. Final navigation invalidation, UTF-8 limits and CSS cleanup regressions are covered by the background suite. Generated distributions are rebuilt at integration gate `tc-1qe.19`.

Tests use mocked Chrome, synthetic pages, in-memory MCP and isolated ephemeral backend servers. Live geometry, actual Chrome startup timing, permission reload, native trusted input and platform-specific behavior remain pending in `loaded-chrome-acceptance.md`. No runtime reload, Windows folder sync, commit or push is part of this issue.
