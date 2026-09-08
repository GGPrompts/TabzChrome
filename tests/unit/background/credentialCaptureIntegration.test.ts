import { beforeEach, describe, expect, it, vi } from 'vitest'

const send = vi.hoisted(() => vi.fn())
vi.mock('@/background/websocket', () => ({ sendToWebSocket: send }))
vi.mock('@/background/state', () => ({ ws: { readyState: 1 } }))
vi.mock('@/background/browserMcp/tabGroups', () => ({
  getAgentForGroup: async () => 'synthetic-agent',
  subscribeToTabOwnershipChanges: vi.fn()
}))

let protection: typeof import('@/background/browserMcp/documentProtection')
let capture: typeof import('@/background/consoleCapture')
let network: typeof import('@/background/networkCapture')
let documentId: string
let childDocuments: string[]
const session: Record<string, unknown> = {}
const callbacks: Record<string, (details: any) => void> = {}
const navigationCallbacks: Record<string, (details: any) => void> = {}
const updated: Array<(tabId: number, change: chrome.tabs.OnUpdatedInfo) => void> = []
const tab = { id: 41, groupId: 8, url: 'https://example.test/', status: 'complete' } as chrome.tabs.Tab

beforeEach(async () => {
  vi.resetModules()
  send.mockReset()
  documentId = 'synthetic-login-document'
  childDocuments = ['synthetic-child-document']
  updated.length = 0
  for (const key of Object.keys(session)) delete session[key]
  Object.assign(chrome, {
    tabs: {
      get: vi.fn(async () => ({ ...tab })), onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn(listener => { updated.push(listener) }) }
    },
    scripting: { executeScript: vi.fn(async (options: { target: { allFrames?: boolean } }) => [
      { frameId: 0, documentId, result: true },
      ...(options.target.allFrames ? childDocuments.map((id, index) => ({ frameId: index + 1, documentId: id, result: true })) : [])
    ]) },
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    webNavigation: {
      onBeforeNavigate: { addListener: vi.fn(callback => { navigationCallbacks.onBeforeNavigate = callback }) },
      onCommitted: { addListener: vi.fn(callback => { navigationCallbacks.onCommitted = callback }) }
    },
    webRequest: Object.fromEntries([
      'onBeforeRequest', 'onSendHeaders', 'onHeadersReceived', 'onBeforeRedirect', 'onCompleted', 'onErrorOccurred'
    ].map(name => [name, { addListener: vi.fn(callback => { callbacks[name] = callback }) }]))
  })
  Object.assign(chrome.storage, { session: {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(session[key]) })),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(session, structuredClone(items)) }),
    remove: vi.fn(async (key: string) => { delete session[key] })
  } })
  protection = await import('@/background/browserMcp/documentProtection')
  capture = await import('@/background/consoleCapture')
  protection.setupDocumentLifecycle()
  capture.setupConsoleCaptureLifecycle()
  navigationCallbacks.onCommitted({
    tabId: 41, frameId: 0, documentId, documentLifecycle: 'active',
    parentFrameId: -1, url: tab.url
  })
  navigationCallbacks.onCommitted({
    tabId: 41, frameId: 1, documentId: childDocuments[0], documentLifecycle: 'active',
    parentFrameId: 0, parentDocumentId: documentId, url: `${tab.url}frame`
  })
  await protection.runWithDocumentAdmission(41, () =>
    protection.assertDocumentCaptureAllowed(41, documentId, 'synthetic fixture'))
  network = await import('@/background/networkCapture')
  network.enableNetworkCapture(41, false, { agent: 'synthetic-agent', groupId: 8 })
})

const entry = (message = 'synthetic-private-capture') => ({
  level: 'error' as const, message, timestamp: 1, url: tab.url!, tabId: 41
})

function request(sourceDocument = documentId) {
  callbacks.onBeforeRequest({
    requestId: 'synthetic-request', tabId: 41, documentId: sourceDocument,
    url: 'https://example.test/submit', method: 'POST', type: 'xmlhttprequest',
    requestBody: { formData: { ordinaryField: ['synthetic-private-capture'] } }
  })
}

async function commitDocuments(mainDocumentId: string, children: string[]): Promise<void> {
  navigationCallbacks.onBeforeNavigate({ tabId: 41, frameId: 0, url: tab.url })
  documentId = mainDocumentId
  childDocuments = children
  navigationCallbacks.onCommitted({
    tabId: 41, frameId: 0, documentId, documentLifecycle: 'active',
    parentFrameId: -1, url: tab.url
  })
  children.forEach((childDocumentId, index) => navigationCallbacks.onCommitted({
    tabId: 41, frameId: index + 1, documentId: childDocumentId, documentLifecycle: 'active',
    parentFrameId: 0, parentDocumentId: documentId, url: `${tab.url}frame-${index}`
  }))
  await protection.runWithDocumentAdmission(41, () => protection.currentDocumentProtection(41))
}

async function protect() {
  await protection.runWithDocumentAdmission(41, () => protection.preflightAndProtectDocument(41, { reason: 'saved-fill' }))
}

describe('real document guard and capture integration', () => {
  it('allows ordinary iframe diagnostics under a verified readable main document', async () => {
    expect(await capture.captureConsoleLog(entry('ordinary-iframe'), tab, 'synthetic-child-document')).toBeDefined()
    request('synthetic-child-document')
    expect(network.getNetworkRequests({}).total).toBe(1)
  })

  it('prunes existing rows and drops main-frame and iframe content after saved-field protection', async () => {
    await capture.captureConsoleLog(entry('ordinary-before-entry'), tab, documentId)
    request()
    expect(network.getNetworkRequests({}).total).toBe(1)
    await protect()
    send.mockClear()
    expect(await capture.captureConsoleLog(entry(), tab, documentId)).toBeUndefined()
    expect(await capture.captureConsoleLog(entry(), tab, 'synthetic-child-document')).toBeUndefined()
    request()
    request('synthetic-child-document')
    expect(capture.getConsoleLogs({})).toEqual([])
    expect(network.getNetworkRequests({}).requests).toEqual([])
    expect(JSON.stringify(send.mock.calls)).not.toContain('synthetic-private-capture')
    expect(JSON.stringify(session)).not.toContain('synthetic-private-capture')
  })

  it('permits verified fresh-document capture while keeping restored historical documents protected', async () => {
    await protect()
    await commitDocuments('synthetic-authenticated-document', ['synthetic-authenticated-child'])
    await protection.runWithDocumentAdmission(41, () => protection.assertDocumentReadable(41, 'synthetic read'))
    expect(await capture.captureConsoleLog(entry('ordinary-new-page'), tab, documentId)).toBeDefined()
    request()
    expect(network.getNetworkRequests({}).total).toBe(1)
    await commitDocuments('synthetic-login-document', ['synthetic-child-document'])
    await expect(protection.runWithDocumentAdmission(41, () => protection.assertDocumentReadable(41, 'synthetic restored read'))).rejects.toThrow()
    expect(await capture.captureConsoleLog(entry(), tab, documentId)).toBeUndefined()
    request()
    expect(network.getNetworkRequests({}).requests.every(row => row.documentId !== documentId)).toBe(true)
  })

  it('invalidates synchronous capture eligibility when navigation starts', async () => {
    await protection.runWithDocumentAdmission(41, () => protection.assertDocumentReadable(41, 'synthetic read'))
    expect(protection.canCaptureDocumentSync(41, documentId)).toBe(true)
    for (const listener of updated) listener(41, { status: 'loading' })
    expect(protection.canCaptureDocumentSync(41, 'synthetic-child-document')).toBe(false)
    request('synthetic-child-document')
    expect(network.getNetworkRequests({}).requests).toEqual([])
  })

  it('keeps a manual handoff protected through redirects, then protects its completion document', async () => {
    await protection.runWithDocumentAdmission(41, () => protection.preflightAndProtectDocument(41, { reason: 'manual-login' }))
    await commitDocuments('synthetic-idp-document', ['synthetic-idp-child'])
    expect(await capture.captureConsoleLog(entry(), tab, documentId)).toBeUndefined()
    request()
    request('synthetic-idp-child')
    expect(network.getNetworkRequests({}).requests).toEqual([])
    await expect(protection.runWithDocumentAdmission(41, () => protection.assertDocumentReadable(41, 'during handoff'))).rejects.toThrow()

    await commitDocuments('synthetic-completion-document', ['synthetic-completion-child'])
    await protection.runWithDocumentAdmission(41, () => protection.completeManualLoginHandoff(41))
    expect(await capture.captureConsoleLog(entry(), tab, documentId)).toBeUndefined()
    await commitDocuments('synthetic-after-handoff-document', ['synthetic-after-handoff-child'])
    expect(await capture.captureConsoleLog(entry('ordinary-after-handoff'), tab, documentId)).toBeDefined()
    expect(await capture.captureConsoleLog(entry(), tab, 'synthetic-idp-child')).toBeUndefined()
    request('synthetic-idp-child')
    expect(network.getNetworkRequests({}).requests).toEqual([])
  })
})
