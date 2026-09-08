import { createRequire } from 'node:module'
import { afterAll, vi } from 'vitest'

const require = createRequire(import.meta.url)
const Module = require('module')
const loggerPath = require.resolve('../modules/logger.js')
const originalLoad = Module._load
const makeLogger = () => Object.fromEntries(
  ['info', 'success', 'warn', 'error', 'debug', 'fatal', 'start', 'ready'].map(level => [level, vi.fn()])
)
const fakeLogger = {
  logger: makeLogger(),
  createModuleLogger: vi.fn(makeLogger),
  appendBrowserLogs: vi.fn(),
  UNIFIED_LOG_PATH: 'synthetic-log-sink'
}

// Production uses CommonJS require(), which vi.mock does not intercept. Never
// import the real logger here: its module initialization truncates unified.log.
function loadWithTestLogging(request, parent, isMain) {
  if (/(?:^|[/\\])logger(?:\.js)?$/.test(request) &&
      Module._resolveFilename(request, parent, isMain) === loggerPath) {
    return fakeLogger
  }
  return originalLoad.call(this, request, parent, isMain)
}
Module._load = loadWithTestLogging

afterAll(() => {
  if (Module._load === loadWithTestLogging) Module._load = originalLoad
})
