import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const resolveAgentTab = vi.hoisted(() => vi.fn())
const protection = vi.hoisted(() => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  currentDocumentProtection: vi.fn(async () => null),
  preflightAndProtectDocument: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-login', generation: 1 })),
  protectTabForUnboundMutation: vi.fn(async (_tabId: number, token: unknown) => token),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({ resolveAgentTab }))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  ...protection,
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] }),
}))

import { sendToWebSocket } from '../../../extension/background/websocket'
import { fillInputInDocument, handleBrowserFillInput, locateTrustedFillTarget } from '../../../extension/background/browserMcp/interaction'

const SECRET = 'SYNTHETIC-SAVED-VALUE'

describe('saved fill host, document, and deadline checks', () => {
  const executeScript = vi.fn()
  const listeners = new Set<(tabId: number, change: chrome.tabs.TabChangeInfo) => void>()
  const lastFrame = () => vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    listeners.clear()
    resolveAgentTab.mockResolvedValue({ id: 42, url: 'http://localhost/login', status: 'complete' })
    document.body.innerHTML = '<input id="password" type="password">'
    const input = document.querySelector('#password') as HTMLInputElement
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 100, height: 20 } as DOMRect)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    executeScript.mockImplementation(async ({ func, args = [] }: { func: (...args: any[]) => unknown; args?: any[] }) => [
      { documentId: 'doc-login', result: await func(...args) }
    ])
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      tabs: {
        get: vi.fn(async () => ({ id: 42, url: 'http://localhost/login', status: 'complete' })),
        sendMessage: vi.fn(async () => undefined),
        onUpdated: {
          addListener: vi.fn((listener: (tabId: number, change: chrome.tabs.TabChangeInfo) => void) => listeners.add(listener)),
          removeListener: vi.fn((listener: (tabId: number, change: chrome.tabs.TabChangeInfo) => void) => listeners.delete(listener)),
        },
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('refuses a changed host before any page injection or protection', async () => {
    resolveAgentTab.mockResolvedValue({ id: 42, url: 'https://evil.example.test/login', status: 'complete' })

    await handleBrowserFillInput({
      requestId: 'wrong-host', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'app.example.test', requireInput: true, requirePasswordType: true,
    })

    expect(executeScript).not.toHaveBeenCalled()
    expect(protection.preflightAndProtectDocument).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false, error: 'Protected document fill was refused or could not be verified' })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain(SECRET)
  })

  it('does a secret-free target/type preflight before persisting protection', async () => {
    document.body.innerHTML = '<input id="password" type="text">'

    await handleBrowserFillInput({
      requestId: 'wrong-type', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'localhost', requireInput: true, requirePasswordType: true,
    })

    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(executeScript.mock.calls[0][0].func).toBe(locateTrustedFillTarget)
    expect(JSON.stringify(executeScript.mock.calls[0][0].args)).not.toContain(SECRET)
    expect(protection.preflightAndProtectDocument).not.toHaveBeenCalled()
    expect((document.querySelector('#password') as HTMLInputElement).value).toBe('')
    expect(lastFrame()).toMatchObject({ success: false })
  })

  it('does not start a delayed preflight after the extension-local deadline', async () => {
    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    executeScript.mockImplementationOnce(async ({ func, args }: { func: (...args: any[]) => unknown; args: any[] }) => {
      now = args[1]
      return [{ documentId: 'doc-login', result: await func(...args) }]
    })

    await handleBrowserFillInput({
      requestId: 'expired', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'localhost', requireInput: true, requirePasswordType: true, requestTimeoutMs: 2000,
    })

    expect(protection.preflightAndProtectDocument).not.toHaveBeenCalled()
    expect((document.querySelector('#password') as HTMLInputElement).value).toBe('')
    expect(lastFrame()).toMatchObject({ success: false })
  })

  it('refuses when the probed and protected document IDs differ without dispatching the saved value', async () => {
    protection.preflightAndProtectDocument.mockResolvedValueOnce({ tabId: 42, documentId: 'doc-new', generation: 1 })

    await handleBrowserFillInput({
      requestId: 'document-race', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'localhost', requireInput: true, requirePasswordType: true,
    })

    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(executeScript.mock.calls.some(([call]) => call.func === fillInputInDocument)).toBe(false)
    expect(JSON.stringify(executeScript.mock.calls)).not.toContain(SECRET)
    expect((document.querySelector('#password') as HTMLInputElement).value).toBe('')
    expect(lastFrame()).toMatchObject({ success: false })
  })

  it('treats navigation after protection as an uncertain value-free failure', async () => {
    executeScript.mockImplementation(async ({ func, args = [] }: { func: (...args: any[]) => unknown; args?: any[] }) => {
      if (func === fillInputInDocument) {
        for (const listener of listeners) listener(42, { status: 'loading', url: 'http://localhost/next' })
        throw new Error('No frame with id doc-login')
      }
      return [{ documentId: 'doc-login', result: await func(...args) }]
    })

    await handleBrowserFillInput({
      requestId: 'navigation', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'localhost', requireInput: true, requirePasswordType: true,
    })

    expect(protection.preflightAndProtectDocument).toHaveBeenCalledTimes(1)
    expect(lastFrame()).toMatchObject({ success: false, error: 'Protected document fill was refused or could not be verified' })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain(SECRET)
  })
})
