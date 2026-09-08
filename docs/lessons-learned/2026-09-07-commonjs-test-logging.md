# CommonJS test imports can reset runtime logs

The backend logger previously initialized its output at module import by truncating `backend/logs/unified.log`. A route test that only intends to exercise a synthetic HTTP fixture still reaches this side effect through `require()`.

During the catch-up run, backend tests reached this import before the problem was identified. The runtime log was not read, and no reconstruction was attempted. Earlier process-boundary fakes prevented PTY launches but did not isolate logging.

`backend/tests/setup-logging.js` now installs a CommonJS loader boundary before test imports and provides an in-memory logger. Vitest ESM `vi.mock` alone does not intercept dependencies loaded by production CommonJS `require()`. The regression test refuses filesystem creation/writes while importing and using the logger, so a future missing boundary fails before it can reset a real log.

Audit module-initialization effects as well as functions explicitly called by a test. Synthetic request data is insufficient isolation when imports open production files or subprocesses.

The protected login prompt revealed the same issue in production: importing the credential store also imports logging in a separate utility process. Logger initialization now opens an append stream and appends its startup marker. `logger-append.test.js` evaluates the production logger with filesystem fakes that reject truncation; it never opens the runtime log. The global test sink remains necessary to avoid test writes and streams.
