import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const browserRouter = require('../routes/browser.js')
const credentialStore = require('../modules/credential-store.js')
const terminalRegistryModule = require('../modules/terminal-registry.js')

const TRUSTED_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const TRUSTED_ORIGIN = { Origin: `chrome-extension://${TRUSTED_ID}` }
const OTHER_ORIGIN = { Origin: 'chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' }
const SECRET = `fixture-password-${Math.random().toString(36).slice(2)}`
const EXTRA_SECRET = `fixture-token-${Math.random().toString(36).slice(2)}`

let tempRoot
let store
let server
let port
let frames
let fanoutFrames
let pageInfo
let fillResult
let connected
let deferPageAnswer
let deferredPageFrame
let pageProbeResolve
let spawner
let registry
const extensionClient = { id: 'extension-client' }

function request(method, route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `/api/browser${route}`,
      method,
      headers: { 'Content-Type': 'application/json', ...headers }
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
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

function answer(frame, via) {
  frames.push({ ...frame, via })
  setImmediate(() => {
    if (frame.type === 'browser-get-page-info') {
      if (deferPageAnswer) {
        deferredPageFrame = frame
        pageProbeResolve?.()
        return
      }
      browserRouter.resolvePendingRequest(frame.requestId, { ...pageInfo }, extensionClient)
    } else if (frame.type === 'browser-fill-input') {
      browserRouter.resolvePendingRequest(frame.requestId, { ...fillResult }, extensionClient)
    } else if (frame.type === 'browser-open-logins-page') {
      browserRouter.resolvePendingRequest(frame.requestId, {
        success: true,
        url: `chrome-extension://${TRUSTED_ID}/dashboard/index.html#/logins?host=${encodeURIComponent(frame.host)}`,
        tabId: 7
      }, extensionClient)
    }
  })
}

function sendToExtension(frame) {
  if (!connected) return 0
  answer(frame, 'extension')
  return 1
}

function sendToClient(client, frame) {
  if (client !== extensionClient) return false
  answer(frame, 'client')
  return true
}

function terminalRecord(id, options = {}) {
  return {
    id,
    name: 'Secret: app.example.com',
    terminalType: 'bash',
    state: 'active',
    secret: true,
    secretKeyPath: options.secretKeyPath,
    workingDir: options.workingDir,
    command: options.command
  }
}

beforeEach(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tabz-secret-routes-'))
  process.env.TABZ_HOME = path.join(tempRoot, 'store')
  process.env.TABZ_EXTENSION_IDS = TRUSTED_ID
  store = credentialStore.createCredentialStore({ storeDir: process.env.TABZ_HOME, homeDir: os.homedir() })
  frames = []
  fanoutFrames = []
  connected = true
  deferPageAnswer = false
  deferredPageFrame = null
  pageProbeResolve = null
  pageInfo = { url: 'https://app.example.com/login', title: 'Sign in', tabId: 42, protectedFillVersion: 1 }
  fillResult = {
    success: true,
    verified: true,
    tagName: 'input',
    inputType: 'password',
    sensitive: true,
    host: 'app.example.com',
    protected: true
  }
  spawner = {
    spawn: vi.fn(async options => ({ success: true, terminal: terminalRecord('ctt-secret-test', options) }))
  }
  registry = {
    findSecretTerminalByKeyPath: vi.fn(() => undefined),
    hasLiveSecretEditor: vi.fn(() => false),
    reconnectToTerminal: vi.fn(async id => terminalRecord(id)),
    closeTerminal: vi.fn(async () => true)
  }

  const app = express()
  app.use(express.json())
  app.set('broadcast', frame => { fanoutFrames.push(frame); return 1 })
  app.set('sendToExtension', sendToExtension)
  app.set('sendToAllExtensions', frame => { answer(frame, 'all-extensions'); return 1 })
  app.set('sendToClient', sendToClient)
  app.set('extensionConnected', () => connected)
  app.set('unifiedSpawn', spawner)
  app.set('terminalRegistry', registry)
  app.use('/api/browser', browserRouter)
  server = http.createServer(app)
  port = await new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port))
  })
})

afterEach(async () => {
  vi.restoreAllMocks()
  await new Promise(resolve => server.close(resolve))
  delete process.env.TABZ_HOME
  delete process.env.TABZ_EXTENSION_IDS
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

function saveEntry({ host = 'app.example.com', user = 'demo-user', password = SECRET } = {}) {
  return store.saveEntry({
    host,
    user,
    password,
    fields: [{ name: 'account', value: 'north' }],
    secretFiles: [{ name: 'api_token', value: EXTRA_SECRET }]
  })
}

describe('configured extension metadata routes', () => {
  it('guards GET before constructing or reading the store, including malformed configured origins', async () => {
    const getStore = vi.spyOn(credentialStore, 'getDefaultStore')

    for (const headers of [
      {},
      OTHER_ORIGIN,
      { Origin: `chrome-extension://${TRUSTED_ID}/dashboard/index.html` },
      { Origin: 'http://localhost:5173' }
    ]) {
      const refused = await request('GET', '/secrets', undefined, headers)
      expect(refused.status).toBe(403)
    }
    expect(getStore).not.toHaveBeenCalled()

    const allowed = await request('GET', '/secrets', undefined, TRUSTED_ORIGIN)
    expect(allowed.status).toBe(200)
    expect(allowed.json).toEqual({ success: true, storeDir: process.env.TABZ_HOME, entries: [] })
    expect(getStore).toHaveBeenCalledTimes(1)
  })

  it('guards POST and DELETE before any store access', async () => {
    const getStore = vi.spyOn(credentialStore, 'getDefaultStore')
    const body = { host: 'app.example.com', user: 'demo', password: SECRET }

    expect((await request('POST', '/secrets', body)).status).toBe(403)
    expect((await request('POST', '/secrets', body, OTHER_ORIGIN)).status).toBe(403)
    expect((await request('DELETE', '/secrets/app.example.com')).status).toBe(403)
    expect((await request('DELETE', '/secrets/app.example.com', undefined, OTHER_ORIGIN)).status).toBe(403)
    expect(getStore).not.toHaveBeenCalled()
  })

  it('does not reflect an unexpected store error through the metadata endpoint', async () => {
    vi.spyOn(credentialStore, 'getDefaultStore').mockImplementationOnce(() => {
      throw new Error(`unexpected ${SECRET}`)
    })

    const response = await request('GET', '/secrets', undefined, TRUSTED_ORIGIN)
    expect(response.status).toBe(500)
    expect(response.json).toEqual({ success: false, error: 'Saved login metadata is unavailable' })
    expect(response.text).not.toContain(SECRET)
  })

  it('creates, lists, rotates, and deletes metadata without returning values', async () => {
    const create = await request('POST', '/secrets', {
      host: 'APP.example.com',
      user: 'demo-user',
      password: SECRET,
      fields: [{ name: 'account', value: 'north' }],
      secretFiles: [{ name: 'api_token', value: EXTRA_SECRET }]
    }, TRUSTED_ORIGIN)
    expect(create.status).toBe(200)
    expect(create.json).toMatchObject({
      success: true,
      status: 'ready',
      host: 'app.example.com',
      hasUsername: true,
      fields: ['account'],
      secretFiles: ['api_token'],
      created: true
    })

    const list = await request('GET', '/secrets', undefined, TRUSTED_ORIGIN)
    expect(list.json.entries[0]).toMatchObject({
      patterns: ['app.example.com'],
      hasUsername: true,
      hasKey: true,
      fields: ['account'],
      secretFiles: ['api_token']
    })

    const rotated = await request('POST', '/secrets', {
      host: 'app.example.com', user: 'other-user', password: `${SECRET}-rotated`
    }, TRUSTED_ORIGIN)
    expect(rotated.json).toMatchObject({ status: 'ready', created: false, hasUsername: true })

    for (const response of [create, list, rotated]) {
      expect(response.text).not.toContain(SECRET)
      expect(response.text).not.toContain(EXTRA_SECRET)
      expect(response.text).not.toContain('north')
      expect(response.text).not.toContain('demo-user')
      expect(response.text).not.toContain('other-user')
    }

    const removed = await request('DELETE', '/secrets/app.example.com', undefined, TRUSTED_ORIGIN)
    expect(removed.json).toMatchObject({ success: true, deleted: true, patterns: ['app.example.com'] })
    expect((await request('GET', '/secrets', undefined, TRUSTED_ORIGIN)).json.entries).toEqual([])
  })
})

describe('secret request and protected prompt', () => {
  it('opens the Logins page without creating a stub when the extension is connected', async () => {
    const response = await request('POST', '/secret-request', {
      host: 'app.example.com', reason: 'test login'
    })

    expect(response.status).toBe(200)
    expect(response.json).toMatchObject({
      success: true,
      status: 'pending',
      host: 'app.example.com',
      created: false,
      surface: 'page',
      loginsRoute: '#/logins?host=app.example.com'
    })
    expect(spawner.spawn).not.toHaveBeenCalled()
    expect(fs.existsSync(store.configPath)).toBe(false)
    expect(frames.find(frame => frame.type === 'browser-open-logins-page')).toMatchObject({
      via: 'extension', host: 'app.example.com', reason: 'test login'
    })
  })

  it('uses the protected Bash terminal fallback and announces only client metadata', async () => {
    connected = false
    const response = await request('POST', '/secret-request', { host: 'app.example.com' })

    expect(response.status).toBe(200)
    expect(response.json).toMatchObject({
      status: 'pending', surface: 'terminal', terminalId: 'ctt-secret-test', editorReused: false
    })
    const options = spawner.spawn.mock.calls[0][0]
    expect(options).toMatchObject({
      terminalType: 'bash',
      isChrome: true,
      useTmux: true,
      secret: true,
      secretKeyPath: path.join(store.keysDir, 'app.example.com')
    })
    expect(options[terminalRegistryModule.SECRET_SPAWN]).toBe(true)
    expect(options.command).toContain('login-prompt.js')
    const announcement = frames.find(frame => frame.type === 'terminal-spawned')
    expect(announcement.data).toEqual({
      id: 'ctt-secret-test',
      name: 'Secret: app.example.com',
      terminalType: 'bash',
      state: 'active',
      secret: true
    })
    expect(JSON.stringify(announcement)).not.toContain('secretKeyPath')
    expect(JSON.stringify(announcement)).not.toContain(store.storeDir)
    expect(fanoutFrames).toEqual([])
  })

  it('reserves a protected editor while spawn is pending so concurrent mutations and duplicate prompts defer', async () => {
    connected = false
    store.ensureEntry('other.example.com')
    let releaseSpawn
    let markStarted
    const started = new Promise(resolve => { markStarted = resolve })
    spawner.spawn.mockImplementationOnce(options => new Promise(resolve => {
      releaseSpawn = () => resolve({ success: true, terminal: terminalRecord('ctt-secret-test', options) })
      markStarted()
    }))

    const firstPromise = request('POST', '/secret-request', { host: 'app.example.com' })
    await started

    const duplicate = await request('POST', '/secret-request', { host: 'other.example.com' })
    expect(duplicate.status).toBe(200)
    expect(duplicate.json).toMatchObject({
      status: 'pending',
      surface: 'terminal',
      configEditDeferred: true,
      created: false
    })
    expect(spawner.spawn).toHaveBeenCalledTimes(1)

    const save = await request('POST', '/secrets', {
      host: 'app.example.com', user: 'demo-user', password: SECRET
    }, TRUSTED_ORIGIN)
    const remove = await request('DELETE', '/secrets/app.example.com', undefined, TRUSTED_ORIGIN)
    expect(save.status).toBe(409)
    expect(remove.status).toBe(409)
    expect(save.text + remove.text).not.toContain(SECRET)

    releaseSpawn()
    const first = await firstPromise
    expect(first.status).toBe(200)
    expect(first.json).toMatchObject({ terminalId: 'ctt-secret-test', editorReused: false })
  })

  it('reattaches a disconnected protected terminal instead of spawning twice', async () => {
    connected = false
    const keyPath = path.join(store.keysDir, 'app.example.com')
    registry.findSecretTerminalByKeyPath.mockReturnValue({
      id: 'ctt-secret-old', state: 'disconnected', secretKeyPath: keyPath
    })
    registry.reconnectToTerminal.mockResolvedValue(terminalRecord('ctt-secret-old', { secretKeyPath: keyPath }))

    const response = await request('POST', '/secret-request', { host: 'app.example.com' })
    expect(response.json).toMatchObject({
      terminalId: 'ctt-secret-old', editorReused: true, editorReattached: true
    })
    expect(spawner.spawn).not.toHaveBeenCalled()
    expect(registry.reconnectToTerminal).toHaveBeenCalledWith('ctt-secret-old')
  })
})

describe('actual-host-first secret fill', () => {
  it('does not construct the store until the extension answers page info', async () => {
    saveEntry()
    const getStore = vi.spyOn(credentialStore, 'getDefaultStore')
    deferPageAnswer = true
    const probeSent = new Promise(resolve => { pageProbeResolve = resolve })
    const responsePromise = request('POST', '/fill-secret', { selector: '#password', field: 'password' })
    await probeSent
    expect(deferredPageFrame?.type).toBe('browser-get-page-info')
    expect(getStore).not.toHaveBeenCalled()
    deferPageAnswer = false
    browserRouter.resolvePendingRequest(deferredPageFrame.requestId, { ...pageInfo }, extensionClient)
    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(getStore).toHaveBeenCalledTimes(1)
  })

  it('matches the actual tab host, binds the value to its answering socket, and returns metadata only', async () => {
    saveEntry()
    fillResult = {
      ...fillResult,
      actualValue: SECRET,
      actualLength: SECRET.length,
      error: `read back ${SECRET}`
    }
    const response = await request('POST', '/fill-secret', {
      selector: '#password', field: 'password', waitTimeout: 60000
    })

    expect(response.status).toBe(200)
    expect(response.json).toEqual({
      filled: true,
      verified: true,
      protected: true,
      host: 'app.example.com',
      hasUsername: true,
      field: 'password',
      kind: 'password'
    })
    expect(response.text).not.toContain(SECRET)
    const fill = frames.find(frame => frame.type === 'browser-fill-input')
    expect(fill).toMatchObject({
      via: 'client',
      tabId: 42,
      value: SECRET,
      waitTimeout: 10000,
      requestTimeoutMs: 14000,
      expectedHost: 'app.example.com',
      requireInput: true,
      allowSelect: false,
      requirePasswordType: true
    })
    expect(fanoutFrames).toEqual([])
  })

  it.each([undefined, 0, 2])('refuses extension protected-fill capability %s before store access or value dispatch', async version => {
    const getStore = vi.spyOn(credentialStore, 'getDefaultStore')
    pageInfo.protectedFillVersion = version

    const response = await request('POST', '/fill-secret', { selector: '#password', field: 'password' })

    expect(response.status).toBe(409)
    expect(response.json).toEqual({
      filled: false,
      error: 'The connected Tabz extension must be reloaded before saved fields can be filled safely'
    })
    expect(getStore).not.toHaveBeenCalled()
    expect(frames.filter(frame => frame.type === 'browser-fill-input')).toEqual([])
  })

  it.each([
    [{ url: 'https://app.example.com/login', protectedFillVersion: 1 }, undefined],
    [{ url: 'https://app.example.com/login', tabId: 44, protectedFillVersion: 1 }, 42]
  ])('refuses an unconfirmed or mismatched target tab before store access', async (reportedPage, requestedTabId) => {
    const getStore = vi.spyOn(credentialStore, 'getDefaultStore')
    pageInfo = reportedPage

    const response = await request('POST', '/fill-secret', {
      selector: '#password', field: 'password', ...(requestedTabId ? { tabId: requestedTabId } : {})
    })

    expect(response.status).toBe(409)
    expect(response.json).toEqual({ filled: false, error: 'The extension did not confirm the requested tab safely' })
    expect(getStore).not.toHaveBeenCalled()
    expect(frames.filter(frame => frame.type === 'browser-fill-input')).toEqual([])
  })

  it('does not let a preferred host override the actual tab and emits no fill frame', async () => {
    saveEntry()
    const response = await request('POST', '/fill-secret', {
      selector: '#password', field: 'password', host: 'other.example.com'
    })

    expect(response.status).toBe(400)
    expect(response.json.filled).toBe(false)
    expect(frames.filter(frame => frame.type === 'browser-fill-input')).toEqual([])
    expect(response.text).not.toContain(SECRET)
  })

  it('refuses an actual tab host with no matching entry before sending a fill frame', async () => {
    saveEntry()
    pageInfo = { url: 'https://evil.example.net/steal', tabId: 44, protectedFillVersion: 1 }
    const response = await request('POST', '/fill-secret', {
      selector: '#password', field: 'password'
    })

    expect(response.status).toBe(409)
    expect(response.json).toMatchObject({ filled: false })
    expect(response.text).toContain('evil.example.net')
    expect(frames.filter(frame => frame.type === 'browser-fill-input')).toEqual([])
    expect(response.text).not.toContain(SECRET)
  })

  it('suppresses extension errors and readback when verification fails', async () => {
    saveEntry()
    fillResult = { success: false, verified: false, error: `refused ${SECRET}`, actualValue: SECRET }
    const response = await request('POST', '/fill-secret', { selector: '#password', field: 'password' })

    expect(response.status).toBe(409)
    expect(response.json).toEqual({
      filled: false,
      verified: false,
      host: 'app.example.com',
      hasUsername: true,
      error: 'Saved field fill was refused or could not be verified'
    })
    expect(response.text).not.toContain(SECRET)
  })

  it('refuses a successful-looking fill without the persisted protection verdict', async () => {
    saveEntry()
    fillResult = { success: true, verified: true }

    const response = await request('POST', '/fill-secret', { selector: '#password', field: 'password' })

    expect(response.status).toBe(409)
    expect(response.json).toEqual({
      filled: false,
      verified: false,
      host: 'app.example.com',
      hasUsername: true,
      error: 'Saved field fill was refused or could not be verified'
    })
  })
})
