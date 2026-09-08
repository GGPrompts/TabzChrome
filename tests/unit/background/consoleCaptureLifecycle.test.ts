import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  currentDocument: 'doc-one',
  allowed: true,
  agent: 'alpha' as string | null,
  owner: vi.fn(),
  protectionListeners: [] as Array<(tabId: number) => void>,
  lifecycleListeners: [] as Array<(event: { type: string; tabId: number }) => void>,
  ownershipListeners: [] as Array<(tabId: number) => void>,
  tabUpdatedListeners: [] as Array<(tabId: number, change: chrome.tabs.OnUpdatedInfo) => void>,
  send: vi.fn(),
}))

vi.mock('@/background/websocket', () => ({ sendToWebSocket: boundary.send }))
vi.mock('@/background/state', () => ({ ws: { readyState: 1 } }))
vi.mock('@/background/browserMcp/tabGroups', () => ({
  getAgentForGroup: boundary.owner,
  subscribeToTabOwnershipChanges: (listener: (tabId: number) => void) => {
    boundary.ownershipListeners.push(listener)
    return () => undefined
  },
}))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  canCaptureDocumentSync: (_tabId: number, documentId?: string) => boundary.allowed && documentId === boundary.currentDocument,
  subscribeToDocumentProtection: (listener: (tabId: number) => void) => {
    boundary.protectionListeners.push(listener)
    return () => undefined
  },
  subscribeToDocumentLifecycle: (listener: (event: { type: string; tabId: number }) => void) => {
    boundary.lifecycleListeners.push(listener)
    return () => undefined
  },
}))

let capture: typeof import('@/background/consoleCapture')
const tab = { id: 41, groupId: 8, url: 'https://top.example.test/' } as chrome.tabs.Tab
const entry = (message: string, overrides: Record<string, unknown> = {}) => ({
  level: 'error' as const,
  message,
  timestamp: 1,
  url: 'https://forged.example.test/',
  tabId: 999,
  ...overrides,
})

beforeEach(async () => {
  vi.resetModules()
  boundary.currentDocument = 'doc-one'
  boundary.allowed = true
  boundary.agent = 'alpha'
  boundary.owner.mockReset().mockImplementation(async () => boundary.agent)
  boundary.protectionListeners.length = 0
  boundary.lifecycleListeners.length = 0
  boundary.ownershipListeners.length = 0
  boundary.tabUpdatedListeners.length = 0
  boundary.send.mockReset()
  Object.assign(chrome, {
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    tabs: {
      ...chrome.tabs,
      onUpdated: { addListener: vi.fn(listener => boundary.tabUpdatedListeners.push(listener)) },
    },
  })
  capture = await import('@/background/consoleCapture')
  capture.setupConsoleCaptureLifecycle()
})

describe('console capture lifecycle', () => {
  it('overrides page identity fields with Chrome sender data and stamps the current owner', async () => {
    const result = await capture.captureConsoleLog(
      entry('owned', { documentId: 'forged', groupId: 999, agent: 'forged' }),
      tab,
      'doc-one',
      'https://frame.example.test/path',
    )
    expect(result).toMatchObject({
      tabId: 41,
      documentId: 'doc-one',
      url: 'https://frame.example.test/path',
      groupId: 8,
      agent: 'alpha',
    })
  })

  it('rejects extension and special-page sender documents', async () => {
    expect(await capture.captureConsoleLog(entry('extension-page'), {
      ...tab, url: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/dashboard.html',
    }, 'doc-one')).toBeUndefined()
    expect(await capture.captureConsoleLog(entry('special-page'), {
      ...tab, url: 'chrome://settings/',
    }, 'doc-one')).toBeUndefined()
    expect(boundary.owner).not.toHaveBeenCalled()
  })

  it('prunes on navigation and accepts the next committed document without prior console activity', async () => {
    await capture.captureConsoleLog(entry('old'), tab, 'doc-one')
    boundary.lifecycleListeners[0]({ type: 'before-navigate', tabId: 41 })
    boundary.currentDocument = 'doc-two'
    expect(await capture.captureConsoleLog(entry('stale'), tab, 'doc-one')).toBeUndefined()
    expect(await capture.captureConsoleLog(entry('fresh'), tab, 'doc-two')).toBeDefined()
    expect(capture.getConsoleLogs({ tabId: 41, level: 'all' }).map(row => row.message)).toEqual(['fresh'])
  })

  it('prunes immutable rows before release or reassignment and never relabels them', async () => {
    await capture.captureConsoleLog(entry('alpha-row'), tab, 'doc-one')
    boundary.ownershipListeners[0](41)
    boundary.agent = 'beta'
    await capture.captureConsoleLog(entry('beta-row'), tab, 'doc-one')
    expect(capture.getConsoleLogs({ tabId: 41, level: 'all' })).toEqual([
      expect.objectContaining({ message: 'beta-row', agent: 'beta' }),
    ])
  })

  it('drops an in-flight row when ownership changes during owner resolution', async () => {
    boundary.owner.mockImplementationOnce(async () => {
      boundary.ownershipListeners[0](41)
      return 'alpha'
    })
    expect(await capture.captureConsoleLog(entry('stale-owner'), tab, 'doc-one')).toBeUndefined()
    expect(boundary.send).toHaveBeenCalledExactlyOnceWith({ type: 'browser-console-logs-prune', tabId: 41 })
  })

  it('prunes when a person moves the tab between groups in Chrome', async () => {
    await capture.captureConsoleLog(entry('before-manual-move'), tab, 'doc-one')
    boundary.tabUpdatedListeners[0](41, { groupId: 9 })
    expect(capture.getConsoleLogs({ tabId: 41, level: 'all' })).toEqual([])
    expect(boundary.send).toHaveBeenLastCalledWith({ type: 'browser-console-logs-prune', tabId: 41 })
  })

  it('drops protected rows before buffering and prunes earlier content', async () => {
    await capture.captureConsoleLog(entry('before-protection'), tab, 'doc-one')
    boundary.send.mockClear()
    boundary.allowed = false
    boundary.protectionListeners[0](41)
    expect(await capture.captureConsoleLog(entry('after-protection'), tab, 'doc-one')).toBeUndefined()
    expect(capture.getConsoleLogs({ tabId: 41, level: 'all' })).toEqual([])
    expect(JSON.stringify(boundary.send.mock.calls)).not.toContain('before-protection')
  })

  it('bounds aggregate console traffic across frames before owner lookup and WebSocket forwarding', async () => {
    for (let index = 0; index < capture.MAX_CONSOLE_EVENTS_PER_TAB_WINDOW + 25; index++) {
      await capture.captureConsoleLog(entry(`burst-${index}`), tab, 'doc-one')
    }
    expect(boundary.owner).toHaveBeenCalledTimes(capture.MAX_CONSOLE_EVENTS_PER_TAB_WINDOW)
    expect(boundary.send.mock.calls.filter(([frame]) => frame.type === 'browser-console-log'))
      .toHaveLength(capture.MAX_CONSOLE_EVENTS_PER_TAB_WINDOW)
  })
})
