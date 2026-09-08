import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const sendToWebSocket = vi.fn()
const resolveAgentTab = vi.fn()
const assertAgentReadableTab = vi.fn()
const assertDocumentReadable = vi.fn()
const assertDocumentReadCurrent = vi.fn()
const markDocumentReadUncertain = vi.fn()
const runWithDocumentAdmission = vi.fn()
const resolvePageRef = vi.fn()
const withDebugger = vi.fn()
const sendDebuggerCommand = vi.fn()

vi.mock('@/background/websocket', () => ({ sendToWebSocket: (...args: unknown[]) => sendToWebSocket(...args) }))
vi.mock('@/background/browserMcp/tabGroups', () => ({
  resolveAgentTab: (...args: unknown[]) => resolveAgentTab(...args),
  getAgentGroupLabel: vi.fn(async () => undefined)
}))
vi.mock('@/background/browserMcp/pageGuard', () => ({
  assertAgentReadableTab: (...args: unknown[]) => assertAgentReadableTab(...args)
}))
vi.mock('@/background/browserMcp/pageRefs', () => ({
  resolvePageRef: (...args: unknown[]) => resolvePageRef(...args),
  stalePageRefMessage: (ref: string, tabId: number) => `stale ${ref} ${tabId}`
}))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: (...args: unknown[]) => runWithDocumentAdmission(...args),
  assertDocumentReadable: (...args: unknown[]) => assertDocumentReadable(...args),
  assertDocumentReadCurrent: (...args: unknown[]) => assertDocumentReadCurrent(...args),
  markDocumentReadUncertain: (...args: unknown[]) => markDocumentReadUncertain(...args),
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] })
}))
vi.mock('@/background/browserMcp/debugger', () => ({
  withDebugger: (...args: unknown[]) => withDebugger(...args),
  sendDebuggerCommand: (...args: unknown[]) => sendDebuggerCommand(...args)
}))

import { captureViewportInline, handleBrowserScreenshot } from '@/background/browserMcp/screenshots'
import { captureScheduler } from '@/background/browserMcp/captureScheduler'

class TestOffscreenCanvas {
  readonly draws: number[][] = []
  constructor(readonly width: number, readonly height: number) { canvases.push(this) }
  getContext() {
    return {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      drawImage: (_bitmap: unknown, ...rest: number[]) => this.draws.push(rest)
    }
  }
  async convertToBlob() { return new Blob(['x'], { type: 'image/png' }) }
}

const canvases: TestOffscreenCanvas[] = []
const token = { tabId: 42, documentId: 'doc-safe', generation: 0, navigationEpoch: 0 }

describe('target-bound screenshots use CSS pixel geometry', () => {
  const executeScript = vi.fn()
  let bitmapSize = { width: 2560, height: 1440 }
  const lastResult = () => sendToWebSocket.mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    canvases.length = 0
    bitmapSize = { width: 2560, height: 1440 }
    captureScheduler.resetForTests()
    resolveAgentTab.mockResolvedValue({ id: 42, windowId: 1, title: 'Agent page', url: 'https://example.test/page', status: 'complete' })
    assertAgentReadableTab.mockResolvedValue(undefined)
    assertDocumentReadable.mockResolvedValue(token)
    assertDocumentReadCurrent.mockResolvedValue(undefined)
    markDocumentReadUncertain.mockResolvedValue(undefined)
    runWithDocumentAdmission.mockImplementation(async (_tabId: number, fn: () => Promise<unknown>) => fn())
    withDebugger.mockImplementation(async (_tabId: number, fn: (target: chrome.debugger.Debuggee) => Promise<unknown>) => fn({ tabId: 42 }))
    sendDebuggerCommand.mockImplementation(async (_target: unknown, method: string) =>
      method === 'Page.captureScreenshot' ? { data: 'eA==' } : {})
    executeScript.mockResolvedValue([{ frameId: 0, documentId: 'doc-safe', result: { width: 1280, height: 720 } }])
    Object.assign(chrome, {
      scripting: { executeScript },
      downloads: {
        download: vi.fn((_options: unknown, callback: (id?: number) => void) => callback(9)),
        search: vi.fn((_query: unknown, callback: (items: unknown[]) => void) => callback([{ id: 9, state: 'complete', filename: 'C:\\Downloads\\shot.png' }]))
      }
    })
    Object.assign(chrome.tabs, { captureVisibleTab: vi.fn(), update: vi.fn() })
    vi.mocked(globalThis.fetch).mockReset()
    vi.mocked(globalThis.fetch).mockResolvedValue({ blob: async () => new Blob(['x'], { type: 'image/png' }) } as Response)
    vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ ...bitmapSize, close: vi.fn() })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('redraws a native DPR 2 viewport in CSS pixels with structured inline metadata', async () => {
    await handleBrowserScreenshot({ requestId: 'viewport', tabId: 42, inlineOnly: true, agent: 'worker' })
    const canvas = canvases[0]
    expect([canvas.width, canvas.height]).toEqual([1280, 720])
    expect(canvas.draws).toEqual([[0, 0, 2560, 1440, 0, 0, 1280, 720]])
    expect(lastResult()).toMatchObject({ success: true, tabId: 42, width: 1280, height: 720, mimeType: 'image/png', bytes: 1, imageReencoded: false })
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()
    expect(chrome.tabs.update).not.toHaveBeenCalled()
  })

  it('does not redraw when Chrome already returns CSS-sized pixels', async () => {
    bitmapSize = { width: 1280, height: 720 }
    await handleBrowserScreenshot({ requestId: 'css', tabId: 42, inlineOnly: true })
    expect(canvases).toHaveLength(0)
    expect(lastResult()).toMatchObject({ success: true, width: 1280, height: 720, imageData: 'eA==' })
  })

  it('upscales an emulated bitmap to its measured CSS viewport', async () => {
    bitmapSize = { width: 400, height: 300 }
    executeScript.mockResolvedValue([{ documentId: 'doc-safe', result: { width: 800, height: 600 } }])
    await handleBrowserScreenshot({ requestId: 'emulated', tabId: 42, inlineOnly: true })
    expect([canvases[0].width, canvases[0].height]).toEqual([800, 600])
    expect(canvases[0].draws).toEqual([[0, 0, 400, 300, 0, 0, 800, 600]])
  })

  it('crops element bounds from device pixels into a CSS-sized image', async () => {
    executeScript.mockResolvedValue([{ documentId: 'doc-safe', result: { x: 100, y: 50, width: 200, height: 80, viewportWidth: 1280, viewportHeight: 720 } }])
    await handleBrowserScreenshot({ requestId: 'element', tabId: 42, selector: '#card', inlineOnly: true })
    expect([canvases[0].width, canvases[0].height]).toEqual([200, 80])
    expect(canvases[0].draws).toEqual([[200, 100, 400, 160, 0, 0, 200, 80]])
  })

  it('magnifies a viewport clip while measuring its source in CSS units', async () => {
    executeScript.mockResolvedValue([{ documentId: 'doc-safe', result: { x: 10, y: 10, width: 40, height: 20, viewportWidth: 1280, viewportHeight: 720 } }])
    await handleBrowserScreenshot({ requestId: 'clip', tabId: 42, clip: { x0: 10, y0: 10, x1: 50, y1: 30 }, inlineOnly: true })
    expect([canvases[0].width, canvases[0].height]).toEqual([160, 80])
    expect(canvases[0].draws).toEqual([[20, 20, 80, 40, 0, 0, 160, 80]])
  })

  it('fits a target-bound full-page CDP capture to CSS content dimensions', async () => {
    bitmapSize = { width: 2560, height: 6000 }
    sendDebuggerCommand.mockImplementation(async (_target: unknown, method: string) => method === 'Page.getLayoutMetrics'
      ? { cssContentSize: { x: 0, y: 0, width: 1280, height: 3000 } }
      : { data: 'eA==' })
    await handleBrowserScreenshot({ requestId: 'full', tabId: 42, fullPage: true, inlineOnly: true })
    expect([canvases[0].width, canvases[0].height]).toEqual([1280, 3000])
    expect(canvases[0].draws).toEqual([[0, 0, 2560, 6000, 0, 0, 1280, 3000]])
  })

  it('stitches target-bound fallback strips into CSS pixels and restores page state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    bitmapSize = { width: 1600, height: 1200 }
    let captures = 0
    sendDebuggerCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.getLayoutMetrics') return { cssContentSize: { x: 0, y: 0, width: 800, height: 1200 } }
      captures += 1
      if (captures === 1) throw new Error('captureBeyondViewport unsupported')
      return { data: 'eA==' }
    })
    executeScript.mockImplementation(async (details: { func: { name: string }; args?: unknown[] }) => {
      const result = details.func.name === 'prepareScreenshotPage'
        ? { fullHeight: 1200, viewportHeight: 600, viewportWidth: 800, originalScrollTop: 23, devicePixelRatio: 2, scroller: 'element' }
        : details.func.name === 'scrollScreenshotPage'
          ? details.args?.[1]
          : undefined
      return [{ documentId: 'doc-safe', result }]
    })

    const handled = handleBrowserScreenshot({ requestId: 'fallback', tabId: 42, fullPage: true, inlineOnly: true })
    for (let index = 0; index < 8 && sendToWebSocket.mock.calls.length === 0; index += 1) {
      await vi.advanceTimersToNextTimerAsync()
    }
    await handled

    expect([canvases[0].width, canvases[0].height]).toEqual([800, 1200])
    expect(canvases[0].draws).toEqual([
      [0, 0, 1600, 1200, 0, 0, 800, 600],
      [0, 0, 1600, 1200, 0, 600, 800, 600]
    ])
    expect(executeScript.mock.calls.map(call => call[0].func.name)).toContain('restoreScreenshotPage')
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()
    expect(lastResult()).toMatchObject({ success: true, width: 800, height: 1200 })
  })

  it('restores nested-scroller state after the target-bound fallback capture fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    sendDebuggerCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.getLayoutMetrics') return { cssContentSize: { x: 0, y: 0, width: 800, height: 1200 } }
      throw new Error('capture refused')
    })
    executeScript.mockImplementation(async (details: { target: unknown; func: { name: string }; args?: unknown[] }) => {
      const result = details.func.name === 'prepareScreenshotPage'
        ? { fullHeight: 1200, viewportHeight: 600, viewportWidth: 800, originalScrollTop: 37, devicePixelRatio: 1, scroller: 'element' }
        : details.func.name === 'scrollScreenshotPage'
          ? details.args?.[1]
          : undefined
      return [{ documentId: 'doc-safe', result }]
    })

    const handled = handleBrowserScreenshot({ requestId: 'fallback-error', tabId: 42, fullPage: true, inlineOnly: true })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(200)
    await vi.advanceTimersByTimeAsync(325)
    await handled

    const functions = executeScript.mock.calls.map(call => call[0].func.name)
    expect(functions).toContain('restoreScreenshotPage')
    expect(executeScript.mock.calls.every(call => call[0].target.documentIds?.[0] === 'doc-safe')).toBe(true)
    expect(lastResult()).toMatchObject({ success: false, error: 'capture refused' })
  })

  it('restores markers when the marking probe runs but loses its document result', async () => {
    sendDebuggerCommand.mockImplementation(async (_target: unknown, method: string) => {
      if (method === 'Page.getLayoutMetrics') return { cssContentSize: { x: 0, y: 0, width: 800, height: 1200 } }
      throw new Error('full-page mode refused')
    })
    let prepareCalls = 0
    executeScript.mockImplementation(async (details: { func: { name: string } }) => {
      if (details.func.name === 'prepareScreenshotPage') {
        prepareCalls += 1
        if (prepareCalls === 1) return [{ documentId: 'doc-safe', result: { fullHeight: 1200, viewportHeight: 600, viewportWidth: 800, originalScrollTop: 41, devicePixelRatio: 1, scroller: 'element' } }]
        return [{ result: undefined }]
      }
      return [{ documentId: 'doc-safe', result: undefined }]
    })

    await handleBrowserScreenshot({ requestId: 'prepare-lost', tabId: 42, fullPage: true, inlineOnly: true })

    expect(executeScript.mock.calls.map(call => call[0].func.name)).toContain('restoreScreenshotPage')
    expect(markDocumentReadUncertain).toHaveBeenCalledWith(42, token)
    expect(lastResult()).toMatchObject({ success: false, error: 'Screenshot page probe returned no document identity' })
  })

  it('quarantines a document when a page read is still pending at the absolute deadline', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    executeScript.mockImplementation(() => new Promise(() => undefined))

    const handled = handleBrowserScreenshot({ requestId: 'late-read', tabId: 42, inlineOnly: true, requestTimeoutMs: 1100 })
    await vi.advanceTimersByTimeAsync(100)
    await handled

    expect(markDocumentReadUncertain).toHaveBeenCalledWith(42, token)
    expect(lastResult()).toMatchObject({ success: false, error: 'Screenshot page read remained pending after its deadline' })
    expect(withDebugger).toHaveBeenCalledTimes(1)
    expect(sendDebuggerCommand).not.toHaveBeenCalled()
  })

  it('quarantines a document when a target-bound CDP capture remains pending', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    sendDebuggerCommand.mockImplementation(() => new Promise(() => undefined))

    const handled = handleBrowserScreenshot({ requestId: 'late-cdp', tabId: 42, inlineOnly: true, requestTimeoutMs: 1100 })
    await vi.advanceTimersByTimeAsync(100)
    await handled

    expect(markDocumentReadUncertain).toHaveBeenCalledWith(42, token)
    expect(lastResult()).toMatchObject({ success: false, error: 'Screenshot capture remained pending after its deadline' })
  })

  it('uses the admitted inline seam without nesting document admission', async () => {
    const observation = await captureViewportInline(42, { agent: 'worker', token, expiresAt: Date.now() + 5000 })
    expect(observation).toMatchObject({ width: 1280, height: 720, mimeType: 'image/png' })
    expect(runWithDocumentAdmission).not.toHaveBeenCalled()
    expect(assertDocumentReadCurrent).toHaveBeenCalled()
  })

  it('refuses a protected document before attaching or capturing', async () => {
    assertDocumentReadable.mockRejectedValueOnce(new Error('protected document'))
    await handleBrowserScreenshot({ requestId: 'protected', tabId: 42, inlineOnly: true })
    expect(lastResult()).toMatchObject({ success: false, error: 'protected document' })
    expect(withDebugger).not.toHaveBeenCalled()
  })

  it('rechecks caller ownership after admission and before the scheduled capture', async () => {
    const owned = { id: 42, windowId: 1, title: 'Agent page', url: 'https://example.test/page', status: 'complete' }
    resolveAgentTab
      .mockResolvedValueOnce(owned)
      .mockResolvedValueOnce(owned)
      .mockResolvedValueOnce(undefined)

    await handleBrowserScreenshot({ requestId: 'moved', tabId: 42, inlineOnly: true, agent: 'worker' })

    expect(lastResult()).toMatchObject({ success: false, error: 'The screenshot tab is no longer owned by this caller' })
    expect(withDebugger).not.toHaveBeenCalled()
    expect(sendDebuggerCommand).not.toHaveBeenCalled()
  })

  it('resolves an opaque ref only for the admitted document and owner', async () => {
    resolvePageRef.mockReturnValue('[data-tabz-ref="ref-a"]')
    executeScript.mockResolvedValue([{ documentId: 'doc-safe', result: { x: 1, y: 2, width: 3, height: 4, viewportWidth: 100, viewportHeight: 100 } }])
    bitmapSize = { width: 100, height: 100 }
    await handleBrowserScreenshot({ requestId: 'ref', tabId: 42, ref: 'ref-a', inlineOnly: true, agent: 'worker' })
    expect(resolvePageRef).toHaveBeenCalledWith(42, 'ref-a', { agent: 'worker', documentId: 'doc-safe' })
  })
})
