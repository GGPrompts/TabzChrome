# Gate 4 verification

`tc-1qe.15` passed local integration verification on 2026-09-07. Beads is the execution-state authority.

| Check | Result |
| --- | --- |
| Full extension suite after final handler repairs | 59 files / 1,144 tests passed |
| Full backend suite | 22 files / 288 tests passed |
| Full canonical and plugin MCP suites | 10 files / 120 tests passed in each copy |
| Extension TypeScript and local extension/MCP builds | Passed after final repairs |
| Built tools/list | Exact 91-tool generated-catalog parity; strict top-level schemas |
| Frozen-selection stdio smoke | Passed; original 86-tool measurement selection retained |
| Canonical/plugin source and generated artifacts | 33 source / 172 generated files match after final guidance rebuild |
| Final handler repair integration checks | Focused 19 tests, background 172 tests, ownership 16 tests passed; included in full rerun |
| Final guidance checks | 6 tests passed in each MCP copy |
| Generated catalog worktree and whitespace checks | Passed |

The full review covered the store's path, owner, mode and symlink checks; atomic rotation; extension-only metadata administration; protected prompt recovery and terminal surfaces; exact-socket host/capability preflight; verified/protected fill outcomes; manual handoff redirects and deadlines; and document/capture admission. Tests use temporary synthetic stores, mocked Chrome, in-memory transports and test-owned ephemeral servers.

Gate review found and repaired legacy element inspection bypassing document admission. Its public handler now requires readable admission, exact injection identity and a final identity check before returning HTML/text/styles. Arbitrary-selector clicks are refused on protected documents; ordinary clicks use exact-document targets, one activation and a fixed deadline that includes queue time. Page highlights cannot target replacement documents. Navigation responses report the caller's requested URL rather than stale browser metadata. The original catalog assertions were updated from 87 to 91 tools, explicitly checking the four login additions. An old fixture guide's password-in-tool-arguments example was replaced with a non-sensitive feedback form example.

These are page-tool protections, not whole-agent or browser-wide data isolation. The plaintext store is accessible to unrestricted same-user filesystem capabilities. Legacy history, sessions, bookmarks, download history and cookies have no document provenance and can expose information a site copies into browser-wide data. They retain their existing functionality and separate policies; the page-agent preset excludes those broader surfaces. Native Windows storage is unsupported; WSL requires private Linux filesystem semantics. Key values trim surrounding whitespace. Trusted CDP dispatch blocks page inspection for the tab's lifetime. Manual completion and ordinary saved fill keep their exact documents protected until fresh navigation; prior document identities remain protected on restoration.

The local build/sync steps follow `.claude/commands/rebuild.md`. Windows sync, user service restart, browser reload and live Chrome acceptance are not performed. No commit or push is part of this run. The prepared human acceptance record remains `loaded-chrome-acceptance.md`; automated checks do not complete it. Logs are `/tmp/tabz-execute/gate4-*`.
