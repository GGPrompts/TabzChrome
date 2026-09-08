import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  listeners: {} as Record<string, (details: any) => void>,
  ownershipListeners: [] as Array<(tabId: number) => void>,
  protectionListeners: [] as Array<(tabId: number) => void>,
  owner: 'agent-a',
  allowed: true,
  resolveTab: vi.fn(),
  send: vi.fn(),
  admission: vi.fn(async (_tabId: number, work: () => unknown) => work())
}))

vi.mock('@/background/websocket', () => ({ sendToWebSocket: fixture.send }))
vi.mock('@/background/deepCapture', () => ({
  clearDeepCaptureRequests: vi.fn(), getDeepNetworkRequests: vi.fn(() => []), isDeepCaptureActive: vi.fn(() => false)
}))
vi.mock('@/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn() }))
vi.mock('@/background/browserMcp/tabGroups', () => ({
  resolveAgentTab: fixture.resolveTab,
  assertTabInAgentGroup: vi.fn(),
  getAgentForGroup: vi.fn(async () => fixture.owner),
  subscribeToTabOwnershipChanges: (listener: (tabId: number) => void) => {
    fixture.ownershipListeners.push(listener)
    return () => undefined
  }
}))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: fixture.admission,
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(),
  canCaptureDocumentSync: vi.fn((_tabId: number, documentId?: string) => fixture.allowed && documentId === 'doc'),
  subscribeToDocumentProtection: (listener: (tabId: number) => void) => {
    fixture.protectionListeners.push(listener)
    return () => undefined
  }
}))

let capture: typeof import('@/background/networkCapture')

function fire(event: string, details: Record<string, unknown>): void {
  fixture.listeners[event](details)
}

function request(requestId: string, tabId: number, url = 'https://site.test/api'): void {
  fire('onBeforeRequest', {
    requestId, tabId, documentId: 'doc', url, method: 'GET', type: 'xmlhttprequest'
  })
}

beforeEach(async () => {
  vi.resetModules()
  fixture.listeners = {}
  fixture.ownershipListeners = []
  fixture.protectionListeners = []
  fixture.owner = 'agent-a'
  fixture.allowed = true
  fixture.send.mockReset()
  fixture.resolveTab.mockReset()
  fixture.admission.mockClear()
  Object.assign(chrome, {
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    tabs: { get: vi.fn(async (tabId: number) => ({ id: tabId, groupId: 8, url: 'https://site.test/' })) },
    webRequest: Object.fromEntries([
      'onBeforeRequest', 'onSendHeaders', 'onHeadersReceived', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'
    ].map(name => [name, { addListener: vi.fn(callback => { fixture.listeners[name] = callback }) }]))
  })
  capture = await import('@/background/networkCapture')
})

describe('network capture ownership and retention', () => {
  it('recognizes exact Tabz origins without substring or top-level-navigation false positives', () => {
    expect(capture.isSelfTraffic({ url: 'http://localhost:8129/api/status' })).toBe(true)
    expect(capture.isSelfTraffic({ url: 'http://localhost:81290/api/status' })).toBe(false)
    expect(capture.isSelfTraffic({
      url: 'https://site.test/', initiator: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', type: 'main_frame'
    })).toBe(false)
    expect(capture.isSelfTraffic({
      url: 'https://site.test/api', initiator: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', type: 'xmlhttprequest'
    })).toBe(true)
  })

  it('keeps independently enabled tabs and synchronously purges a moved tab', () => {
    capture.enableNetworkCapture(10, false, { agent: 'agent-a', groupId: 8 })
    capture.enableNetworkCapture(20, true, { agent: 'agent-a', groupId: 8 })
    request('a', 10)
    request('b', 20, 'http://localhost:8129/api/status')
    expect(capture.getNetworkRequests({ agent: 'agent-a' }).requests.map(row => row.requestId).sort()).toEqual(['a', 'b'])

    fixture.ownershipListeners.forEach(listener => listener(10))
    expect(capture.getNetworkRequests({ agent: 'agent-a' }).requests.map(row => row.requestId)).toEqual(['b'])
    request('late', 10)
    expect(capture.getNetworkRequests({ tabId: 10, agent: 'agent-a' }).requests).toEqual([])
  })

  it('purges content on protection but retains opt-in for a later readable document', () => {
    capture.enableNetworkCapture(10, false, { agent: 'agent-a', groupId: 8 })
    request('before', 10)
    fixture.protectionListeners.forEach(listener => listener(10))
    expect(capture.getNetworkRequests({ tabId: 10 }).requests).toEqual([])
    request('fresh', 10)
    expect(capture.getNetworkRequests({ tabId: 10 }).requests.map(row => row.requestId)).toEqual(['fresh'])
  })

  it('preserves redirect and failure diagnostics without accepting late stale events', () => {
    capture.enableNetworkCapture(10, false, { agent: 'agent-a', groupId: 8 })
    request('chain', 10, 'https://site.test/start')
    fire('onHeadersReceived', {
      requestId: 'chain', tabId: 10, documentId: 'doc', statusCode: 302,
      statusLine: 'HTTP/1.1 302 Found', responseHeaders: []
    })
    fire('onBeforeRedirect', {
      requestId: 'chain', tabId: 10, documentId: 'doc', statusCode: 302,
      statusLine: 'HTTP/1.1 302 Found', redirectUrl: 'https://site.test/end'
    })
    request('chain', 10, 'https://site.test/end')
    fire('onErrorOccurred', { requestId: 'chain', tabId: 10, documentId: 'doc', error: 'net::ERR_FAILED' })
    const rows = capture.getNetworkRequests({ tabId: 10 }).requests
    expect(rows).toHaveLength(2)
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ redirectedTo: 'https://site.test/end', redirectHop: 1, status: 302 }),
      expect.objectContaining({ url: 'https://site.test/end', status: 0, statusText: 'net::ERR_FAILED' })
    ]))

    fixture.allowed = false
    fire('onCompleted', { requestId: 'chain', tabId: 10, documentId: 'doc' })
    fixture.allowed = true
    expect(capture.getNetworkRequests({ tabId: 10 }).requests).toEqual([])
  })

  it('pairs matching webRequest and deep rows by ordinal when clocks differ', () => {
    const web = (requestId: string, timestamp: number) => ({
      requestId, url: 'https://site.test/api', method: 'GET', resourceType: 'XHR', timestamp,
      tabId: 10, documentId: 'doc'
    })
    const deep = (requestId: string, timestamp: number) => ({
      ...web(requestId, timestamp), source: 'deep' as const, deep: true as const, bodyAvailable: false,
      streamMessageCount: 0, droppedStreamMessages: 0, dataReceivedChunkCount: 0, dataReceivedBytes: 0,
      webSocketFrameCount: 0, webSocketFramesSent: 0, webSocketFramesReceived: 0, droppedWebSocketFrames: 0
    })
    const rows = capture.mergeNetworkRequestRows([web('w1', 1), web('w2', 2)], [deep('d1', 30_000), deep('d2', 30_001)])
    expect(rows.map(row => [row.requestId, (row as { webRequestId?: string }).webRequestId])).toEqual([
      ['d1', 'w1'], ['d2', 'w2']
    ])
  })

  it('refuses a queued enable after its original relative deadline', async () => {
    vi.useFakeTimers()
    fixture.resolveTab.mockResolvedValue({ id: 10, groupId: 8, url: 'https://site.test/' })
    fixture.admission.mockImplementationOnce(async (_tabId: number, work: () => unknown) => {
      await vi.advanceTimersByTimeAsync(20)
      return work()
    })
    await capture.handleBrowserEnableNetworkCapture({ requestId: 'late', tabId: 10, agent: 'agent-a', requestTimeoutMs: 10 })
    expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringContaining('expired') }))
    expect(fixture.listeners.onBeforeRequest).toBeUndefined()
    vi.useRealTimers()
  })
})
