# Workflow helpers verification

`tc-1qe.23` adds typed explicit-target workflow helpers, bounded read waits, metadata-only assertions, and generic synthetic lookup/one-submit examples.

Canonical and plugin suites each pass **3 files / 66 tests**: workflow helpers 19, CLI 36, and action adapter 11. Canonical and mirror TypeScript checks pass. Parent-controlled MCP compilation produced the distribution used by example/CLI tests; source/distribution parity is 44 source files and 212 generated files. Scoped source, tests, examples and fixture copies match; excluded source-product terms and whitespace checks pass.

The tests cover exact string/boolean fill verification, sensitive-value omission, action/target identity, protected-action verification, mismatch exit 1 with a sticky uncertainty latch, malformed evidence exit 4, metadata-only CLI failures, fixed-entry read deadlines, late-result rejection and pre-aborted reads. One-submit examples reconcile an exact generated receipt after a dropped response with one submit attempt. Missing, mismatched, late and transport-failed receipts never replay or authorize cleanup; cleanup failure preserves an earlier workflow failure.

Integration found that the action adapter returned verified ordinary `actualValue` without its `sensitive:false` classification. The existing safe projection now publishes that explicit classification, and its existing adapter test asserts it. This is result evidence only; published input schemas and descriptions are unchanged.

The actual built stdio [workflow comparison](workflow-measurement.md) produces byte-identical artifacts from canonical and mirror scripts. It records the same one-read/one-action task and separates schema/startup overhead, response size, outer MCP round trips and backend operations. The frozen baseline is unchanged.

Active browser guidance was updated to use protected saved-login handoffs, enforced group ownership and no replay after uncertainty; obsolete counts and universal loading claims were removed. Existing dirty documentation was patched in place. Examples contain generated records only. No model, real browser, user backend, credential store, runtime reload, global installation or publication was used.
