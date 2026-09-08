import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import http from 'node:http'

const router = (await import('../routes/browser.js')).default
let server
let origin
let frames

beforeEach(async () => {
  frames = []
  const app = express()
  app.use(express.json())
  app.set('sendToExtension', frame => {
    frames.push(frame)
    setImmediate(() => router.resolvePendingRequest(frame.requestId, {
      success: true, tabId: 42, filePath: '/synthetic/page.png',
      imageData: 'YWJj', mimeType: 'image/png', width: 400, height: 300, bytes: 3
    }, { synthetic: true }))
    return 1
  })
  app.use('/api/browser', router)
  server = http.createServer(app)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}/api/browser`
})
afterEach(async () => {
  router.pendingRequests.clear()
  await new Promise(resolve => server.close(resolve))
})
async function post(path, body) {
  const response = await fetch(`${origin}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, data: await response.json() }
}

describe('capture relay contracts', () => {
  it('carries crop geometry, caller identity and the relative screenshot deadline', async () => {
    const clip = { x0: 1, y0: 2, x1: 101, y1: 52 }
    const response = await post('/screenshot', { tabId: 42, agent: 'capture-worker', clip, inlineOnly: true })
    expect(frames[0]).toMatchObject({ type: 'browser-screenshot', tabId: 42, agent: 'capture-worker', clip, inlineOnly: true, requestTimeoutMs: 29000 })
    expect(response.data).toMatchObject({ success: true, tabId: 42, imageData: 'YWJj', mimeType: 'image/png', width: 400, height: 300, bytes: 3 })
  })
  it('rejects conflicting, malformed and unbounded screenshot requests before dispatch', async () => {
    for (const body of [[], { tabId: 0 }, { inlineOnly: true, outputPath: 'page.png' }, { ref: 'r1', selector: '#main' }, { fullPage: true, selector: '#main' }, { clip: { x0: 5, y0: 0, x1: 2, y1: 4 } }, { clip: { x0: 0, y0: 0, x1: 4, y1: 4, scale: 2 } }]) {
      expect((await post('/screenshot', body)).status).toBe(400)
    }
    expect(frames).toEqual([])
  })
  it('bounds deep capture and keeps payload IDs distinct from transport correlation', async () => {
    await post('/network-capture/deep/enable', { tabId: 42, agent: 'capture-worker' })
    expect(frames[0]).toMatchObject({ type: 'browser-enable-deep-capture', tabId: 42, agent: 'capture-worker', maxBodyBytes: 64000, includeSelf: false })
    await post('/network-response-body', { tabId: 42, requestId: 'fixture-row', offset: 2, length: 16 })
    expect(frames[1]).toMatchObject({ type: 'browser-get-response-body', networkRequestId: 'fixture-row', offset: 2, length: 16 })
    expect(frames[1].requestId).not.toBe('fixture-row')
    for (const [route, body] of [['/network-capture/deep/enable', { maxBodyBytes: 1000001 }], ['/network-response-body', { requestId: 'r', length: 32001 }], ['/network-requests', { source: 'unrestricted' }], ['/network-requests', { limit: 201 }]]) {
      expect((await post(route, body)).status).toBe(400)
    }
    expect(frames).toHaveLength(2)
  })
  it('drops image data and file metadata from failed or malformed image responses', () => {
    expect(router.screenshotResultFields({ success: false, imageData: 'YWJj', mimeType: 'image/png', filePath: '/private/value.png' })).toMatchObject({ success: false, filePath: undefined })
    expect(router.screenshotResultFields({ success: true, imageData: 'data:text/html,secret', mimeType: 'text/html' })).not.toHaveProperty('imageData')
  })
})
