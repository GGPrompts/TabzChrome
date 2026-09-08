import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

let backend: Server
let client: Client
const posts: Array<{ path: string; body: Record<string, unknown> }> = []
let nextAct: Record<string, unknown> = { success: true }

function listen(server: Server): Promise<number> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

function bodyOf(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise(resolve => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}))
  })
}

beforeAll(async () => {
  backend = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/api/mcp-config') {
      res.end('{}')
      return
    }
    const body = await bodyOf(req)
    posts.push({ path: url.pathname, body })
    if (url.pathname === '/api/browser/act') {
      res.end(JSON.stringify({ action: body.action, trusted: body.trusted, ...nextAct }))
      return
    }
    if (url.pathname === '/api/browser/screenshot' || url.pathname === '/api/browser/screenshot-full') {
      res.end(JSON.stringify({ success: true, tabId: 42, filePath: body.inlineOnly ? undefined : '/synthetic/screenshots/page.png', imageData: 'YWJj', mimeType: 'image/png', width: 400, height: 300, bytes: 3 }))
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  const port = await listen(backend)
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`
  const { createTabzServer } = await import('../src/server.js')
  const instance = await createTabzServer({ backendUrl: process.env.BACKEND_URL })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'actTool.test', version: '0.0.0' })
  await Promise.all([client.connect(clientTransport), instance.server.connect(serverTransport)])
})

beforeEach(() => {
  posts.length = 0
  nextAct = { success: true }
})

afterAll(async () => {
  await client.close()
  await new Promise<void>(resolve => backend.close(() => resolve()))
})

async function act(arguments_: Record<string, unknown>) {
  const result = await client.callTool({ name: 'tabz_act', arguments: arguments_ })
  return { result, text: JSON.stringify(result.content) }
}

describe('tabz_act', () => {
  it('routes all page actions through the compact endpoint with the session agent', async () => {
    nextAct = { success: true, tabId: 42, target: { description: '<button> "Save"' }, events: ['click'] }
    const { result } = await act({ action: 'double_click', ref: 'ref_fixture_1', modifiers: 'ctrl' })
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({
      path: '/api/browser/act',
      body: { action: 'double_click', ref: 'ref_fixture_1', modifiers: 'ctrl', direction: 'down', trusted: false, agent: expect.any(String) }
    })
    expect(result.isError).toBe(false)
    expect(result.structuredContent).toMatchObject({ status: 'completed', success: true, action: 'double_click', tabId: 42 })
  })

  it('allows targetless focused typing and key input while validating ambiguous targets', async () => {
    nextAct = { success: true, verified: true, sensitive: false, actualValue: 'hello' }
    expect((await act({ action: 'type', value: 'hello' })).result.structuredContent)
      .toMatchObject({ status: 'verified', success: true, sensitive: false, actualValue: 'hello' })
    nextAct = { success: true }
    expect((await act({ action: 'key', key: 'Control+A Backspace' })).result.isError).toBe(false)

    posts.length = 0
    const invalid = await act({ action: 'click', ref: 'ref_a', selector: '#save' })
    expect(invalid.result.isError).toBe(true)
    expect(invalid.text).toContain('choose one target')
    expect(posts).toHaveLength(0)
  })

  it('reports verified, mismatch, and missing-verdict outcomes honestly', async () => {
    nextAct = { success: true, verified: false, actualValue: 'other' }
    const mismatch = await act({ action: 'type', selector: '#name', value: 'wanted' })
    expect(mismatch.result).toMatchObject({ isError: true, structuredContent: { status: 'mismatch', success: false, verified: false } })
    expect(mismatch.text).not.toContain('other')

    nextAct = { success: true }
    const missing = await act({ action: 'type', selector: '#name', value: 'wanted' })
    expect(missing.result).toMatchObject({ isError: true, structuredContent: { status: 'unknown', success: null, verified: null } })
    expect(missing.text).toContain('Do not automatically replay')

    nextAct = { success: true, verified: true, sensitive: true, actualLength: 8, actualValue: 'SENTINEL' }
    const sensitive = await act({ action: 'type', selector: '#password', value: 'SENTINEL' })
    expect(sensitive.result).toMatchObject({ isError: false, structuredContent: { status: 'verified', sensitive: true, actualLength: 8 } })
    expect(JSON.stringify(sensitive.result)).not.toContain('SENTINEL')

    nextAct = { success: true, verified: true, actualValue: 'SYNTHETIC-MISSING-SENSITIVITY' }
    const missingSensitivity = await act({ action: 'type', selector: '#name', value: 'wanted' })
    expect(missingSensitivity.result).toMatchObject({ isError: false, structuredContent: { status: 'verified', success: true } })
    expect(JSON.stringify(missingSensitivity.result)).not.toContain('SYNTHETIC-MISSING-SENSITIVITY')
  })

  it('classifies explicit post-dispatch uncertainty as unknown and never successful-looking', async () => {
    nextAct = { success: false, error: 'Click outcome is unknown because the operation could not be verified; inspect the current page before retrying.' }
    const unknown = await act({ action: 'click', selector: '#save' })
    expect(unknown.result).toMatchObject({ isError: true, structuredContent: { status: 'unknown', success: null } })
    expect(unknown.text).toContain('Do not automatically replay')

    nextAct = { success: null, status: 'unknown', tabId: 42, error: 'Action outcome is unknown' }
    const explicit = await act({ action: 'click', selector: '#save' })
    expect(explicit.result).toMatchObject({ isError: true, structuredContent: { status: 'unknown', success: null, tabId: 42 } })
  })

  it('requires verified protected success and suppresses protected page-derived fields', async () => {
    nextAct = {
      success: true, protected: true, verified: false, tabId: 42,
      target: { description: 'SYNTHETIC-TARGET' }, actualValue: 'SYNTHETIC-ACTUAL',
      recovery: { title: 'SYNTHETIC-RECOVERY' }, error: 'SYNTHETIC-ERROR'
    }
    const unverified = await act({ action: 'click', ref: 'ref_protected' })
    expect(unverified.result).toMatchObject({
      isError: true,
      structuredContent: { status: 'unknown', success: null, protected: true, verified: false }
    })
    expect(JSON.stringify(unverified.result)).not.toMatch(/SYNTHETIC-(TARGET|ACTUAL|RECOVERY|ERROR)/)

    nextAct = {
      success: true, protected: true, verified: true, tabId: 42,
      target: { description: 'SYNTHETIC-TARGET' }, actualValue: 'SYNTHETIC-ACTUAL',
      recovery: { title: 'SYNTHETIC-RECOVERY' }
    }
    const verified = await act({ action: 'click', ref: 'ref_protected' })
    expect(verified.result).toMatchObject({
      isError: false,
      structuredContent: { status: 'completed', success: true, protected: true, verified: true }
    })
    expect(JSON.stringify(verified.result)).not.toMatch(/SYNTHETIC-(TARGET|ACTUAL|RECOVERY)/)
  })

  it('refuses malformed success envelopes instead of inventing success', async () => {
    nextAct = { success: true, action: 'hover' }
    const malformed = await act({ action: 'click', selector: '#save' })
    expect(malformed.result).toMatchObject({ isError: true, structuredContent: { status: 'unknown', success: null } })
  })

  it('uses the existing saved-file screenshot route and keeps wait local', async () => {
    const shot = await act({ action: 'screenshot', selector: '#main', outputPath: 'tabz/test.png' })
    expect(posts).toEqual([{ path: '/api/browser/screenshot', body: expect.objectContaining({ selector: '#main', outputPath: 'tabz/test.png' }) }])
    expect(shot.result).toMatchObject({ isError: false, structuredContent: { status: 'completed', path: '/synthetic/screenshots/page.png' } })

    posts.length = 0
    const waited = await act({ action: 'wait', seconds: 0 })
    expect(waited.result).toMatchObject({ isError: false, structuredContent: { status: 'completed', seconds: 0 } })
    expect(posts).toHaveLength(0)
  })

  it('keeps the schema strict and rejects malformed observation or crop arguments', async () => {
    for (const arguments_ of [
      { action: 'click', selector: '#save', observe: 'yes' },
      { action: 'zoom', x0: 3, y0: 2, x1: 1, y1: 4 },
      { action: 'drag', selector: '#a' },
      { action: 'hover', x: 5 }
    ]) {
      posts.length = 0
      expect((await act(arguments_)).result.isError).toBe(true)
      expect(posts).toHaveLength(0)
    }
  })
  it('routes zoom CSS bounds and returns inline image plus file metadata', async () => {
    const shot = await act({ action: 'zoom', tabId: 42, x0: 10, y0: 20, x1: 110, y1: 70 })
    expect(posts[0].body.clip).toEqual({ x0: 10, y0: 20, x1: 110, y1: 70 })
    expect(shot.result.structuredContent).toMatchObject({ action: 'zoom', success: true, width: 400, height: 300, bytes: 3, inline: true })
    expect(shot.result.content).toContainEqual({ type: 'image', data: 'YWJj', mimeType: 'image/png' })
  })

  it('carries inline observation without changing or replaying the action verdict', async () => {
    nextAct = { success: true, tabId: 42, observed: true, imageData: 'YWJj', mimeType: 'image/png', width: 400, height: 300, bytes: 3 }
    const observed = await act({ action: 'click', selector: '#save', observe: true })
    expect(posts).toHaveLength(1)
    expect(posts[0].body.observe).toBe(true)
    expect(observed.result.structuredContent).toMatchObject({ status: 'completed', success: true, observed: true })
    expect(observed.result.content).toContainEqual({ type: 'image', data: 'YWJj', mimeType: 'image/png' })
    nextAct = { success: true, tabId: 42, observed: false, observationError: 'capture refused' }
    const missing = await act({ action: 'click', selector: '#save', observe: true })
    expect(missing.result.structuredContent).toMatchObject({ status: 'completed', success: true, observed: false })
    expect(posts).toHaveLength(2)
  })

  it('does not expose an injected image from a protected action result', async () => {
    nextAct = { success: false, protected: true, tabId: 42, observed: true, imageData: 'YWJj', mimeType: 'image/png' }
    const protectedResult = await act({ action: 'click', ref: 'ref_submit', observe: true })
    expect(protectedResult.result.isError).toBe(true)
    expect(protectedResult.result.content.every(item => item.type === 'text')).toBe(true)
    expect(JSON.stringify(protectedResult.result)).not.toContain('YWJj')
  })

})
