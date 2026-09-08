import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const protection = vi.hoisted(() => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-1', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  currentDocumentProtection: vi.fn(async () => null),
  preflightAndProtectDocument: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-1', generation: 1 })),
  protectTabForUnboundMutation: vi.fn(async (_tabId: number, token: unknown) => token),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  resolveAgentTab: vi.fn(async (_agent: string | undefined, tabId?: number) => ({ id: tabId ?? 42, url: 'https://example.test/form' }))
}))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  ...protection,
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] }),
}))

import { sendToWebSocket } from '../../../extension/background/websocket'
import { handleBrowserClickElement, handleBrowserFillInput } from '../../../extension/background/browserMcp/interaction'

type Injection = { func: (...args: any[]) => unknown; args: any[] }

describe('interaction mutation verification and deadlines', () => {
  const executeScript = vi.fn()
  const addListener = vi.fn()
  const removeListener = vi.fn()
  const lastFrame = () => vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    document.body.innerHTML = ''
    Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
      configurable: true,
      get() { return this.getAttribute('contenteditable') === 'true' }
    })
    executeScript.mockImplementation(async ({ func, args = [] }: Injection) => [{ result: await func(...args), documentId: 'doc-1' }])
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      tabs: {
        get: vi.fn(async () => ({ id: 42, url: 'https://example.test/form' })),
        query: vi.fn(async () => [{ id: 42 }]),
        sendMessage: vi.fn(async () => undefined),
        onUpdated: { addListener, removeListener }
      }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('uses the native setter and verifies the settled value', async () => {
    document.body.innerHTML = '<input id="tracked" name="city">'
    const input = document.querySelector('#tracked') as HTMLInputElement
    const native = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!
    let tracked = ''
    let state = ''
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() { return native.get!.call(this) },
      set(value: string) { tracked = String(value); native.set!.call(this, value) }
    })
    input.addEventListener('input', () => {
      const current = native.get!.call(input) as string
      if (current !== tracked) state = current
      native.set!.call(input, state)
    })

    await handleBrowserFillInput({ requestId: 'fill-native', selector: '#tracked', value: 'Denver', tabId: 42 })

    expect(state).toBe('Denver')
    expect(lastFrame()).toMatchObject({ success: true, verified: true, actualValue: 'Denver', actualLength: 6, sensitive: false })
  })

  it('reports controlled replacement of the submitted value as unverified', async () => {
    document.body.innerHTML = '<input id="controlled" name="city">'
    const input = document.querySelector('#controlled') as HTMLInputElement
    input.addEventListener('input', () => { input.value = 'old-state' })

    await handleBrowserFillInput({ requestId: 'fill-controlled', selector: '#controlled', value: 'new-state', tabId: 42 })

    expect(lastFrame()).toMatchObject({ success: true, verified: false, actualValue: 'old-state', actualLength: 9 })
  })

  it('re-queries a replaced node and treats either node classification as sensitive', async () => {
    const secret = 'SYNTHETIC-REPLACEMENT-SECRET'
    document.body.innerHTML = '<input id="replace" name="city">'
    const input = document.querySelector('#replace') as HTMLInputElement
    input.addEventListener('input', () => {
      const replacement = document.createElement('input')
      replacement.id = 'replace'
      replacement.type = 'password'
      replacement.name = 'password'
      replacement.value = input.value
      input.replaceWith(replacement)
    })

    await handleBrowserFillInput({ requestId: 'fill-replaced', selector: '#replace', value: secret, tabId: 42 })

    expect(input.isConnected).toBe(false)
    expect(lastFrame()).toMatchObject({ success: true, verified: true, sensitive: true, inputType: 'password', actualLength: secret.length })
    expect(lastFrame().actualValue).toBeUndefined()
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain(secret)
  })

  it('keeps normalized browser values while omitting sensitive read-back text', async () => {
    document.body.innerHTML = '<input id="number" type="number"><input id="password" type="password">'
    const number = document.querySelector('#number') as HTMLInputElement
    number.addEventListener('input', () => { number.value = '5' })
    await handleBrowserFillInput({ requestId: 'fill-number', selector: '#number', value: '5.00', tabId: 42 })
    expect(lastFrame()).toMatchObject({ verified: true, actualValue: '5', inputType: 'number' })

    const secret = 'SYNTHETIC-PASSWORD'
    await handleBrowserFillInput({ requestId: 'fill-secret', selector: '#password', value: secret, tabId: 42 })
    expect(lastFrame()).toMatchObject({ verified: true, sensitive: true, actualLength: secret.length })
    expect(lastFrame().actualValue).toBeUndefined()
  })

  it('keeps an ordinary protected fill boolean-only and does not send an unbound highlight', async () => {
    document.body.innerHTML = '<input id="protected-city" name="city">'
    protection.currentDocumentProtection.mockResolvedValueOnce({ tabId: 42, documentId: 'doc-1', generation: 1 })

    await handleBrowserFillInput({
      requestId: 'fill-protected', selector: '#protected-city', value: 'Denver', tabId: 42
    })

    expect(lastFrame()).toEqual({
      type: 'browser-fill-input-result',
      requestId: 'fill-protected',
      success: true,
      tagName: undefined,
      inputType: undefined,
      sensitive: undefined,
      selected: undefined,
      host: undefined,
      protected: true,
      verified: true,
      verifyError: undefined,
      actualLength: undefined,
      actualValue: undefined,
      error: undefined
    })
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled()
  })

  it('uses the service-worker expiry and cannot start a delayed fill', async () => {
    document.body.innerHTML = '<input id="late">'
    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    executeScript.mockImplementationOnce(async ({ func, args }: Injection) => {
      now = args[2]
      return [{ result: await func(...args) }]
    })

    await handleBrowserFillInput({
      requestId: 'fill-late', selector: '#late', value: 'must-not-land', tabId: 42, requestTimeoutMs: 2000
    })

    expect((document.querySelector('#late') as HTMLInputElement).value).toBe('')
    expect(lastFrame()).toMatchObject({ success: false })
  })

  it('checks expiry again when a selector polling timer fires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(40_000)
    const pending = handleBrowserFillInput({
      requestId: 'fill-poll-late', selector: '#appears-late', value: 'must-not-land', tabId: 42,
      waitTimeout: 100, requestTimeoutMs: 2000
    })
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalled())

    vi.setSystemTime(40_101)
    document.body.innerHTML = '<input id="appears-late">'
    await vi.runOnlyPendingTimersAsync()
    await pending

    expect((document.querySelector('#appears-late') as HTMLInputElement).value).toBe('')
    expect(lastFrame()).toMatchObject({ success: false })
  })

  it('rechecks the deadline after focus handlers before writing', async () => {
    document.body.innerHTML = '<input id="focus-late">'
    let now = 20_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const input = document.querySelector('#focus-late') as HTMLInputElement
    input.addEventListener('focus', () => { now += 1000 })

    await handleBrowserFillInput({
      requestId: 'fill-focus-late', selector: '#focus-late', value: 'must-not-land', tabId: 42, requestTimeoutMs: 2000
    })

    expect(input.value).toBe('')
    expect(lastFrame()).toMatchObject({ success: false, error: expect.stringContaining('expired during focus') })
  })

  it('activates an HTML element exactly once and guards a delayed click', async () => {
    document.body.innerHTML = '<button id="once">Go</button>'
    const button = document.querySelector('#once') as HTMLButtonElement
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ width: 10, height: 10 } as DOMRect)
    let clicks = 0
    button.addEventListener('click', () => { clicks++ })

    await handleBrowserClickElement({ requestId: 'click-once', selector: '#once', tabId: 42 })
    expect(clicks).toBe(1)
    expect(lastFrame()).toMatchObject({ success: true })
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42, documentIds: ['doc-1'] }
    }))
    expect(protection.assertDocumentReadCurrent).toHaveBeenCalledWith(
      42, expect.objectContaining({ documentId: 'doc-1' }), { documentId: 'doc-1' }
    )

    let now = 30_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    executeScript.mockImplementationOnce(async ({ func, args }: Injection) => {
      now = args[1]
      return [{ result: await func(...args) }]
    })
    await handleBrowserClickElement({ requestId: 'click-late', selector: '#once', tabId: 42, requestTimeoutMs: 2000 })
    expect(clicks).toBe(1)
    expect(lastFrame()).toMatchObject({ success: false })
  })

  it('refuses arbitrary-selector clicks on protected documents without querying the DOM', async () => {
    protection.currentDocumentProtection.mockResolvedValueOnce({ tabId: 42, documentId: 'doc-1', generation: 1 })

    await handleBrowserClickElement({
      requestId: 'click-protected', selector: 'input[value^="SYNTHETIC"] + button', tabId: 42
    })

    expect(executeScript).not.toHaveBeenCalled()
    expect(lastFrame()).toEqual({
      type: 'browser-click-element-result',
      requestId: 'click-protected',
      success: false,
      error: 'Refused: tabz_click cannot use an arbitrary selector on a protected document; ask the user to submit or navigate'
    })
  })

  it('does not start a click whose fixed request deadline expires in the admission queue', async () => {
    let now = 10_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    protection.runWithDocumentAdmission.mockImplementationOnce(async (_tabId: number, fn: () => Promise<unknown>) => {
      now = 11_000
      return fn()
    })

    await handleBrowserClickElement({
      requestId: 'click-queued-expired', selector: '#submit', tabId: 42, requestTimeoutMs: 2000
    })

    expect(executeScript).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({
      success: false,
      error: 'Refused: the request deadline expired before click; nothing was clicked'
    })
  })

  it('reports an uncertain click without replay when exact-document execution rejects', async () => {
    executeScript.mockRejectedValueOnce(new Error('The frame was removed'))

    await handleBrowserClickElement({ requestId: 'click-uncertain', selector: '#submit', tabId: 42 })

    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(lastFrame()).toMatchObject({
      success: false,
      error: expect.stringContaining('outcome is unknown')
    })
  })
})
