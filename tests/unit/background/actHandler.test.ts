import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  captureInline: vi.fn(),
  resolveAgentTab: vi.fn(),
  assertOwned: vi.fn(),
  runAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertReadable: vi.fn(),
  assertCurrent: vi.fn(),
  assertProtected: vi.fn(),
  currentProtection: vi.fn(),
  markUncertain: vi.fn(),
  withDebugger: vi.fn(),
  sendDebuggerCommand: vi.fn()
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: mocks.send }))
vi.mock('../../../extension/background/browserMcp/screenshots', () => ({ captureViewportInline: mocks.captureInline }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  subscribeToTabOwnershipChanges: vi.fn(() => () => undefined),
  resolveAgentTab: mocks.resolveAgentTab,
  assertTabInAgentGroup: mocks.assertOwned
}))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: mocks.runAdmission,
  assertDocumentReadable: mocks.assertReadable,
  assertDocumentReadCurrent: mocks.assertCurrent,
  assertProtectedDocumentCurrent: mocks.assertProtected,
  currentDocumentProtection: mocks.currentProtection,
  markDocumentReadUncertain: mocks.markUncertain,
  protectedDocumentTarget: (token: { tabId: number; documentId: string }) => ({
    tabId: token.tabId,
    documentIds: [token.documentId]
  })
}))
vi.mock('../../../extension/background/browserMcp/debugger', () => ({
  withDebugger: mocks.withDebugger,
  sendDebuggerCommand: mocks.sendDebuggerCommand
}))

import {
  clickProtectedPageRef,
  handleBrowserAct,
  locateActTarget,
  performPageAction,
  type PageActSpec
} from '../../../extension/background/browserMcp/act'
import { rememberPageRefs, resetPageRefsForTests } from '../../../extension/background/browserMcp/pageRefs'

describe('compact page actions', () => {
  const executeScript = vi.fn()
  const lastFrame = () => mocks.send.mock.calls.at(-1)?.[0] as Record<string, unknown>

  function spec(action: PageActSpec['action'], overrides: Partial<PageActSpec> = {}): PageActSpec {
    return {
      action,
      selector: null,
      text: null,
      x: null,
      y: null,
      value: null,
      key: null,
      repeat: 1,
      modifiers: null,
      direction: null,
      ticks: 3,
      toX: null,
      toY: null,
      toSelector: null,
      timeout: 5000,
      modifierFlags: { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false },
      keyDescriptors: [],
      located: null,
      ...overrides
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    resetPageRefsForTests()
    mocks.resolveAgentTab.mockResolvedValue({ id: 42, url: 'https://example.test/form' })
    mocks.assertReadable.mockResolvedValue({ tabId: 42, documentId: 'doc-a', generation: 0, navigationEpoch: 0 })
    mocks.currentProtection.mockResolvedValue(null)
    mocks.markUncertain.mockResolvedValue(undefined)
    mocks.withDebugger.mockImplementation(async (_tabId: number, fn: (target: chrome.debugger.Debuggee) => Promise<unknown>) => fn({ tabId: 42 }))
    mocks.sendDebuggerCommand.mockResolvedValue({})
    executeScript.mockImplementation(async ({ func, args = [] }: { func: (...args: unknown[]) => unknown; args?: unknown[] }) => [{
      frameId: 0,
      documentId: 'doc-a',
      result: await func(...args)
    }])
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      tabs: {
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() }
      }
    })
    document.body.innerHTML = `
      <button id="save">Save</button>
      <input id="name" name="name">
      <input id="password" name="password" type="password">
      <textarea id="notes"></textarea>`
    Element.prototype.getBoundingClientRect = () => ({
      x: 10, y: 20, left: 10, top: 20, width: 100, height: 40,
      right: 110, bottom: 60, toJSON() { return {} }
    }) as DOMRect
    Element.prototype.scrollIntoView = vi.fn()
    ;(document as Document & { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => document.querySelector('#save')
  })

  it('types at the focused selection and reports the whole-field verification', async () => {
    const input = document.querySelector('#name') as HTMLInputElement
    input.value = 'alpha omega'
    input.setSelectionRange(6, 11)
    input.focus()
    const action = spec('type', {
      value: 'beta',
      keyDescriptors: Array.from('beta').map(key => ({
        key, code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), printable: true,
        flags: { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
      }))
    })
    action.located = await locateActTarget(action)

    const outcome = await performPageAction(action)

    expect(input.value).toBe('alpha beta')
    expect(outcome.field).toMatchObject({ actualValue: 'alpha beta', expectedValue: 'alpha beta' })
  })

  it('deletes one complete Unicode grapheme rather than one UTF-16 code unit', async () => {
    const input = document.querySelector('#name') as HTMLInputElement
    const joined = '👩🏽\u200d💻'
    input.value = `A${joined}B`
    input.setSelectionRange(1 + joined.length, 1 + joined.length)
    const action = spec('key', {
      selector: '#name',
      key: 'Backspace',
      keyDescriptors: [{
        key: 'Backspace', code: 'Backspace', keyCode: 8, printable: false,
        flags: { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
      }]
    })
    action.located = await locateActTarget(action)

    await performPageAction(action)

    expect(input.value).toBe('AB')
    expect(input.selectionStart).toBe(1)
  })

  it('keeps simultaneous synthetic target handoffs isolated per request', async () => {
    const first = spec('click', { selector: '#save', handoffToken: 'request-one' })
    const second = spec('click', { selector: '#name', handoffToken: 'request-two' })
    const button = document.querySelector('#save') as HTMLButtonElement
    const input = document.querySelector('#name') as HTMLInputElement
    const buttonClick = vi.fn()
    const inputClick = vi.fn()
    button.addEventListener('click', buttonClick)
    input.addEventListener('click', inputClick)

    first.located = await locateActTarget(first)
    second.located = await locateActTarget(second)
    await performPageAction(first)
    await performPageAction(second)

    expect(buttonClick).toHaveBeenCalledTimes(1)
    expect(inputClick).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-tabz-act-handoff]')).toBeNull()
  })

  it('preserves single, double, triple, right-click, hover, and modifier event semantics', async () => {
    const button = document.querySelector('#save') as HTMLButtonElement
    const observed: Array<{ type: string; detail: number; button: number; ctrlKey: boolean }> = []
    for (const type of ['click', 'dblclick', 'contextmenu', 'pointerover', 'mouseover']) {
      button.addEventListener(type, event => {
        const mouse = event as MouseEvent
        observed.push({ type, detail: mouse.detail, button: mouse.button, ctrlKey: mouse.ctrlKey })
      })
    }
    const run = async (action: PageActSpec['action'], modifiers?: PageActSpec['modifierFlags']) => {
      const current = spec(action, {
        selector: '#save',
        handoffToken: `handoff-${action}-${observed.length}`,
        ...(modifiers ? { modifierFlags: modifiers } : {})
      })
      current.located = await locateActTarget(current)
      return performPageAction(current)
    }

    await run('click')
    await run('double_click')
    await run('triple_click')
    await run('right_click')
    await run('hover')
    await run('click', { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false })

    expect(observed.filter(event => event.type === 'click')).toHaveLength(1 + 2 + 3 + 1)
    expect(observed.filter(event => event.type === 'dblclick')).toHaveLength(2)
    expect(observed.filter(event => event.type === 'contextmenu')).toEqual([
      expect.objectContaining({ button: 2 })
    ])
    expect(observed.some(event => event.type === 'pointerover')).toBe(true)
    expect(observed.at(-1)).toMatchObject({ type: 'click', ctrlKey: true })
  })

  it('applies repeated editing keys with modifiers and leaves readonly or disabled fields unchanged', async () => {
    const input = document.querySelector('#name') as HTMLInputElement
    const backspace = {
      key: 'Backspace', code: 'Backspace', keyCode: 8, printable: false,
      flags: { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
    }
    input.value = 'A😀B'
    input.setSelectionRange(3, 3)
    const repeat = spec('key', { selector: '#name', repeat: 2, keyDescriptors: [backspace], handoffToken: 'repeat' })
    repeat.located = await locateActTarget(repeat)
    await performPageAction(repeat)
    expect(input.value).toBe('B')

    input.value = 'alpha'
    input.readOnly = true
    input.setSelectionRange(5, 5)
    const readonly = spec('key', { selector: '#name', keyDescriptors: [backspace], handoffToken: 'readonly' })
    readonly.located = await locateActTarget(readonly)
    await performPageAction(readonly)
    expect(input.value).toBe('alpha')

    input.readOnly = false
    input.disabled = true
    const disabledType = spec('type', {
      selector: '#name', value: 'secret', handoffToken: 'disabled',
      keyDescriptors: Array.from('secret').map(key => ({
        key, code: `Key${key.toUpperCase()}`, keyCode: key.toUpperCase().charCodeAt(0), printable: true,
        flags: { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
      }))
    })
    disabledType.located = await locateActTarget(disabledType)
    expect(await performPageAction(disabledType)).toMatchObject({ success: false, error: expect.stringMatching(/not editable/) })
    expect(input.value).toBe('alpha')
  })

  it('supports targetless scrolling, explicit scroll-to, and drag endpoints', async () => {
    const scrollBy = vi.fn()
    const scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollBy', { configurable: true, value: scrollBy })
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 600 })

    const scroll = spec('scroll', { direction: 'down', ticks: 2 })
    scroll.located = await locateActTarget(scroll)
    expect(await performPageAction(scroll)).toMatchObject({ success: true, events: ['wheel'] })
    expect(scrollBy).toHaveBeenCalledWith({ left: 0, top: 200 })

    const scrollToTarget = spec('scroll_to', { selector: '#save', handoffToken: 'scroll-to' })
    scrollToTarget.located = await locateActTarget(scrollToTarget)
    expect(await performPageAction(scrollToTarget)).toMatchObject({ success: true, tagName: 'button' })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()

    const drag = spec('drag', { selector: '#save', toSelector: '#name', handoffToken: 'drag' })
    drag.located = await locateActTarget(drag)
    const dragged = await performPageAction(drag)
    expect(dragged).toMatchObject({ success: true })
    expect(dragged.events).toEqual(expect.arrayContaining(['pointerdown', 'mousedown', 'pointerup', 'mouseup']))
  })

  it('refuses an aged injected action before click or typing', async () => {
    const button = document.querySelector('#save') as HTMLButtonElement
    const input = document.querySelector('#name') as HTMLInputElement
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    const click = spec('click', { selector: '#save', handoffToken: 'expired-click', expiresAt: Date.now() - 1 })
    click.located = { found: true, x: 60, y: 40, tagName: 'button', description: 'button', devicePixelRatio: 1, targetGiven: true }
    const typed = spec('type', {
      selector: '#name', value: 'late', handoffToken: 'expired-type', expiresAt: Date.now() - 1,
      located: { found: true, x: 60, y: 40, tagName: 'input', description: 'input', devicePixelRatio: 1, targetGiven: true },
      keyDescriptors: []
    })

    expect(await performPageAction(click)).toMatchObject({ success: false, error: expect.stringMatching(/deadline expired/) })
    expect(await performPageAction(typed)).toMatchObject({ success: false, error: expect.stringMatching(/deadline expired/) })
    expect(clicked).not.toHaveBeenCalled()
    expect(input.value).toBe('')
  })

  it('permits only an exact prepublished ref for a protected synthetic submit across protection generations', async () => {
    const button = document.querySelector('#save') as HTMLButtonElement
    button.setAttribute('data-tabz-ref', 'ref-submit')
    rememberPageRefs(42, ['ref-submit'], { agent: 'alpha', documentId: 'doc-a' })
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    mocks.currentProtection
      .mockResolvedValueOnce({ tabId: 42, documentId: 'doc-a', generation: 1, navigationEpoch: 0 })
      .mockResolvedValueOnce({ tabId: 42, documentId: 'doc-a', generation: 3, navigationEpoch: 0 })

    await handleBrowserAct({ requestId: 'protected-1', action: 'click', ref: 'ref-submit', tabId: 42, agent: 'alpha' })
    await handleBrowserAct({ requestId: 'protected-2', action: 'click', ref: 'ref-submit', tabId: 42, agent: 'alpha' })

    expect(clicked).toHaveBeenCalledTimes(2)
    expect(executeScript.mock.calls.map(([call]) => call.func)).toEqual([
      clickProtectedPageRef,
      clickProtectedPageRef
    ])
    expect(mocks.send.mock.calls.map(([frame]) => frame)).toEqual([
      expect.objectContaining({ success: true, protected: true, verified: true, tabId: 42 }),
      expect.objectContaining({ success: true, protected: true, verified: true, tabId: 42 })
    ])
  })

  it('refuses protected selectors and trusted refs without general locator or recovery reads', async () => {
    mocks.currentProtection.mockResolvedValue({ tabId: 42, documentId: 'doc-a', generation: 2, navigationEpoch: 0 })
    rememberPageRefs(42, ['ref-submit'], { agent: 'alpha', documentId: 'doc-a' })

    await handleBrowserAct({ requestId: 'protected-selector', action: 'click', selector: '#save', tabId: 42, agent: 'alpha' })
    await handleBrowserAct({ requestId: 'protected-trusted', action: 'click', ref: 'ref-submit', trusted: true, tabId: 42, agent: 'alpha' })
    await handleBrowserAct({ requestId: 'protected-observe', action: 'click', ref: 'ref-submit', observe: true, tabId: 42, agent: 'alpha' })
    expect(mocks.captureInline).not.toHaveBeenCalled()

    expect(executeScript).not.toHaveBeenCalled()
    for (const [frame] of mocks.send.mock.calls) {
      expect(frame).toMatchObject({ success: false, protected: true, verified: false })
      expect(frame).not.toHaveProperty('target')
      expect(frame).not.toHaveProperty('recovery')
    }
  })

  it('reports unknown when a protected dispatch returns no boolean result for the matching document', async () => {
    mocks.currentProtection.mockResolvedValue({ tabId: 42, documentId: 'doc-a', generation: 2, navigationEpoch: 0 })
    rememberPageRefs(42, ['ref-submit'], { agent: 'alpha', documentId: 'doc-a' })
    executeScript.mockResolvedValueOnce([{ frameId: 0, documentId: 'doc-a', result: undefined }])

    await handleBrowserAct({ requestId: 'protected-missing-result', action: 'click', ref: 'ref-submit', tabId: 42, agent: 'alpha' })

    expect(lastFrame()).toMatchObject({
      success: null,
      status: 'unknown',
      protected: true,
      verified: false,
      tabId: 42,
      error: expect.stringMatching(/outcome is unknown/)
    })
  })

  it('runs document admission before debugger attachment for trusted input', async () => {
    const order: string[] = []
    mocks.assertReadable.mockImplementation(async () => {
      order.push('document')
      return { tabId: 42, documentId: 'doc-a', generation: 0, navigationEpoch: 0 }
    })
    mocks.withDebugger.mockImplementation(async (_tabId: number, fn: (target: chrome.debugger.Debuggee) => Promise<unknown>) => {
      order.push('debugger')
      return fn({ tabId: 42 })
    })

    await handleBrowserAct({ requestId: 'trusted-click', action: 'click', selector: '#save', trusted: true, tabId: 42 })

    expect(mocks.runAdmission).toHaveBeenCalledTimes(1)
    expect(order.slice(0, 2)).toEqual(['document', 'debugger'])
    expect(mocks.sendDebuggerCommand).toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: true, trusted: true, tabId: 42 })
  })

  it('does not let another caller use a ref published for the same tab and document', async () => {
    const button = document.querySelector('#save') as HTMLButtonElement
    button.setAttribute('data-tabz-ref', 'ref-alpha')
    rememberPageRefs(42, ['ref-alpha'], { agent: 'alpha', documentId: 'doc-a' })
    const clicked = vi.fn()
    button.addEventListener('click', clicked)

    await handleBrowserAct({ requestId: 'wrong-owner', action: 'click', ref: 'ref-alpha', tabId: 42, agent: 'beta' })

    expect(clicked).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false, error: expect.stringMatching(/stale or unknown/) })
    expect(executeScript).not.toHaveBeenCalled()
  })

  it('focuses an explicit typing target and lets a later targetless key use that focus', async () => {
    const input = document.querySelector('#name') as HTMLInputElement
    const notes = document.querySelector('#notes') as HTMLTextAreaElement
    notes.focus()

    await handleBrowserAct({ requestId: 'focus-explicit', action: 'type', selector: '#name', value: 'ab', tabId: 42 })
    await handleBrowserAct({ requestId: 'focus-targetless', action: 'key', key: 'Backspace', tabId: 42 })

    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('a')
    expect(lastFrame()).toMatchObject({ success: true, action: 'key', target: { tagName: 'input' } })
  })

  it('refuses trusted point dispatch when another element covers the located target', async () => {
    const overlay = document.createElement('div')
    overlay.id = 'overlay'
    document.body.append(overlay)
    ;(document as Document & { elementFromPoint: (x: number, y: number) => Element | null }).elementFromPoint = () => overlay

    await handleBrowserAct({ requestId: 'covered', action: 'click', selector: '#save', trusted: true, tabId: 42 })

    expect(mocks.withDebugger).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false, recovery: { covering: { tag: 'div' } } })
    expect(String(lastFrame().error)).toContain('covered')
  })

  it('reports an explicit unknown result after dispatch loses final document verification and never replays', async () => {
    const button = document.querySelector('#save') as HTMLButtonElement
    const clicked = vi.fn()
    button.addEventListener('click', clicked)
    mocks.assertCurrent
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('document navigated'))

    await handleBrowserAct({ requestId: 'unknown-click', action: 'click', selector: '#save', tabId: 42 })

    expect(clicked).toHaveBeenCalledTimes(1)
    expect(lastFrame()).toMatchObject({ success: null, status: 'unknown', tabId: 42 })
    expect(executeScript.mock.calls.filter(([call]) => call.func === performPageAction)).toHaveLength(1)
    expect(mocks.markUncertain).toHaveBeenCalledWith(42, expect.objectContaining({ documentId: 'doc-a' }))
  })

  it('quarantines a stalled locator at the fixed request deadline and never dispatches late', async () => {
    let finishLate!: (value: chrome.scripting.InjectionResult[]) => void
    executeScript.mockImplementationOnce(() => new Promise(resolve => { finishLate = resolve }))

    await handleBrowserAct({
      requestId: 'late-locator', action: 'click', selector: '#save', tabId: 42, requestTimeoutMs: 1005
    })

    expect(lastFrame()).toMatchObject({ success: false, tabId: 42, error: expect.stringMatching(/deadline expired/) })
    expect(mocks.markUncertain).toHaveBeenCalledWith(42, expect.objectContaining({ documentId: 'doc-a' }))
    expect(executeScript.mock.calls.filter(([call]) => call.func === performPageAction)).toHaveLength(0)

    finishLate([{ frameId: 0, documentId: 'doc-a', result: {
      found: true, x: 60, y: 40, tagName: 'button', description: 'button', devicePixelRatio: 1, targetGiven: true
    } }])
    await Promise.resolve()
    expect(executeScript.mock.calls.filter(([call]) => call.func === performPageAction)).toHaveLength(0)
  })
  it('observes after one action inside the existing document admission', async () => {
    let admitted = false
    mocks.runAdmission.mockImplementationOnce(async (_tabId, fn) => {
      admitted = true
      try { return await fn() } finally { admitted = false }
    })
    mocks.captureInline.mockImplementationOnce(async (tabId, options) => {
      expect(admitted).toBe(true)
      expect(tabId).toBe(42)
      expect(options).toMatchObject({ agent: 'alpha', token: { documentId: 'doc-a' } })
      return { imageData: 'YWJj', mimeType: 'image/png', width: 400, height: 300, bytes: 3 }
    })
    const clicked = vi.fn()
    document.querySelector('#save')!.addEventListener('click', clicked)
    await handleBrowserAct({ requestId: 'observe', action: 'click', selector: '#save', tabId: 42, agent: 'alpha', observe: true })
    expect(mocks.runAdmission).toHaveBeenCalledTimes(1)
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(lastFrame()).toMatchObject({ success: true, observed: true, imageData: 'YWJj' })
  })

  it('keeps the action verdict when a later observation fails and never replays', async () => {
    mocks.captureInline.mockRejectedValueOnce(new Error('synthetic capture failure'))
    const clicked = vi.fn()
    document.querySelector('#save')!.addEventListener('click', clicked)
    await handleBrowserAct({ requestId: 'observe-failure', action: 'click', selector: '#save', tabId: 42, observe: true })
    expect(clicked).toHaveBeenCalledTimes(1)
    expect(lastFrame()).toMatchObject({ success: true, observed: false })
    expect(lastFrame()).not.toHaveProperty('imageData')
  })

})
