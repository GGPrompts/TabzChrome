# Gate 6: published overhead and compatibility

`tc-1qe.21` verifies the complete measured description pass and retained legacy surface. See `tool-overhead-verification.md` for exact bytes, characters, estimates, comparison sets and source/payload hashes.

| Check | Result |
| --- | --- |
| Full root suite | 79 files / 1,299 tests passed |
| Full backend suite | 24 files / 310 tests passed |
| Canonical and plugin MCP suites | 20 files / 183 tests passed in each copy |
| Extension TypeScript and `/rebuild` extension step | Passed |
| `/rebuild` MCP compilation and plugin copy | Passed |
| Source/distribution/package sync | 40 source / 200 distribution files and metadata match |
| Action enum and worktree catalog | Current; 97 tools |
| Rebuilt isolated stdio measurement | Full97 and page20 payload hashes match the recorded post-pass artifacts |
| Whitespace | Passed |

The gate updated one stale login test to verify deferred result-enum documentation through `tabz_docs`, while retaining its explicit never-request-credentials assertion. The detailed manual-login guide now explicitly limits automated submission to prepublished refs, matching the enforced protection boundary. This documentation repair does not change measured schemas or startup instructions.

Logs are `/tmp/tabz-execute/gate6-*`. The extension build's large-chunk advisory remains unchanged. All evidence uses synthetic transports and local build artifacts; no loaded-Chrome, runtime reload, Windows sync or publication evidence is implied.
