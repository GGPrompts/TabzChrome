# Measured published tool overhead

`tc-1qe.20` measures the built MCP server through an isolated stdio process and an ephemeral synthetic backend. It never contacts the user's backend, Chrome, configuration or login store. Run `node tabz-mcp-server/scripts/measure-tools.mjs` from this checkout after building the MCP package.

The measurement records the complete `tools/list` array, every per-tool published entry, input schemas and initialize instructions, with raw protocol evidence and SHA-256 hashes. Character counts are JavaScript UTF-16 string lengths; byte counts are UTF-8. Estimated tokens are `ceil(chars / 4)`, a heuristic rather than tokenizer output or a billing claim. Per-entry estimates rounded individually need not sum to the exact whole-array estimate.

The original `mcp-stdio-baseline.json` remains frozen at 86 tools and 66,951 schema characters. The earlier closed `tc-ppdd` already shortened descriptions; its gains belong to that earlier work. A second snapshot, `mcp-before-description-pass.json`, records the integrated catalog immediately before this pass:

| Surface before this pass | Tools | Schema characters / bytes | Initialize instruction characters |
| --- | ---: | ---: | ---: |
| Full compatibility | 97 | 81,742 / 81,742 | 1,168 |
| Page agent | 23 | 23,885 / 23,885 | 1,168 |

For the full 97-tool comparison, top-level descriptions occupy 18,951 characters and recursive input-schema descriptions occupy 17,756. Removing descriptions from the complete published array leaves 38,103 characters. Compare the same 97-tool set to attribute this pass's metadata savings; compare page-agent separately to show the additional effect of compact selection.

The compact preset uses `tabz_act` for clicks and screenshot operations. `tabz_click`, `tabz_screenshot`, and `tabz_screenshot_full` remain registered in the full catalog and available to custom selections. Existing named custom presets and explicit disabled-tool choices are preserved.

`mcp-after-description-pass.json` records the resulting built surface:

| Surface after this pass | Tools | Schema characters / bytes | Instructions | Combined characters | Estimated tokens, chars/4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full compatibility | 97 | 60,607 / 60,607 | 1,168 | 61,775 | 15,444 |
| Page agent | 20 | 18,235 / 18,235 | 1,168 | 19,403 | 4,851 |

For the same 97 tools, schemas shrink **25.86%** and schemas plus startup instructions shrink **25.49%** (82,910 to 61,775 characters). Top-level description characters fall 37.73%, from 18,951 to 11,801; recursive parameter-description characters fall 63.61%, from 17,756 to 6,461. The 38,103-character structure with descriptions removed is unchanged. Initialize safety guidance is byte-for-byte unchanged.

Page-agent's combined surface shrinks **22.55%**, from 25,053 to 19,403 characters. Selection and prose are separate effects: retaining its original 23 tool IDs with the new descriptions would total 21,420 characters including instructions; selecting the compact 20 removes another 2,017 characters. Compared with the original pre-port 86-tool baseline (66,951 characters, no instructions), the final compact surface is 71.02% smaller, but those are different tool selections, not an equivalent-feature-set or billing comparison.

Examples of complete per-tool published entries:

| Tool | Before characters | After characters | After estimated tokens |
| --- | ---: | ---: | ---: |
| `tabz_act` | 2,856 | 2,653 | 664 |
| `tabz_read_page` | 723 | 642 | 161 |
| `tabz_batch` | 866 | 784 | 196 |

The dashboard estimates were refreshed from these actual complete entries and include the 1,168-character startup allowance. Full-catalog preservation, schema structure and 279 compiled tool handlers/helper functions were checked against the pre-pass build. No handler differences were found.

The regression gate measures actual MCP-published entries, limits total schema size to 63,000 characters (about 4% headroom), and caps initialize instructions separately at 1,300. Per-tool exceptions preserve protected login guidance, meaningful enums and SDK metadata. All registered tools retain bundled `tabz_docs` entries; legacy tools point callers to `tabz_act`.

Validation: canonical and mirror focused credential/preset/budget suites each pass 3 files / 25 tests; settings/catalog/preset tests pass 3 files / 13 tests; backend configuration tests pass 6 tests. Extension and MCP TypeScript, build, catalog and source/distribution mirror checks pass (40 source / 200 distribution files). Logs: `/tmp/tabz-execute/token-*`. No universal per-turn loading or billed-token savings are claimed. Workflow execution round trips and response sizes are measured separately in [the synthetic workflow comparison](workflow-measurement.md).

## Final integrated build

`mcp-final-overhead.json` preserves the final measurement after the Chrome compatibility fixes. The geolocation description adds 46 characters to explain actual permission observation. No input-schema structure, tool selection or initialization text changed. The earlier before/after description-pass snapshots above remain historical evidence.

| Final surface | Tools | Schema characters / bytes | Instructions | Combined characters | Estimated tokens, chars/4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Full compatibility | 97 | 60,653 / 60,653 | 1,168 | 61,821 | 15,456 |
| Page agent | 20 | 18,235 / 18,235 | 1,168 | 19,403 | 4,851 |

The final full catalog is **25.44% smaller** in combined schema/startup characters than the same 97-tool surface before the description pass. The compact page-agent result is unchanged. Settings now uses the final geolocation entry estimate, 199 tokens from its 793-character complete published entry. These estimates are not billed-token measurements.
