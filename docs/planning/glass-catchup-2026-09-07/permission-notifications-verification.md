# Background permission notifications

`tc-1qe.18` moves permission/question desktop notification detection into the extension background lifecycle. Beads owns execution status.

Polling uses persisted terminal metadata and bounded requests to the existing pane-aware status endpoint. Each poll schedules its successor only after completion, and lifecycle generations invalidate late responses. Protected terminals (`secret: true` or the protected session prefix) are excluded before status requests. Terminal UI hooks retain their status/history and audio roles while reporting view focus for notification suppression.

Desktop notifications retain the master toggle, question event preference and quiet hours. Background transition tracking and deduplication prevent remounting a view from producing another desktop alert. Existing audio and non-prompt notification preferences remain part of their current UI paths.

The existing status endpoint now includes the matched pane's foreground command and returns unknown when a requested named session is unavailable. It does not borrow another terminal's working-directory state. Existing split-pane status selection and per-pane audio remain intact. The New Tab status request now uses the endpoint's actual `sessionName` parameter.

| Check | Result |
| --- | --- |
| Background prompt, status/session/audio hooks and shared transitions | 6 files / 143 tests passed |
| Protected-terminal backend routes, including missing-session and pane attribution regressions | 1 file / 11 tests passed |
| Extension TypeScript project | Passed |
| Whitespace check | Passed |

Logs: `/tmp/tabz-execute/prompt-final.log`, `prompt-backend-parent.log`, `prompt-types.log`. Loaded Chrome notification timing, focus behavior and click navigation remain pending human acceptance. Chrome may delay alarm delivery; no exact real-time notification latency is promised.
