# Capture lifecycle and byte limits

Capture producers must invalidate access synchronously when navigation or ownership changes. Cleanup can wait for a debugger queue; revocation cannot. A late callback must compare its captured session against the current session before changing state, or it can invalidate a replacement session. Trusted document commits repopulate the frame tree; URL equality alone does not prove document identity.

Retained row limits do not bound queued asynchronous callbacks. Deep capture also limits pending event count and bytes, redacts before queueing, and rechecks ownership after asynchronous lookups. Response and stream limits count UTF-8 bytes. Decoding an arbitrary byte slice with replacement characters can exceed the requested byte budget; truncation must stop at a valid UTF-8 boundary.

Debugger domain cleanup belongs in `finally`. Reusing a persistent debugger attachment means a failed operation will not detach it, so detach cannot be relied on to reset enabled CSS, Page, DOM or Profiler domains. Stop tracking before disabling domains, and preserve the attachment owned by another feature.

Regression coverage lives in `documentProtection.test.ts`, `deepCapture.test.ts`, `deepCaptureLimits.test.ts`, `networkCapture.test.ts`, and `debuggerConcurrencyCoverage.test.ts` under `tests/unit/background/`. These mocked checks do not replace loaded-Chrome acceptance.

A separate integration failure showed that a generated settings catalog can advertise a tool omitted by the server's `ALL_TOOL_IDS` filter. `presetSession.test.ts` now verifies deep capture through actual MCP `tools/list`, rather than only inspecting registration source.

Page saving has a second lifecycle race: a tab can finish loading between a status check and installing its completion listener. Subscribe to updates and closure first, then immediately recheck the tab; remove both listeners and the deadline timer on every terminal path. Once loading completes, revalidate ownership and document identity before capture and again before releasing its content. The one-shot MHTML operation remains subject to separate live Chrome acceptance.
