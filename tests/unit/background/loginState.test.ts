import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({ resolveAgentTab: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn((_tabId: number, fn: () => Promise<unknown>) => fn()),
  preflightAndProtectDocument: vi.fn(),
  completeManualLoginHandoff: vi.fn(),
  protectedDocumentTarget: vi.fn((token: { tabId: number; documentId: string }) => ({ tabId: token.tabId, documentIds: [token.documentId] })),
  assertProtectedDocumentCurrent: vi.fn(),
  currentDocumentProtection: vi.fn(),
  assertDocumentReadable: vi.fn(),
  assertDocumentReadCurrent: vi.fn()
}))

import { sendToWebSocket } from '../../../extension/background/websocket'
import { handleBrowserLoginState } from '../../../extension/background/browserMcp/login'
import { classifyLoginState, hostOf, sanitizeLoginUrl } from '../../../extension/background/browserMcp/loginState'
import { resolveAgentTab } from '../../../extension/background/browserMcp/tabGroups'
import {
  assertDocumentReadable,
  assertProtectedDocumentCurrent,
  completeManualLoginHandoff,
  currentDocumentProtection,
  preflightAndProtectDocument
} from '../../../extension/background/browserMcp/documentProtection'

describe('manual login state', () => {
  const executeScript = vi.fn()
  const lastFrame = () => vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolveAgentTab).mockReset()
    vi.stubGlobal('chrome', { scripting: { executeScript }, tabs: { get: vi.fn() } })
    vi.mocked(currentDocumentProtection).mockResolvedValue(null)
    vi.mocked(assertDocumentReadable).mockResolvedValue({ tabId: 42, documentId: 'doc-login', generation: 0 })
    vi.mocked(preflightAndProtectDocument).mockResolvedValue({ tabId: 42, documentId: 'doc-login', generation: 1 })
    vi.mocked(completeManualLoginHandoff).mockResolvedValue({ tabId: 42, documentId: 'doc-home', generation: 4 })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('classifies credential and identifier steps without field values', () => {
    expect(classifyLoginState({
      url: 'https://id.example.com/oauth/authorize', passwordInputs: 0,
      oneTimeCodeInputs: 0, identifierInputs: 1
    })).toMatchObject({ authUrl: true, hasPasswordField: false, hasLoginForm: true })
    expect(classifyLoginState({
      url: 'https://app.example.com/home', passwordInputs: 0,
      oneTimeCodeInputs: 1, identifierInputs: 0
    })).toMatchObject({ authUrl: false, hasPasswordField: false, hasLoginForm: true })
  })

  it('strips URL credentials, query, and fragment and reports hostname only', () => {
    const raw = 'https://user:pass@app.example.com/callback?code=SYNTHETIC-CODE#access_token=SYNTHETIC-TOKEN'
    expect(sanitizeLoginUrl(raw)).toBe('https://app.example.com/callback')
    expect(hostOf(raw)).toBe('app.example.com')
    expect(JSON.stringify(classifyLoginState({
      url: raw, passwordInputs: 0, oneTimeCodeInputs: 0, identifierInputs: 0
    }))).not.toContain('SYNTHETIC')
  })

  it('probes an owned stable tab and sends counts only as booleans', async () => {
    const tab = { id: 42, url: 'https://app.example.com/login?return=SYNTHETIC', status: 'complete', groupId: 7 }
    vi.mocked(resolveAgentTab).mockResolvedValueOnce(tab).mockResolvedValueOnce(tab).mockResolvedValueOnce(tab)
    executeScript.mockResolvedValue([{ result: {
      documentUrl: tab.url, passwordInputs: 1, oneTimeCodeInputs: 0, identifierInputs: 1
    } }])

    await handleBrowserLoginState({ requestId: 'state', tabId: 42, agent: 'worker-a' })

    expect(resolveAgentTab).toHaveBeenNthCalledWith(1, 'worker-a', 42)
    expect(resolveAgentTab).toHaveBeenNthCalledWith(2, 'worker-a', 42)
    expect(lastFrame()).toMatchObject({
      type: 'browser-login-state-result', requestId: 'state', success: true,
      tabId: 42, probed: true, url: 'https://app.example.com/login',
      host: 'app.example.com', authUrl: true, hasPasswordField: true, hasLoginForm: true
    })
    expect(JSON.stringify(lastFrame())).not.toContain('SYNTHETIC')
  })

  it('persists manual handoff protection before returning success', async () => {
    const tab = { id: 42, url: 'https://app.example.com/login', status: 'complete', groupId: 7 }
    vi.mocked(resolveAgentTab).mockResolvedValue(tab)

    await handleBrowserLoginState({
      requestId: 'handoff', tabId: 42, agent: 'worker-a', beginHandoff: true, requestTimeoutMs: 5000
    })

    expect(preflightAndProtectDocument).toHaveBeenCalledWith(42, {
      reason: 'manual-login', expiresAt: expect.any(Number)
    })
    expect(assertProtectedDocumentCurrent).toHaveBeenCalledWith(
      42,
      { tabId: 42, documentId: 'doc-login', generation: 1 },
      { expiresAt: expect.any(Number) }
    )
    expect(executeScript).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: true, tabId: 42, protected: true })
  })

  it('binds value-free probes to the protected document after handoff', async () => {
    const tab = { id: 42, url: 'https://app.example.com/login#step-2', status: 'complete', groupId: 7 }
    const token = { tabId: 42, documentId: 'doc-login', generation: 3 }
    vi.mocked(resolveAgentTab).mockResolvedValue(tab)
    vi.mocked(currentDocumentProtection).mockResolvedValue(token)
    executeScript.mockResolvedValue([{ documentId: 'doc-login', result: {
      documentUrl: tab.url, passwordInputs: 1, oneTimeCodeInputs: 0, identifierInputs: 0
    } }])

    await handleBrowserLoginState({ requestId: 'protected-probe', tabId: 42, agent: 'worker-a' })

    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42, documentIds: ['doc-login'] }
    }))
    expect(assertProtectedDocumentCurrent).toHaveBeenCalledWith(42, token)
    expect(lastFrame()).toMatchObject({
      success: true, probed: true, url: 'https://app.example.com', hasPasswordField: true
    })
  })

  it('keeps a redirected login document inside the manual handoff reservation', async () => {
    const redirected = { id: 42, url: 'https://identity.example.test/sso/login', status: 'complete', groupId: 7 }
    const redirectedToken = { tabId: 42, documentId: 'doc-sso', generation: 2 }
    vi.mocked(resolveAgentTab).mockResolvedValue(redirected)
    vi.mocked(currentDocumentProtection).mockResolvedValue(redirectedToken)
    executeScript.mockResolvedValue([{ documentId: 'doc-sso', result: {
      documentUrl: redirected.url, passwordInputs: 1, oneTimeCodeInputs: 0, identifierInputs: 1
    } }])

    await handleBrowserLoginState({ requestId: 'redirected', tabId: 42, agent: 'worker-a' })

    expect(assertDocumentReadable).not.toHaveBeenCalled()
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42, documentIds: ['doc-sso'] }
    }))
    expect(assertProtectedDocumentCurrent).toHaveBeenCalledWith(42, redirectedToken)
    expect(lastFrame()).toMatchObject({
      success: true, probed: true, url: 'https://identity.example.test', host: 'identity.example.test',
      hasPasswordField: true
    })
  })

  it('protects the final clear document before completing the manual handoff', async () => {
    const tab = { id: 42, url: 'https://app.example.com/dashboard', status: 'complete', groupId: 7 }
    vi.mocked(resolveAgentTab).mockResolvedValue(tab)

    await handleBrowserLoginState({
      requestId: 'complete', tabId: 42, agent: 'worker-a', completeHandoff: true, requestTimeoutMs: 5000
    })

    expect(completeManualLoginHandoff).toHaveBeenCalledWith(42, { expiresAt: expect.any(Number) })
    expect(executeScript).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: true, tabId: 42, protected: true })
  })

  it('never reports protected when persistence fails', async () => {
    const tab = { id: 42, url: 'https://app.example.com/login', status: 'complete', groupId: 7 }
    vi.mocked(resolveAgentTab).mockResolvedValue(tab)
    vi.mocked(preflightAndProtectDocument).mockRejectedValue(new Error('Document protection could not be persisted'))

    await handleBrowserLoginState({
      requestId: 'handoff-failed', tabId: 42, agent: 'worker-a', beginHandoff: true, requestTimeoutMs: 5000
    })

    expect(lastFrame()).toMatchObject({ success: false, error: 'Document protection could not be persisted' })
    expect(lastFrame().protected).not.toBe(true)
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('does not complete a handoff after its request expired in the admission queue', async () => {
    const tab = { id: 42, url: 'https://app.example.com/dashboard', status: 'complete', groupId: 7 }
    vi.mocked(resolveAgentTab).mockResolvedValue(tab)
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValue(2000)

    try {
      await handleBrowserLoginState({
        requestId: 'expired-completion', tabId: 42, agent: 'worker-a',
        completeHandoff: true, requestTimeoutMs: 500
      })
    } finally {
      now.mockRestore()
    }

    expect(completeManualLoginHandoff).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false })
    expect(String(lastFrame().error)).toContain('expired before document admission')
  })

  it('does not replay or trust a probe when navigation changes', async () => {
    const before = { id: 42, url: 'https://app.example.com/login', status: 'complete', groupId: 7 }
    const after = { ...before, url: 'https://app.example.com/home' }
    vi.mocked(resolveAgentTab).mockResolvedValueOnce(before).mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    executeScript.mockResolvedValue([{ result: {
      documentUrl: before.url, passwordInputs: 1, oneTimeCodeInputs: 0, identifierInputs: 0
    } }])

    await handleBrowserLoginState({ requestId: 'moved', agent: 'worker-a' })

    expect(executeScript).toHaveBeenCalledTimes(1)
    expect(lastFrame()).toMatchObject({
      success: true, probed: false, url: 'https://app.example.com/home',
      hasPasswordField: false, hasLoginForm: false
    })
  })

  it('skips injection while loading and refuses pending internal navigation', async () => {
    const loading = { id: 42, url: 'https://app.example.com/login', status: 'loading', groupId: 7 }
    vi.mocked(resolveAgentTab).mockResolvedValueOnce(loading).mockResolvedValueOnce(loading).mockResolvedValueOnce(loading)
    await handleBrowserLoginState({ requestId: 'loading', agent: 'worker-a' })
    expect(executeScript).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: true, probed: false, tabStatus: 'loading' })

    vi.mocked(sendToWebSocket).mockClear()
    vi.mocked(resolveAgentTab).mockReset().mockResolvedValue({
      id: 42, url: 'https://app.example.com/', pendingUrl: 'chrome-extension://fixture/dashboard/index.html',
      status: 'loading', groupId: 7
    })
    await handleBrowserLoginState({ requestId: 'internal', agent: 'worker-a' })
    expect(lastFrame()).toMatchObject({ success: false })
    expect(String(lastFrame().error)).toContain('chrome-extension://')
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('fails closed when ownership is lost after the probe', async () => {
    vi.mocked(resolveAgentTab)
      .mockResolvedValueOnce({ id: 42, url: 'https://app.example.com/login', status: 'complete', groupId: 7 })
      .mockResolvedValueOnce({ id: 42, url: 'https://app.example.com/login', status: 'complete', groupId: 7 })
      .mockRejectedValueOnce(new Error('Tab 42 is not in your group'))
    executeScript.mockResolvedValue([{ result: {
      documentUrl: 'https://app.example.com/login', passwordInputs: 0,
      oneTimeCodeInputs: 0, identifierInputs: 1
    } }])

    await handleBrowserLoginState({ requestId: 'lost', agent: 'worker-a' })
    expect(lastFrame()).toMatchObject({ success: false, error: 'Tab 42 is not in your group' })
  })
})
