# CLI and package verification

`tc-1qe.22` ports the discover/call/run CLI and reusable client from the pinned Glass source, adapted to Tabz's 8129 page-agent endpoint and typed browser results.

- Canonical TypeScript build passed using the MCP build step of `/rebuild`; canonical source and generated output were copied to the plugin mirror. Parity: 43 source files and 208 generated files.
- Canonical and mirror CLI suites: 36 tests each. Synthetic ephemeral servers cover identities, preset isolation, required-tool/schema checks, input and image limits, signals, malformed/lost mutation results, sticky mismatch/uncertainty, receipt-only owned cleanup, and bounded session cleanup preserving the primary failure.
- An actual `npm pack --ignore-scripts` tarball was installed offline into `/tmp/tabz-execute/cli-installed`, without global writes. The installed symlink `node_modules/.bin/tabz --help` ran successfully. Importing `tabz-mcp-server/client` verified the client/error exports and default endpoint; declarations and the existing stdio entry point were present.
- Package and lock changes only add the executable and client exports; no dependency version changes or AI SDK were added. The client uses a 96-bit random run suffix. Node 18 remains the declared minimum.
- `git diff --check` passed. CLI tests require built `dist`; no implicit pretest build was introduced.

The open adapter already translates an explicit extension `created:true` receipt into public `status:"created"`/`opened:true`. Cleanup additionally requires a positive tab ID, the owning Claude group receipt, and no reuse flag. Missing or inferred creation does not authorize cleanup. A fill mismatch exits 1 but latches future mutations; unknown or malformed mutation evidence exits 4. Lost connections after dispatch do not authorize replay.

No user backend, browser, credential store, global installation, publication, or runtime reload was used for this verification. Loaded-Chrome acceptance remains separate.
