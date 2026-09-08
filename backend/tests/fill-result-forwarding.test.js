import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import http from 'http'

const browserRouter = (await import('../routes/browser.js')).default
const {
  emulateGeolocationResultFields,
  emulateMediaResultFields,
  fillInputResultFields,
  makeBrowserRequest,
  requestTimeoutMs,
  scriptResultFields
} = await import('../routes/browser.js')

let server
let port
let responseFrame
let sentFrames

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
      res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }))
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function fakeSendToExtension(frame) {
  sentFrames.push(frame)
  setImmediate(() => {
    const result = frame.type === 'browser-fill-input'
      ? fillInputResultFields({ ...responseFrame, requestId: frame.requestId })
      : { success: true, result: null }
    browserRouter.resolvePendingRequest(frame.requestId, result)
  })
  return 1
}

beforeEach(async () => {
  responseFrame = { success: true, verified: true, sensitive: false, actualValue: 'synthetic', actualLength: 9 }
  sentFrames = []
  const app = express()
  app.use(express.json())
  app.set('sendToExtension', fakeSendToExtension)
  app.use('/api/browser', browserRouter)
  server = http.createServer(app)
  port = await new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
})

afterEach(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe('browser request forwarding', () => {
  it('keeps type and requestId authoritative over route payload fields', async () => {
    let sent
    const resultPromise = makeBrowserRequest(frame => {
      sent = frame
      setImmediate(() => browserRouter.resolvePendingRequest(frame.requestId, { success: true }))
      return 1
    }, 'browser-list-tabs', { type: 'browser-close-window', requestId: 'forged' })

    await expect(resultPromise).resolves.toEqual({ success: true })
    expect(sent.type).toBe('browser-list-tabs')
    expect(sent.requestId).toMatch(/^browser-\d+$/)
    expect(sent.requestId).not.toBe('forged')
  })

  it('forwards relative operation budgets below each relay timeout', async () => {
    await post('/click-element', { selector: '#go' })
    await post('/fill-input', { selector: '#city', value: 'synthetic' })
    await post('/execute-script', { code: '1 + 1' })

    expect(sentFrames.map(frame => [frame.type, frame.requestTimeoutMs])).toEqual([
      ['browser-click-element', 14000],
      ['browser-fill-input', 14000],
      ['browser-execute-script', 29000]
    ])
  })

  it('refuses a relay budget that cannot retain the response reserve', () => {
    expect(() => requestTimeoutMs(1000)).toThrow(/response reserve/)
    expect(() => requestTimeoutMs(999)).toThrow(/response reserve/)
    expect(requestTimeoutMs(1001)).toBe(1)
  })

  it('forwards the fill verdict and confirmed ordinary read-back', async () => {
    responseFrame = {
      success: true,
      tagName: 'input',
      inputType: 'text',
      sensitive: false,
      host: 'example.test',
      selected: false,
      verified: true,
      actualLength: 6,
      actualValue: 'Denver'
    }

    const response = await post('/fill-input', { selector: '#city', value: 'Denver', tabId: 42 })
    expect(response.json).toMatchObject(responseFrame)
  })

  it('forwards checkbox booleans without coercion and rejects other value types', async () => {
    responseFrame = {
      success: true, inputType: 'checkbox', sensitive: false, verified: true,
      actualLength: 4, actualValue: 'true'
    }

    const accepted = await post('/fill-input', { selector: '#remember', value: true, tabId: 42 })
    expect(accepted.status).toBe(200)
    expect(sentFrames.at(-1)).toMatchObject({ type: 'browser-fill-input', value: true })
    expect(accepted.json).toMatchObject({ success: true, verified: true, actualValue: 'true' })

    const sentBefore = sentFrames.length
    const refused = await post('/fill-input', { selector: '#remember', value: { checked: true } })
    expect(refused.status).toBe(400)
    expect(refused.json.error).toBe('value must be a string or boolean')
    expect(sentFrames).toHaveLength(sentBefore)
  })

  it('reduces protected fill frames to boolean outcomes at the backend boundary', async () => {
    responseFrame = {
      success: true, verified: true, protected: true, selected: false,
      sensitive: false, tagName: 'input', inputType: 'text', host: 'page-controlled.test',
      actualLength: 16, actualValue: 'SYNTHETIC-LEAK', verifyError: 'SYNTHETIC-LEAK'
    }

    const response = await post('/fill-input', { selector: '#already-protected', value: 'ordinary-value' })
    expect(response.json).toEqual({ success: true, verified: true, protected: true, selected: false })
    expect(JSON.stringify(response.json)).not.toContain('SYNTHETIC-LEAK')

    responseFrame = {
      success: false, verified: false, protected: true,
      error: 'page rejected SYNTHETIC-LEAK', actualValue: 'SYNTHETIC-LEAK'
    }
    const failed = await post('/fill-input', { selector: '#already-protected', value: 'ordinary-value' })
    expect(failed.json).toEqual({
      success: false, verified: false, protected: true,
      error: 'Protected document fill was refused or could not be verified'
    })
    expect(JSON.stringify(failed.json)).not.toContain('SYNTHETIC-LEAK')
  })

  it('preserves a failed verdict without exposing its unconfirmed read-back', async () => {
    responseFrame = {
      success: true,
      inputType: 'text',
      sensitive: false,
      verified: false,
      actualLength: 5,
      actualValue: '80202',
      verifyError: 'controlled field reverted'
    }

    const response = await post('/fill-input', { selector: '#zip', value: '802021234' })
    expect(response.json).toMatchObject({ verified: false, actualLength: 5 })
    expect(response.json.actualValue).toBeUndefined()
  })

  it('does not restore a submitted value when sensitivity metadata is absent', async () => {
    responseFrame = {
      success: true,
      verified: true,
      actualLength: 9,
      actualValue: 'synthetic'
    }

    const response = await post('/fill-input', { selector: '#unknown', value: 'synthetic' })
    expect(response.json.actualValue).toBeUndefined()
    expect(JSON.stringify(response.json)).not.toContain('synthetic')
  })

  it('omits sensitive values and recursively scrubs diagnostics', async () => {
    responseFrame = {
      success: false,
      inputType: 'password',
      sensitive: true,
      verified: false,
      actualLength: 9,
      actualValue: 'synthetic',
      error: 'Rejected synthetic',
      verifyError: 'Read synthetic after write'
    }

    const response = await post('/fill-input', { selector: '#password', value: 'synthetic' })
    expect(response.json.actualValue).toBeUndefined()
    expect(response.json.error).toBe('Rejected [redacted]')
    expect(response.json.verifyError).toBe('Read [redacted] after write')
    expect(JSON.stringify(response.json)).not.toContain('synthetic')
  })

  it('forwards media fields and translates vision type without colliding with the envelope', async () => {
    await post('/emulate/media', {
      tabId: 8,
      media: 'print',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      forcedColors: 'active'
    })
    await post('/emulate/vision', { tabId: 8, type: 'deuteranopia' })

    expect(sentFrames[0]).toMatchObject({
      type: 'browser-emulate-media',
      media: 'print',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      forcedColors: 'active'
    })
    expect(sentFrames[1]).toMatchObject({
      type: 'browser-emulate-vision',
      visionType: 'deuteranopia'
    })
  })

  it('forwards geolocation clear to the extension', async () => {
    await post('/emulate/geolocation', { tabId: 8, clear: true })

    expect(sentFrames[0]).toMatchObject({
      type: 'browser-emulate-geolocation',
      tabId: 8,
      clear: true
    })
  })

  it('projects script timeout uncertainty without claiming termination confirmation', () => {
    expect(scriptResultFields({
      success: false,
      executionPath: 'debugger',
      timedOut: true,
      uncertain: true,
      terminationAttempted: true,
      terminationAcknowledged: false,
      error: 'evaluation timed out',
      ignored: 'not forwarded'
    })).toEqual({
      success: false,
      result: undefined,
      executionPath: 'debugger',
      resultTruncated: undefined,
      warning: undefined,
      timedOut: true,
      uncertain: true,
      terminationAttempted: true,
      terminationAcknowledged: false,
      error: 'evaluation timed out'
    })
  })

  it('projects every media result field used by the existing MCP schema', () => {
    expect(emulateMediaResultFields({
      success: true,
      media: 'print',
      features: [{ name: 'prefers-color-scheme', value: 'dark' }],
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      forcedColors: 'active',
      message: 'applied'
    })).toMatchObject({
      media: 'print',
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      forcedColors: 'active'
    })
  })

  it('projects bounded geolocation permission evidence and omits unknown fields', () => {
    expect(emulateGeolocationResultFields({
      success: true,
      latitude: 39.7392,
      longitude: -104.9903,
      accuracy: 20,
      permissionGranted: false,
      permissionState: 'prompt',
      permissionNote: 'Location is not granted',
      message: 'override set',
      ignored: 'not forwarded'
    })).toEqual({
      success: true,
      latitude: 39.7392,
      longitude: -104.9903,
      accuracy: 20,
      permissionGranted: false,
      permissionState: 'prompt',
      permissionNote: 'Location is not granted',
      message: 'override set',
      error: undefined
    })

    expect(emulateGeolocationResultFields({
      success: true,
      permissionGranted: 'yes',
      permissionState: 'forged',
      permissionNote: 'x'.repeat(3000)
    })).toMatchObject({
      success: true,
      permissionGranted: undefined,
      permissionState: undefined,
      permissionNote: 'x'.repeat(2000)
    })
  })
})
