# Logins UI and handoff verification

`tc-1qe.13` passed local verification on 2026-09-07.

| Check | Result |
| --- | --- |
| Required dashboard/background suites | 4 files / 30 tests passed |
| Required MCP login, secrets and credential-guidance suites | 3 files / 51 tests passed in canonical and plugin copies |
| Parent full canonical MCP suite | 10 files / 111 tests passed |
| Parent login and secret backend routes | 2 files / 17 tests passed |
| Worker broader background integration | 14 files / 101 tests passed |
| Worker backend login, secret, release and fill integration | 4 files / 31 tests passed |
| Extension and both MCP TypeScript checks | Passed |
| Generated catalog | 91 tools; worktree check passed |
| Canonical/plugin source synchronization and whitespace | Passed |

Parent logs are `/tmp/tabz-execute/logins-ui-background-final.log`, `logins-mcp-final.log`, `logins-backend-parent.log`, and `logins-types-final.log`. The MCP build artifacts will be refreshed at the following credential integration gate; source parity here does not claim the existing build contains these tools.

The UI exposes presence and field names, never saved values. Rotation submits blank retained fields, failure retains edits, success clears them, and pending saves disable form mutations. Rotate and dashboard navigation protect unfinished work. Quick Open requests navigation approval before opening a file. Native confirmation presentation remains loaded-Chrome acceptance.

Dashboard opening is serialized, checks current and pending URLs, reuses only an ungrouped dashboard, and never creates a replacement after uncertain navigation. Only positively created tabs can be ungrouped by this flow. Login probes recheck ownership and navigation, remove URL userinfo/query/fragment, and return boolean form indicators. Backend result forwarding allowlists these fields. Extension/internal pages remain outside supported agent inspection and control.

The four new tools are `tabz_request_login`, `tabz_secret_request`, `tabz_secret_status`, and `tabz_fill_secret`. Tool summaries use `hasUsername`; saved usernames and arbitrary backend extras are omitted. Human waits share one overall deadline and reserve notification cleanup time. The compatibility status `signed_in` explicitly means two completed probes found no prompt, with `evidence: login_prompt_absent` and `authenticationConfirmed: false`; it does not establish authenticated access.

This slice does not complete the credential security feature. The following issue implements saved-fill enforcement and document protection before saved values or manual handoff, including the necessary read/capture boundaries. The final loaded-Chrome walkthrough remains separate. All checks here used synthetic fixtures/mocked Chrome or test-owned ephemeral servers; no runtime reload, real credential store, browser interaction, commit or push was performed.
