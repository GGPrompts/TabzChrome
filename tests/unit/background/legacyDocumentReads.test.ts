import { beforeEach, describe, expect, it, vi } from 'vitest'

const { assertDocumentReadable, getConsoleLogs } = vi.hoisted(() => ({
  assertDocumentReadable: vi.fn(), getConsoleLogs: vi.fn(() => [{ message: 'SYNTHETIC-SECRET' }])
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn(), updateBadge: vi.fn() }))
vi.mock('../../../extension/background/state', () => ({
  ws: null, connectedClients: new Set(), broadcastToClients: vi.fn(), pendingQueueCommand: null,
  pendingPasteCommand: null, setPendingQueueCommand: vi.fn(), setPendingPasteCommand: vi.fn(), popoutWindows: new Map()
}))
vi.mock('../../../extension/background/consoleCapture', () => ({
  captureConsoleLog: vi.fn(), getConsoleLogs, getConsoleLogCount: vi.fn(() => 1)
}))
vi.mock('../../../extension/background/utils', () => ({ tryOpenSidebar: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/script', () => ({ executeWhitelistFallback: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable,
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
  currentDocumentProtection: vi.fn(async () => null),
  protectedDocumentTarget: vi.fn()
}))

import { setupMessageHandlers } from '../../../extension/background/messageHandlers'

describe('legacy extension read entry points', () => {
  let listener: (message: Record<string, unknown>, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void) => Promise<boolean>

  beforeEach(() => {
    vi.clearAllMocks()
    assertDocumentReadable.mockRejectedValue(new Error('protected document'))
    Object.assign(chrome, {
      runtime: {
        ...chrome.runtime,
        onMessage: { addListener: vi.fn(callback => { listener = callback }) },
        onMessageExternal: { addListener: vi.fn() },
        onConnect: { addListener: vi.fn() }
      },
      tabs: { query: vi.fn(), get: vi.fn(async () => ({ id: 42, url: 'https://example.test/' })) },
      scripting: { executeScript: vi.fn() }
    })
    setupMessageHandlers()
  })

  it.each([
    { type: 'BROWSER_EXECUTE_SCRIPT', tabId: 42, code: "document.querySelector('#password').value" },
    { type: 'GET_CONSOLE_LOGS', tabId: 42 }
  ])('refuses $type on protected documents without returning buffered or DOM values', async message => {
    const sendResponse = vi.fn()
    await listener(message, {}, sendResponse)
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    expect(getConsoleLogs).not.toHaveBeenCalled()
    expect(JSON.stringify(sendResponse.mock.calls)).not.toContain('SYNTHETIC-SECRET')
    expect(sendResponse).toHaveBeenCalledWith(expect.objectContaining({ error: 'protected document' }))
  })
})
