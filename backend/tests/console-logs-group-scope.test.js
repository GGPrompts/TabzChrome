import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import http from 'http'

const browserRouter = (await import('../routes/browser.js')).default

let server
let port
let frames
let groupStatus

function get(route) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: `/api/browser${route}`, method: 'GET' }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, json: JSON.parse(text) }))
    })
    req.on('error', reject)
    req.end()
  })
}

function seed(entry) {
  browserRouter.addConsoleLog({
    level: 'error',
    message: 'synthetic error',
    timestamp: Date.now(),
    url: 'https://example.test/page',
    groupId: 5,
    agent: 'worker-a',
    ...entry
  })
}

beforeEach(async () => {
  frames = []
  groupStatus = { success: true, exists: true, groupId: 5, tabCount: 1, tabIds: [999] }
  const app = express()
  app.set('sendToExtension', frame => {
    frames.push(frame)
    setImmediate(() => browserRouter.resolvePendingRequest(frame.requestId, { ...groupStatus }))
    return 1
  })
  app.use('/api/browser', browserRouter)
  server = http.createServer(app)
  port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
})

afterEach(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe('console log ownership', () => {
  it('does not collapse identical page and extension messages into one origin', () => {
    seed({ tabId: 95001, message: 'same fixture failure', source: 'page', origin: 'page' })
    seed({ tabId: 95001, message: 'same fixture failure', source: 'extension', origin: 'extension:fixture-id' })
    const result = browserRouter.getConsoleLogs({ agent: 'worker-a', tabId: 95001 })
    expect(result.logs).toHaveLength(2)
    expect(result.logs.map(row => row.origin).sort()).toEqual(['extension:fixture-id', 'page'])
    browserRouter.removeConsoleLogsForTab(95001)
  })
  it('uses immutable capture-time ownership after tabs move', async () => {
    const mine = { tabId: 91001, groupId: 5, agent: 'worker-a', message: 'mine' }
    seed(mine)
    mine.groupId = 6
    mine.agent = 'worker-b'
    seed({ tabId: 91002, groupId: 6, agent: 'worker-b', message: 'theirs' })

    const response = await get('/console-logs?level=error&agent=worker-a')

    expect(response.status).toBe(200)
    expect(response.json.logs.filter(row => row.tabId >= 91001).map(row => row.message)).toEqual(['mine'])
    expect(frames[0]).toMatchObject({ type: 'browser-get-claude-group-status', agent: 'worker-a' })
  })

  it('does not expose an explicit tab owned by another caller', async () => {
    seed({ tabId: 92001, groupId: 6, agent: 'worker-b', message: 'private row' })

    const response = await get('/console-logs?level=error&tabId=92001&agent=worker-a')

    expect(response.json.scope).toBe('tab')
    expect(response.json.logs).toEqual([])
    expect(frames).toEqual([])
  })

  it('fails closed when a fresh caller has no group', async () => {
    seed({ tabId: 93001, message: 'must stay hidden' })
    groupStatus = { success: true, exists: false, groupId: null, tabCount: 0 }

    const response = await get('/console-logs?level=error&agent=fresh-worker')

    expect(response.json.logs).toEqual([])
    expect(response.json.note).toMatch(/no tabs yet/i)
  })

  it('prunes only the closed tab rows', () => {
    seed({ tabId: 94001, message: 'closed' })
    seed({ tabId: 94002, message: 'open' })
    expect(browserRouter.removeConsoleLogsForTab(94001)).toBe(1)
    expect(browserRouter.getConsoleLogs({ agent: 'worker-a', tabId: 94001 }).logs).toEqual([])
    expect(browserRouter.getConsoleLogs({ agent: 'worker-a', tabId: 94002 }).logs.map(row => row.message)).toEqual(['open'])
  })
})
