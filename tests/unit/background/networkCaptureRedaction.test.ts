import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  getAgentForGroup: vi.fn(),
  subscribeToTabOwnershipChanges: vi.fn()
}))
// This suite tests redaction after successful document admission. Credential
// admission/refusal and late-event races are covered by credentialCapture.
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  subscribeToDocumentProtection: vi.fn(),
  subscribeToDocumentLifecycle: vi.fn(),
  canCaptureDocumentSync: (_tabId: number, documentId?: string) => documentId === 'synthetic-document'
}))

const listeners: Record<string, (details: any) => void> = {}
let capture: typeof import('../../../extension/background/networkCapture')

beforeEach(async () => {
  vi.resetModules()
  for (const key of Object.keys(listeners)) delete listeners[key]
  Object.assign(chrome, {
    tabs: { get: vi.fn(async (tabId: number) => ({ id: tabId, groupId: -1, url: 'https://example.test/' })) },
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    webRequest: Object.fromEntries([
      'onBeforeRequest', 'onSendHeaders', 'onHeadersReceived', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred',
    ].map(name => [name, { addListener: vi.fn(callback => { listeners[name] = callback }) }])),
  })
  capture = await import('../../../extension/background/networkCapture')
  expect(capture.enableNetworkCapture(41, false, { agent: '__default__', groupId: -1 })).toEqual({ success: true })
})

function request(requestBody: unknown, url = 'https://example.test/api/submit') {
  listeners.onBeforeRequest({
    requestId: 'synthetic-request', tabId: 41, documentId: 'synthetic-document', method: 'POST', type: 'xmlhttprequest',
    url, requestBody,
  })
}

function stored() {
  const result = capture.getNetworkRequests({ tabId: 41 })
  expect(result.total).toBe(1)
  return result.requests[0]
}

describe('network capture redaction wiring', () => {
  it('redacts nested JSON before the captured request is returned', () => {
    const secret = 'synthetic-json-sentinel'
    const body = JSON.stringify({ user: 'ordinary-user', login: [{ password: secret }], token: secret })
    request({ raw: [{ bytes: new TextEncoder().encode(body).buffer }] })
    const row = stored()
    expect(JSON.stringify(row)).not.toContain(secret)
    expect(row.postData).toContain('ordinary-user')
    expect(row.postData).toContain('[redacted]')
  })

  it('redacts form values and request/response credentials without losing diagnostics', () => {
    const secret = 'synthetic-form-header-sentinel'
    request({ formData: { email: ['person@example.test'], password: [secret], otp: [secret] } })
    listeners.onSendHeaders({ requestId: 'synthetic-request', requestHeaders: [
      { name: 'Authorization', value: `Bearer ${secret}` },
      { name: 'Cookie', value: `session=${secret}` },
      { name: 'X-Request-Id', value: 'synthetic-trace-id' },
    ] })
    listeners.onHeadersReceived({ requestId: 'synthetic-request', statusCode: 200, statusLine: 'HTTP/1.1 200 OK', responseHeaders: [
      { name: 'Set-Cookie', value: `session=${secret}; HttpOnly` },
      { name: 'Content-Type', value: 'application/json' },
    ] })
    const row = stored()
    expect(JSON.stringify(row)).not.toContain(secret)
    expect(row.postData).toContain('person@example.test')
    expect(row.requestHeaders?.['X-Request-Id']).toBe('synthetic-trace-id')
    expect(row.responseHeaders?.['Content-Type']).toBe('application/json')
    expect(row.status).toBe(200)
  })

  it('omits opaque body content instead of returning an unparsed secret', () => {
    const secret = 'synthetic-opaque-sentinel'
    request({ raw: [{ bytes: new TextEncoder().encode(secret).buffer }] })
    expect(JSON.stringify(stored())).not.toContain(secret)
  })

  it('suppresses the entire body on credential-shaped endpoints', () => {
    const secret = 'synthetic-login-sentinel'
    request({ raw: [{ bytes: new TextEncoder().encode(JSON.stringify({ ordinary: 'diagnostic', password: secret })).buffer }] },
      'https://example.test/login')
    expect(stored()).toMatchObject({ postData: '[redacted]', bodyRedacted: true })
    expect(JSON.stringify(stored())).not.toContain(secret)
  })

  it('redacts credential-shaped URL query values before storage', () => {
    const secret = 'synthetic-query-sentinel'
    request(undefined, `https://example.test/api/items?trace=okay&access_token=${secret}`)
    expect(stored().url).toContain('trace=okay')
    expect(stored().url).not.toContain(secret)
  })
})
