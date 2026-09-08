import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const { sendToWebSocket, withDebugger, sendDebuggerCommand, MockDebuggerAttachError } = vi.hoisted(() => {
  class AttachError extends Error {}
  return {
    sendToWebSocket: vi.fn(),
    withDebugger: vi.fn(),
    sendDebuggerCommand: vi.fn(),
    MockDebuggerAttachError: AttachError
  }
})

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: (...args: unknown[]) => sendToWebSocket(...args) }))
vi.mock('../../../extension/background/browserMcp/debugger', () => ({
  DebuggerAttachError: MockDebuggerAttachError,
  withDebugger: (...args: unknown[]) => withDebugger(...args),
  sendDebuggerCommand: (...args: unknown[]) => sendDebuggerCommand(...args)
}))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  resolveAgentTab: vi.fn(async (_agent: string | undefined, tabId?: number) => ({ id: tabId ?? 42, url: 'https://example.test/' }))
}))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-test', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
  markDocumentReadUncertain: vi.fn(async () => undefined),
  currentDocumentProtection: vi.fn(async () => null),
  protectedDocumentTarget: vi.fn((token: { tabId: number; documentId: string }) => ({
    tabId: token.tabId, documentIds: [token.documentId]
  }))
}))

import { currentDocumentProtection } from '../../../extension/background/browserMcp/documentProtection'
import { resolveAgentTab } from '../../../extension/background/browserMcp/tabGroups'
import { executeWhitelistFallback, handleBrowserExecuteScript, handleBrowserGetPageInfo } from '../../../extension/background/browserMcp/script'

describe('browser script execution', () => {
  const executeScript = vi.fn()
  const lastFrame = () => sendToWebSocket.mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    document.body.innerHTML = '<button id="go">Go</button><x>selected</x>'
    executeScript.mockImplementation(async ({ target, func, args = [] }) => {
      if (target.allFrames) return [
        { frameId: 0, documentId: 'doc-test', result: true },
        { frameId: 1, documentId: 'doc-frame', result: true }
      ]
      const documentIds = target.documentIds || ['doc-test']
      return documentIds.map((documentId: string, frameId: number) => ({ documentId, frameId, result: func(...args) }))
    })
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      tabs: { get: vi.fn(), query: vi.fn() }
    })
    withDebugger.mockImplementation(async (_tabId, fn) => fn({ tabId: 42 }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('uses bounded Runtime.evaluate with the debugger path', async () => {
    sendDebuggerCommand.mockResolvedValueOnce({ result: { value: { ok: true } } })

    await handleBrowserExecuteScript({ requestId: 'script-ok', code: '({ ok: true })', tabId: 42 })

    const evaluateCall = sendDebuggerCommand.mock.calls[0]
    expect(evaluateCall.slice(0, 2)).toEqual([{ tabId: 42 }, 'Runtime.evaluate'])
    expect(evaluateCall[2]).toMatchObject({ expression: '({ ok: true })', returnByValue: true, awaitPromise: true, userGesture: true })
    expect(evaluateCall[2].timeout).toBeLessThanOrEqual(25_000)
    expect(evaluateCall[2].timeout).toBeLessThan(30_000)
    expect(evaluateCall[3]).toBe(evaluateCall[2].timeout + 250)
    expect(lastFrame()).toMatchObject({ success: true, result: { ok: true }, executionPath: 'debugger' })
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('falls back only for a typed attach failure and exact whitelist code', async () => {
    withDebugger.mockRejectedValueOnce(new MockDebuggerAttachError('blocked'))

    await handleBrowserExecuteScript({ requestId: 'script-fallback', code: "document.querySelector('x').outerHTML", tabId: 42 })

    expect(lastFrame()).toMatchObject({ success: true, result: '<x>selected</x>', executionPath: 'whitelist-fallback' })
    expect(lastFrame().warning).toContain('blocked')
  })

  it('never replays through fallback after evaluation starts and fails', async () => {
    sendDebuggerCommand.mockRejectedValueOnce(new Error('evaluation channel failed'))

    await handleBrowserExecuteScript({ requestId: 'script-error', code: "document.querySelector('#go').click()", tabId: 42 })

    expect(lastFrame()).toMatchObject({ success: false, error: 'evaluation channel failed', executionPath: 'debugger' })
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('freezes verified frame document IDs before exact-whitelist all-frame execution', async () => {
    await handleBrowserExecuteScript({ requestId: 'script-frames', code: 'document.title', tabId: 42, allFrames: true })

    expect(executeScript).toHaveBeenCalledTimes(2)
    expect(executeScript.mock.calls[1][0].target).toEqual({ tabId: 42, documentIds: ['doc-test', 'doc-frame'] })
    expect(sendDebuggerCommand).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: true, executionPath: 'whitelist-all-frames' })
  })

  it('attempts bounded termination after an unresolved evaluation timeout and reports uncertainty', async () => {
    sendDebuggerCommand
      .mockRejectedValueOnce(new Error("Debugger command 'Runtime.evaluate' timed out after 25250ms"))
      .mockResolvedValueOnce({})

    await handleBrowserExecuteScript({ requestId: 'script-timeout', code: 'mutateThenHang()', tabId: 42 })

    expect(sendDebuggerCommand.mock.calls[1][1]).toBe('Runtime.terminateExecution')
    expect(sendDebuggerCommand.mock.calls[1][3]).toBeLessThanOrEqual(1500)
    expect(lastFrame()).toMatchObject({
      success: false, executionPath: 'debugger', timedOut: true, uncertain: true,
      terminationAttempted: true, terminationAcknowledged: true
    })
    expect(String(lastFrame().error)).toContain('inspect state before retrying')
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('keeps the outcome uncertain when experimental termination is unavailable', async () => {
    sendDebuggerCommand
      .mockRejectedValueOnce(new Error("Debugger command 'Runtime.evaluate' timed out after 25250ms"))
      .mockRejectedValueOnce(new Error('Runtime.terminateExecution was not found'))

    await handleBrowserExecuteScript({ requestId: 'script-timeout-no-terminate', code: 'mutateThenHang()', tabId: 42 })

    expect(lastFrame()).toMatchObject({ timedOut: true, uncertain: true, terminationAttempted: true, terminationAcknowledged: false })
    expect(String(lastFrame().error)).toContain('did not acknowledge')
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('does not terminate an evaluation Chrome already reported settled', async () => {
    sendDebuggerCommand.mockResolvedValueOnce({
      result: { description: 'timeout' },
      exceptionDetails: { text: 'Script execution timed out' }
    })

    await handleBrowserExecuteScript({ requestId: 'script-settled-timeout', code: 'hang()', tabId: 42 })

    expect(sendDebuggerCommand).toHaveBeenCalledTimes(1)
    expect(lastFrame()).toMatchObject({ timedOut: true, uncertain: true, terminationAttempted: false })
  })

  it('checks the relative deadline before evaluation can start', async () => {
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    withDebugger.mockImplementationOnce(async (_tabId, _fn, options) => {
      now = 5000
      options.guard()
    })

    await handleBrowserExecuteScript({ requestId: 'script-late', code: 'changePage()', tabId: 42, requestTimeoutMs: 4000 })

    expect(sendDebuggerCommand).not.toHaveBeenCalled()
    expect(executeScript).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false, executionPath: 'debugger' })
    expect(String(lastFrame().error)).toContain('nothing was executed')
  })

  it('caps large serialized debugger results', async () => {
    sendDebuggerCommand.mockResolvedValueOnce({ result: { value: 'x'.repeat(60_000) } })
    await handleBrowserExecuteScript({ requestId: 'script-large', code: 'largeValue()', tabId: 42 })
    expect(lastFrame()).toMatchObject({ success: true, resultTruncated: true, executionPath: 'debugger' })
    expect(String(lastFrame().result).length).toBe(50_000)
  })

  it('returns only origin and the fill capability for protected page metadata', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValueOnce({
      id: 42, url: 'https://example.test/SYNTHETIC-SAVED-VALUE?token=SYNTHETIC-SAVED-VALUE'
    } as chrome.tabs.Tab)
    vi.mocked(resolveAgentTab).mockResolvedValueOnce({
      id: 42, url: 'https://example.test/SYNTHETIC-SAVED-VALUE?token=SYNTHETIC-SAVED-VALUE',
      title: 'SYNTHETIC-SAVED-VALUE'
    })
    vi.mocked(currentDocumentProtection).mockResolvedValueOnce({ tabId: 42, documentId: 'doc-test', generation: 1 })

    await handleBrowserGetPageInfo({ requestId: 'protected-info', tabId: 42 })

    expect(lastFrame()).toMatchObject({
      type: 'browser-page-info', requestId: 'protected-info', url: 'https://example.test',
      title: '', protectedFillVersion: 1
    })
    expect(JSON.stringify(lastFrame())).not.toContain('SYNTHETIC-SAVED-VALUE')
  })
})

describe('executeWhitelistFallback', () => {
  it('returns selected outerHTML and rejects unmatched code', () => {
    document.body.innerHTML = '<x>selected</x><main>other page content</main>'
    expect(executeWhitelistFallback("document.querySelector('x').outerHTML")).toEqual({ success: true, result: '<x>selected</x>' })
    const rejected = executeWhitelistFallback('1 + 1')
    expect(rejected.success).toBe(false)
    expect(rejected.result).toBeUndefined()
    expect(rejected.error).toContain('does not exactly match')
  })

  it('refuses an expired fallback before a mutation', () => {
    document.body.innerHTML = '<button id="go">Go</button>'
    let clicks = 0
    document.querySelector('#go')!.addEventListener('click', () => { clicks++ })
    const result = executeWhitelistFallback("document.querySelector('#go').click()", Date.now())
    expect(result.success).toBe(false)
    expect(clicks).toBe(0)
  })
})
