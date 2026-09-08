# Saved logins

Saved logins let a person enter credentials locally and let browser tools request a host-matched fill. Tool responses report field names, readiness and verification results; they do not return saved values or populate edit forms with them.

The backend stores entries beneath `~/.tabzchrome`, using the operating-system home directory. `TABZ_HOME` selects a different store location. There is no automatic import from another product's directory.

## Storage boundary

Store and key directories must be owned by the backend user and private (`0700`); secret files must be regular, owned files with mode `0600`. Unsafe paths, symlinks and unsupported permission semantics are refused. A temporary owned probe checks that the filesystem enforces permission changes. Rotation stages new protected files before replacing the configuration, then removes superseded keys that no remaining entry references. Deletion removes the configuration entry before cleaning up its unreferenced files. Failed writes retain the previous login. Blank fields on an existing-entry update retain saved values; omitted extra fields are removed.

Use Linux, macOS, or WSL with the store in the WSL Linux home. Native Windows is unsupported for this file-permission model. Windows-mounted WSL storage is not a substitute for an owner-private Unix filesystem.

These are local plaintext files protected by filesystem permissions, not an encrypted vault. A process or tool with unrestricted filesystem access as the backend user can read that user's files, including through a shell or file-reading interface. The saved-login and browser interfaces use values without returning them to a model; they do not sandbox every other tool available to an agent or isolate the target website.

The current key-file format strips surrounding whitespace from secret values. It does not support passwords whose leading or trailing whitespace is significant.

## Host matching

A fill is authorized against the actual target tab's hostname. A requested saved-host name can select among matching entries but cannot override that hostname check. Ports do not widen hostname matching.

Wildcard matching stays within one hostname label. A literal registrable domain must remain below a recognized public or private suffix: `*.customer.co.il` can be valid, while `*.co.il`, `*.github.io` and `*.workers.dev` are refused. Exact hosts are preferable when only one site needs the login. Public-suffix validation uses [tldts](https://github.com/remusao/tldts) with private suffixes enabled; this limits pattern breadth and does not prove domain ownership.

## Protected human entry

Credential metadata administration requires the configured Tabz extension Origin. Credential-entry terminals are protected from ordinary terminal enumeration, capture, typing, reattachment and control tools. Recovery preserves their protected classification, and only the trusted extension receives a reduced terminal record. Enter credentials only through the human entry flow, never in MCP arguments, shell commands, issue text or agent messages.

## Dashboard and tool workflow

Open **Logins** in the dashboard to manage entries. Editing shows saved-field presence and names, not saved values. Leave an existing field blank to keep its saved value; enter a replacement to rotate it. Unsaved edits are protected when changing dashboard sections or receiving a request for another host.

`tabz_secret_request` opens the human entry surface and waits briefly. `tabz_secret_status` checks readiness without opening an editor. Once ready, `tabz_fill_secret` identifies the saved field by name and fills an input on the matching host; the caller does not supply or receive its value.

`tabz_request_login` instead asks the person to sign in on the site, for example with a password manager or SSO. Its short wait can be repeated. Two observations without a login prompt are a heuristic: the compatibility status `signed_in` does not prove the site granted authenticated access. Verify the application's authenticated state separately before continuing a workflow that requires it. Login probe URLs omit user information, query strings and fragments.

## Browser read protection

Before a saved field enters a page or a manual login handoff begins, the extension records the Chrome document identity in session storage. This applies to saved usernames and named fields as well as passwords. The record contains identifiers, not values or hashes of values.

Page-content reads, arbitrary scripts, screenshots, page exports and diagnostic captures must not return content from a protected document. Capture admission happens before buffering or forwarding, and existing capture rows are pruned when protection begins. Legacy arbitrary-selector clicks are refused on protected documents because selectors can test page data. Navigation and human interaction remain available under tab ownership rules.

To automate a submit button, obtain its opaque ref with `tabz_read_page` before filling saved fields, then use that ref with a synthetic `tabz_act` click. The ref must still belong to the same document and caller. Repeated saved-field fills do not invalidate that same-document ref, but rereading, navigation, removal or ownership changes do. Protected clicks cannot use selectors, text, coordinates, trusted CDP input or recovery reads. If a ref has expired while the page is protected, ask the person to submit rather than trying to inspect it again.

Protection follows document identity rather than the URL: changing a fragment or navigating within an SPA does not clear it, and Back/Forward restoration of an earlier document retains it. A verified fresh document may permit normal inspection. A same-document login can therefore finish while content inspection remains blocked; navigate to a fresh page before verifying the application's authenticated state. Missing identity, unavailable protection storage and uncertain operations fail closed.

Manual handoff protection spans redirects and short polling windows. Completing the handoff protects the completion document before retiring the handoff reservation, so that document still requires fresh navigation for inspection. The handoff covers the selected tab; a sign-in popup or another tab needs its own handoff before credential entry there.

Use the default filling mode first. Optional `trusted: true` sends browser keyboard events, whose target cannot be bound atomically to a document. Once trusted dispatch begins, inspection and diagnostic capture stay blocked for that entire tab until it closes, even after a successful fill or fresh navigation. Navigation and human interaction remain available; a separate new tab can be used for subsequent authenticated work when appropriate. Do not replay an uncertain sign-in mutation merely to recover inspection.

This is a page-tool boundary, not browser-wide data isolation. Legacy history, recently closed/synced sessions, bookmarks, download history and cookie tools operate on browser-wide data without the protected page's document identity. A site can copy information into that data, including titles or URLs; these tools are not covered by document protection. Cookie tools have their own value-redaction policy. The `page-agent` preset excludes these broader tools. Giving an agent broader presets or same-user filesystem access expands what it can read; saved logins do not make those capabilities secret-blind.

Agent page access supports HTTP and HTTPS. Local files, `data:` and `blob:` pages are not supported inspection targets; granting the extension local-file permission does not make the credential store an agent-readable page. This browser boundary does not control what a target website does with values it receives, or isolate arbitrary same-user shell processes.
