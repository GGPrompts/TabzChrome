# Compact tools verification

`tc-1qe.16` implements the compact browser tools and structured legacy adapters. Beads remains the execution-state authority.

The public catalog now includes `tabz_act`, `tabz_read_page`, and `tabz_batch` while retaining every legacy tool. Core remains seven tools, so custom disable lists and unknown-preset fallback remain meaningful. The generated page action enum contains ten verbs; screenshot and wait are MCP-side operations. Inline observation and cropped screenshots belong to the next capture issue.

Page refs bind to the caller and exact document, invalidate on reread/navigation/removal/ownership changes, and use one document admission per request. On a document protected by saved filling, only a synthetic click through an already published ref is available; the tiny injected handler returns a boolean without inspecting field values. Two successive saved fills on the same document do not invalidate that published ref. Trusted input follows document admission before the per-tab debugger queue. Fixed deadlines include queue time, and unresolved page reads quarantine the document against later secret entry.

Batch calls use a per-server dispatcher of successfully registered tools, validate each tool schema, pass request context and cancellation through, execute sequentially, and stop on the first error. Disabled tools and recursive batches are refused. This is not a workflow engine.

Structured adapters cover open/list/switch/close tabs, page and element reads, fill, click, act and group status. Fill mismatch and absent verification remain errors; sensitive values stay suppressed. Mutation transport loss and unverified dispatch remain unknown. Open-tab cleanup evidence requires a positive returned tab ID and explicit `created: true`; requested `newTab` alone is insufficient.

| Check | Result |
| --- | --- |
| Background suite after final protected-click repair | 25 files / 195 tests passed |
| Backend suite | 23 files / 302 tests passed |
| Canonical and plugin MCP suites | 14 files / 151 tests passed in each copy |
| Extension TypeScript (`tsconfig.extension.json`) | Passed after closure-variable narrowing repair |
| Generated action enum and worktree catalog | Current; 94 tools |
| MCP Settings and shared catalog tests | 3 files / 13 tests passed |
| Canonical/plugin source parity | 39 files match |
| Whitespace check | Passed |

Logs: `/tmp/tabz-execute/compact-*-final.log` and `compact-settings-parent.log`. Generated distributions are rebuilt at the next integration gate.

 Tests use synthetic fixtures, mocked Chrome, in-memory MCP and isolated backend transports. Native trusted-input behavior and loaded Chrome acceptance remain separate; this issue performs no runtime reload or publication.
