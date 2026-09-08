import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  assertDocumentCaptureAllowed,
  assertDocumentReadCurrent,
  assertDocumentReadable,
  assertProtectedDocumentCurrent,
  canCaptureDocumentSync,
  completeManualLoginHandoff,
  currentDocumentProtection,
  markDocumentReadUncertain,
  preflightAndProtectDocument,
  protectTabForUnboundMutation,
  protectedDocumentTarget,
  resetDocumentProtectionMemoryForTests,
  runWithDocumentAdmission,
  setupDocumentLifecycle,
  subscribeToDocumentLifecycle,
  subscribeToDocumentProtection
} from '../../../extension/background/browserMcp/documentProtection'

describe('document protection boundary', () => {
  let currentDocumentId: string
  let currentFrameDocumentIds: string[]
  let tab: chrome.tabs.Tab
  let stored: Record<string, unknown>
  let onRemoved: ((tabId: number) => void) | undefined
  let onUpdated: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void) | undefined
  let onBeforeNavigate: ((details: chrome.webNavigation.WebNavigationBaseCallbackDetails) => void) | undefined
  let onCommitted: ((details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => void) | undefined
  const storageGet = vi.fn()
  const storageSet = vi.fn()
  const storageRemove = vi.fn()
  const executeScript = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    resetDocumentProtectionMemoryForTests()
    currentDocumentId = 'doc-a'
    currentFrameDocumentIds = []
    tab = { id: 42, url: 'https://app.example.com/login', status: 'complete' }
    stored = {}
    storageGet.mockImplementation(async (key: string) => ({ [key]: stored[key] }))
    storageSet.mockImplementation(async (values: Record<string, unknown>) => { Object.assign(stored, values) })
    storageRemove.mockImplementation(async (key: string) => { delete stored[key] })
    executeScript.mockImplementation(async () => [
      { frameId: 0, documentId: currentDocumentId, result: true },
      ...currentFrameDocumentIds.map((documentId, index) => ({ frameId: index + 1, documentId, result: true }))
    ])
    vi.stubGlobal('chrome', {
      tabs: {
        get: vi.fn(async () => ({ ...tab })),
        onUpdated: { addListener: vi.fn((listener) => { onUpdated = listener }) },
        onRemoved: { addListener: vi.fn((listener) => { onRemoved = listener }) }
      },
      scripting: { executeScript },
      webNavigation: {
        onBeforeNavigate: { addListener: vi.fn((listener) => { onBeforeNavigate = listener }) },
        onCommitted: { addListener: vi.fn((listener) => { onCommitted = listener }) }
      },
      storage: { session: { get: storageGet, set: storageSet, remove: storageRemove } }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('persists a document ID before notifying mutation subscribers', async () => {
    const observed: unknown[] = []
    subscribeToDocumentProtection(tabId => {
      observed.push(tabId, structuredClone(stored))
    })
    const token = await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))

    expect(token).toMatchObject({ tabId: 42, documentId: 'doc-a', generation: 1, navigationEpoch: 0 })
    expect(protectedDocumentTarget(token)).toEqual({ tabId: 42, documentIds: ['doc-a'] })
    expect(observed[0]).toBe(42)
    expect(JSON.stringify(observed)).toContain('doc-a')
    expect(JSON.stringify(stored)).not.toMatch(/password|selector|https:|login/i)
  })

  it('retains historical documents across navigation and service-worker memory reset', async () => {
    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))
    currentDocumentId = 'doc-b'
    await expect(runWithDocumentAdmission(42, () =>
      assertDocumentReadable(42, 'tabz_execute_script'))).resolves.toMatchObject({ documentId: 'doc-b' })

    currentDocumentId = 'doc-a'
    resetDocumentProtectionMemoryForTests()
    await expect(runWithDocumentAdmission(42, () =>
      assertDocumentReadable(42, 'tabz_execute_script'))).rejects.toThrow(/saved or manually entered login/)
  })

  it('keeps same-document history and hash changes protected', async () => {
    const token = await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))
    tab.url = 'https://app.example.com/home#signed-in'
    await expect(runWithDocumentAdmission(42, () =>
      assertProtectedDocumentCurrent(42, token))).resolves.toBeUndefined()
    await expect(runWithDocumentAdmission(42, () =>
      assertDocumentReadable(42, 'tabz_screenshot'))).rejects.toThrow(/navigate to a new page/)
  })

  it('serializes reads against protection and rejects stale generations', async () => {
    let releaseRead!: () => void
    const readGate = new Promise<void>(resolve => { releaseRead = resolve })
    const order: string[] = []
    const read = runWithDocumentAdmission(42, async () => {
      const token = await assertDocumentReadable(42, 'tabz_execute_script')
      order.push('read-start')
      await readGate
      await assertDocumentReadCurrent(42, token)
      order.push('read-end')
    })
    const protect = runWithDocumentAdmission(42, async () => {
      order.push('protect-start')
      return preflightAndProtectDocument(42, { reason: 'saved-fill' })
    })
    await vi.waitFor(() => expect(order).toEqual(['read-start']))
    releaseRead()
    const [, protection] = await Promise.all([read, protect])
    expect(order).toEqual(['read-start', 'read-end', 'protect-start'])

    const newer = await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))
    expect(newer.generation).toBeGreaterThan(protection.generation)
    await expect(runWithDocumentAdmission(42, () =>
      assertProtectedDocumentCurrent(42, protection))).rejects.toThrow(/changed/)
  })

  it('rejects a read that navigates away and back to the same document ID before post-check', async () => {
    const token = await runWithDocumentAdmission(42, () => assertDocumentReadable(42, 'tabz_execute_script'))
    onUpdated?.(42, { status: 'loading', url: 'https://app.example.com/intermediate' })
    onUpdated?.(42, { status: 'loading', url: tab.url })
    tab.status = 'complete'
    await expect(runWithDocumentAdmission(42, () => assertDocumentReadCurrent(42, token)))
      .rejects.toThrow(/navigated/)
  })

  it('persists uncertain reads and refuses a saved fill in that document', async () => {
    const token = await runWithDocumentAdmission(42, () =>
      assertDocumentReadable(42, 'tabz_execute_script'))
    await runWithDocumentAdmission(42, () => markDocumentReadUncertain(42, token))
    await expect(runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))).rejects.toThrow(/may still be running/)
  })

  it('fails closed for pending navigation, missing document IDs, and storage failure', async () => {
    tab.pendingUrl = 'https://app.example.com/next'
    await expect(runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))).rejects.toThrow(/navigation is pending/)
    expect(storageSet).not.toHaveBeenCalled()

    tab.pendingUrl = undefined
    executeScript.mockResolvedValue([{ frameId: 0, result: true }])
    await expect(runWithDocumentAdmission(42, () =>
      assertDocumentReadable(42, 'tabz_get_dom_tree'))).rejects.toThrow(/document ID/)

    executeScript.mockImplementation(async () => [{ frameId: 0, documentId: currentDocumentId, result: true }])
    storageGet.mockRejectedValue(new Error('storage unavailable'))
    resetDocumentProtectionMemoryForTests()
    await expect(runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))).rejects.toThrow(/storage is unavailable/)
  })

  it('uses conservative capture gates and removes state when the tab closes', async () => {
    expect(canCaptureDocumentSync(42, 'doc-a')).toBe(false)
    const token = await runWithDocumentAdmission(42, () =>
      assertDocumentCaptureAllowed(42, 'doc-a', 'console'))
    expect(canCaptureDocumentSync(42, 'doc-a')).toBe(true)
    await runWithDocumentAdmission(42, () => assertDocumentReadCurrent(42, token, { documentId: 'doc-a' }))

    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'manual-login' }))
    expect(canCaptureDocumentSync(42, 'doc-a')).toBe(false)
    await expect(runWithDocumentAdmission(42, () =>
      assertDocumentCaptureAllowed(42, 'doc-a', 'console'))).rejects.toThrow(/protected/)

    onRemoved?.(42)
    await vi.waitFor(() => expect(storageRemove).toHaveBeenCalled())
    expect(canCaptureDocumentSync(42, 'doc-a')).toBe(false)
  })

  it('refreshes an active committed document without waiting for console activity', async () => {
    const events: string[] = []
    subscribeToDocumentLifecycle(event => events.push(`${event.type}:${event.frameId}:${event.documentId ?? ''}`))
    setupDocumentLifecycle()
    onBeforeNavigate?.({ tabId: 42, frameId: 0 } as chrome.webNavigation.WebNavigationBaseCallbackDetails)
    expect(canCaptureDocumentSync(42, 'doc-reloaded')).toBe(false)
    onCommitted?.({
      tabId: 42, frameId: 0, parentFrameId: -1, documentId: 'doc-reloaded',
      documentLifecycle: 'active'
    } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)
    await vi.waitFor(() => expect(canCaptureDocumentSync(42, 'doc-reloaded')).toBe(true))
    expect(events).toEqual(expect.arrayContaining(['before-navigate:0:', 'committed:0:doc-reloaded']))
  })

  it('admits only active subframes linked to the current committed document tree', async () => {
    setupDocumentLifecycle()
    onCommitted?.({
      tabId: 42, frameId: 0, parentFrameId: -1, documentId: 'doc-main', documentLifecycle: 'active'
    } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)
    await vi.waitFor(() => expect(canCaptureDocumentSync(42, 'doc-main')).toBe(true))

    onCommitted?.({
      tabId: 42, frameId: 2, parentFrameId: 0, parentDocumentId: 'wrong-parent',
      documentId: 'child-wrong', documentLifecycle: 'active'
    } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)
    onCommitted?.({
      tabId: 42, frameId: 1, parentFrameId: 0, parentDocumentId: 'doc-main',
      documentId: 'child-active', documentLifecycle: 'active'
    } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)
    onCommitted?.({
      tabId: 42, frameId: 3, parentFrameId: 0, parentDocumentId: 'doc-main',
      documentId: 'child-prerender', documentLifecycle: 'prerender'
    } as chrome.webNavigation.WebNavigationTransitionCallbackDetails)

    expect(canCaptureDocumentSync(42, 'child-active')).toBe(true)
    expect(canCaptureDocumentSync(42, 'child-wrong')).toBe(false)
    expect(canCaptureDocumentSync(42, 'child-prerender')).toBe(false)
    onBeforeNavigate?.({ tabId: 42, frameId: 1 } as chrome.webNavigation.WebNavigationBaseCallbackDetails)
    expect(canCaptureDocumentSync(42, 'child-active')).toBe(false)
    expect(canCaptureDocumentSync(42, 'doc-main')).toBe(true)
  })

  it('allows a verified iframe event only while the current main document is readable', async () => {
    currentFrameDocumentIds = ['iframe-doc']
    const token = await runWithDocumentAdmission(42, () =>
      assertDocumentCaptureAllowed(42, 'iframe-doc', 'console'))
    expect(token.documentId).toBe('doc-a')
    await runWithDocumentAdmission(42, () =>
      assertDocumentReadCurrent(42, token, { captureDocumentId: 'iframe-doc' }))
    expect(canCaptureDocumentSync(42, 'iframe-doc')).toBe(true)

    onUpdated?.(42, { status: 'loading' })
    expect(canCaptureDocumentSync(42, 'iframe-doc')).toBe(false)
    await runWithDocumentAdmission(42, () =>
      assertDocumentCaptureAllowed(42, 'iframe-doc', 'console'))
    expect(canCaptureDocumentSync(42, 'iframe-doc')).toBe(true)

    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'manual-login' }))
    expect(canCaptureDocumentSync(42, 'iframe-doc')).toBe(false)
  })

  it('drops a delayed iframe event after its frame leaves the verified tree', async () => {
    currentFrameDocumentIds = ['iframe-old']
    await runWithDocumentAdmission(42, () => assertDocumentCaptureAllowed(42, 'iframe-old', 'network'))
    expect(canCaptureDocumentSync(42, 'iframe-old')).toBe(true)

    currentDocumentId = 'doc-new'
    currentFrameDocumentIds = ['iframe-new']
    onUpdated?.(42, { status: 'loading', url: 'https://app.example.com/next' })
    tab.url = 'https://app.example.com/next'
    tab.status = 'complete'
    await runWithDocumentAdmission(42, () => assertDocumentCaptureAllowed(42, 'iframe-new', 'network'))

    expect(canCaptureDocumentSync(42, 'iframe-old')).toBe(false)
    expect(canCaptureDocumentSync(42, 'iframe-new')).toBe(true)
    await expect(runWithDocumentAdmission(42, () =>
      assertDocumentCaptureAllowed(42, 'iframe-old', 'network'))).rejects.toThrow(/current verified frame tree/)
  })

  it('does not let a late document probe repopulate capture eligibility after navigation', async () => {
    let resolveProbe!: (value: chrome.scripting.InjectionResult[]) => void
    executeScript.mockImplementationOnce(() => new Promise(resolve => { resolveProbe = resolve }))
    const admission = runWithDocumentAdmission(42, () =>
      assertDocumentCaptureAllowed(42, 'iframe-old', 'console'))

    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(1))
    onUpdated?.(42, { status: 'loading' })
    tab.status = 'complete'
    resolveProbe([{ frameId: 0, documentId: 'doc-a', result: true }])

    await expect(admission).rejects.toThrow(/detected navigation/)
    expect(canCaptureDocumentSync(42, 'iframe-old')).toBe(false)
  })

  it('keeps CDP-style unbound input protected across every later document in the tab', async () => {
    const documentToken = await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))
    const tabToken = await runWithDocumentAdmission(42, () =>
      protectTabForUnboundMutation(42, documentToken))
    expect(tabToken.generation).toBe(documentToken.generation + 1)

    currentDocumentId = 'doc-b'
    tab.url = 'https://app.example.com/home'
    await expect(runWithDocumentAdmission(42, () =>
      assertDocumentReadable(42, 'tabz_execute_script'))).rejects.toThrow(/saved or manually entered login/)
    expect(canCaptureDocumentSync(42, 'doc-b')).toBe(false)
  })

  it('keeps manual handoff tab-wide across redirects and protects the completion document before release', async () => {
    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'manual-login' }))
    currentDocumentId = 'doc-sso'
    tab.url = 'https://identity.example.com/continue'
    onUpdated?.(42, { status: 'loading', url: tab.url })
    tab.status = 'complete'

    const redirectToken = await runWithDocumentAdmission(42, () => currentDocumentProtection(42))
    expect(redirectToken).toMatchObject({ documentId: 'doc-sso' })
    await expect(runWithDocumentAdmission(42, () => assertProtectedDocumentCurrent(42, redirectToken!)))
      .resolves.toBeUndefined()
    await expect(runWithDocumentAdmission(42, () => assertDocumentReadable(42, 'tabz_screenshot')))
      .rejects.toThrow(/saved or manually entered login/)

    await runWithDocumentAdmission(42, () => completeManualLoginHandoff(42))
    currentDocumentId = 'doc-fresh'
    tab.url = 'https://app.example.com/home'
    onUpdated?.(42, { status: 'loading', url: tab.url })
    tab.status = 'complete'
    await expect(runWithDocumentAdmission(42, () => assertDocumentReadable(42, 'tabz_execute_script')))
      .resolves.toMatchObject({ documentId: 'doc-fresh' })

    currentDocumentId = 'doc-sso'
    onUpdated?.(42, { status: 'loading' })
    tab.status = 'complete'
    await expect(runWithDocumentAdmission(42, () => assertDocumentReadable(42, 'tabz_execute_script')))
      .rejects.toThrow(/saved or manually entered login/)
  })

  it('retains the manual reservation when navigation interrupts completion', async () => {
    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'manual-login' }))
    let resolveVerification!: (value: chrome.scripting.InjectionResult[]) => void
    executeScript
      .mockImplementationOnce(async () => [{ frameId: 0, documentId: 'doc-a', result: true }])
      .mockImplementationOnce(() => new Promise(resolve => { resolveVerification = resolve }))

    const completion = runWithDocumentAdmission(42, () => completeManualLoginHandoff(42))
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(4))
    currentDocumentId = 'doc-next'
    onUpdated?.(42, { status: 'loading', url: 'https://app.example.com/next' })
    tab.url = 'https://app.example.com/next'
    tab.status = 'complete'
    resolveVerification([{ frameId: 0, documentId: 'doc-a', result: true }])

    await expect(completion).rejects.toThrow(/navigation/)
    expect(JSON.stringify(stored)).toContain('"manualHandoffProtection":true')
    await expect(runWithDocumentAdmission(42, () => assertDocumentReadable(42, 'tabz_screenshot')))
      .rejects.toThrow(/saved or manually entered login/)
  })

  it('does not persist a queued preflight after its deadline expires', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const blocker = runWithDocumentAdmission(42, () => gate)
    const preflight = runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill', expiresAt: 50 }))
    now = 51
    release()
    await blocker
    await expect(preflight).rejects.toThrow(/deadline expired/)
    expect(storageSet).not.toHaveBeenCalled()
  })

  it('keeps manual protection active if completion expires after staging', async () => {
    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'manual-login' }))
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const unsubscribe = subscribeToDocumentProtection(() => { now = 51 })
    await expect(runWithDocumentAdmission(42, () =>
      completeManualLoginHandoff(42, { expiresAt: 50 }))).rejects.toThrow(/deadline expired/)
    unsubscribe()
    expect(JSON.stringify(stored)).toContain('"manualHandoffProtection":true')
  })

  it('reports current protection without changing it', async () => {
    await expect(runWithDocumentAdmission(42, () => currentDocumentProtection(42))).resolves.toBeNull()
    await runWithDocumentAdmission(42, () => preflightAndProtectDocument(42, { reason: 'saved-fill' }))
    await expect(runWithDocumentAdmission(42, () => currentDocumentProtection(42))).resolves.toMatchObject({
      tabId: 42, documentId: 'doc-a', generation: 1
    })
  })
})
