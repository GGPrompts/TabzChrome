# Synthetic workflow size and round trips

`tc-1qe.23` measures the same task in each mode: read the known synthetic orders page, then click `#submit` in tab 41 exactly once. The frozen pre-port fixture provides the baseline. The current build is measured using `node tabz-mcp-server/scripts/measure-workflow.mjs`; raw requests, responses and the frozen baseline hash are in `mcp-workflow-comparison.json`.

The script spawns the real built stdio MCP server against a test-owned ephemeral HTTP fixture. It does not call a model, Chrome, the user's backend, configuration or saved-login store. All modes perform one backend read and one backend action, with zero unexpected requests. Initialize and tools/list add two startup RPC round trips in each mode and are counted separately.

| Mode | Workflow MCP round trips | Backend read / action | Result payload bytes | Response envelope bytes |
| --- | ---: | ---: | ---: | ---: |
| Frozen pre-port legacy | 2 | 1 / 1 | 461 | 526 |
| Current legacy tools | 2 | 1 / 1 | 1,114 | 1,179 |
| Current `tabz_read_page` + `tabz_act` | 2 | 1 / 1 | 1,007 | 1,072 |
| Current sequential `tabz_batch` | 1 | 1 / 1 | 750 | 782 |

Result payload bytes measure the JSON array of tool results, excluding JSON-RPC envelopes. Envelope bytes sum the serialized response objects; newline framing is excluded. These fixtures are ASCII, so their character and UTF-8 byte counts agree.

Batching halves the outer workflow MCP round trips, from two to one, without reducing the number of backend operations. Compact separate results are 9.6% smaller than current legacy results; the batch response is 25.5% smaller than compact separate results. Those reductions compare different result representations: compact reads include an outline, legacy reads return page metadata, and batch sections retain text rather than the complete nested typed result objects. A dependent workflow still needs to read its result before deciding an unknown next action; this fixture can batch because the target is already known.

All current responses are larger than the original minimal baseline. The additional typed evidence supports deterministic callers and honest uncertainty handling. There is no claim that schema reduction also shrank every result, eliminated backend work, reduced model invocations, or established latency or billed-token savings. Schema/startup savings are measured independently in [tool overhead](tool-overhead-verification.md).

One-submit reconciliation is verified separately by the workflow-helper tests: after a dropped submit response, read for the exact expected receipt without submitting again. This protocol-size fixture does not establish real browser execution or loaded-Chrome acceptance.
