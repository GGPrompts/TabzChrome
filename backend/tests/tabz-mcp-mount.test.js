import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'

const { mountTabzMcp } = await import('../modules/tabz-mcp-mount.js')

function fakeLog() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
}

function closeServer(server) {
  return new Promise(resolve => server.close(resolve))
}

function request(port, requestPath, body = { jsonrpc: '2.0', id: 1, method: 'initialize' }) {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

describe('Tabz MCP backend mount', () => {
  let fixtureRoot
  let distPath

  beforeEach(() => {
    fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tabz-mcp-mount-'))
    distPath = path.join(fixtureRoot, 'http.js')
    fs.writeFileSync(distPath, '// synthetic module; tests inject its import')
  })

  afterEach(() => {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('registers both placeholders before static and returns useful JSON-RPC 503s for missing dist', async () => {
    const app = express()
    app.use(express.json())
    const log = fakeLog()
    const missing = path.join(fixtureRoot, 'missing-http.js')
    const mount = mountTabzMcp({ app, log, distPath: missing })
    app.use(express.static(fixtureRoot))
    const server = http.createServer(app)
    const port = await listen(server)

    try {
      expect(await mount.ready).toBe(false)
      for (const requestPath of ['/mcp', '/mcp/core']) {
        const response = await request(port, requestPath, { jsonrpc: '2.0', id: 17, method: 'initialize' })
        expect(response.status).toBe(503)
        expect(response.json).toMatchObject({ jsonrpc: '2.0', id: 17, error: { code: -32000 } })
        expect(response.json.error.message).toContain('/rebuild')
      }
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('/rebuild'))
    } finally {
      await mount.close()
      await closeServer(server)
    }
  })

  it('serves a synchronous loading placeholder, then forwards parsed body and route preset', async () => {
    let resolveImport
    const pendingImport = new Promise(resolve => { resolveImport = resolve })
    const handled = []
    const handler = {
      handle: vi.fn((req, res, body, options) => {
        handled.push({ body, options })
        res.json({ jsonrpc: '2.0', id: body.id, result: { preset: options.preset ?? null } })
      }),
      close: vi.fn(async () => undefined)
    }
    const createTabzMcpHandler = vi.fn(() => handler)
    const app = express()
    app.use(express.json())
    const log = fakeLog()
    const mount = mountTabzMcp({
      app,
      log,
      distPath,
      importModule: () => pendingImport,
      backendUrl: 'http://127.0.0.1:48129'
    })
    app.use(express.static(fixtureRoot))
    const server = http.createServer(app)
    const port = await listen(server)

    try {
      const loading = await request(port, '/mcp')
      expect(loading.status).toBe(503)
      expect(loading.json.error.message).toContain('still loading')

      resolveImport({ createTabzMcpHandler })
      expect(await mount.ready).toBe(true)
      expect(createTabzMcpHandler).toHaveBeenCalledWith(expect.objectContaining({
        path: '/mcp', backendUrl: 'http://127.0.0.1:48129'
      }))
      const readyLog = log.info.mock.calls.map(([line]) => line).join('\n')
      expect(readyLog).toContain('http://localhost:8129/mcp')
      expect(readyLog).not.toContain('8130')
      expect(readyLog).not.toContain('page-agent')

      const named = await request(port, '/mcp/core', { jsonrpc: '2.0', id: 2, method: 'tools/list' })
      const bare = await request(port, '/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/list' })
      expect(named).toMatchObject({ status: 200, json: { result: { preset: 'core' } } })
      expect(bare).toMatchObject({ status: 200, json: { result: { preset: null } } })
      expect(handled).toEqual([
        { body: { jsonrpc: '2.0', id: 2, method: 'tools/list' }, options: { preset: 'core' } },
        { body: { jsonrpc: '2.0', id: 3, method: 'tools/list' }, options: { preset: undefined } }
      ])
    } finally {
      await mount.close()
      await closeServer(server)
    }
    expect(handler.close).toHaveBeenCalledTimes(1)
  })

  it('does not create or install a handler after close wins a delayed import', async () => {
    let resolveImport
    const pendingImport = new Promise(resolve => { resolveImport = resolve })
    const createTabzMcpHandler = vi.fn()
    const app = express()
    const mount = mountTabzMcp({ app, log: fakeLog(), distPath, importModule: () => pendingImport })

    await mount.close()
    resolveImport({ createTabzMcpHandler })

    expect(await mount.ready).toBe(false)
    expect(createTabzMcpHandler).not.toHaveBeenCalled()
    expect(mount.getHandler()).toBeNull()
  })

  it('disposes a handler created as shutdown begins and rejects incomplete handlers', async () => {
    const lateClose = vi.fn(async () => undefined)
    const app = express()
    let mount
    mount = mountTabzMcp({
      app,
      log: fakeLog(),
      distPath,
      importModule: async () => ({
        createTabzMcpHandler: () => {
          void mount.close()
          return { handle: vi.fn(), close: lateClose }
        }
      })
    })
    expect(await mount.ready).toBe(false)
    expect(lateClose).toHaveBeenCalledTimes(1)
    expect(mount.getHandler()).toBeNull()

    const partialClose = vi.fn(async () => undefined)
    const partial = mountTabzMcp({
      app: express(),
      log: fakeLog(),
      distPath,
      importModule: async () => ({ createTabzMcpHandler: () => ({ close: partialClose }) })
    })
    expect(await partial.ready).toBe(false)
    expect(partialClose).toHaveBeenCalledTimes(1)
    expect(partial.getHandler()).toBeNull()
    await partial.close()
  })

  it('bounds handler cleanup and returns the same close promise on repeated calls', async () => {
    const log = fakeLog()
    const close = vi.fn(() => new Promise(() => undefined))
    const mount = mountTabzMcp({
      app: express(),
      log,
      distPath,
      closeTimeoutMs: 20,
      importModule: async () => ({ createTabzMcpHandler: () => ({ handle: vi.fn(), close }) })
    })
    expect(await mount.ready).toBe(true)

    const first = mount.close()
    const second = mount.close()
    expect(second).toBe(first)
    await first

    expect(close).toHaveBeenCalledTimes(1)
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('close exceeded 20ms'))
  })

  it('maps synchronous and asynchronous handler failures to JSON-RPC internal errors', async () => {
    const app = express()
    app.use(express.json())
    const log = fakeLog()
    const handle = vi.fn()
      .mockImplementationOnce(() => { throw new Error('synthetic sync failure') })
      .mockRejectedValueOnce(new Error('synthetic async failure'))
    const mount = mountTabzMcp({
      app,
      log,
      distPath,
      importModule: async () => ({ createTabzMcpHandler: () => ({ handle, close: vi.fn() }) })
    })
    expect(await mount.ready).toBe(true)
    const server = http.createServer(app)
    const port = await listen(server)

    try {
      for (const id of [10, 11]) {
        const response = await request(port, '/mcp', { jsonrpc: '2.0', id, method: 'tools/list' })
        expect(response).toMatchObject({ status: 500, json: { id, error: { code: -32603, message: 'Internal error' } } })
      }
      expect(log.error).toHaveBeenCalledTimes(2)
    } finally {
      await mount.close()
      await closeServer(server)
    }
  })
})
