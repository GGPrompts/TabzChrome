import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import express from 'express'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const browserRouter = (await import('../routes/browser.js')).default
const { loginStateResultFields, openLoginsPageResultFields } = await import('../routes/browser.js')

let server
let port
let frames

function post(route, body) {
  const payload = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port, path: `/api/browser${route}`, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let text = ''
      res.on('data', chunk => { text += chunk })
      res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }))
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
    setImmediate(() => {
      const result = frame.type === 'browser-login-state'
        ? loginStateResultFields({
            success: true, tabId: frame.tabId ?? 42, tabStatus: 'complete', probed: true,
            url: 'https://user:password@app.example.com/login?code=SYNTHETIC#token=SYNTHETIC',
            host: 'forged.example.net', authUrl: true, hasPasswordField: true,
            hasLoginForm: true, protected: frame.beginHandoff === true || frame.completeHandoff === true,
            pageText: 'must not pass'
          })
        : openLoginsPageResultFields({
            success: true, tabId: 7,
            url: `chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dashboard/index.html#/logins?host=${frame.host}`,
            extra: 'must not pass'
          })
      browserRouter.resolvePendingRequest(frame.requestId, result)
    })
    return 1
  })
  app.use('/api/browser', browserRouter)
  server = http.createServer(app)
  port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
})

afterEach(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe('manual login browser relays', () => {
  it('forwards login-state with caller identity and returns value-free sanitized fields', async () => {
    const response = await post('/login-state', { tabId: 42, agent: 'worker-a' })
    expect(response.status).toBe(200)
    expect(frames[0]).toMatchObject({ type: 'browser-login-state', tabId: 42, agent: 'worker-a' })
    expect(response.json).toEqual({
      success: true, tabId: 42, tabStatus: 'complete', probed: true,
      url: 'https://app.example.com/login', host: 'app.example.com', authUrl: true,
      hasPasswordField: true, hasLoginForm: true, protected: false
    })
    expect(JSON.stringify(response.json)).not.toContain('SYNTHETIC')
    expect(response.json).not.toHaveProperty('pageText')
  })

  it('forwards beginHandoff and returns the positive protection verdict', async () => {
    const response = await post('/login-state', { tabId: 42, beginHandoff: true, requestTimeoutMs: 12000, agent: 'worker-a' })
    expect(response.status).toBe(200)
    expect(frames[0]).toMatchObject({
      type: 'browser-login-state', tabId: 42, beginHandoff: true, requestTimeoutMs: 9000, agent: 'worker-a'
    })
    expect(response.json).toMatchObject({ success: true, tabId: 42, protected: true })
  })

  it('forwards completeHandoff and rejects contradictory lifecycle flags', async () => {
    const response = await post('/login-state', { tabId: 42, completeHandoff: true, requestTimeoutMs: 8750.9, agent: 'worker-a' })
    expect(response.status).toBe(200)
    expect(frames[0]).toMatchObject({
      type: 'browser-login-state', tabId: 42, completeHandoff: true, requestTimeoutMs: 8750, agent: 'worker-a'
    })
    expect(response.json).toMatchObject({ success: true, tabId: 42, protected: true })

    expect((await post('/login-state', { tabId: 42, beginHandoff: true, completeHandoff: true, requestTimeoutMs: 1000 })).status).toBe(400)
    expect((await post('/login-state', { tabId: 42, beginHandoff: true })).status).toBe(400)
    expect((await post('/login-state', { tabId: 42, completeHandoff: true, requestTimeoutMs: 0 })).status).toBe(400)
  })

  it('opens Logins with normalized user input limited to host and reason', async () => {
    const response = await post('/open-logins-page', {
      host: 'App.Example.com', reason: 'Synthetic handoff', agent: 'worker-a',
      url: 'https://attacker.invalid/', value: 'must not pass'
    })
    expect(response.status).toBe(200)
    expect(frames[0]).toMatchObject({
      type: 'browser-open-logins-page', host: 'app.example.com',
      reason: 'Synthetic handoff', agent: 'worker-a'
    })
    expect(frames[0]).not.toHaveProperty('url')
    expect(frames[0]).not.toHaveProperty('value')
    expect(response.json).toMatchObject({ success: true, tabId: 7 })
  })

  it('rejects invalid targets before sending a frame', async () => {
    expect((await post('/login-state', { tabId: -1 })).status).toBe(400)
    expect((await post('/open-logins-page', { host: '*.example.com' })).status).toBe(400)
    expect(frames).toEqual([])
  })

  it('drops malformed result URLs and arbitrary fields at the relay boundary', () => {
    expect(loginStateResultFields({ success: true, url: 'not a url', page: 'secret' })).toEqual({
      success: true, tabId: undefined, tabStatus: 'unknown', probed: false,
      url: '', host: '', authUrl: false, hasPasswordField: false, hasLoginForm: false,
      protected: false, error: undefined
    })
    expect(openLoginsPageResultFields({
      success: true, url: 'https://example.com/#/logins?host=example.com', value: 'secret'
    })).toEqual({ success: true, url: '', tabId: undefined, error: undefined })
  })

  it('passes the answering socket through both lifecycle result cases', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const source = fs.readFileSync(path.join(here, '../server.js'), 'utf8')
    expect(source).toMatch(/case 'browser-login-state-result':[\s\S]*loginStateResultFields\(data\),[\s\S]*ws/)
    expect(source).toMatch(/case 'browser-open-logins-page-result':[\s\S]*openLoginsPageResultFields\(data\),[\s\S]*ws/)
  })
})
