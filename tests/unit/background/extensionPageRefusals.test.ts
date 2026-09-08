import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  resolveAgentTab: vi.fn(), assertTabInAgentGroup: vi.fn(),
  getClaudeActiveGroupId: vi.fn(), isNamedAgent: vi.fn(() => true),
  subscribeToTabOwnershipChanges: vi.fn()
}))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-test', generation: 0 })),
  assertDocumentCaptureAllowed: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-test', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  canCaptureDocumentSync: vi.fn(() => true),
  subscribeToDocumentProtection: vi.fn(() => () => undefined),
  subscribeToDocumentLifecycle: vi.fn(() => () => undefined)
}))

import { sendToWebSocket } from '../../../extension/background/websocket'
import { handleBrowserEnableNetworkCapture } from '../../../extension/background/networkCapture'
import { assertAgentReadableTab, isRefusedPageUrl, refusalMessage } from '../../../extension/background/browserMcp/pageGuard'
import { resolveAgentTab } from '../../../extension/background/browserMcp/tabGroups'

describe('extension and browser-page refusal boundary', () => {
  const addListener = vi.fn()
  const lastFrame = () => vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    const event = { addListener, removeListener: vi.fn(), hasListener: vi.fn(() => false) }
    vi.stubGlobal('chrome', {
      tabs: { get: vi.fn() },
      webRequest: {
        onBeforeRequest: event, onSendHeaders: event, onHeadersReceived: event,
        onBeforeRedirect: event, onCompleted: event, onErrorOccurred: event
      }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each([
    'chrome-extension://fixture/dashboard/index.html',
    'chrome://extensions',
    'devtools://devtools/bundled/inspector.html',
    'edge://settings',
    'about:blank',
    'file:///home/user/.config/private',
    'data:text/html,private',
    'blob:https://app.example.com/private'
  ])('refuses %s', url => {
    expect(isRefusedPageUrl(url)).toBe(true)
    expect(refusalMessage('tabz_test', url)).toContain('Refused: tabz_test')
  })

  it('checks both current and pending URL while ordinary web pages pass', async () => {
    await expect(assertAgentReadableTab('tabz_test', {
      id: 1, url: 'https://app.example.com/', pendingUrl: 'chrome-extension://fixture/dashboard/index.html'
    })).rejects.toThrow(/chrome-extension:\/\//)
    await expect(assertAgentReadableTab('tabz_test', {
      id: 2, url: 'https://app.example.com/', pendingUrl: 'https://app.example.com/next'
    })).resolves.toBeUndefined()
  })

  it('refuses network capture before installing listeners', async () => {
    vi.mocked(resolveAgentTab).mockResolvedValue({
      id: 42, url: 'https://app.example.com/',
      pendingUrl: 'chrome-extension://fixture/dashboard/index.html'
    })
    await handleBrowserEnableNetworkCapture({ requestId: 'capture', tabId: 42, agent: 'worker-a' })
    expect(lastFrame()).toMatchObject({ type: 'browser-enable-network-capture-result', success: false })
    expect(addListener).not.toHaveBeenCalled()
  })

  it('allows network capture on an ordinary owned web page', async () => {
    vi.mocked(resolveAgentTab).mockResolvedValue({ id: 42, url: 'https://app.example.com/' })
    await handleBrowserEnableNetworkCapture({ requestId: 'capture-web', tabId: 42, agent: 'worker-a' })
    expect(lastFrame()).toMatchObject({ type: 'browser-enable-network-capture-result', success: true })
    expect(addListener).toHaveBeenCalledTimes(6)
  })
})
