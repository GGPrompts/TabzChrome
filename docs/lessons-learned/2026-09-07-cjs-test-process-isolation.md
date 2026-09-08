# Isolate CommonJS process dependencies before importing tests

The catch-up baseline exposed terminal registry tests that imported the real PTY handler and spawned terminals. The first backend run was interrupted. The test-created `Claude Test` tmux session was identified by its exact name and creation timestamp and removed; no unrelated session was changed.

Mocking an ESM import does not necessarily intercept a production CommonJS `require('child_process')` or `require('./pty-handler')`. Install the test boundary before importing the registry or spawn service. The backend helper now substitutes those process dependencies in memory, restores the loader after the suite, and throws for unsupported process operations. Tests continue to execute the actual registry and spawn logic.

Inspect process boundaries before running a newly encountered backend suite. A green assertion is insufficient evidence that tests were isolated; check that the boundary covers both plain and `node:` module names. New process behaviors should receive explicit fakes and assertions rather than silently returning success.
