import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('../../../extension/background/browserMcp/documentProtection', () => ({
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-test', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined)
}))

import {
  aggregateCssCoverage,
  attachWithBusyRetry,
  handleBrowserGetCoverage,
  markEmulatedTabAttached,
  markEmulatedTabDetached,
  runExclusivePerTab,
  withDebugger,
  type CSSRuleUsage,
  type CSSStyleSheetHeader
} from '../../../extension/background/browserMcp/debugger'
import { sendToWebSocket } from '../../../extension/background/websocket'
import { assertDocumentReadable, assertDocumentReadCurrent } from '../../../extension/background/browserMcp/documentProtection'

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(chrome, {
    debugger: {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn((_target, _method, _params, callback) => callback?.({})),
      onEvent: { addListener: vi.fn(), removeListener: vi.fn() },
      onDetach: { addListener: vi.fn(), removeListener: vi.fn() }
    }
  })
})

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

describe('runExclusivePerTab', () => {
  it('runs two calls on the same tab strictly in invocation order', async () => {
    const firstGate = deferred()
    const firstStarted = deferred()
    const events: string[] = []

    const first = runExclusivePerTab(11, async () => {
      events.push('first:start')
      firstStarted.resolve()
      await firstGate.promise
      events.push('first:end')
    })
    const second = runExclusivePerTab(11, async () => {
      events.push('second:start')
      events.push('second:end')
    })

    await firstStarted.promise
    expect(events).toEqual(['first:start'])

    firstGate.resolve()
    await Promise.all([first, second])
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
  })

  it('allows calls on different tabs to interleave', async () => {
    const firstGate = deferred()
    const events: string[] = []

    const first = runExclusivePerTab(21, async () => {
      events.push('tab21:start')
      await firstGate.promise
      events.push('tab21:end')
    })
    const second = runExclusivePerTab(22, async () => {
      events.push('tab22:start')
      events.push('tab22:end')
    })

    await second
    expect(events).toEqual(['tab21:start', 'tab22:start', 'tab22:end'])

    firstGate.resolve()
    await first
    expect(events.at(-1)).toBe('tab21:end')
  })

  it('releases the tab slot when a call rejects', async () => {
    const first = runExclusivePerTab(31, async () => {
      throw new Error('expected failure')
    })
    const second = runExclusivePerTab(31, async () => 'ran after rejection')

    await expect(first).rejects.toThrow('expected failure')
    await expect(second).resolves.toBe('ran after rejection')
  })
})

function getDebuggerMock() {
  return chrome.debugger as unknown as {
    attach: ReturnType<typeof vi.fn>
    detach: ReturnType<typeof vi.fn>
  }
}

// No backoff in tests: the delays are the production value's only difference.
const NO_WAIT_DELAYS = [0, 0, 0]

const BUSY = 'Another debugger is already attached to the tab with id: 41'

describe('attachWithBusyRetry', () => {
  beforeEach(() => {
    const dbg = getDebuggerMock()
    dbg.attach.mockClear()
    dbg.detach.mockClear()
  })

  afterEach(() => {
    // The shared chrome mock is module scoped, so persistent implementations
    // set here must not leak into the next test file.
    const dbg = getDebuggerMock()
    dbg.attach.mockReset()
    dbg.detach.mockReset()
    dbg.attach.mockImplementation((_target: unknown, _version: string, callback?: () => void) => {
      callback?.()
    })
    dbg.detach.mockImplementation((_target: unknown, callback?: () => void) => {
      callback?.()
    })
  })

  it('detaches a stale attachment of our own and attaches on the retry', async () => {
    const dbg = getDebuggerMock()
    dbg.attach.mockRejectedValueOnce(new Error(BUSY))

    await attachWithBusyRetry({ tabId: 41 }, 41, NO_WAIT_DELAYS)

    expect(dbg.detach).toHaveBeenCalledTimes(1)
    expect(dbg.attach).toHaveBeenCalledTimes(2)
  })

  it('waits out another client holding the tab', async () => {
    const dbg = getDebuggerMock()
    dbg.detach.mockRejectedValue(new Error('Debugger is not attached to the tab with id: 41'))
    dbg.attach
      .mockRejectedValueOnce(new Error(BUSY))
      .mockRejectedValueOnce(new Error(BUSY))

    await attachWithBusyRetry({ tabId: 41 }, 41, NO_WAIT_DELAYS)

    expect(dbg.attach).toHaveBeenCalledTimes(3)
  })

  it('gives up after the bounded attempts and reports the busy tab', async () => {
    const dbg = getDebuggerMock()
    dbg.detach.mockRejectedValue(new Error('Debugger is not attached to the tab with id: 41'))
    dbg.attach.mockRejectedValue(new Error(BUSY))

    await expect(attachWithBusyRetry({ tabId: 41 }, 41, NO_WAIT_DELAYS))
      .rejects.toThrow('Debugger busy on tab 41; ask the user to close/disable DevTools, a password manager/inline-autofill extension, or an earlier deep-capture session, not retry.')
    expect(dbg.attach).toHaveBeenCalledTimes(NO_WAIT_DELAYS.length + 1)
  })

  it.each([
    'Cannot access a chrome-extension:// URL of different extension',
    'Cannot attach to this target.'
  ])('never retries a permanent refusal: %s', async chromeMessage => {
    const dbg = getDebuggerMock()
    dbg.attach.mockRejectedValue(new Error(chromeMessage))

    await expect(attachWithBusyRetry({ tabId: 41 }, 41, NO_WAIT_DELAYS)).rejects.toThrow()
    expect(dbg.attach).toHaveBeenCalledTimes(1)
    expect(dbg.detach).not.toHaveBeenCalled()
  })
})

describe('withDebugger attach errors', () => {
  beforeEach(() => {
    const dbg = getDebuggerMock()
    dbg.attach.mockClear()
    dbg.detach.mockClear()
  })

  it('maps a chrome-extension refusal to a retryable tab message', async () => {
    const dbg = getDebuggerMock()
    dbg.attach.mockRejectedValueOnce(
      new Error('Cannot access a chrome-extension:// URL of different extension')
    )

    await expect(withDebugger(41, async () => undefined))
      .rejects.toThrow('Debugger busy on tab 41; ask the user to close/disable DevTools, a password manager/inline-autofill extension, or an earlier deep-capture session, not retry.')
    expect(dbg.attach).toHaveBeenCalledTimes(1)
  })

  it('recovers from a busy tab instead of asking the caller to retry', async () => {
    const dbg = getDebuggerMock()
    dbg.attach.mockRejectedValueOnce(new Error(BUSY))

    await expect(withDebugger(41, async () => 'ran')).resolves.toBe('ran')
    expect(dbg.attach).toHaveBeenCalledTimes(2)
  })

  it('checks the deadline guard after waiting for the per-tab queue', async () => {
    const dbg = getDebuggerMock()
    const firstStarted = deferred()
    const releaseFirst = deferred()
    let expired = false
    const secondBody = vi.fn(async () => undefined)

    const first = withDebugger(41, async () => {
      firstStarted.resolve()
      await releaseFirst.promise
    })
    await firstStarted.promise
    const second = withDebugger(41, secondBody, {
      guard: () => {
        if (expired) throw new Error('capture deadline expired')
      }
    })
    const secondResult = second.catch(error => error)

    expired = true
    releaseFirst.resolve()
    await first

    expect(await secondResult).toMatchObject({ message: 'capture deadline expired' })
    expect(secondBody).not.toHaveBeenCalled()
    expect(dbg.attach).toHaveBeenCalledTimes(1)
    expect(dbg.detach).toHaveBeenCalledTimes(1)
  })

  it('checks the deadline guard before a busy attach retry', async () => {
    const dbg = getDebuggerMock()
    let guardCalls = 0
    dbg.attach.mockRejectedValue(new Error(BUSY))
    dbg.detach.mockRejectedValue(new Error('held by another client'))

    await expect(attachWithBusyRetry({ tabId: 41 }, 41, NO_WAIT_DELAYS, () => {
      guardCalls += 1
      if (guardCalls > 1) throw new Error('capture deadline expired')
    })).rejects.toThrow('capture deadline expired')

    expect(dbg.attach).toHaveBeenCalledTimes(1)
  })
})

describe('aggregateCssCoverage', () => {
  it('joins rule usage by stylesheet ID and uses text or range totals', () => {
    const headers = new Map<string, CSSStyleSheetHeader>([
      ['app', {
        styleSheetId: 'app',
        sourceURL: 'https://example.test/app.css',
        frameId: 'main',
        isInline: false
      }],
      ['font', {
        styleSheetId: 'font',
        sourceURL: 'https://example.test/font-awesome.css',
        frameId: 'main',
        isInline: false
      }],
      ['inline', {
        styleSheetId: 'inline',
        sourceURL: '',
        frameId: 'main',
        isInline: true
      }],
      ['extension', {
        styleSheetId: 'extension',
        sourceURL: 'chrome-extension://abc/hidden.css',
        frameId: 'extension-frame',
        isInline: false
      }]
    ])
    const ruleUsage: CSSRuleUsage[] = [
      { styleSheetId: 'app', startOffset: 0, endOffset: 20, used: true },
      { styleSheetId: 'app', startOffset: 20, endOffset: 50, used: false },
      { styleSheetId: 'font', startOffset: 0, endOffset: 10, used: true },
      { styleSheetId: 'font', startOffset: 10, endOffset: 30, used: false },
      { styleSheetId: 'inline', startOffset: 0, endOffset: 5, used: true },
      { styleSheetId: 'extension', startOffset: 0, endOffset: 100, used: true }
    ]

    const result = aggregateCssCoverage(
      headers,
      ruleUsage,
      new Map([
        ['app', 100],
        ['inline', 10]
      ]),
      new Map([['main', 'https://example.test/login']])
    )

    expect(result).toEqual([
      {
        url: 'https://example.test/app.css',
        usedBytes: 20,
        totalBytes: 100,
        usedPercent: 20
      },
      {
        url: 'https://example.test/font-awesome.css',
        usedBytes: 10,
        totalBytes: 30,
        usedPercent: 33
      },
      {
        url: 'https://example.test/login',
        usedBytes: 5,
        totalBytes: 10,
        usedPercent: 50
      }
    ])
  })

  it('registers the stylesheet listener before enabling CSS coverage', async () => {
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: 51, url: 'https://example.test/' } as chrome.tabs.Tab)
    let loadListener: ((tabId: number, changeInfo: { status?: string }) => void) | undefined
    const events: string[] = []
    Object.assign(chrome.tabs, {
      reload: vi.fn(async (tabId: number) => {
        events.push('reload')
        loadListener?.(tabId, { status: 'complete' })
      }),
      onUpdated: {
        addListener: vi.fn(listener => { loadListener = listener }),
        removeListener: vi.fn()
      }
    })
    const dbg = chrome.debugger as unknown as {
      sendCommand: ReturnType<typeof vi.fn>
      onEvent: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> }
    }
    dbg.onEvent.addListener.mockImplementation(() => { events.push('listener:add') })
    dbg.sendCommand.mockImplementation((_target: unknown, method: string, _params: unknown, callback: (value: unknown) => void) => {
      events.push(method)
      if (method === 'Page.getFrameTree') {
        callback({ frameTree: { frame: { id: 'main', url: 'https://example.test/' } } })
      } else if (method === 'CSS.stopRuleUsageTracking') {
        callback({ ruleUsage: [] })
      } else {
        callback({})
      }
    })

    await handleBrowserGetCoverage({ requestId: 'css-order', tabId: 51, coverageType: 'css' })

    expect(events.indexOf('listener:add')).toBeLessThan(events.indexOf('CSS.enable'))
    expect(events.indexOf('CSS.startRuleUsageTracking')).toBeLessThan(events.indexOf('reload'))
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-get-coverage-result', requestId: 'css-order', success: true
    }))
  })

  it('cancels the load waiter and releases the tab queue when reload fails', async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: 52, url: 'https://example.test/' } as chrome.tabs.Tab)
    Object.assign(chrome.tabs, {
      reload: vi.fn().mockRejectedValue(new Error('reload refused')),
      onUpdated: { addListener, removeListener }
    })
    const dbg = getDebuggerMock() as ReturnType<typeof getDebuggerMock> & { sendCommand: ReturnType<typeof vi.fn> }
    ;(dbg as any).sendCommand.mockImplementation((_target: unknown, method: string, _params: unknown, callback: (value: unknown) => void) => {
      callback(method === 'Profiler.takePreciseCoverage' ? { result: [] } : {})
    })

    await handleBrowserGetCoverage({ requestId: 'reload-failure', tabId: 52, coverageType: 'js' })

    expect(addListener).toHaveBeenCalledTimes(1)
    expect(removeListener).toHaveBeenCalledTimes(1)
    expect(dbg.detach).toHaveBeenCalledTimes(1)
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-get-coverage-result', requestId: 'reload-failure', success: false, error: 'reload refused'
    }))
    await expect(runExclusivePerTab(52, async () => 'released')).resolves.toBe('released')
  })

  it('stops and disables coverage domains after failure without detaching a persistent owner', async () => {
    const tabId = 54
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: tabId, url: 'https://example.test/' } as chrome.tabs.Tab)
    Object.assign(chrome.tabs, {
      reload: vi.fn().mockRejectedValue(new Error('reload refused')),
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() }
    })
    const dbg = chrome.debugger as unknown as {
      attach: ReturnType<typeof vi.fn>
      detach: ReturnType<typeof vi.fn>
      sendCommand: ReturnType<typeof vi.fn>
    }
    const commands: string[] = []
    dbg.sendCommand.mockImplementation((_target: unknown, method: string, _params: unknown, callback: (value: unknown) => void) => {
      commands.push(method)
      if (method === 'Page.getFrameTree') {
        callback({ frameTree: { frame: { id: 'main', url: 'https://example.test/' } } })
      } else {
        callback({})
      }
    })
    markEmulatedTabAttached(tabId)

    try {
      await handleBrowserGetCoverage({ requestId: 'persistent-failure', tabId, coverageType: 'both' })
    } finally {
      markEmulatedTabDetached(tabId)
    }

    expect(commands).toEqual(expect.arrayContaining([
      'Profiler.stopPreciseCoverage',
      'CSS.stopRuleUsageTracking',
      'CSS.disable',
      'Page.disable',
      'DOM.disable',
      'Profiler.disable'
    ]))
    expect(commands.indexOf('CSS.stopRuleUsageTracking')).toBeLessThan(commands.indexOf('CSS.disable'))
    expect(commands.indexOf('Profiler.stopPreciseCoverage')).toBeLessThan(commands.indexOf('Profiler.disable'))
    expect(dbg.attach).not.toHaveBeenCalled()
    expect(dbg.detach).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-get-coverage-result', requestId: 'persistent-failure', success: false, error: 'reload refused'
    }))
  })

  it('binds successful coverage to the fresh document created by its intentional reload', async () => {
    vi.mocked(assertDocumentReadable)
      .mockResolvedValueOnce({ tabId: 53, documentId: 'before-reload', generation: 0 })
      .mockResolvedValueOnce({ tabId: 53, documentId: 'after-reload', generation: 0 })
    vi.mocked(chrome.tabs.get).mockResolvedValue({ id: 53, url: 'https://example.test/' } as chrome.tabs.Tab)
    let loadListener: ((tabId: number, changeInfo: { status?: string }) => void) | undefined
    Object.assign(chrome.tabs, {
      reload: vi.fn(async (tabId: number) => { loadListener?.(tabId, { status: 'complete' }) }),
      onUpdated: {
        addListener: vi.fn(listener => { loadListener = listener }),
        removeListener: vi.fn()
      }
    })
    const dbg = getDebuggerMock() as ReturnType<typeof getDebuggerMock> & { sendCommand: ReturnType<typeof vi.fn> }
    ;(dbg as any).sendCommand.mockImplementation((_target: unknown, method: string, _params: unknown, callback: (value: unknown) => void) => {
      callback(method === 'Profiler.takePreciseCoverage' ? { result: [] } : {})
    })

    await handleBrowserGetCoverage({ requestId: 'fresh-coverage', tabId: 53, coverageType: 'js' })

    expect(assertDocumentReadable).toHaveBeenCalledTimes(2)
    expect(assertDocumentReadCurrent).toHaveBeenCalledWith(53, expect.objectContaining({ documentId: 'after-reload' }))
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-get-coverage-result', requestId: 'fresh-coverage', success: true
    }))
  })
})
