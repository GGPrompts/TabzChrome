import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const browserRouter = (await import('../routes/browser.js')).default
const {
  actResultFields,
  pendingRequests,
  readPageResultFields,
  sanitizeActResult,
  validateActBody
} = await import('../routes/browser.js')

const extensionClient = { synthetic: 'configured-extension-socket' }
let server
let port
let frames
let responseFrame
let sendMode

function post(route, body) {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: `/api/browser${route}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, response => {
      let text = ''
      response.on('data', chunk => { text += chunk })
      response.on('end', () => resolve({ status: response.statusCode, json: text ? JSON.parse(text) : null }))
    })
    request.on('error', reject)
    request.write(payload)
    request.end()
  })
}

function fakeSendToExtension(frame) {
  frames.push(frame)
  if (sendMode === 'throw') throw new Error('synthetic send uncertainty')
  if (sendMode === 'unavailable') return 0
  setImmediate(() => {
    const projected = frame.type === 'browser-read-page'
      ? readPageResultFields(responseFrame)
      : actResultFields(responseFrame)
    browserRouter.resolvePendingRequest(
      frame.requestId,
      projected,
      sendMode === 'senderless' ? undefined : extensionClient
    )
  })
  return 1
}

beforeEach(async () => {
  frames = []
  sendMode = 'answer'
  responseFrame = {
    success: true,
    action: 'click',
    trusted: false,
    tabId: 42,
    target: { description: '<button#save>', tagName: 'button', x: 10, y: 20 },
    events: ['click']
  }
  const app = express()
  app.use(express.json())
  app.set('sendToExtension', fakeSendToExtension)
  app.use('/api/browser', browserRouter)
  server = http.createServer(app)
  port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
})

afterEach(async () => {
  pendingRequests.clear()
  await new Promise(resolve => server.close(resolve))
})

describe('POST /api/browser/act', () => {
  it('forwards observation and preserves opaque image bytes without exposing protected images', async () => {
    responseFrame = { success: true, action: 'type', trusted: false, tabId: 42, verified: true, sensitive: false, observed: true, imageData: 'YWJj', mimeType: 'image/png', width: 400, height: 300, bytes: 3 }
    const response = await post('/act', { action: 'type', value: 'Y', observe: true })
    expect(frames[0].observe).toBe(true)
    expect(response.json).toMatchObject({ observed: true, imageData: 'YWJj', mimeType: 'image/png' })
    const protectedResult = actResultFields({ ...responseFrame, protected: true })
    expect(protectedResult).not.toHaveProperty('imageData')
    expect(protectedResult).not.toHaveProperty('observed')
  })

  it('strictly validates page actions and action-specific inputs before relaying', async () => {
    expect((await post('/act', [])).status).toBe(400)
    const invalidBodies = [
      { action: 'middle_click', selector: '#save' },
      { action: 'click' },
      { action: 'type', selector: '#name' },
      { action: 'key', key: '   ' },
      { action: 'drag', selector: '#card' },
      { action: 'click', ref: 'ref_1', selector: '#save' },
      { action: 'click', text: 'Save', x: 1, y: 2 },
      { action: 'drag', selector: '#card', toSelector: '#lane', toX: 1, toY: 2 },
      { action: 'click', x: 1 },
      { action: 'scroll', tabId: 0 },
      { action: 'scroll', ticks: 11 },
      { action: 'scroll', direction: 'diagonal' },
      { action: 'click', selector: '#save', observe: 'yes' }
    ]
    for (const body of invalidBodies) {
      const response = await post('/act', body)
      expect(response.status).toBe(400)
    }
    expect(frames).toEqual([])
  })

  it('relays only defined validated fields with caller identity and a relative deadline budget', async () => {
    responseFrame = {
      success: true, action: 'double_click', trusted: true, tabId: 42,
      target: { tagName: 'button', x: 60, y: 40 }, events: ['click', 'click', 'dblclick']
    }
    const response = await post('/act', {
      action: 'double_click', x: 60, y: 40, modifiers: 'ctrl', trusted: true,
      waitTimeout: 999999, agent: 'worker-1'
    })

    expect(response.status).toBe(200)
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      type: 'browser-act', action: 'double_click', x: 60, y: 40,
      modifiers: 'ctrl', trusted: true, waitTimeout: 10000,
      requestTimeoutMs: 24000, agent: 'worker-1'
    })
    expect(frames[0]).not.toHaveProperty('requestTimeout')
    expect(frames[0]).not.toHaveProperty('selector')
    expect(response.json).toMatchObject({ success: true, action: 'double_click', trusted: true })

    frames = []
    responseFrame = { success: true, action: 'scroll', trusted: false, tabId: 42, scroll: { x: 0, y: 300 } }
    await post('/act', { action: 'scroll' })
    expect(frames[0]).toMatchObject({ requestTimeoutMs: 14000, waitTimeout: 5000 })
  })

  it('allows an opaque ref and forwards only bounded allowlisted result fields', async () => {
    responseFrame = {
      success: false,
      action: 'click',
      trusted: false,
      tabId: 42,
      target: { description: '<button>', tagName: 'button', x: 1, y: 2, value: 'must not pass' },
      events: ['pointerdown', 'click'],
      recovery: {
        url: 'https://user:pass@example.test/path?token=hidden#fragment',
        title: 'Checkout',
        point: { x: 1, y: 2 },
        covering: { tag: 'div', description: '<div.backdrop>', html: 'must not pass' },
        suggestions: [{ ref: 'ref_a_1', role: 'button', name: 'Close', tag: 'button', value: 'must not pass' }],
        refs: ['ref_a_1'],
        html: 'must not pass'
      },
      error: 'target is covered',
      secretKeyPath: '/must/not/pass',
      extra: 'must not pass'
    }

    const response = await post('/act', { action: 'click', ref: 'ref_a_1' })
    expect(frames[0]).toMatchObject({ type: 'browser-act', ref: 'ref_a_1' })
    expect(response.json).toMatchObject({
      success: false,
      target: { tagName: 'button' },
      recovery: { url: 'https://example.test/path', refs: ['ref_a_1'] }
    })
    expect(JSON.stringify(response.json)).not.toContain('must not pass')
    expect(response.json).not.toHaveProperty('secretKeyPath')
  })

  it('redacts submitted text from diagnostics and never returns a sensitive read-back', async () => {
    responseFrame = {
      success: false, action: 'type', trusted: false, tabId: 42, verified: false,
      sensitive: false, actualLength: 6, actualValue: 'public-mismatch',
      error: 'Page rejected SYNTHETIC-VALUE',
      recovery: { suggestions: [{ ref: 'ref_1', name: 'SYNTHETIC-VALUE', role: 'textbox', tag: 'input' }] }
    }
    const ordinary = await post('/act', {
      action: 'type', selector: '#city', value: 'SYNTHETIC-VALUE'
    })
    expect(ordinary.json).not.toHaveProperty('actualValue')
    expect(ordinary.json.error).toBe('Page rejected [redacted]')
    expect(JSON.stringify(ordinary.json.recovery)).not.toContain('SYNTHETIC-VALUE')

    responseFrame = {
      success: true, action: 'type', trusted: false, tabId: 42, verified: true,
      sensitive: true, actualLength: 15, actualValue: 'SYNTHETIC-VALUE'
    }
    const sensitive = await post('/act', {
      action: 'type', selector: '#password', value: 'SYNTHETIC-VALUE'
    })
    expect(sensitive.json).toMatchObject({ success: true, verified: true, sensitive: true, actualLength: 15 })
    expect(sensitive.json).not.toHaveProperty('actualValue')
    expect(JSON.stringify(sensitive.json)).not.toContain('SYNTHETIC-VALUE')
  })

  it('reduces protected action outcomes to fixed boolean metadata', async () => {
    responseFrame = {
      success: false, action: 'click', trusted: true, tabId: 42, protected: true, verified: false,
      target: { description: 'SYNTHETIC-LEAK' }, error: 'SYNTHETIC-LEAK',
      recovery: { title: 'SYNTHETIC-LEAK' }, actualValue: 'SYNTHETIC-LEAK'
    }
    const response = await post('/act', { action: 'click', ref: 'ref_protected', trusted: true })
    expect(response.json).toEqual({
      success: false,
      action: 'click',
      trusted: true,
      tabId: 42,
      protected: true,
      verified: false,
      error: 'Protected document action was refused or could not be verified'
    })
  })

  it('requires an identified answering socket and reports send uncertainty without replay advice', async () => {
    sendMode = 'senderless'
    const senderless = await post('/act', { action: 'click', selector: '#save' })
    expect(senderless.status).toBe(200)
    expect(senderless.json).toMatchObject({ success: null, status: 'unknown', uncertain: true })

    sendMode = 'throw'
    const uncertain = await post('/act', { action: 'click', selector: '#save' })
    expect(uncertain.status).toBe(200)
    expect(uncertain.json).toMatchObject({ success: null, status: 'unknown', transportError: true, uncertain: true })
    expect(uncertain.json.error).toContain('do not automatically retry')
    expect(pendingRequests.size).toBe(0)

    sendMode = 'unavailable'
    const unavailable = await post('/act', { action: 'click', selector: '#save' })
    expect(unavailable.status).toBe(503)
  })

  it('does not accept a success for a missing or different result tab', async () => {
    responseFrame = { success: true, action: 'click', trusted: false, events: ['click'] }
    const missing = await post('/act', { action: 'click', selector: '#save' })
    expect(missing.json).toMatchObject({ success: null, status: 'unknown', uncertain: true })

    responseFrame = { success: true, action: 'click', trusted: false, tabId: 99, events: ['click'] }
    const mismatch = await post('/act', { action: 'click', selector: '#save', tabId: 42 })
    expect(mismatch.json).toMatchObject({ success: null, status: 'unknown', uncertain: true })
  })

  it('does not fabricate success when the producer omits or changes action identity', async () => {
    responseFrame = { success: true, action: 'hover', trusted: false, tabId: 42 }
    const wrongAction = await post('/act', { action: 'click', selector: '#save' })
    expect(wrongAction.json).toMatchObject({ success: null, status: 'unknown', action: 'click', uncertain: true })

    responseFrame = { success: true, action: 'click', tabId: 42 }
    const missingPath = await post('/act', { action: 'click', selector: '#save' })
    expect(missingPath.json).toMatchObject({ success: null, status: 'unknown', action: 'click', uncertain: true })

    responseFrame = { success: true, action: 'click', trusted: true, tabId: 42 }
    const wrongPath = await post('/act', { action: 'click', selector: '#save' })
    expect(wrongPath.json).toMatchObject({ success: null, status: 'unknown', action: 'click', trusted: false, uncertain: true })
  })
})

describe('POST /api/browser/read-page', () => {
  it('relays a bounded page read with caller identity and allowlists the result', async () => {
    responseFrame = {
      success: true, tabId: 42, text: '- button "Save" [ref=ref_1]', nodeCount: 2,
      refCount: 1, truncated: false, title: 'Fixture', url: 'https://example.test/',
      html: '<input value="must not pass">', extra: 'must not pass'
    }
    const response = await post('/read-page', { tabId: 42, maxChars: 1200, agent: 'worker-1' })
    expect(response.status).toBe(200)
    expect(frames[0]).toMatchObject({
      type: 'browser-read-page', tabId: 42, maxChars: 1200,
      requestTimeoutMs: 14000, agent: 'worker-1'
    })
    expect(response.json).toMatchObject({ success: true, tabId: 42, refCount: 1, truncated: false })
    expect(response.json).not.toHaveProperty('html')
    expect(response.json).not.toHaveProperty('extra')
  })

  it('rejects malformed bodies before relay and requires an identified sender', async () => {
    expect((await post('/read-page', [])).status).toBe(400)
    for (const body of [
      { tabId: 0 }, { maxChars: 499 }, { maxChars: 20001 },
      { maxChars: 1000.5 }, { maxChars: 1000, observe: true }
    ]) {
      const response = await post('/read-page', body)
      expect(response.status).toBe(400)
    }
    expect(frames).toEqual([])

    sendMode = 'senderless'
    const senderless = await post('/read-page', {})
    expect(senderless.status).toBe(503)

    sendMode = 'answer'
    responseFrame = { success: true, tabId: 99, text: 'wrong tab' }
    const mismatch = await post('/read-page', { tabId: 42 })
    expect(mismatch.status).toBe(409)
  })
})

describe('result projections and production dispatch wiring', () => {
  it('refuses arbitrary action fields in the pure validator', () => {
    expect(validateActBody({ action: 'click', selector: '#a', requestTimeoutMs: 1 })).toBe('unknown field: requestTimeoutMs')
  })

  it('keeps ordinary read-back only through the explicit sanitization contract', () => {
    const projected = actResultFields({
      success: true, action: 'type', trusted: false, verified: true,
      sensitive: false, actualValue: 'ordinary', requestId: 'x', secret: 'hidden'
    })
    expect(sanitizeActResult(projected, 'requested', { action: 'type', trusted: false }).actualValue).toBe('ordinary')
    expect(projected).not.toHaveProperty('secret')
    for (const verdict of [{ success: true, verified: false }, { success: true }, { success: null, verified: true }, { success: false, verified: true }]) {
      const unverified = actResultFields({ ...verdict, action: 'type', trusted: false, sensitive: false, actualValue: 'SYNTHETIC-UNVERIFIED' })
      expect(sanitizeActResult(unverified, 'requested', { action: 'type', trusted: false })).not.toHaveProperty('actualValue')
    }
  })

  it('forwards both result types through their allowlists with the answering socket', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const source = fs.readFileSync(path.join(here, '../server.js'), 'utf8')
    expect(source).toMatch(/case 'browser-act-result':[\s\S]*actResultFields\(data\),[\s\S]*ws/)
    expect(source).toMatch(/case 'browser-read-page-result':[\s\S]*readPageResultFields\(data\),[\s\S]*ws/)
    expect(source).toMatch(/case 'browser-open-url-result':[\s\S]*created: typeof data\.created === 'boolean' \? data\.created : undefined,[\s\S]*}, ws\)/)
  })
})
