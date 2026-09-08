import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'
import express from 'express'
import cors from 'cors'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const WebSocket = require('ws')
const wsIdentity = require('../modules/ws-identity.js')

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tabz-origin-'))
const settingsFile = path.join(tempDir, 'settings.json')
process.env.TABZ_SETTINGS_PATH = settingsFile
const settingsStore = require('../modules/settings-store.js')

const EXT_ID = 'abcdefghijklmnopabcdefghijklmnop'
const EXT = `chrome-extension://${EXT_ID}`
const UNKNOWN_EXT = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba'
const TOKEN = `test-${Math.random().toString(36).slice(2)}`
const ALLOWED = 'https://tabz-driver.example.test'

let server
let wss
let port
let connections

function request(route, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: route, method, headers }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }))
    })
    req.on('error', reject)
    req.end()
  })
}

function connect(origin, token = TOKEN) {
  return new Promise(resolve => {
    const headers = origin === undefined ? {} : { Origin: origin }
    const ws = new WebSocket(`ws://127.0.0.1:${port}/?token=${token}`, { headers })
    ws.on('unexpected-response', (_req, res) => { resolve({ status: res.statusCode }); ws.terminate() })
    ws.on('open', () => resolve({ open: true, ws }))
    ws.on('error', error => resolve({ error: error.message }))
  })
}

beforeAll(async () => {
  const app = express()
  const probe = http.createServer()
  port = await new Promise(resolve => probe.listen(0, '127.0.0.1', () => {
    const address = probe.address()
    probe.close(() => resolve(address.port))
  }))
  const originPolicy = wsIdentity.createOriginPolicy({
    selfPort: port,
    getTrustedOrigins: settingsStore.getTrustedWebOrigins,
    getExtensionIds: () => [EXT_ID]
  })
  app.use(cors({ origin: originPolicy.corsOrigin, credentials: true }))
  app.use('/api/auth-token', (req, res, next) => {
    const refusal = originPolicy.tokenRefusal(req)
    if (refusal) return res.status(refusal.status).json({ error: refusal.message })
    next()
  })
  app.get('/api/auth-token', (_req, res) => res.json({ token: TOKEN }))
  app.get('/api/auth/token', (req, res) => {
    const refusal = originPolicy.tokenRefusal(req)
    if (refusal) return res.status(refusal.status).json({ error: refusal.message })
    res.json({ token: TOKEN })
  })
  app.get('/health', (_req, res) => res.json({ ok: true }))
  server = http.createServer(app)
  wss = new WebSocket.Server({ noServer: true })
  originPolicy.installUpgradeGuard(server, wss)
  connections = []
  wss.on('connection', (ws, req) => {
    const token = new URL(req.url, 'http://localhost').searchParams.get('token')
    if (token !== TOKEN) return ws.close(1008, 'Unauthorized')
    connections.push(wsIdentity.markConnection(ws, req, originPolicy.policyFor()))
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
})

beforeEach(() => {
  fs.rmSync(settingsFile, { force: true })
  connections.length = 0
})

afterAll(async () => {
  delete process.env.TABZ_SETTINGS_PATH
  for (const client of wss.clients) client.terminate()
  await new Promise(resolve => server.close(resolve))
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe('origin classification', () => {
  const policy = { selfPort: 8129, trustedOrigins: [ALLOWED], extensionIds: [EXT_ID] }

  it('requires an exact configured extension origin', () => {
    expect(wsIdentity.classifyOrigin(EXT, policy)).toMatchObject({ kind: 'extension', extensionId: EXT_ID })
    expect(wsIdentity.classifyOrigin(UNKNOWN_EXT, policy).kind).toBe('extension-unknown')
    for (const malformed of [`${EXT}/path`, `${EXT}?x=1`, `${EXT}/`, 'chrome-extension:/x']) {
      expect(wsIdentity.classifyOrigin(malformed, policy).kind, malformed).not.toBe('extension')
    }
  })

  it('recognizes supported local callers without confusing lookalike hosts', () => {
    expect(wsIdentity.classifyOrigin(undefined, policy).kind).toBe('none')
    expect(wsIdentity.classifyOrigin('http://localhost:8129', policy).kind).toBe('self')
    expect(wsIdentity.classifyOrigin('http://127.0.0.1:5173', policy).kind).toBe('localhost')
    expect(wsIdentity.classifyOrigin(ALLOWED, policy).kind).toBe('allowlisted')
    for (const origin of ['http://localhost.evil.test:8129', 'http://evil-localhost.test', 'null', 'file://']) {
      expect(wsIdentity.classifyOrigin(origin, policy).kind, origin).toBe('page')
    }
  })
})

describe('token, CORS, and WebSocket policy', () => {
  it('serves tokens only to configured extensions and supported local clients', async () => {
    for (const route of ['/api/auth/token', '/api/auth-token']) {
      for (const origin of [undefined, EXT, `http://localhost:${port}`]) {
        const result = await request(route, origin === undefined ? {} : { Origin: origin })
        expect(result.status, `${route} ${String(origin)}`).toBe(200)
        expect(result.text).toContain(TOKEN)
      }
    }
    for (const route of ['/api/auth/token', '/api/auth-token']) {
      for (const origin of [UNKNOWN_EXT, `${EXT}/path`, 'https://evil.example.test', 'http://localhost:4747', 'null']) {
        const result = await request(route, { Origin: origin })
        expect(result.status, `${route} ${origin}`).toBe(403)
        expect(result.text, `${route} ${origin}`).not.toContain(TOKEN)
      }
    }
  })

  it('does not reflect forged web or extension origins through CORS', async () => {
    for (const origin of [UNKNOWN_EXT, `${EXT}/path`, 'https://evil.example.test', 'http://localhost.evil.test']) {
      const result = await request('/health', { Origin: origin })
      expect(result.headers['access-control-allow-origin'], origin).toBeUndefined()
    }
    expect((await request('/health', { Origin: EXT })).headers['access-control-allow-origin']).toBe(EXT)
  })

  it('rejects forged upgrades before token auth and permits configured/local clients', async () => {
    for (const origin of [UNKNOWN_EXT, `${EXT}/path`, 'https://evil.example.test', 'http://localhost:4747']) {
      expect(await connect(origin), origin).toEqual({ status: 403 })
    }
    for (const origin of [EXT, undefined, `http://localhost:${port}`]) {
      const result = await connect(origin)
      expect(result.open, String(origin)).toBe(true)
      result.ws.close()
    }
    expect(connections.map(item => item.originKind)).toEqual(['extension', 'none', 'self'])
  })

  it('applies a validated allowlist dynamically', async () => {
    expect((await request('/api/auth/token', { Origin: ALLOWED })).status).toBe(403)
    expect(settingsStore.setTrustedWebOrigins([ALLOWED, 'https://*.bad.test'])).toMatchObject({
      saved: true,
      origins: [ALLOWED],
      rejected: ['https://*.bad.test']
    })
    expect((await request('/api/auth/token', { Origin: ALLOWED })).status).toBe(200)
  })
})
