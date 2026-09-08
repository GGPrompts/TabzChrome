import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  allowed: true,
  documentId: 'synthetic-document',
  listeners: [] as Array<(tabId: number) => void>,
  owner: vi.fn(async () => 'synthetic-agent'),
  send: vi.fn()
}))

vi.mock('@/background/websocket', () => ({ sendToWebSocket: boundary.send }))
vi.mock('@/background/state', () => ({ ws: { readyState: 1 } }))
vi.mock('@/background/browserMcp/tabGroups', () => ({
  getAgentForGroup: boundary.owner,
  subscribeToTabOwnershipChanges: vi.fn()
}))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  subscribeToDocumentProtection: (listener: (tabId: number) => void) => boundary.listeners.push(listener),
  subscribeToDocumentLifecycle: vi.fn(),
  runWithDocumentAdmission: async (_tabId: number, work: () => unknown) => work(),
  canCaptureDocumentSync: (_tabId: number, documentId?: string) => boundary.allowed && documentId === boundary.documentId,
  assertDocumentCaptureAllowed: async (tabId: number, documentId?: string) => {
    if (!boundary.allowed || documentId !== boundary.documentId) throw new Error('Protected document')
    return { tabId, documentId, generation: 0 }
  },
  assertDocumentReadCurrent: async (_tabId: number, token: { documentId: string }) => {
    if (!boundary.allowed || token.documentId !== boundary.documentId) throw new Error('Document changed')
  }
}))

let consoleCapture: typeof import('@/background/consoleCapture')
let networkCapture: typeof import('@/background/networkCapture')
const listeners: Record<string, (details: any) => void> = {}
const tab = { id: 41, groupId: 8, url: 'https://example.test/' } as chrome.tabs.Tab
const entry = () => ({ level: 'error' as const, message: 'synthetic-capture-value', timestamp: 1, url: tab.url!, tabId: 41 })

beforeEach(async () => {
  vi.resetModules()
  boundary.allowed = true
  boundary.documentId = 'synthetic-document'
  boundary.listeners.length = 0
  boundary.send.mockReset()
  boundary.owner.mockReset().mockResolvedValue('synthetic-agent')
  Object.assign(chrome, {
    tabs: { get: vi.fn(async (tabId: number) => ({ id: tabId, groupId: 8, url: 'https://example.test/' })) },
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    webRequest: Object.fromEntries([
      'onBeforeRequest', 'onSendHeaders', 'onHeadersReceived', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'
    ].map(name => [name, { addListener: vi.fn(callback => { listeners[name] = callback }) }]))
  })
  consoleCapture = await import('@/background/consoleCapture')
  networkCapture = await import('@/background/networkCapture')
  networkCapture.enableNetworkCapture(41, false, { agent: 'synthetic-agent', groupId: 8 })
})

function startRequest(extra: Record<string, unknown> = {}) {
  listeners.onBeforeRequest({
    requestId: 'synthetic-request', tabId: 41, documentId: 'synthetic-document',
    method: 'POST', type: 'xmlhttprequest', url: 'https://example.test/submit', ...extra
  })
}

describe('credential document capture boundary', () => {
  it('requires Chrome sender identity instead of accepting a page-provided document id', async () => {
    expect(await consoleCapture.captureConsoleLog({ ...entry(), documentId: 'synthetic-document' }, tab)).toBeUndefined()
    expect(boundary.send).not.toHaveBeenCalled()
    expect(await consoleCapture.captureConsoleLog({ ...entry(), tabId: 999, documentId: 'forged' }, tab, 'synthetic-document'))
      .toMatchObject({ tabId: 41, documentId: 'synthetic-document', agent: 'synthetic-agent' })
  })

  it('drops console entries before buffering or forwarding on protection and unknown startup state', async () => {
    boundary.allowed = false
    expect(await consoleCapture.captureConsoleLog(entry(), tab, 'synthetic-document')).toBeUndefined()
    expect(consoleCapture.addConsoleLog({ ...entry(), documentId: 'synthetic-document' })).toBeUndefined()
    expect(consoleCapture.getConsoleLogs({})).toEqual([])
    expect(consoleCapture.getConsoleLogCount()).toBe(0)
    expect(boundary.send).not.toHaveBeenCalled()
  })

  it('revalidates console admission after awaiting ownership', async () => {
    boundary.owner.mockImplementationOnce(async () => {
      boundary.allowed = false
      return 'synthetic-agent'
    })
    expect(await consoleCapture.captureConsoleLog(entry(), tab, 'synthetic-document')).toBeUndefined()
    expect(boundary.send).not.toHaveBeenCalled()
  })

  it('prunes both capture buffers and sends a content-free backend prune on protection', async () => {
    await consoleCapture.captureConsoleLog(entry(), tab, 'synthetic-document')
    startRequest()
    expect(consoleCapture.getConsoleLogCount()).toBe(1)
    expect(networkCapture.getNetworkRequests({}).total).toBe(1)
    boundary.send.mockClear()
    boundary.allowed = false
    for (const notify of boundary.listeners) notify(41)
    expect(consoleCapture.getConsoleLogCount()).toBe(0)
    expect(networkCapture.getNetworkRequests({}).total).toBe(0)
    expect(boundary.send).toHaveBeenCalledExactlyOnceWith({ type: 'browser-console-logs-prune', tabId: 41 })
    expect(JSON.stringify(boundary.send.mock.calls)).not.toContain(entry().message)
    // Becoming readable later does not restore discarded rows.
    boundary.allowed = true
    expect(consoleCapture.getConsoleLogs({})).toEqual([])
    expect(networkCapture.getNetworkRequests({}).requests).toEqual([])
  })

  it('refuses network capture before touching a protected request body', () => {
    boundary.allowed = false
    const details = {
      requestId: 'blocked', tabId: 41, documentId: 'synthetic-document',
      url: 'https://example.test/', method: 'POST', type: 'xmlhttprequest',
      get requestBody(): never { throw new Error('Body must not be decoded') }
    }
    expect(() => listeners.onBeforeRequest(details)).not.toThrow()
    boundary.allowed = true
    expect(networkCapture.getNetworkRequests({}).requests).toEqual([])
  })

  it('rejects missing, stale and unsupported network document sources', () => {
    startRequest({ documentId: undefined })
    startRequest({ documentId: 'old-document' })
    startRequest({ url: 'chrome-extension://synthetic/dashboard/index.html' })
    expect(networkCapture.getNetworkRequests({}).requests).toEqual([])
  })

  it.each(['onSendHeaders', 'onHeadersReceived', 'onCompleted', 'onErrorOccurred'])
  ('drops late %s events after document protection instead of restoring a row', event => {
    startRequest()
    boundary.allowed = false
    listeners[event]({ requestId: 'synthetic-request', requestHeaders: [{ name: 'X-Ordinary', value: entry().message }] })
    boundary.allowed = true
    expect(networkCapture.getNetworkRequests({}).requests).toEqual([])
  })

  it('filters stale captured rows even before a lifecycle notification is delivered', async () => {
    await consoleCapture.captureConsoleLog(entry(), tab, 'synthetic-document')
    startRequest()
    boundary.documentId = 'fresh-document'
    expect(consoleCapture.getConsoleLogs({})).toEqual([])
    expect(networkCapture.getNetworkRequests({}).requests).toEqual([])
  })
})
