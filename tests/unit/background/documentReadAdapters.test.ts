import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({ resolveAgentTab: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-safe', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  protectedDocumentTarget: vi.fn((token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] }))
}))
vi.mock('../../../extension/background/browserMcp/debugger', async importOriginal => {
  const original = await importOriginal<typeof import('../../../extension/background/browserMcp/debugger')>()
  return {
    ...original,
    withDebugger: vi.fn(async (tabId: number, fn: (target: chrome.debugger.Debuggee) => Promise<unknown>) => fn({ tabId })),
    sendDebuggerCommand: vi.fn(async (_target: chrome.debugger.Debuggee, method: string) =>
      method === 'Page.captureScreenshot' ? { data: 'cGl4ZWxz' } : {})
  }
})

import { sendToWebSocket } from '../../../extension/background/websocket'
import { resolveAgentTab } from '../../../extension/background/browserMcp/tabGroups'
import { assertDocumentReadable, assertDocumentReadCurrent } from '../../../extension/background/browserMcp/documentProtection'
import { sendDebuggerCommand } from '../../../extension/background/browserMcp/debugger'
import { handleBrowserGetDomTree } from '../../../extension/background/browserMcp/debugger'
import { handleBrowserScreenshot } from '../../../extension/background/browserMcp/screenshots'
import { handleBrowserCaptureImage, handleBrowserDownloadFile, handleBrowserSavePage } from '../../../extension/background/browserMcp/downloads'

describe('document-bound read adapters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(resolveAgentTab).mockResolvedValue({ id: 42, windowId: 7, url: 'https://example.test/page', status: 'complete' })
    vi.mocked(assertDocumentReadable).mockResolvedValue({ tabId: 42, documentId: 'doc-safe', generation: 0 })
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: 42, windowId: 7, url: 'https://example.test/page', status: 'complete' } as chrome.tabs.Tab)
    Object.assign(chrome.tabs, { captureVisibleTab: vi.fn(), update: vi.fn() })
    Object.assign(chrome, {
      downloads: {
        download: vi.fn((_options: chrome.downloads.DownloadOptions, callback?: (id?: number) => void) => callback?.(9)),
        search: vi.fn((_query: chrome.downloads.DownloadQuery, callback: (results: chrome.downloads.DownloadItem[]) => void) =>
          callback([{ id: 9, state: 'complete', filename: 'C:\\Downloads\\shot.png' } as chrome.downloads.DownloadItem]))
      }
    })
    Object.assign(chrome, {
      pageCapture: { saveAsMHTML: vi.fn(async () => new Blob(['page'])) },
      scripting: { executeScript: vi.fn(async () => [{ frameId: 0, documentId: 'doc-safe', result: { dataUrl: 'data:image/png;base64,QQ==', width: 1, height: 1 } }]) }
    })
    vi.mocked(globalThis.fetch).mockResolvedValue({
      blob: async () => new Blob(['pixel'], { type: 'image/png' })
    } as Response)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('captures screenshot pixels from the validated tab without activating or window-capturing another tab', async () => {
    const operation = handleBrowserScreenshot({ requestId: 'shot', tabId: 42 })
    await vi.runAllTimersAsync()
    await operation

    expect(sendDebuggerCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      'Page.captureScreenshot',
      expect.objectContaining({ format: 'png' }),
      expect.any(Number)
    )
    expect(chrome.tabs.captureVisibleTab).not.toHaveBeenCalled()
    expect(chrome.tabs.update).not.toHaveBeenCalled()
    expect(assertDocumentReadCurrent).toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({ type: 'browser-screenshot-result', success: true }))
  })

  it('refuses local and opaque direct downloads before Chrome receives a download request', async () => {
    for (const url of ['file:///home/user/.config/private', 'data:text/plain,secret', 'blob:https://example.test/id']) {
      await handleBrowserDownloadFile({ requestId: url, url })
    }
    expect(chrome.downloads.download).not.toHaveBeenCalled()
    expect(vi.mocked(sendToWebSocket).mock.calls.map(call => call[0])).toEqual(expect.arrayContaining([
      expect.objectContaining({ success: false, error: expect.stringContaining('only http:// and https://') })
    ]))
  })

  it('returns structured inline metadata for an admitted captured image and downloads only its data URL', async () => {
    const operation = handleBrowserCaptureImage({ requestId: 'image-inline', tabId: 42, selector: '#image' })
    await vi.runAllTimersAsync()
    await operation

    expect(chrome.downloads.download).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'data:image/png;base64,QQ==' }),
      expect.any(Function)
    )
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'browser-capture-image-result',
      success: true,
      tabId: 42,
      width: 1,
      height: 1,
      imageData: expect.any(String),
      mimeType: 'image/png',
      bytes: expect.any(Number),
      imageReencoded: false
    }))
  })

  it.each([
    ['DOM tree', () => handleBrowserGetDomTree({ requestId: 'dom', tabId: 42 })],
    ['image extraction', () => handleBrowserCaptureImage({ requestId: 'image', tabId: 42 })],
    ['page serialization', () => handleBrowserSavePage({ requestId: 'page', tabId: 42 })]
  ])('blocks %s before content is returned when document admission refuses', async (_label, run) => {
    vi.mocked(assertDocumentReadable).mockRejectedValueOnce(new Error('protected document'))
    await run()
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({ success: false, error: 'protected document' }))
  })
})
