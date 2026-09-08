import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  beforeNavigate: [] as Array<(details: chrome.webNavigation.WebNavigationParentedCallbackDetails) => void>,
  committed: [] as Array<(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => void>,
  tabUpdated: [] as Array<(tabId: number, changeInfo: chrome.tabs.OnUpdatedInfo) => void>,
  tabRemoved: [] as Array<(tabId: number) => void>,
  ownerChanged: [] as Array<(tabId: number) => void>,
  send: vi.fn(),
}))

vi.mock('@/background/websocket', () => ({ sendToWebSocket: boundary.send }))
vi.mock('@/background/state', () => ({ ws: { readyState: 1 } }))
vi.mock('@/background/browserMcp/tabGroups', () => ({
  getAgentForGroup: vi.fn(async () => 'alpha'),
  subscribeToTabOwnershipChanges: (listener: (tabId: number) => void) => {
    boundary.ownerChanged.push(listener)
    return () => undefined
  },
}))

let protection: typeof import('@/background/browserMcp/documentProtection')
let capture: typeof import('@/background/consoleCapture')
const session: Record<string, unknown> = {}
const tab = { id: 41, groupId: 8, url: 'https://example.test/', status: 'complete' } as chrome.tabs.Tab

function mainCommit(documentId: string) {
  boundary.committed[0]({
    tabId: 41,
    frameId: 0,
    parentFrameId: -1,
    documentId,
    documentLifecycle: 'active',
  } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)
}

function consoleEntry(message: string) {
  return { level: 'log' as const, message, timestamp: 1, url: tab.url!, tabId: 41 }
}

beforeEach(async () => {
  vi.resetModules()
  for (const key of Object.keys(boundary)) {
    const value = boundary[key as keyof typeof boundary]
    if (Array.isArray(value)) value.length = 0
  }
  boundary.send.mockReset()
  for (const key of Object.keys(session)) delete session[key]
  Object.assign(chrome, {
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    tabs: {
      get: vi.fn(async () => ({ ...tab })),
      onUpdated: { addListener: vi.fn(listener => boundary.tabUpdated.push(listener)) },
      onRemoved: { addListener: vi.fn(listener => boundary.tabRemoved.push(listener)) },
    },
    webNavigation: {
      onBeforeNavigate: { addListener: vi.fn(listener => boundary.beforeNavigate.push(listener)) },
      onCommitted: { addListener: vi.fn(listener => boundary.committed.push(listener)) },
    },
  })
  Object.assign(chrome.storage, { session: {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(session[key]) })),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(session, structuredClone(items)) }),
    remove: vi.fn(async (key: string) => { delete session[key] }),
  } })
  protection = await import('@/background/browserMcp/documentProtection')
  capture = await import('@/background/consoleCapture')
  protection.setupDocumentLifecycle()
  capture.setupConsoleCaptureLifecycle()
})

describe('console capture with trusted Chrome document lifecycle', () => {
  it('refreshes main and child eligibility after navigation without needing an earlier console event', async () => {
    mainCommit('doc-one')
    await vi.waitFor(() => expect(protection.canCaptureDocumentSync(41, 'doc-one')).toBe(true))
    expect(await capture.captureConsoleLog(consoleEntry('first'), tab, 'doc-one')).toBeDefined()

    boundary.beforeNavigate[0]({ tabId: 41, frameId: 0, parentFrameId: -1 } as chrome.webNavigation.WebNavigationParentedCallbackDetails)
    expect(protection.canCaptureDocumentSync(41, 'doc-one')).toBe(false)
    expect(await capture.captureConsoleLog(consoleEntry('stale-main'), tab, 'doc-one')).toBeUndefined()

    mainCommit('doc-two')
    await vi.waitFor(() => expect(protection.canCaptureDocumentSync(41, 'doc-two')).toBe(true))
    boundary.committed[0]({
      tabId: 41,
      frameId: 2,
      parentFrameId: 0,
      parentDocumentId: 'doc-two',
      documentId: 'child-two',
      documentLifecycle: 'active',
    } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)

    expect(await capture.captureConsoleLog(consoleEntry('fresh-child'), tab, 'child-two', 'https://frame.example.test/')).toBeDefined()
    expect(await capture.captureConsoleLog(consoleEntry('stale-child'), tab, 'child-one', 'https://frame.example.test/')).toBeUndefined()
    expect(capture.getConsoleLogs({ level: 'all', tabId: 41 }).map(row => row.message)).toEqual(['fresh-child'])
  })

  it('rejects a subframe commit that is not parented by the verified frame tree', async () => {
    mainCommit('doc-one')
    await vi.waitFor(() => expect(protection.canCaptureDocumentSync(41, 'doc-one')).toBe(true))
    boundary.committed[0]({
      tabId: 41,
      frameId: 3,
      parentFrameId: 0,
      parentDocumentId: 'foreign-main',
      documentId: 'foreign-child',
      documentLifecycle: 'active',
    } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)
    expect(await capture.captureConsoleLog(consoleEntry('foreign-child'), tab, 'foreign-child')).toBeUndefined()
  })
})
