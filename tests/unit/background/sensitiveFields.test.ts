import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-1', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  currentDocumentProtection: vi.fn(async () => null),
  preflightAndProtectDocument: vi.fn(),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
  protectTabForUnboundMutation: vi.fn(),
  protectedDocumentTarget: vi.fn((token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] }))
}))

import { sendToWebSocket } from '../../../extension/background/websocket'
import { assertDocumentReadable, assertDocumentReadCurrent } from '../../../extension/background/browserMcp/documentProtection'
import { handleBrowserFillInput, handleBrowserGetElementInfo } from '../../../extension/background/browserMcp/interaction'
import { isSensitiveInput } from '../../../extension/background/browserMcp/sensitiveFields'

const SENTINEL = "SENTINEL-'" + 'x'.repeat(5100)

beforeEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
  vi.stubGlobal('chrome', {
    tabs: {
      query: vi.fn().mockResolvedValue([{ id: 42 }]),
      get: vi.fn().mockResolvedValue({ id: 42, url: 'https://example.test/form' }),
      sendMessage: vi.fn().mockResolvedValue(undefined)
    },
    scripting: {
      executeScript: vi.fn(async ({ func, args }) => [{ result: await func(...args), documentId: 'doc-1' }])
    }
  })
})

describe('sensitive field detection', () => {
  it('detects passwords, tokens, one-time codes, and payment fields', () => {
    expect(isSensitiveInput('input', 'password', 'q', 'q', undefined)).toBe(true)
    for (const value of ['password', 'pwd', 'user-secret', 'api-token', 'otp-code', 'mfa-code', 'api_key', 'cvv', 'cc-number', 'card-number']) {
      expect(isSensitiveInput('input', 'text', value, undefined, undefined), value).toBe(true)
    }
    expect(isSensitiveInput('input', 'text', 'code', 'code', 'one-time-code')).toBe(true)
    expect(isSensitiveInput('textarea', undefined, 'secret-notes', undefined, undefined)).toBe(true)
    expect(isSensitiveInput('input', 'text', 'email', 'email', 'email')).toBe(false)
  })

  it('classifies an actual password fill before the WebSocket result is sent', async () => {
    document.body.innerHTML = '<input id="password" type="password">'
    await handleBrowserFillInput({ requestId: 'fill-1', selector: '#password', value: SENTINEL, tabId: 42 })
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-fill-input-result',
      requestId: 'fill-1',
      success: true,
      inputType: 'password',
      sensitive: true
    }))
  })

  it('sanitizes long quoted inputs and nested sensitive editable text before serialization', async () => {
    const form = document.createElement('form')
    form.innerHTML = `<input name="email" value="a@example.test"><input type="password" value="${SENTINEL}"><div contenteditable="true" name="api-token">${SENTINEL}</div><span>Useful label</span>`
    document.body.append(form)
    await handleBrowserGetElementInfo({ requestId: 'inspect-1', selector: 'form', tabId: 42, includeStyles: false })
    const result = vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0]
    expect(JSON.stringify(result)).not.toContain(SENTINEL)
    expect(result).toMatchObject({ type: 'browser-get-element-info-result', success: true })
    expect(result.outerHTML).toContain('value="[redacted]"')
    expect(result.outerHTML).toContain('Useful label')
    expect(result.innerText).toContain('Useful label')
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42, documentIds: ['doc-1'] }
    }))
    expect(assertDocumentReadCurrent).toHaveBeenCalledWith(42, expect.objectContaining({ documentId: 'doc-1' }), { documentId: 'doc-1' })
  })

  it('redacts standard one-time-code fields during fill and inspection', async () => {
    const secret = 'SYNTHETIC-OTP-123456'
    document.body.innerHTML = `<input id="code" autocomplete="one-time-code" value="${secret}">`
    await handleBrowserFillInput({ requestId: 'otp-fill', selector: '#code', value: secret, tabId: 42 })
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'otp-fill', success: true, sensitive: true,
    }))
    await handleBrowserGetElementInfo({ requestId: 'otp-read', selector: '#code', tabId: 42 })
    const result = vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0]
    expect(result).toMatchObject({ success: true })
    expect(JSON.stringify(result)).not.toContain(secret)
  })

  it('refuses extension pages before filling or inspecting them', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({
      id: 42,
      url: 'https://example.test/form',
      pendingUrl: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/dashboard/index.html'
    })
    await handleBrowserFillInput({ requestId: 'fill-refused', selector: '#password', value: SENTINEL, tabId: 42 })
    await handleBrowserGetElementInfo({ requestId: 'inspect-refused', selector: 'body', tabId: 42 })
    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    const frames = vi.mocked(sendToWebSocket).mock.calls.map(call => call[0])
    expect(frames).toHaveLength(2)
    expect(frames.every(frame => frame.success === false && String(frame.error).includes('Refused'))).toBe(true)
  })

  it('refuses element inspection before DOM access when document admission rejects', async () => {
    document.body.innerHTML = `<div id="account">${SENTINEL}</div>`
    vi.mocked(assertDocumentReadable).mockRejectedValueOnce(new Error('protected document'))

    await handleBrowserGetElementInfo({ requestId: 'inspect-protected', selector: '#account', tabId: 42 })

    expect(chrome.scripting.executeScript).not.toHaveBeenCalled()
    expect(assertDocumentReadCurrent).not.toHaveBeenCalled()
    const result = vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0]
    expect(result).toMatchObject({ success: false, error: 'protected document' })
    expect(JSON.stringify(result)).not.toContain(SENTINEL)
  })

  it('drops inspection content when Chrome omits document identity or navigation invalidates it', async () => {
    document.body.innerHTML = `<div id="account">${SENTINEL}</div>`
    const executeScript = vi.mocked(chrome.scripting.executeScript)
    executeScript.mockImplementationOnce(async ({ func, args }) => [{ result: await func!(...args!) }])

    await handleBrowserGetElementInfo({ requestId: 'inspect-no-document', selector: '#account', tabId: 42 })
    let result = vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0]
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('Chrome document') })
    expect(JSON.stringify(result)).not.toContain(SENTINEL)

    vi.mocked(assertDocumentReadCurrent).mockRejectedValueOnce(new Error('The page navigated before the browser read could be verified'))
    await handleBrowserGetElementInfo({ requestId: 'inspect-navigation', selector: '#account', tabId: 42 })
    result = vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0]
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('navigated') })
    expect(JSON.stringify(result)).not.toContain(SENTINEL)
  })
})
