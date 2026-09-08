# Credential backend verification

`tc-1qe.12` passed local verification on 2026-09-07. The exact four-suite check passed 101 tests in the final worker run. The parent then ran the complete backend suite: 21 files / 274 tests passed. Syntax and whitespace checks also passed. Evidence: `/tmp/tabz-execute/credential-backend-full-parent.log`; earlier scoped evidence is under `/tmp/tabz-execute/credential-*.log`.

The reviewed implementation includes Tabz-only store paths, metadata without saved usernames or field values, actual-host-first resolution, sender-bound fill dispatch, trusted-Origin administration, and protected prompt reservations. Store tests cover public/private suffix validation, platform refusal, real permission-change probes on synthetic files, unsafe modes/ownership/paths, shared keys, staged writes, partial failures, rotation and deletion. Terminal tests cover API/WS capture and control, exact tmux targets, persistent classification, reduced records, and late lifecycle/output filtering.

A direct backend dependency on `tldts@7.0.17` supplies maintained suffix data instead of the incomplete source list. Installation used `--ignore-scripts`; the manifest/lock diff adds that package and its core dependency only. Native Windows is intentionally refused; Linux/macOS/WSL cases here are synthetic tests, not native-platform acceptance.

The logger now appends startup markers rather than truncating the running backend log when utility processes import it. Production behavior is tested with filesystem fakes; all backend tests use the global in-memory logging boundary. The earlier runtime-log reset discovered during testing is documented in the CommonJS logging lesson; that log was not read or reconstructed.

No actual credential store, user backend, browser tab, or tmux session was used for these checks. Values in tests were synthetic and filesystem fixtures temporary. No commit, push, deployment, runtime reload, or global configuration was performed.

This verifies the backend slice only. The Logins UI/handoff and final extension-side saved-value enforcement remain the following planned issues; backend tests alone do not accept the complete production credential feature. Storage is plaintext under private filesystem permissions and does not isolate same-user shell processes. The inherited key format normalizes surrounding whitespace; see `docs/saved-logins.md` for that compatibility limit.
