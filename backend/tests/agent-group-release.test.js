import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import http from 'http'

const browserRouter = (await import('../routes/browser.js')).default

let server
let port
let frames

function post(route, body) {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `/api/browser${route}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

beforeEach(async () => {
  frames = []
  const app = express()
  app.use(express.json())
  app.set('sendToExtension', frame => {
    frames.push(frame)
    setImmediate(() => browserRouter.resolvePendingRequest(frame.requestId, {
      success: true,
      groupId: 10,
      ungroupedCount: 2
    }))
    return 1
  })
  app.use('/api/browser', browserRouter)
  server = http.createServer(app)
  port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
})

afterEach(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe('POST /api/browser/claude-group/release', () => {
  it('releases only the caller identity through the extension channel', async () => {
    const response = await post('/claude-group/release', { agent: 'worker-1' })

    expect(response.status).toBe(200)
    expect(response.json).toEqual({ success: true, groupId: 10, ungroupedCount: 2 })
    expect(frames).toHaveLength(1)
    expect(frames[0]).toMatchObject({
      type: 'browser-release-claude-group',
      agent: 'worker-1'
    })
  })

  it('cannot be spoofed by a route payload field', async () => {
    await post('/close-tab', { agent: 'worker-1', tabIds: [17] })
    expect(frames[0]).toMatchObject({ type: 'browser-close-tab', agent: 'worker-1', tabIds: [17] })
  })

  it('refuses force-close for an agent-scoped caller', async () => {
    const response = await post('/close-tab', { agent: 'worker-1', tabIds: [17], force: true })
    expect(response.status).toBe(400)
    expect(response.json.error).toMatch(/cannot force-close/i)
    expect(frames).toEqual([])
  })

  it('preserves the window request envelope and forwards group options', async () => {
    await post('/windows', {
      agent: 'worker-1', type: 'popup', url: 'https://example.test/',
      addToClaudeGroup: true, claudeGroupTitle: 'Synthetic work'
    })
    expect(frames[0]).toMatchObject({
      type: 'browser-create-window', windowType: 'popup', agent: 'worker-1',
      addToClaudeGroup: true, claudeGroupTitle: 'Synthetic work'
    })
  })
})
