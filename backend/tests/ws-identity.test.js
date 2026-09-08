import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'
import './helpers/process-boundary-fake.js'

const require = createRequire(import.meta.url)
const identity = require('../modules/ws-identity.js')
const registry = require('../modules/terminal-registry.js')
const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop'
const EXT = `chrome-extension://${EXT_ID}`
const policy = { extensionIds: [EXT_ID] }

function socket(origin) {
  const ws = { sent: [], readyState: 1, send(frame) { this.sent.push(JSON.parse(frame)) } }
  identity.markConnection(ws, { headers: origin === undefined ? {} : { origin } }, policy)
  return ws
}

describe('WebSocket extension identity', () => {
  it('anchors sidebar membership on the configured upgrade origin', () => {
    const members = new Set()
    const page = socket('http://localhost:5173')
    const localTool = socket(undefined)
    const extension = socket(EXT)
    expect(identity.applyIdentify(page, { clientType: 'sidebar' }, members).member).toBe(false)
    expect(identity.applyIdentify(localTool, { clientType: 'sidebar' }, members).member).toBe(false)
    expect(identity.applyIdentify(extension, { clientType: 'sidebar', extensionId: EXT_ID }, members).member).toBe(true)
    expect([...members]).toEqual([extension])
  })

  it('rejects a mismatched identify claim and browser result frames from local tools', () => {
    const extension = socket(EXT)
    expect(identity.applyIdentify(extension, { clientType: 'sidebar', extensionId: 'ponmlkjihgfedcbaponmlkjihgfedcba' }, new Set()).member).toBe(false)
    const localTool = socket(undefined)
    expect(identity.acceptsBrowserFrame(localTool, { type: 'browser-fill-input-result' })).toBe(false)
    expect(identity.acceptsBrowserFrame(localTool, { type: 'list-terminals' })).toBe(true)
  })

  it('sends a browser request to the newest identified extension only', () => {
    const members = new Set()
    const older = socket(EXT)
    const newer = socket(EXT)
    identity.applyIdentify(older, { clientType: 'sidebar' }, members)
    identity.applyIdentify(newer, { clientType: 'sidebar' }, members)
    const channel = identity.createExtensionChannel(members)
    expect(channel.sendToOne({ type: 'browser-fill-input', value: 'synthetic' })).toBe(1)
    expect(older.sent).toEqual([])
    expect(newer.sent).toHaveLength(1)
  })

  it('does not replay an uncertain send onto an older extension socket', () => {
    const members = new Set()
    const older = socket(EXT)
    const newer = socket(EXT)
    identity.applyIdentify(older, { clientType: 'sidebar' }, members)
    identity.applyIdentify(newer, { clientType: 'sidebar' }, members)
    newer.send = () => { throw new Error('synthetic EPIPE') }
    const channel = identity.createExtensionChannel(members, { activeConnections: new Set([older, newer]), log: { error() {} } })
    expect(channel.sendToOne({ type: 'browser-click-element' })).toBe(0)
    expect(older.sent).toEqual([])
  })
})

describe('protected terminal WebSocket boundary', () => {
  function protectedTerminal() {
    return {
      id: 'ctt-secret-fixture',
      name: 'Login editor',
      terminalType: 'bash',
      state: 'active',
      secret: true,
      secretKeyPath: '/synthetic/store/keys/example.test',
      workingDir: '/synthetic/store',
      config: { command: 'synthetic editor command' },
      sessionName: 'ctt-secret-fixture'
    }
  }

  it('refuses every terminal-addressing message before a local client can acquire ownership', () => {
    registry.terminals.clear()
    registry.terminals.set('ctt-secret-fixture', protectedTerminal())
    const localTool = socket(undefined)
    const attempts = [
      { type: 'command', terminalId: 'ctt-secret-fixture' },
      { type: 'resize', terminalId: 'ctt-secret-fixture' },
      { type: 'reconnect', terminalId: 'ctt-secret-fixture' },
      { type: 'reconnect', data: { terminalId: 'ctt-secret-fixture' } },
      { type: 'detach', terminalId: 'ctt-secret-fixture' },
      { type: 'close', terminalId: 'ctt-secret-fixture' },
      { type: 'update-embedded', terminalId: 'ctt-secret-fixture' },
      { type: 'targeted-pane-send', tmuxPane: 'ctt-secret-fixture:1.0' },
      { type: 'tmux-session-send', sessionName: 'ctt-secret-fixture' },
      { type: 'spawn', config: { sessionName: 'ctt-secret-fixture' } }
    ]
    for (const attempt of attempts) {
      expect(identity.secretTerminalRefusal(localTool, attempt, registry)).toMatchObject({
        type: 'terminal-error',
        terminalId: 'ctt-secret-fixture',
        requestType: attempt.type,
        error: 'Secret editor terminal'
      })
    }
    expect(identity.secretTerminalRefusal(socket(EXT), attempts[0], registry)).toBeNull()
  })

  it('rejects protected flags on JSON spawns and exposes only the minimal extension record', () => {
    const terminal = protectedTerminal()
    expect(identity.stripSecretSpawnKeys({
      name: 'fixture', secret: true, secretKeyPath: terminal.secretKeyPath
    })).toEqual({ config: { name: 'fixture' }, rejected: ['secret', 'secretKeyPath'] })
    expect(identity.clientTerminalRecord(terminal)).toEqual({
      id: terminal.id,
      name: terminal.name,
      terminalType: 'bash',
      state: 'active',
      secret: true
    })
    expect(identity.visibleTerminals(socket(EXT), [terminal])).toEqual([
      identity.clientTerminalRecord(terminal)
    ])
    expect(identity.visibleTerminals(socket(undefined), [terminal])).toEqual([])
  })

  it('requires an exact known tmux session before producing a target', () => {
    const sessions = new Set(['ctt-secret-fixture', 'ctt-plain-fixture'])
    expect(identity.exactTmuxTarget('ctt-plain-fixture:1.0', sessions)).toBe('=ctt-plain-fixture:1.0')
    expect(identity.exactTmuxTarget('ctt-secret', sessions)).toBeNull()
    expect(identity.exactTmuxTarget('ctt-secret*', sessions)).toBeNull()
  })

  it('keeps late protected output classified after its registry record is removed', () => {
    registry.terminals.clear()
    expect(identity.isProtectedTerminalReference(registry, 'ctt-secret-fixture')).toBe(true)
    expect(identity.isProtectedTerminalReference(registry, 'ctt-plain-fixture')).toBe(false)

    registry.terminals.set('opaque-terminal', {
      id: 'opaque-terminal', secret: true, sessionName: 'opaque-session'
    })
    expect(identity.isProtectedTerminalReference(registry, 'opaque-terminal')).toBe(true)
    expect(identity.isProtectedTerminalReference(registry, 'opaque-session')).toBe(true)
  })
})
