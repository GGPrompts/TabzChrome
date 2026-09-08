import { createRequire } from 'node:module'
import { afterAll } from 'vitest'

const require = createRequire(import.meta.url)
const Module = require('module')

// CJS production modules load their dependencies with require(), so Vitest's
// ESM mocks do not intercept them. Patch that loader before importing either
// registry suite to keep every PTY and child-process operation in memory.
export const fakePtyHandler = {
  on: () => {},
  removeAllListeners: () => {},
  createPTY: (config) => ({
    id: config.id,
    name: config.name,
    status: 'active',
    tmuxSession: config.useTmux ? (config.sessionName || config.name) : null,
    process: {}
  }),
  killPTY: async () => true,
  disconnectPTY: () => {},
  reconnectPTY: () => null,
  canReconnectPTY: () => false,
  cancelDisconnect: () => false,
  getProcess: () => null,
  cleanupImmediate: () => {},
  tmuxSessionExists: () => false,
  setTmuxOption: () => {},
  getTmuxOption: () => '',
  writeData: () => {},
  resize: (_id, cols, rows) => ({ cols, rows })
}

export const fakeChildProcess = {
  execSync: () => '',
  exec: unsupportedProcessOperation('exec'),
  spawn: unsupportedProcessOperation('spawn'),
  execFileSync: unsupportedProcessOperation('execFileSync'),
  spawnSync: unsupportedProcessOperation('spawnSync')
}

const originalLoad = Module._load
function unsupportedProcessOperation(operation) {
  return () => {
    throw new Error(`Test process boundary blocked child_process.${operation}`)
  }
}

function testModuleLoad(request, parent, isMain) {
  if (request === 'child_process' || request === 'node:child_process') return fakeChildProcess
  if (request === './pty-handler') {
    return fakePtyHandler
  }
  return originalLoad.call(this, request, parent, isMain)
}

Module._load = testModuleLoad

afterAll(() => {
  if (Module._load === testModuleLoad) {
    Module._load = originalLoad
  }
})
