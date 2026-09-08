import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  resolveAgentTab: vi.fn(),
  assertOwned: vi.fn(),
  runAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertReadable: vi.fn(),
  assertCurrent: vi.fn(),
  markUncertain: vi.fn()
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: mocks.send }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  subscribeToTabOwnershipChanges: vi.fn(() => () => undefined),
  resolveAgentTab: mocks.resolveAgentTab,
  assertTabInAgentGroup: mocks.assertOwned
}))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: mocks.runAdmission,
  assertDocumentReadable: mocks.assertReadable,
  assertDocumentReadCurrent: mocks.assertCurrent,
  markDocumentReadUncertain: mocks.markUncertain,
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({
    tabId: token.tabId,
    documentIds: [token.documentId]
  })
}))

import {
  clearPageRefsForTab,
  handleBrowserReadPage,
  readPageDocument,
  rememberPageRefs,
  resetPageRefsForTests,
  resolvePageRef,
  setupPageRefPruning
} from '../../../extension/background/browserMcp/pageRefs'

describe('compact page refs', () => {
  const executeScript = vi.fn()
  const updatedListeners: Array<(tabId: number, info: chrome.tabs.TabChangeInfo) => void> = []
  const removedListeners: Array<(tabId: number) => void> = []

  beforeEach(() => {
    vi.clearAllMocks()
    resetPageRefsForTests()
    updatedListeners.length = 0
    removedListeners.length = 0
    mocks.resolveAgentTab.mockResolvedValue({ id: 42, url: 'https://example.test/form' })
    mocks.assertReadable.mockResolvedValue({ tabId: 42, documentId: 'doc-a', generation: 0, navigationEpoch: 0 })
    executeScript.mockImplementation(async ({ func, args = [] }: { func: (...args: unknown[]) => unknown; args?: unknown[] }) => [{
      frameId: 0,
      documentId: 'doc-a',
      result: await func(...args)
    }])
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      tabs: {
        onUpdated: { addListener: vi.fn(fn => updatedListeners.push(fn)) },
        onRemoved: { addListener: vi.fn(fn => removedListeners.push(fn)) }
      }
    })
    document.title = 'Fixture page'
    document.body.innerHTML = `
      <button aria-label="Save changes">ignored text</button>
      <label>Email <input id="email"></label>
      <label>Password <input id="password" type="password" value="SYNTHETIC-SECRET"></label>
      <a href="/details">View details</a>
      <div>ordinary prose is omitted</div>`
    Element.prototype.getBoundingClientRect = () => ({
      x: 1, y: 2, left: 1, top: 2, width: 100, height: 20,
      right: 101, bottom: 22, toJSON() { return {} }
    }) as DOMRect
  })

  it('publishes a bounded interactive outline without field values or prose', () => {
    const result = readPageDocument('ref_fixture_', 2000)

    expect(result.nodeCount).toBe(4)
    expect(result.text).toContain('button "Save changes" [ref=ref_fixture_1]')
    expect(result.text).toContain('textbox "Password" [ref=ref_fixture_3]')
    expect(result.text).not.toContain('SYNTHETIC-SECRET')
    expect(result.text).not.toContain('ordinary prose')
  })

  it('binds refs to the exact caller and document and replaces them on reread', () => {
    rememberPageRefs(42, ['ref-old'], { agent: 'alpha', documentId: 'doc-a' })
    expect(resolvePageRef(42, 'ref-old', { agent: 'alpha', documentId: 'doc-a' }))
      .toBe('[data-tabz-ref="ref-old"]')
    expect(() => resolvePageRef(42, 'ref-old', { agent: 'beta', documentId: 'doc-a' })).toThrow(/stale or unknown/)
    expect(() => resolvePageRef(42, 'ref-old', { agent: 'alpha', documentId: 'doc-b' })).toThrow(/stale or unknown/)

    rememberPageRefs(42, ['ref-new'], { agent: 'alpha', documentId: 'doc-a' })
    expect(() => resolvePageRef(42, 'ref-old', { agent: 'alpha', documentId: 'doc-a' })).toThrow(/read_page again/)
  })

  it('invalidates refs on navigation and tab removal', () => {
    setupPageRefPruning()
    rememberPageRefs(42, ['ref-nav'], { agent: 'alpha', documentId: 'doc-a' })
    updatedListeners[0](42, { status: 'loading' })
    expect(() => resolvePageRef(42, 'ref-nav', { agent: 'alpha', documentId: 'doc-a' })).toThrow(/stale/)

    rememberPageRefs(42, ['ref-close'], { agent: 'alpha', documentId: 'doc-a' })
    removedListeners[0](42)
    expect(() => resolvePageRef(42, 'ref-close', { agent: 'alpha', documentId: 'doc-a' })).toThrow(/stale/)
  })

  it('runs one admitted exact-document read and publishes refs only after final checks', async () => {
    await handleBrowserReadPage({ requestId: 'read-1', tabId: 42, agent: 'alpha', maxChars: 1200 })

    expect(mocks.runAdmission).toHaveBeenCalledTimes(1)
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({
      target: { tabId: 42, documentIds: ['doc-a'] }
    }))
    expect(mocks.assertCurrent).toHaveBeenCalledWith(expect.objectContaining({}), expect.objectContaining({ documentId: 'doc-a' }), { documentId: 'doc-a' })
    expect(mocks.assertOwned).toHaveBeenCalledTimes(2)
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-read-page-result', requestId: 'read-1', success: true, tabId: 42, refCount: 4
    }))
  })

  it('clears the prior publication when a reread fails', async () => {
    rememberPageRefs(42, ['ref-old'], { agent: 'alpha', documentId: 'doc-a' })
    executeScript.mockRejectedValueOnce(new Error('synthetic read failure'))

    await handleBrowserReadPage({ requestId: 'read-fail', tabId: 42, agent: 'alpha' })

    expect(() => resolvePageRef(42, 'ref-old', { agent: 'alpha', documentId: 'doc-a' })).toThrow(/stale/)
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-read-page-result', requestId: 'read-fail', success: false
    }))
  })

  it('times out a stalled read, records uncertainty, and never publishes its late refs', async () => {
    let finishLate!: (value: chrome.scripting.InjectionResult[]) => void
    executeScript.mockImplementationOnce(() => new Promise(resolve => { finishLate = resolve }))

    await handleBrowserReadPage({
      requestId: 'read-timeout', tabId: 42, agent: 'alpha', requestTimeoutMs: 1005
    })

    expect(mocks.markUncertain).toHaveBeenCalledWith(42, expect.objectContaining({ documentId: 'doc-a' }))
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-read-page-result', success: false, error: expect.stringMatching(/deadline expired/)
    }))

    finishLate([{ frameId: 0, documentId: 'doc-a', result: {
      text: 'late', refs: ['ref-late'], nodeCount: 1, truncated: false, title: '', url: ''
    } }])
    await Promise.resolve()
    expect(() => resolvePageRef(42, 'ref-late', { agent: 'alpha', documentId: 'doc-a' })).toThrow(/stale/)
  })
})
