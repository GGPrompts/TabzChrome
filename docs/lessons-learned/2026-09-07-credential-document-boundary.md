# Credential secrecy needs a document boundary

The Glass catch-up review found that redacting password inputs in DOM summaries does not stop arbitrary script evaluation from reading the same value. A script can use an alias or an encoded property name, so filtering JavaScript text does not establish a reliable boundary. Saved usernames and named fields have the same issue when the store promises not to disclose their values.

TabzChrome records the Chrome document identity before saved entry or manual handoff, then refuses content reads from that document. The record survives service-worker restarts and retains historical identities for Back/Forward cache restoration. URL equality is insufficient: an SPA can retain a credential while its URL changes, and different documents can use the same URL.

Read and fill admission serialize per tab. This queue must remain separate from the debugger queue: a fill can hold document admission while acquiring a debugger, and using the same non-reentrant mutex for both would deadlock. Read adapters validate the document again before returning a result. A timed-out operation is not proof that Chrome stopped executing it.

Audit every legacy adapter as well as the new tools. The integration gate found that `tabz_get_element` still used only the page-scheme guard, so its HTML/text response bypassed document protection even though the newer DOM and script handlers were guarded. A protected-document regression must exercise the public legacy handler, not just the shared protection module.

Trusted keyboard input needs extra care because CDP input commands target a tab rather than an injection document ID. Uncertain dispatch or navigation cannot simply release protection and assume a replacement document is safe. The conservative recovery boundary is recorded explicitly, and successful type checks before a command do not make the command atomic with navigation.

Captures must enforce the boundary before buffering or forwarding content. Protecting the main document also suppresses iframe captures; checking only each event's frame document would miss credentials entered through an embedded login. Navigation invalidates cached capture eligibility until the main document is verified again. Late console/header/body callbacks cannot restore pruned rows.

Screenshots require a target-bound capture API. Validating one tab and then using window-scoped `captureVisibleTab` can capture a different tab after an activation race. A before/after active-tab comparison is not an atomic capture guarantee.

Keep ordinary compatibility and security evidence together: synthetic tests cover named fields, controlled replacements, select/checkbox behavior, Unicode input, deadlines, navigation, iframe capture, restart, and historical documents. These tests do not establish loaded-Chrome acceptance. The same-document restriction and same-user shell/target-website limits are part of the product contract; see [saved logins](../saved-logins.md).
