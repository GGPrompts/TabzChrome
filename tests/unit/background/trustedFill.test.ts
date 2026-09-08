import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const protection = vi.hoisted(() => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  currentDocumentProtection: vi.fn(async () => null),
  preflightAndProtectDocument: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-login', generation: 1 })),
  protectTabForUnboundMutation: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-login', generation: 2 })),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
}))
const debuggerApi = vi.hoisted(() => ({
  withDebugger: vi.fn(async (tabId: number, fn: (target: { tabId: number }) => Promise<unknown>) => fn({ tabId })),
  sendDebuggerCommand: vi.fn(async () => ({})),
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  resolveAgentTab: vi.fn(async () => ({ id: 42, url: 'https://console.example.test/login', status: 'complete' }))
}))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  ...protection,
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] }),
}))
vi.mock('../../../extension/background/browserMcp/debugger', () => debuggerApi)

import { sendToWebSocket } from '../../../extension/background/websocket'
import {
  checkTrustedFillTarget,
  clearTrustedFillMarker,
  handleBrowserFillInput,
  locateTrustedFillTarget,
  readTrustedFillTarget,
} from '../../../extension/background/browserMcp/interaction'

const SECRET = 'Ab1!🙂'

describe('trusted saved-field typing', () => {
  const executeScript = vi.fn()
  let typeChanged = false
  let typedKeyDown = false
  const lastFrame = () => vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    typeChanged = false
    typedKeyDown = false
    debuggerApi.sendDebuggerCommand.mockImplementation(async (_target, method, params) => {
      if (method === 'Input.dispatchKeyEvent' && (params as { type?: string }).type === 'keyDown') typedKeyDown = true
      return {}
    })
    executeScript.mockImplementation(async (injection: { func: unknown; target: chrome.scripting.InjectionTarget }) => {
      if (injection.func === locateTrustedFillTarget) {
        return [{ documentId: 'doc-login', result: { success: true, host: 'console.example.test', x: 120, y: 80, tagName: 'input', type: 'password' } }]
      }
      if (injection.func === checkTrustedFillTarget) {
        if (typeChanged && typedKeyDown) {
          return [{ documentId: 'doc-login', result: { success: false, host: 'console.example.test', error: 'target type changed' } }]
        }
        return [{ documentId: 'doc-login', result: { success: true, host: 'console.example.test', x: 120, y: 80 } }]
      }
      if (injection.func === readTrustedFillTarget) {
        return [{ documentId: 'doc-login', result: { success: true, host: 'console.example.test', tagName: 'input', type: 'password', actualValue: SECRET } }]
      }
      if (injection.func === clearTrustedFillMarker) return [{ documentId: 'doc-login' }]
      throw new Error('Unexpected injected function')
    })
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      tabs: {
        get: vi.fn(async () => ({ id: 42, url: 'https://console.example.test/login', status: 'complete' })),
        sendMessage: vi.fn(async () => undefined),
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: { getPlatformInfo: vi.fn(async () => ({ os: 'linux' })) },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('protects the exact probed document before CDP and returns only a boolean verdict', async () => {
    await handleBrowserFillInput({
      requestId: 'trusted-ok', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'console.example.test', requireInput: true, requirePasswordType: true,
      allowSelect: true, trusted: true, requestTimeoutMs: 15000,
    })

    expect(protection.preflightAndProtectDocument).toHaveBeenCalledWith(42, expect.objectContaining({ reason: 'saved-fill' }))
    expect(protection.protectTabForUnboundMutation).toHaveBeenCalledWith(42, { tabId: 42, documentId: 'doc-login', generation: 1 })
    expect(protection.preflightAndProtectDocument.mock.invocationCallOrder[0]).toBeLessThan(protection.protectTabForUnboundMutation.mock.invocationCallOrder[0])
    expect(debuggerApi.withDebugger.mock.invocationCallOrder[0]).toBeLessThan(protection.protectTabForUnboundMutation.mock.invocationCallOrder[0])
    expect(protection.protectTabForUnboundMutation.mock.invocationCallOrder[0]).toBeLessThan(debuggerApi.sendDebuggerCommand.mock.invocationCallOrder[0])
    expect(executeScript.mock.calls.some(([call]) => call.func === checkTrustedFillTarget && call.target.documentIds?.[0] === 'doc-login')).toBe(true)

    const charTexts = debuggerApi.sendDebuggerCommand.mock.calls
      .filter(([, method, params]) => method === 'Input.dispatchKeyEvent' && (params as { type?: string }).type === 'char')
      .map(([, , params]) => (params as { text?: string }).text)
    expect(charTexts).toEqual(['A', 'b', '1', '!'])
    expect(debuggerApi.sendDebuggerCommand).toHaveBeenCalledWith(
      { tabId: 42 }, 'Input.insertText', { text: '🙂' }, expect.any(Number)
    )
    expect(lastFrame()).toMatchObject({ success: true, verified: true, protected: true })
    const serialized = JSON.parse(JSON.stringify(lastFrame()))
    expect(serialized).toEqual({
      type: 'browser-fill-input-result', requestId: 'trusted-ok', success: true,
      protected: true, verified: true
    })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain(SECRET)
  })

  it('rechecks password type before the secret-bearing char event and clears the marker', async () => {
    typeChanged = true

    await handleBrowserFillInput({
      requestId: 'trusted-type-change', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'console.example.test', requireInput: true, requirePasswordType: true, trusted: true,
    })

    const charCommands = debuggerApi.sendDebuggerCommand.mock.calls.filter(
      ([, method, params]) => method === 'Input.dispatchKeyEvent' && (params as { type?: string }).type === 'char'
    )
    expect(charCommands).toHaveLength(0)
    expect(lastFrame()).toMatchObject({ success: false, protected: true, error: 'Protected document fill was refused or could not be verified' })
    expect(executeScript.mock.calls.some(([call]) => call.func === clearTrustedFillMarker)).toBe(true)
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain(SECRET)
  })

  it('clears the marker and keeps the saved value out of failure envelopes when CDP fails', async () => {
    debuggerApi.sendDebuggerCommand.mockRejectedValueOnce(new Error(`dispatch rejected ${SECRET}`))

    await handleBrowserFillInput({
      requestId: 'trusted-failure', selector: '#password', value: SECRET, tabId: 42,
      expectedHost: 'console.example.test', requireInput: true, requirePasswordType: true, trusted: true,
    })

    expect(debuggerApi.withDebugger).toHaveBeenCalledTimes(1)
    expect(executeScript.mock.calls.some(([call]) => call.func === clearTrustedFillMarker)).toBe(true)
    expect(lastFrame()).toMatchObject({ success: false, protected: true, error: 'Protected document fill was refused or could not be verified' })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain(SECRET)
  })
})
