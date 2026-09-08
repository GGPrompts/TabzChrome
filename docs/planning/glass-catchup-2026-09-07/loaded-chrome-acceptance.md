# Loaded Chrome acceptance record

Status: **not run**. This is the prepared record for `tc-1qe.27`, after the full automated gate (`tc-1qe.26`). Passing local tests or producing extension bundles does not fill in this record.

## Environment and authorization

Record the authorized Chrome instance, loaded extension revision/build, backend revision, platform, and task-owned tab/group identities. Record extension build, any approved folder sync, backend restart, and human extension reload separately. Use a temporary store containing only synthetic credentials. Do not inspect the person's existing credential store or runtime logs.

| Check | Evidence / result |
| --- | --- |
| Full automated gate passed for this worktree | Passed: `tc-1qe.26`, see `gate8-verification.md`; recheck if the worktree changes |
| Loaded extension revision and backend revision identified | Pending |
| Authorized runtime/reload steps recorded | Pending |
| Temporary synthetic store and fixture ownership recorded | Pending |
| Linux / macOS / WSL environments actually exercised | Pending; list unavailable environments explicitly |

## User-visible walkthrough

| Area | Acceptance to exercise | Evidence / result |
| --- | --- | --- |
| Logins forms | Add, rotate and delete a synthetic login and named fields; saved values never hydrate forms; blank rotation preserves existing fields | Pending |
| Unsaved entries | Sidebar, Quick Open, hash changes, another host request, and close/reload cannot silently discard a dirty form | Pending |
| Protected dashboard | Reuse an ungrouped Logins dashboard, including a loading tab; agent screenshots/scripts/DOM/network/actions refuse extension pages | Pending |
| Saved fill | Wrong host/type, changed password type, navigation and deadline refuse late mutation; controlled inputs settle before verification; exercise Unicode and selects | Pending |
| Trusted fill limit | After trusted keyboard dispatch, content inspection remains blocked for the tab's lifetime, including after navigation; default filling retains document-based protection | Pending |
| Read protection | After saved fill or manual entry begins, script aliases, legacy element inspection, DOM reads, screenshots and capture/export paths cannot retrieve the synthetic value; arbitrary-selector clicks refuse protected documents | Pending |
| Protected submit refs | Read a submit ref before filling two saved fields; one synthetic ref click can submit on that same document without page-content reads. Reread, navigation and ownership changes invalidate refs; stale protected refs require human submission | Pending |
| Document lifecycle | Same-document/hash/history transitions retain protection; fresh documents permit normal inspection; restoring an earlier protected document through Back/Forward remains protected | Pending |
| Manual handoff | Protection spans SSO redirects and pending wait windows before focus/notification; timeout and closed-tab cleanup work; completion protects its document, prompt disappearance remains a heuristic | Pending |
| Agent ownership | Two distinct agents cannot read, control or inherit the other's tabs, capture rows or pending work; unrelated user tabs remain intact | Pending |
| Browser diagnostics | Screenshots, zoom/scroll, console and network capture operate on ordinary synthetic pages; switching ownership does not expose earlier captures | Pending |
| Capture geometry | Compare viewport/element/crop/full-page captures at multiple browser zoom and device-pixel ratios; burst capture scheduling and nested-scroller/sticky restoration survive errors | Pending |
| Early console bridge | Reload an ordinary fixture with synchronous startup console/error events and an iframe; methods execute once and logs identify their real origin without flooding | Pending |
| Deep capture lifecycle | Exercise redirect/failure rows, bounded body/stream pages and CSS joins; reload without console activity admits only trusted new documents; protected or old-owner frames never reappear | Pending |
| Capture permission update | Record the loaded build accepting the webNavigation permission and minimum supported Chrome version | Pending |
| CLI uncertainty | Drop a response from a task-owned fixture; inspect receipt/status and reconcile the action without repeating an uncertain mutation | Pending |
| Toolbar toggle | Click the toolbar icon repeatedly to open and close the panel; context-menu and popup opens still work | Pending |
| Screenshot folder | Change and save the default folder, enable connection folders, and verify captures; explicit tool output paths still win and old settings retain the legacy default | Pending |
| Emulation | Observe granted/prompt/denied/unknown location states on a synthetic site; clear the override; exercise network throttling/clear and unavailable or policy-denied commands | Pending |
| Page saving | Save a task-owned loading page as MHTML; exercise completion, close and navigation races; verify the resulting file and record remaining download limitations | Pending |
| Background alerts | With the side panel closed, exercise synthetic permission/question status transitions, preference and quiet-hour suppression, focused-view suppression and protected-terminal exclusion | Pending |
| Terminal recovery | Ordinary terminal recovery still works; protected entry terminals stay hidden from agent capture/control and automated polling | Pending |
| Files | Browse Here changes only the tree; Set as Working Dir changes the shared working directory and recent entries | Pending |
| Rendering | Check Logins layout, keyboard interaction, error/loading states and console errors | Pending |

The store is plaintext under private filesystem permissions. Native Windows storage is unsupported; WSL storage must use the Linux filesystem. The inherited key format trims surrounding whitespace. Browser read protection does not isolate arbitrary processes running as the same user or code running on the target website. Browser-wide history, session, bookmark, download-history and cookie tools lack document provenance and have separate limits; see [saved logins](../../saved-logins.md). Same-document/SPA authentication may require fresh-document navigation before inspection resumes.

## Published MCP measurements

Record the actual loaded full and `page-agent` tool catalogs and initialization instructions using the same serialization method as the automated measurement artifacts. Keep character/byte counts and tokenizer estimates distinct from billed token costs. Record tool-call counts and response sizes for the same synthetic read/action workflow. Do not substitute the original frozen 86-tool selection for the final published full catalog.

## Cleanup and disposition

Record cleanup of only task-owned temporary credentials, files, tabs and groups. List any remaining owned artifacts and any unperformed platform checks. Keep `tc-1qe.27` and the epic open when required acceptance lacks evidence. Product acceptance does not authorize commit, push, publishing or deployment.
