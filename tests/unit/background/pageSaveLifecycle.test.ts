import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({ resolveAgentTab: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/pageLoad', () => ({ waitForTabLoadComplete: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-safe', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  protectedDocumentTarget: vi.fn()
}))
vi.mock('../../../extension/background/utils', () => ({
  windowsToWslPath: vi.fn((path: string) => path),
  waitForDownload: vi.fn(async () => ({ success: true, filename: '/downloads/page.mhtml' }))
}))

import { sendToWebSocket } from '../../../extension/background/websocket'
import { resolveAgentTab } from '../../../extension/background/browserMcp/tabGroups'
import { assertAgentReadableTab } from '../../../extension/background/browserMcp/pageGuard'
import { assertDocumentReadable, assertDocumentReadCurrent } from '../../../extension/background/browserMcp/documentProtection'
import { waitForTabLoadComplete } from '../../../extension/background/browserMcp/pageLoad'
import { handleBrowserSavePage } from '../../../extension/background/browserMcp/downloads'

describe('save-page lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveAgentTab).mockResolvedValue({
      id: 42,
      windowId: 7,
      url: 'https://example.test/page',
      status: 'complete'
    })
    vi.mocked(chrome.tabs.get)
      .mockResolvedValue({ id: 42, url: 'https://example.test/page', title: 'Example', status: 'complete' } as chrome.tabs.Tab)
    Object.assign(chrome, {
      pageCapture: { saveAsMHTML: vi.fn(async () => new Blob(['page'])) },
      downloads: {
        download: vi.fn((_options: chrome.downloads.DownloadOptions, callback: (id?: number) => void) => callback(9))
      }
    })
    vi.mocked(chrome.storage.local.get).mockResolvedValue({})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:page')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
  })

  it('waits for loading, then revalidates ownership, eligibility, and the exact document', async () => {
    vi.mocked(chrome.tabs.get)
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/start', status: 'loading' } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/final', title: 'Final', status: 'complete' } as chrome.tabs.Tab)

    await handleBrowserSavePage({ requestId: 'save', tabId: 42, agent: 'alpha' })

    expect(waitForTabLoadComplete).toHaveBeenCalledWith(42)
    expect(resolveAgentTab).toHaveBeenCalledTimes(3)
    expect(resolveAgentTab).toHaveBeenNthCalledWith(2, 'alpha', 42)
    expect(assertAgentReadableTab).toHaveBeenCalledTimes(2)
    expect(assertDocumentReadable).toHaveBeenCalledWith(42, 'tabz_save_page')
    expect(assertDocumentReadCurrent).toHaveBeenCalledWith(42, expect.objectContaining({ documentId: 'doc-safe' }))
    expect(chrome.pageCapture.saveAsMHTML).toHaveBeenCalledOnce()
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'browser-save-page-result',
      requestId: 'save',
      success: true
    }))
  })

  it('refuses an ownership transfer after waiting without capturing', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({ id: 42, url: 'https://example.test/start', status: 'loading' } as chrome.tabs.Tab)
    vi.mocked(resolveAgentTab)
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/start', status: 'loading' })
      .mockRejectedValueOnce(new Error('Tab 42 is owned by another agent'))

    await handleBrowserSavePage({ requestId: 'owner-before', tabId: 42, agent: 'alpha' })

    expect(chrome.pageCapture.saveAsMHTML).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({
      success: false,
      error: 'Tab 42 is owned by another agent'
    }))
  })

  it('rechecks page eligibility after loading before capturing', async () => {
    vi.mocked(chrome.tabs.get)
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/start', status: 'loading' } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 42, pendingUrl: 'chrome://settings', status: 'complete' } as chrome.tabs.Tab)
    vi.mocked(assertAgentReadableTab)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Refused: tabz_save_page supports HTTP and HTTPS pages'))

    await handleBrowserSavePage({ requestId: 'page-guard', tabId: 42, agent: 'alpha' })

    expect(chrome.pageCapture.saveAsMHTML).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({
      success: false,
      error: 'Refused: tabz_save_page supports HTTP and HTTPS pages'
    }))
  })

  it('does not release captured content after a post-capture ownership transfer', async () => {
    vi.mocked(resolveAgentTab)
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/page', status: 'complete' })
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/page', status: 'complete' })
      .mockRejectedValueOnce(new Error('Tab 42 is owned by another agent'))

    await handleBrowserSavePage({ requestId: 'owner-after', tabId: 42, agent: 'alpha' })

    expect(chrome.pageCapture.saveAsMHTML).toHaveBeenCalledOnce()
    expect(chrome.downloads.download).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({
      success: false,
      error: 'Tab 42 is owned by another agent'
    }))
  })

  it('does not capture when the tab starts loading again after the wait', async () => {
    vi.mocked(chrome.tabs.get)
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/start', status: 'loading' } as chrome.tabs.Tab)
      .mockResolvedValueOnce({ id: 42, url: 'https://example.test/next', status: 'loading' } as chrome.tabs.Tab)

    await handleBrowserSavePage({ requestId: 'loading-again', tabId: 42, agent: 'alpha' })

    expect(chrome.pageCapture.saveAsMHTML).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({
      success: false,
      error: 'Tab started loading again before MHTML capture'
    }))
  })

  it('does not replay saveAsMHTML after a capture failure', async () => {
    vi.mocked(chrome.pageCapture.saveAsMHTML).mockRejectedValueOnce(new Error('capture failed'))

    await handleBrowserSavePage({ requestId: 'capture-failure', tabId: 42, agent: 'alpha' })

    expect(chrome.pageCapture.saveAsMHTML).toHaveBeenCalledOnce()
    expect(chrome.downloads.download).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenLastCalledWith(expect.objectContaining({
      success: false,
      error: 'MHTML capture failed for tab 42: capture failed'
    }))
  })
})
