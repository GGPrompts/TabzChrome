# Browser deadlines and verified fills

A backend timeout does not stop work already queued in Chrome. Compute a deadline before dispatching injected code, check it at the start of each polling callback, and check again after focus handlers before writing. Starting a fresh timeout inside the injected function would permit a delayed injection to mutate after the caller stopped waiting.

A successful assignment also does not establish a successful fill. Use the native input setter, allow controlled fields to settle, re-query replaced nodes, and compare browser-normalized values. Classify both the original and replacement field as potentially sensitive. Otherwise a plain input replaced by a password input could expose the replacement value during read-back.

Only enter the script whitelist fallback before debugger evaluation starts. Evaluation errors and timeouts can follow partial mutations, so they must never trigger a second execution path. The explicit all-frame mode uses the supported whitelist and reports its first-frame-result limitation.

Chrome documents the `Runtime.evaluate` timeout and `Runtime.terminateExecution` as experimental. Termination can affect current or next execution; an acknowledgment is not evidence that earlier statements did nothing. Keep timeout outcomes uncertain and retain the per-tab queue through bounded cleanup. See the [official Runtime protocol](https://chromedevtools.github.io/devtools-protocol/tot/Runtime/).

Temporary debugger calls must not detach persistent emulation or capture owners. Failed acquisition must release only the ownership acquired by that call. Coverage also needs to cancel its load listener and timer if the reload fails.

The regressions use mocked Chrome and synthetic values in the background debugger, script, and fill suites, plus backend forwarding and MCP result tests. Loaded-browser acceptance remains separate.
