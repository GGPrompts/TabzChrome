# Tabz CLI

The CLI calls Tabz MCP directly without a model or AI SDK. It uses the running local Tabz backend and connected extension, with `http://localhost:8129/mcp/page-agent` as its default endpoint. Build the checkout through `/rebuild` before using the compiled CLI.

From the repository, the direct entry point is:

```bash
node tabz-mcp-server/dist/cli/index.js --help
node tabz-mcp-server/dist/cli/index.js discover
```

The built npm package also provides the `tabz` executable and `tabz-mcp-server/client` import. Its existing `node dist/index.js` MCP stdio entry point remains available.

## Commands

- `tabz discover` lists the selected preset's tools.
- `tabz call <tool> --input arguments.json` reads a JSON object from a file. Without `--input`, it reads standard input. JSON input is bounded to 1 MiB; it is not accepted as a command-line argument.
- `tabz run workflow.mjs` loads a trusted Node module that exports `requiredTools` and a default or named `run` function. Required tools and their schemas are checked before dispatch.

`--endpoint`, `--preset`, and `--timeout` select the MCP endpoint, named preset and per-request timeout. Environment equivalents are `TABZ_MCP_ENDPOINT`, `TABZ_MCP_PRESET`, and `TABZ_CLI_TIMEOUT_MS`. Endpoint URLs cannot contain userinfo credentials.

Each process has a new caller identity. Use one workflow for a sequence that must retain tab ownership; separate invocations do not inherit each other's tabs. Unknown presets expose only Core and fail required-tool preflight when a workflow needs more.

Successful command output is one JSON document on stdout; diagnostics go to stderr. Help is human-readable text. Image blocks are represented by metadata in stdout. Use `--output <file>` with `call` to save a returned image to an explicit new file, subject to `--max-binary-bytes` (20 MiB by default).

Browser screenshot paths are separate from CLI `--output`: MCP Settings → Screenshot location controls the default folder inside Chrome's Downloads directory. The upgrade default is `tabz/screenshots`, with connection subfolders off. Validate and save a new folder there to change future captures. A tool's explicit `outputPath` remains relative to Downloads and takes precedence over those settings.

## Results and cleanup

| Exit | Meaning |
| --- | --- |
| 0 | Success |
| 1 | Tool-reported failure, including a definite fill mismatch |
| 2 | Usage, input-schema or required-tool error |
| 3 | Read/session/transport failure |
| 4 | Uncertain mutation or a mutation blocked by earlier uncertainty |

A lost or malformed mutation response does not authorize a retry. Read tools can inspect the outcome; uncertainty remains latched for later mutations. A fill mismatch also blocks subsequent mutations in that client. Reconciliation is a deliberate workflow decision, not an automatic replay.

Browser-tab cleanup requires a positive creation receipt from that same client. The MCP open adapter emits `status: "created"` and `opened: true` only after the extension confirms creation with a positive tab ID. Requested `newTab`, reused/navigated results and a returned tab ID alone are insufficient. Session cleanup uses one bounded deadline for HTTP DELETE and SDK close and preserves the original workflow failure.

For saved credentials, call the saved-login tools with a host and field reference. Do not read the credential store or put credential values in workflow source, JSON input, diagnostics or command-line arguments. Human MFA and manual sign-in remain human actions; a missing login prompt does not establish authenticated access.

## Workflow helpers

`tabz-mcp-server/client` also exports `TabzWorkflowClient`, `waitFor`, and `assert`. The wrapper uses explicit tab targets and validates typed results from opens, fills, actions and reads. Its `act` helper covers the ten page-interaction verbs; use `client.callTool` for screenshot, zoom, wait, saved-login tools and other operations. Ordinary fills require an exact string or boolean read-back; sensitive fills require verified evidence without returning the value.

`waitFor` accepts a classified read callback and an options object with `operation`, a safe `targetLabel`, `deadline`, `interval`, and `maxAttempts`. `deadline` is a total millisecond budget from entry, including all attempts; it is not an absolute timestamp or a fresh budget for each retry. Supply the workflow's `signal` for cancellation. Use static labels in assertions and errors, never page text or credential values. The helper bounds waiting; it does not turn an arbitrary callback into a safe read.

The package includes two trusted workflow modules and a synthetic HTML fixture:

- `examples/synthetic-lookup.mjs` fills a generated item ID, clicks once, and checks an exact result.
- `examples/synthetic-one-submit.mjs` checks a receipt containing a generated request ID and a submission count of one. After a dropped response it reads for that receipt, without another submit attempt. Missing, mismatched, late or failed receipt reads do not authorize replay or uncertain-tab cleanup.
- `examples/synthetic-workflow-fixture.html` contains only generated records and forms, with no external requests.

For an explicitly authorized browser walkthrough, serve the fixture from a task-owned local HTTP server, then set `TABZ_FIXTURE_URL` to its URL and run the chosen module with `tabz run`. The examples create their own tabs. Successful normal cleanup closes that created tab; reconciled cleanup uses the same client's creation ledger and keeps the mutation uncertainty latch. Cleanup errors cannot replace an earlier workflow failure. Automated tests simulate lost responses; the fixture itself does not damage or disconnect a running transport.

Automated CLI/package verification and [workflow measurements](planning/glass-catchup-2026-09-07/workflow-measurement.md) are recorded under `docs/planning/glass-catchup-2026-09-07/`. They do not establish loaded-Chrome acceptance.
