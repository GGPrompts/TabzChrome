import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import express from 'express'
import { createRequire } from 'node:module'
import { fakeChildProcess, fakePtyHandler } from './helpers/process-boundary-fake.js'

const require = createRequire(import.meta.url)
const registry = require('../modules/terminal-registry.js')
const identity = require('../modules/ws-identity.js')
const tmux = require('../modules/tmux-session-manager.js')
const apiRouter = require('../routes/api.js')
const fs = require('node:fs')

const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop'
const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`
const SESSIONS = [
  { name: 'ctt-secret-fixture', paneId: '%1', secret: true },
  { name: 'ctt-plain-fixture', paneId: '%2', secret: false }
]

let server
let port
let processCalls
let extensionFrames
let broadcastFrames
let originals

function terminal(id, extra = {}) {
  return {
    id,
    name: id,
    terminalType: 'bash',
    state: 'active',
    workingDir: '/synthetic/work',
    sessionName: id,
    sessionId: id,
    panes: [],
    ...extra
  }
}

function request(method, route, body, headers = {}) {
  const payload = body === undefined ? undefined : JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `/api${route}`,
      method,
      headers: {
        ...(payload === undefined ? {} : {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }),
        ...headers
      }
    }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({
        status: res.statusCode,
        text,
        json: text ? JSON.parse(text) : null
      }))
    })
    req.on('error', reject)
    if (payload !== undefined) req.write(payload)
    req.end()
  })
}

beforeEach(async () => {
  originals = {
    listDetailedSessions: tmux.listDetailedSessions,
    listSessionNames: tmux.listSessionNames,
    killSession: tmux.killSession,
    listWindows: tmux.listWindows,
    executeTmuxCommand: tmux.executeTmuxCommand,
    getTmuxOption: fakePtyHandler.getTmuxOption,
    setTmuxOption: fakePtyHandler.setTmuxOption,
    spawnSync: fakeChildProcess.spawnSync
  }
  processCalls = []
  extensionFrames = []
  broadcastFrames = []
  fakeChildProcess.spawnSync = (command, args) => {
    processCalls.push([command, args])
    return { status: 0, stdout: '', stderr: '' }
  }
  fakePtyHandler.getTmuxOption = name =>
    name === 'ctt-flagged-fixture' ? '/synthetic/store/keys/example.test' : ''
  fakePtyHandler.setTmuxOption = () => {}
  tmux.listDetailedSessions = async () => SESSIONS.map(session => ({ ...session }))
  tmux.listSessionNames = () => SESSIONS.map(({ name, secret }) => ({ name, secret }))
  tmux.killSession = async () => ({ success: true })
  tmux.listWindows = async () => ({ success: true, windows: [] })
  tmux.executeTmuxCommand = async () => ({ success: true })

  registry.terminals.clear()
  registry.terminals.set('ctt-secret-fixture', terminal('ctt-secret-fixture', {
    name: 'Login editor',
    secret: true,
    secretKeyPath: '/synthetic/store/keys/example.test'
  }))
  registry.terminals.set('ctt-plain-fixture', terminal('ctt-plain-fixture'))

  const app = express()
  app.use(express.json())
  app.set('originPolicy', identity.createOriginPolicy({
    selfPort: 8129,
    getExtensionIds: () => [EXTENSION_ID]
  }))
  app.set('broadcast', frame => { broadcastFrames.push(frame) })
  app.set('sendToAllExtensions', frame => { extensionFrames.push(frame) })
  app.use('/api', apiRouter)
  server = http.createServer(app)
  port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
})

afterEach(async () => {
  await new Promise(resolve => server.close(resolve))
  registry.terminals.clear()
  tmux.listDetailedSessions = originals.listDetailedSessions
  tmux.listSessionNames = originals.listSessionNames
  tmux.killSession = originals.killSession
  tmux.listWindows = originals.listWindows
  tmux.executeTmuxCommand = originals.executeTmuxCommand
  fakePtyHandler.getTmuxOption = originals.getTmuxOption
  fakePtyHandler.setTmuxOption = originals.setTmuxOption
  fakeChildProcess.spawnSync = originals.spawnSync
})

describe('protected terminal HTTP routes', () => {
  it('returns unknown for a missing named session without reading cwd state', async () => {
    fakeChildProcess.spawnSync = () => ({ status: 1, stdout: '', stderr: '' })
    const exists = vi.spyOn(fs, 'existsSync').mockImplementation(() => {
      throw new Error('State files must not be inspected for a missing named session')
    })
    try {
      const result = await request('GET', '/claude-status?dir=%2Fsynthetic&sessionName=ctt-gone')
      expect(result.json).toEqual({ success: true, status: 'unknown', sessionId: null })
      expect(exists).not.toHaveBeenCalled()
    } finally { exists.mockRestore() }
  })

  it('attributes status to the exact live pane and includes its foreground command', async () => {
    fakeChildProcess.spawnSync = (_command, args) => ({
      status: 0,
      stdout: args[0] === 'list-panes' ? '%42\tclaude\n' : '', stderr: '',
    })
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const list = vi.spyOn(fs, 'readdirSync').mockReturnValue(['fixture.json'])
    const read = vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify({
      tmux_pane: '%42', working_dir: '/synthetic', status: 'tool_use',
      current_tool: 'Read', last_updated: '2026-09-07T20:00:00.000Z',
    }))
    const oldListPanes = tmux.listPanes
    tmux.listPanes = async () => [{ paneId: '%42', command: 'claude' }]
    try {
      const result = await request('GET', '/claude-status?dir=%2Fsynthetic&sessionName=ctt-plain-fixture')
      expect(result.json).toMatchObject({ success: true, tmuxPane: '%42', pane_command: 'claude', current_tool: 'Read' })
    } finally {
      exists.mockRestore(); list.mockRestore(); read.mockRestore(); tmux.listPanes = oldListPanes
    }
  })

  it('omits protected terminals for local tools and exposes only the minimal record to the configured extension', async () => {
    for (const headers of [
      {},
      { Origin: 'http://localhost:5173' },
      { Origin: 'https://page.example' },
      { Origin: 'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
    ]) {
      const local = await request('GET', '/agents', undefined, headers)
      expect(local.status).toBe(200)
      expect(local.json.data.map(item => item.id)).toEqual(['ctt-plain-fixture'])
      expect(local.text).not.toContain('/synthetic/store')
      expect(local.text).not.toContain('Login editor')
    }

    const extension = await request('GET', '/agents', undefined, { Origin: EXTENSION_ORIGIN })
    expect(extension.json.data.find(item => item.id === 'ctt-secret-fixture')).toEqual({
      id: 'ctt-secret-fixture',
      name: 'Login editor',
      terminalType: 'bash',
      state: 'active',
      secret: true
    })
    expect(extension.text).not.toContain('secretKeyPath')
    expect(extension.text).not.toContain('/synthetic/store')

    const one = await request(
      'GET', '/tmux/sessions/ctt-secret-fixture', undefined, { Origin: EXTENSION_ORIGIN }
    )
    expect(one.json.data).toEqual({
      id: 'ctt-secret-fixture', name: 'ctt-secret-fixture', secret: true
    })
  })

  it('refuses capture, control, resize, status, and reattach before a process boundary is crossed', async () => {
    const attempts = [
      request('GET', '/agents/ctt-secret-fixture'),
      request('POST', '/agents/ctt-secret-fixture/command', { command: 'fixture' }),
      request('POST', '/agents/ctt-secret-fixture/resize', { cols: 80, rows: 24 }),
      request('POST', '/agents/ctt-secret-fixture/detach'),
      request('DELETE', '/agents/ctt-secret-fixture'),
      request('GET', '/terminals/ctt-secret-fixture/capture'),
      request('GET', '/terminals/ctt-secret-fixture/panes'),
      request('POST', '/terminals/send-keys', {
        terminalId: 'ctt-plain-fixture', sessionName: 'ctt-secret-fixture', text: 'fixture'
      }),
      request('GET', '/tmux/sessions/ctt-secret-fixture/preview'),
      request('GET', '/tmux/sessions/ctt-secret-fixture/capture'),
      request('GET', '/tmux/sessions/ctt-secret-fixture/statusline'),
      request('GET', '/tmux/sessions/ctt-secret-fixture/windows'),
      request('POST', '/tmux/sessions/ctt-secret-fixture/command', { command: 'list-panes' }),
      request('POST', '/tmux/refresh/ctt-secret-fixture'),
      request('DELETE', '/tmux/sessions/ctt-secret-fixture'),
      request('POST', '/tmux/detach/ctt-secret-fixture'),
      request('GET', '/tmux/info/ctt-secret-fixture'),
      request('GET', '/tmux/sessions/ctt-secret-fixture'),
      request('GET', '/claude-status?dir=%2Fsynthetic&sessionName=ctt-secret-fixture')
    ]
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403)
      expect(response.json.error).toBe('Secret editor terminal')
    }

    const reattach = await request('POST', '/tmux/reattach', { sessions: ['ctt-secret-fixture'] })
    expect(reattach.json.data.success).toEqual([])
    expect(reattach.json.data.failed).toEqual([
      { session: 'ctt-secret-fixture', error: 'Secret editor terminal' }
    ])

    const bulk = await request('DELETE', '/tmux/sessions/bulk', {
      sessions: ['ctt-secret-fixture']
    })
    expect(bulk.json.data).toEqual({
      killed: [],
      failed: [{ session: 'ctt-secret-fixture', error: 'Secret editor terminal' }]
    })
    expect(registry.getTerminal('ctt-secret-fixture')).toBeDefined()
    expect(processCalls).toEqual([])
  })

  it('hides protected tmux sessions from local enumeration and reduces extension enumeration', async () => {
    expect((await request('GET', '/tmux/sessions')).json.data.sessions).toEqual(['ctt-plain-fixture'])
    expect((await request('GET', '/tmux/sessions/detailed')).json.data.sessions.map(item => item.name))
      .toEqual(['ctt-plain-fixture'])

    const detailed = await request('GET', '/tmux/sessions/detailed', undefined, { Origin: EXTENSION_ORIGIN })
    expect(detailed.json.data.sessions.find(item => item.name === 'ctt-secret-fixture'))
      .toEqual({ id: 'ctt-secret-fixture', name: 'ctt-secret-fixture', secret: true })

    tmux.listSessionNames = () => [
      { name: 'ctt-plain-fixture', secret: false },
      { name: 'ctt-flagged-fixture', secret: true }
    ]
    expect((await request('GET', '/tmux/sessions')).json.data.sessions)
      .toEqual(['ctt-plain-fixture'])
  })

  it('uses exact tmux targets and never resolves a protected-session prefix', async () => {
    for (const name of ['ctt-secret', 'ctt-secret*', 'ctt-secret-fixture-extra']) {
      for (const response of await Promise.all([
        request('GET', `/tmux/sessions/${encodeURIComponent(name)}/preview`),
        request('GET', `/tmux/sessions/${encodeURIComponent(name)}/windows`),
        request('POST', `/tmux/sessions/${encodeURIComponent(name)}/command`, { command: 'list-panes' }),
        request('POST', `/tmux/refresh/${encodeURIComponent(name)}`)
      ])) expect(response.status).toBe(404)
    }

    registry.terminals.set('ctt-plain', terminal('ctt-plain'))
    expect((await request('GET', '/terminals/ctt-plain/capture')).status).toBe(404)
    expect((await request('POST', '/terminals/send-keys', {
      terminalId: 'ctt-plain', sessionName: 'ctt-plain', text: 'fixture'
    })).status).toBe(404)

    const plainCapture = await request('GET', '/terminals/ctt-plain-fixture/capture')
    expect(plainCapture.status).toBe(200)
    expect(processCalls).toContainEqual([
      'tmux',
      ['capture-pane', '-t', '=ctt-plain-fixture', '-p', '-S', '-50']
    ])
  })

  it('lets only the extension close a protected editor and forces a kill instead of detach', async () => {
    expect((await request('POST', '/agents/ctt-secret-fixture/detach')).status).toBe(403)
    const closed = await request(
      'POST', '/agents/ctt-secret-fixture/detach', undefined, { Origin: EXTENSION_ORIGIN }
    )
    expect(closed.status).toBe(200)
    expect(closed.json.data.detached).toBe(false)
    expect(processCalls).toContainEqual([
      'tmux', ['kill-session', '-t', '=ctt-secret-fixture']
    ])
    expect(extensionFrames).toContainEqual({
      type: 'terminal-closed', data: { id: 'ctt-secret-fixture' }
    })
    expect(broadcastFrames).toEqual([])
  })

  it('fails closed from the reserved prefix or persisted option after the registry entry is gone', async () => {
    registry.terminals.delete('ctt-secret-fixture')
    expect((await request('GET', '/tmux/sessions/ctt-secret-fixture/preview')).status).toBe(403)
    expect(registry.isSecretTerminal('ctt-flagged-fixture')).toBe(true)

    registry.terminals.set('ctt-reattached', terminal('ctt-reattached', {
      sessionName: 'ctt-flagged-fixture', sessionId: 'ctt-flagged-fixture'
    }))
    expect(registry.isSecretTerminal('ctt-reattached')).toBe(true)
  })
})

describe('protected registry capability', () => {
  it('honours protected flags only with the in-process Symbol and restores the persisted marker', () => {
    expect(registry.resolveSecretFlags({
      secret: true,
      secretKeyPath: '/synthetic/store/keys/example.test'
    })).toEqual({ secret: false, secretKeyPath: null, stripped: true })
    expect(registry.resolveSecretFlags({
      [registry.SECRET_SPAWN]: true,
      secret: true,
      secretKeyPath: '/synthetic/store/keys/example.test'
    })).toEqual({
      secret: true,
      secretKeyPath: '/synthetic/store/keys/example.test',
      stripped: false
    })
    expect(registry.secretFlagsForRecoveredSession('ctt-secret-fixture', ''))
      .toEqual({ secret: true, secretKeyPath: null })
    expect(registry.secretFlagsForRecoveredSession(
      'ctt-plain-fixture', '/synthetic/store/keys/example.test\n'
    )).toEqual({
      secret: true,
      secretKeyPath: '/synthetic/store/keys/example.test'
    })

    const recovered = registry.recoveredSecretSpawnConfig(
      'ctt-flagged-fixture', () => '/synthetic/store/keys/example.test'
    )
    expect(recovered[registry.SECRET_SPAWN]).toBe(true)
    expect(registry.resolveSecretFlags(recovered)).toEqual({
      secret: true,
      secretKeyPath: '/synthetic/store/keys/example.test',
      stripped: false
    })
  })

  it('finds only live protected editors by their owned key path', () => {
    const keyPath = '/synthetic/store/keys/example.test'
    expect(registry.findSecretTerminalByKeyPath(keyPath)?.id).toBe('ctt-secret-fixture')
    expect(registry.hasLiveSecretEditor(() => true)).toBe(true)
    expect(registry.hasLiveSecretEditor(() => false)).toBe(false)

    registry.terminals.get('ctt-secret-fixture').state = 'closed'
    expect(registry.findSecretTerminalByKeyPath(keyPath)).toBeUndefined()
    expect(registry.hasLiveSecretEditor(() => true)).toBe(false)
  })
})

describe('protected tmux command parser', () => {
  it('allows layout argv and rejects targets, separators, shells, and typing commands', () => {
    expect(tmux.parseTmuxControlCommand('list-panes')).toEqual({ argv: ['list-panes'] })
    expect(tmux.parseTmuxControlCommand('  split-window   -h '))
      .toEqual({ argv: ['split-window', '-h'] })
    expect(tmux.parseTmuxControlCommand('select-layout tiled'))
      .toEqual({ argv: ['select-layout', 'tiled'] })

    for (const command of [
      'split-window -t other', 'split-window -ht other', 'swap-pane -s %1',
      'list-panes -S', 'list-panes;kill-server', 'list-panes ;', 'kill-server',
      'send-keys x', 'run-shell id', 'new-session', '', 42, undefined
    ]) expect(tmux.parseTmuxControlCommand(command)).toHaveProperty('error')
  })
})
