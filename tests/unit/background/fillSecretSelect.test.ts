import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const protection = vi.hoisted(() => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  currentDocumentProtection: vi.fn(async () => null),
  preflightAndProtectDocument: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-form', generation: 1 })),
  protectTabForUnboundMutation: vi.fn(async (_tabId: number, token: unknown) => token),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
}))
const debuggerApi = vi.hoisted(() => ({
  withDebugger: vi.fn(async (tabId: number, fn: (target: { tabId: number }) => Promise<unknown>) => fn({ tabId })),
  sendDebuggerCommand: vi.fn(async () => ({})),
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  resolveAgentTab: vi.fn(async () => ({ id: 42, url: `${location.origin}/login`, status: 'complete' }))
}))
vi.mock('../../../extension/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn(async () => undefined) }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  ...protection,
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] }),
}))
vi.mock('../../../extension/background/browserMcp/debugger', () => debuggerApi)

import { sendToWebSocket } from '../../../extension/background/websocket'
import { handleBrowserFillInput } from '../../../extension/background/browserMcp/interaction'

describe('saved named-field input types', () => {
  const executeScript = vi.fn()
  const host = location.hostname.toLowerCase()
  const lastFrame = () => vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = `
      <input id="org" name="organization">
      <select id="role" name="role">
        <option value="">Choose</option>
        <option value="dispatch">Dispatch login</option>
        <option value="admin">Admin login</option>
      </select>
      <input id="remember" type="checkbox">
      <input id="password" type="password">
    `
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 10, width: 100, height: 20 } as DOMRect)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    executeScript.mockImplementation(async ({ func, args = [], target }: {
      func: (...args: any[]) => unknown
      args?: any[]
      target: chrome.scripting.InjectionTarget
    }) => [{ documentId: 'doc-form', result: await func(...args), target }])
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      tabs: {
        get: vi.fn(async () => ({ id: 42, url: `${location.origin}/login`, status: 'complete' })),
        sendMessage: vi.fn(async () => undefined),
        onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
      },
      runtime: { getPlatformInfo: vi.fn(async () => ({ os: 'linux' })) },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('selects by option value and visible label while keeping saved values out of results', async () => {
    await handleBrowserFillInput({
      requestId: 'select-value', selector: '#role', value: 'admin', tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true,
    })
    expect((document.querySelector('#role') as HTMLSelectElement).value).toBe('admin')
    expect(lastFrame()).toMatchObject({ success: true, verified: true, protected: true, selected: true })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain('admin')

    await handleBrowserFillInput({
      requestId: 'select-label', selector: '#role', value: 'Dispatch login', tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true,
    })
    expect((document.querySelector('#role') as HTMLSelectElement).value).toBe('dispatch')
    expect(lastFrame()).toMatchObject({ success: true, verified: true, protected: true, selected: true })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain('Dispatch login')
  })

  it('refuses an unknown select option with a metadata-only failure', async () => {
    await handleBrowserFillInput({
      requestId: 'select-missing', selector: '#role', value: 'SYNTHETIC-MISSING-VALUE', tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true,
    })

    expect((document.querySelector('#role') as HTMLSelectElement).value).toBe('')
    expect(lastFrame()).toMatchObject({ success: false, protected: true, error: 'Protected document fill was refused or could not be verified' })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain('SYNTHETIC-MISSING-VALUE')
  })

  it('fills text and Unicode named fields and verifies controlled persistence', async () => {
    const unicode = 'München 東京 🙂'
    await handleBrowserFillInput({
      requestId: 'unicode', selector: '#org', value: unicode, tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true,
    })
    expect((document.querySelector('#org') as HTMLInputElement).value).toBe(unicode)
    expect(lastFrame()).toMatchObject({ success: true, verified: true, protected: true })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain(unicode)

    const input = document.querySelector('#org') as HTMLInputElement
    input.addEventListener('input', () => { input.value = 'controlled-old-value' }, { once: true })
    await handleBrowserFillInput({
      requestId: 'controlled', selector: '#org', value: 'new-saved-value', tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true,
    })
    expect(lastFrame()).toMatchObject({ success: false, verified: false, protected: true })
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain('new-saved-value')
    expect(JSON.stringify(vi.mocked(sendToWebSocket).mock.calls)).not.toContain('controlled-old-value')
  })

  it('fills checkbox booleans and their legacy string spellings without coercing text fields', async () => {
    await handleBrowserFillInput({
      requestId: 'checkbox-string', selector: '#remember', value: 'true', tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true,
    })
    expect((document.querySelector('#remember') as HTMLInputElement).checked).toBe(true)
    expect(lastFrame()).toMatchObject({ success: true, verified: true, protected: true })

    await handleBrowserFillInput({ requestId: 'checkbox-boolean', selector: '#remember', value: false, tabId: 42 })
    expect((document.querySelector('#remember') as HTMLInputElement).checked).toBe(false)
    expect(lastFrame()).toMatchObject({ success: true, verified: true, protected: false, actualValue: 'false' })

    await handleBrowserFillInput({ requestId: 'text-boolean', selector: '#org', value: true, tabId: 42 })
    expect(lastFrame()).toMatchObject({ success: false, error: 'A boolean value needs a checkbox or radio input' })
  })

  it('allows named text fields when trusted permission is present but refuses an actual select before tab-wide protection', async () => {
    await handleBrowserFillInput({
      requestId: 'trusted-text', selector: '#org', value: 'named-value', tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true, trusted: true,
    })
    expect(protection.preflightAndProtectDocument).toHaveBeenCalledTimes(1)
    expect(protection.protectTabForUnboundMutation).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    await handleBrowserFillInput({
      requestId: 'trusted-select', selector: '#role', value: 'admin', tabId: 42,
      expectedHost: host, requireInput: true, allowSelect: true, trusted: true,
    })
    expect(protection.preflightAndProtectDocument).not.toHaveBeenCalled()
    expect(protection.protectTabForUnboundMutation).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false, protected: false })
  })
})
