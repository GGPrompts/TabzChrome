import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * SCREENSHOT SAVE FOLDER. The folder and the per-connection
 * subfolder are dashboard settings in chrome.storage.local, read at capture
 * time so a change takes effect on the next screenshot without reloading the
 * service worker. These tests pin what actually reaches
 * chrome.downloads.download.
 */

const sendToWebSocket = vi.fn()
vi.mock('@/background/websocket', () => ({
  sendToWebSocket: (...args: unknown[]) => sendToWebSocket(...args),
  broadcastToClients: vi.fn()
}))

const getAgentGroupLabel = vi.fn(async () => undefined as string | undefined)
vi.mock('@/background/browserMcp/tabGroups', () => ({
  assertTabInAgentGroup: vi.fn(async () => undefined),
  resolveAgentTab: vi.fn(async (_agent: string | undefined, tabId?: number) => chrome.tabs.get(tabId ?? 42)),
  getAgentGroupLabel: (...args: unknown[]) => getAgentGroupLabel(...(args as []))
}))

vi.mock('@/background/browserMcp/debugger', () => ({
  withDebugger: vi.fn(async (_tabId: number, fn: (target: chrome.debugger.Debuggee) => Promise<unknown>) => fn({ tabId: 42 })),
  sendDebuggerCommand: vi.fn(async (_target: unknown, method: string) => method === 'Page.captureScreenshot' ? { data: 'eA==' } : {})
}))

vi.mock('@/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('@/background/browserMcp/pageRefs', () => ({
  resolvePageRef: vi.fn(),
  stalePageRefMessage: (ref: string, tabId: number) => `stale ${ref} ${tabId}`
}))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-safe', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] })
}))

import { handleBrowserScreenshot } from '@/background/browserMcp/screenshots'
import { captureScheduler } from '@/background/browserMcp/captureScheduler'

describe('screenshot save folder', () => {
  const download = vi.fn()
  const search = vi.fn()
  const executeScript = vi.fn()
  const captureVisibleTab = vi.fn()
  const storageGet = vi.fn()

  const savedFilename = () => download.mock.calls[download.mock.calls.length - 1][0].filename as string
  const lastResult = () => sendToWebSocket.mock.calls[sendToWebSocket.mock.calls.length - 1][0] as Record<string, unknown>

  beforeEach(() => {
    sendToWebSocket.mockReset()
    download.mockReset()
    search.mockReset()
    executeScript.mockReset()
    captureVisibleTab.mockReset()
    storageGet.mockReset()
    getAgentGroupLabel.mockReset()
    getAgentGroupLabel.mockResolvedValue(undefined)
    captureScheduler.resetForTests()

    // A DPR 1 capture needs no canvas, so the download path is all that runs.
    executeScript.mockResolvedValue([{ documentId: 'doc-safe', result: { width: 1280, height: 720 } }])
        storageGet.mockResolvedValue({})

    download.mockImplementation((_options: unknown, callback: (id: number) => void) => callback(7))
    search.mockImplementation((_query: unknown, callback: (results: unknown[]) => void) =>
      callback([{ id: 7, state: 'complete', filename: 'C:\\Users\\matt\\Downloads\\shot.png' }]))

    const c = globalThis.chrome as unknown as Record<string, any>
    c.scripting = { executeScript }
    c.tabs = {
      ...(c.tabs as Record<string, unknown>),
      get: vi.fn(async () => ({ id: 42, windowId: 1, url: 'https://agent.example.test/page', active: true, groupId: 10 })),
      query: vi.fn(async () => [{ id: 42, windowId: 1, url: 'https://agent.example.test/page', active: true }]),
      update: vi.fn(async () => undefined),
      captureVisibleTab
    }
    c.downloads = { ...(c.downloads as Record<string, unknown>), download, search }
    c.storage = { ...(c.storage as Record<string, unknown>), local: { get: storageGet } }

    vi.mocked(globalThis.fetch).mockReset()
    vi.mocked(globalThis.fetch).mockResolvedValue({
      blob: async () => new Blob(['x'], { type: 'image/png' })
    } as Response)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1280, height: 720, close: vi.fn() })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('preserves the legacy default screenshot folder', async () => {
    await handleBrowserScreenshot({ requestId: 'default', tabId: 42, agent: 'abc123def456' })

    expect(savedFilename()).toMatch(/^tabz\/screenshots\/screenshot-.+\.png$/)
    expect(getAgentGroupLabel).not.toHaveBeenCalled()
    expect(lastResult()).toMatchObject({ success: true })
  })

  it('uses the connection label when the group has one', async () => {
    storageGet.mockResolvedValue({ screenshotPerConnection: true })
    getAgentGroupLabel.mockResolvedValue('Leadership Ops')

    await handleBrowserScreenshot({ requestId: 'labelled', tabId: 42, agent: 'abc123def456' })

    expect(savedFilename()).toMatch(/^tabz\/screenshots\/Leadership-Ops\/screenshot-.+\.png$/)
  })

  it('reads the configured folder at capture time', async () => {
    storageGet.mockResolvedValue({ screenshotFolder: 'work/shots', screenshotPerConnection: false })

    await handleBrowserScreenshot({ requestId: 'configured', tabId: 42, agent: 'abc123def456' })

    expect(savedFilename()).toMatch(/^work\/shots\/screenshot-.+\.png$/)
    // Setting a new folder takes effect on the next capture, with no cache.
    storageGet.mockResolvedValue({ screenshotFolder: 'other', screenshotPerConnection: false })
    await handleBrowserScreenshot({ requestId: 'configured-again', tabId: 42, agent: 'abc123def456' })
    expect(savedFilename()).toMatch(/^other\/screenshot-.+\.png$/)
  })

  it('preserves an explicit Downloads-relative outputPath', async () => {
    storageGet.mockResolvedValue({ screenshotFolder: 'work/shots', screenshotPerConnection: false })

    await handleBrowserScreenshot({ requestId: 'output', tabId: 42, agent: 'a', outputPath: 'captures/page.png' })

    expect(savedFilename()).toBe('captures/page.png')
  })

  it('refuses an outputPath that would escape the Downloads folder', async () => {
    await handleBrowserScreenshot({ requestId: 'escape', tabId: 42, agent: 'a', outputPath: '../page.png' })

    expect(download).not.toHaveBeenCalled()
    expect(lastResult()).toMatchObject({ success: false })
    expect(String(lastResult().error)).toContain('".." is not allowed')
  })

  it('does not consult the group label when the toggle is off', async () => {
    storageGet.mockResolvedValue({ screenshotPerConnection: false })

    await handleBrowserScreenshot({ requestId: 'no-subfolder', tabId: 42, agent: 'abc123def456' })

    expect(getAgentGroupLabel).not.toHaveBeenCalled()
    expect(savedFilename()).toMatch(/^tabz\/screenshots\/screenshot-.+\.png$/)
  })

  it('reports a failed file save while retaining successfully prepared inline metadata', async () => {
    search.mockImplementation((_query: unknown, callback: (results: unknown[]) => void) =>
      callback([{ id: 7, state: 'interrupted', error: 'disk full' }]))

    await handleBrowserScreenshot({ requestId: 'interrupted', tabId: 42, inlineOnly: false })

    expect(lastResult()).toMatchObject({
      success: false,
      error: 'disk full',
      imageData: 'eA==',
      mimeType: 'image/png',
      width: 1280,
      height: 720,
      imageReencoded: false
    })
  })

  it('stops download polling when the absolute request deadline expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    search.mockImplementation((_query: unknown, callback: (results: unknown[]) => void) =>
      callback([{ id: 7, state: 'in_progress' }]))

    const handled = handleBrowserScreenshot({ requestId: 'download-timeout', tabId: 42, requestTimeoutMs: 1200 })
    await vi.advanceTimersByTimeAsync(200)
    await handled
    const callsAtTimeout = search.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)

    expect(lastResult()).toMatchObject({ success: false, error: 'Download timed out' })
    expect(search).toHaveBeenCalled()
    expect(search).toHaveBeenCalledTimes(callsAtTimeout)
  })
})
