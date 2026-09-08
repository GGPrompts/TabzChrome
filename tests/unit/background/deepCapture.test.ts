import { beforeEach, describe, expect, it, vi } from 'vitest'

const fixture = vi.hoisted(() => ({
  event: undefined as undefined | ((source: chrome.debugger.Debuggee, method: string, params?: object) => void),
  detachEvent: undefined as undefined | ((source: chrome.debugger.Debuggee) => void),
  ownershipListeners: [] as Array<(tabId: number) => void>,
  protectionListeners: [] as Array<(tabId: number) => void>,
  lifecycleListeners: [] as Array<(event: { type: string; tabId: number; frameId: number }) => void>,
  attached: new Set<number>(),
  owner: 'agent-a',
  ownerLookup: vi.fn(),
  allowed: true,
  attach: vi.fn(),
  detach: vi.fn(),
  command: vi.fn(),
  exclusive: vi.fn(async (_tabId: number, work: () => unknown) => work()),
  resolveTab: vi.fn()
}))

vi.mock('@/background/browserMcp/debugger', () => ({
  attachWithBusyRetry: fixture.attach,
  debuggerAttachError: (tabId: number, error: unknown) => new Error(
    error instanceof Error ? error.message : `Debugger failure on tab ${tabId}: ${String(error)}`),
  isDeepCaptureTabAttached: (tabId: number) => fixture.attached.has(tabId),
  isEmulatedTabAttached: vi.fn(() => false),
  isPersistentDebuggerAttached: (tabId: number) => fixture.attached.has(tabId),
  markDeepCaptureTabAttached: (tabId: number) => fixture.attached.add(tabId),
  markDeepCaptureTabDetached: (tabId: number) => fixture.attached.delete(tabId),
  runExclusivePerTab: fixture.exclusive,
  sendDebuggerCommand: fixture.command
}))
vi.mock('@/background/browserMcp/pageGuard', () => ({ assertAgentReadableTab: vi.fn() }))
vi.mock('@/background/browserMcp/tabGroups', () => ({
  assertTabInAgentGroup: vi.fn(),
  getAgentForGroup: fixture.ownerLookup,
  resolveAgentTab: fixture.resolveTab,
  subscribeToTabOwnershipChanges: (listener: (tabId: number) => void) => {
    fixture.ownershipListeners.push(listener)
    return () => undefined
  }
}))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  assertDocumentReadable: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-a', generation: 1 })),
  assertDocumentReadCurrent: vi.fn(),
  canCaptureDocumentSync: vi.fn(() => fixture.allowed),
  runWithDocumentAdmission: vi.fn(async (_tabId: number, work: () => unknown) => work()),
  subscribeToDocumentLifecycle: (listener: (event: { type: string; tabId: number; frameId: number }) => void) => {
    fixture.lifecycleListeners.push(listener)
    return () => undefined
  },
  subscribeToDocumentProtection: (listener: (tabId: number) => void) => {
    fixture.protectionListeners.push(listener)
    return () => undefined
  }
}))

let deep: typeof import('@/background/deepCapture')

const token = (tabId: number, documentId = 'doc-a', generation = 1) => ({ tabId, documentId, generation })
const context = { tabId: 10, maxBodyBytes: 64, includeSelf: false }

function requestParams(requestId: string, url = 'https://site.test/api/data') {
  return {
    requestId, timestamp: 10, wallTime: 20, type: 'Fetch',
    request: {
      url, method: 'POST',
      headers: { Authorization: 'Bearer synthetic-secret', 'X-Trace': 'trace' },
      postData: JSON.stringify({ ordinary: 'diagnostic', password: 'synthetic-secret' })
    }
  }
}

beforeEach(async () => {
  vi.resetModules()
  fixture.event = undefined
  fixture.detachEvent = undefined
  fixture.ownershipListeners = []
  fixture.protectionListeners = []
  fixture.lifecycleListeners = []
  fixture.attached.clear()
  fixture.owner = 'agent-a'
  fixture.ownerLookup.mockReset().mockImplementation(async () => fixture.owner)
  fixture.allowed = true
  fixture.attach.mockReset().mockResolvedValue(undefined)
  fixture.detach.mockReset().mockResolvedValue(undefined)
  fixture.command.mockReset().mockResolvedValue({})
  fixture.exclusive.mockReset().mockImplementation(async (_tabId: number, work: () => unknown) => work())
  fixture.resolveTab.mockReset()
  Object.assign(chrome, {
    tabGroups: { TAB_GROUP_ID_NONE: -1 },
    tabs: { get: vi.fn(async (tabId: number) => ({ id: tabId, groupId: 8, url: 'https://site.test/' })) },
    debugger: {
      attach: fixture.attach,
      detach: fixture.detach,
      sendCommand: vi.fn(),
      onEvent: { addListener: vi.fn(listener => { fixture.event = listener }) },
      onDetach: { addListener: vi.fn(listener => { fixture.detachEvent = listener }) }
    }
  })
  deep = await import('@/background/deepCapture')
})

describe('deep capture redaction and bounds', () => {
  it('redacts request credentials and suppresses every sensitive endpoint body', () => {
    const store = new Map<string, import('@/background/deepCapture').StoredDeepNetworkRequest>()
    const ordinary = requestParams('ordinary')
    ordinary.request.headers[`X-${'a'.repeat(300)}-Token`] = 'long-name-secret'
    deep.applyDeepCaptureEvent(store, context, 'Network.requestWillBeSent', ordinary)
    expect(store.get('ordinary')).toMatchObject({
      requestHeaders: { Authorization: '[redacted]', 'X-Trace': 'trace' },
      postData: JSON.stringify({ ordinary: 'diagnostic', password: '[redacted]' })
    })
    deep.applyDeepCaptureEvent(store, context, 'Network.requestWillBeSent', requestParams('secret', 'https://site.test/login'))
    deep.applyDeepCaptureEvent(store, context, 'Network.loadingFinished', { requestId: 'secret' })
    expect(store.get('secret')).toMatchObject({ postData: '[redacted]', responseBody: '[redacted]', bodyRedacted: true })
    expect(JSON.stringify([...store.values()])).not.toContain('synthetic-secret')
    expect(JSON.stringify([...store.values()])).not.toContain('long-name-secret')
    deep.applyDeepCaptureEvent(store, context, 'Network.requestWillBeSent',
      requestParams('query', 'https://site.test/api?trace=okay&access_token=query-secret'))
    expect(store.get('query')?.url).toContain('trace=okay')
    expect(store.get('query')?.url).not.toContain('query-secret')
  })

  it('redacts decoded base64 JSON and suppresses opaque binary payloads', () => {
    const store = new Map<string, import('@/background/deepCapture').StoredDeepNetworkRequest>()
    deep.applyDeepCaptureEvent(store, context, 'Network.requestWillBeSent', requestParams('body'))
    const row = store.get('body')!
    deep.storeDeepResponseBody(row, btoa(JSON.stringify({ value: 'okay', token: 'synthetic-secret' })), true, 64)
    expect(JSON.parse(atob(row.responseBody!))).toEqual({ value: 'okay', token: '[redacted]' })
    expect(row.base64Encoded).toBe(true)

    deep.storeDeepResponseBody(row, btoa('\u0000\u0001synthetic-secret'), true, 64)
    expect(row).toMatchObject({ responseBody: '[redacted]', base64Encoded: false, bodyRedacted: true })
    expect(JSON.stringify(row)).not.toContain('synthetic-secret')
  })

  it('bounds aggregate stream and websocket payload bytes and counts drops', () => {
    const store = new Map<string, import('@/background/deepCapture').StoredDeepNetworkRequest>()
    const small = { ...context, maxBodyBytes: 12 }
    deep.applyDeepCaptureEvent(store, small, 'Network.requestWillBeSent', requestParams('stream'))
    deep.applyDeepCaptureEvent(store, small, 'Network.eventSourceMessageReceived', {
      requestId: 'stream', data: 'abcdefghijklmnop', eventName: 'x'.repeat(1000), eventId: 'y'.repeat(1000)
    })
    deep.applyDeepCaptureEvent(store, small, 'Network.eventSourceMessageReceived', { requestId: 'stream', data: 'later' })
    const stream = store.get('stream')!
    expect(new TextEncoder().encode(stream.streamMessages[0].data).length).toBeLessThanOrEqual(12)
    expect(stream.streamMessages[0].eventName.length).toBe(256)
    expect(stream.droppedStreamMessages).toBe(1)

    deep.applyDeepCaptureEvent(store, small, 'Network.requestWillBeSent', requestParams('socket'))
    deep.applyDeepCaptureEvent(store, small, 'Network.webSocketFrameReceived', {
      requestId: 'socket', response: { opcode: 2, payloadData: 'synthetic-secret' }
    })
    expect(store.get('socket')!.webSocketFrames[0].payload).toBe('[binary omit')
    expect(JSON.stringify(store.get('socket'))).not.toContain('synthetic-secret')
  })

  it('archives redirects and preserves bounded failure metadata', () => {
    const store = new Map<string, import('@/background/deepCapture').StoredDeepNetworkRequest>()
    deep.applyDeepCaptureEvent(store, context, 'Network.requestWillBeSent', requestParams('chain', 'https://site.test/start'))
    deep.applyDeepCaptureEvent(store, context, 'Network.requestWillBeSent', requestParams('chain', 'https://site.test/end'))
    deep.applyDeepCaptureEvent(store, context, 'Network.loadingFailed', { requestId: 'chain', errorText: 'net::ERR_FAILED' })
    expect([...store.keys()]).toEqual(['chain:r1', 'chain'])
    expect(store.get('chain:r1')).toMatchObject({ requestId: 'chain:r1', redirectHop: 1, redirectedTo: 'https://site.test/end' })
    expect(store.get('chain')).toMatchObject({ status: 0, statusText: 'net::ERR_FAILED' })
  })
})

describe('deep capture session lifecycle', () => {
  it('requires a verified document token and scopes enabled tab IDs to one owner', async () => {
    expect(await deep.enableDeepCapture(10)).toMatchObject({ success: false, error: expect.stringContaining('admitted current document') })
    expect(await deep.enableDeepCapture(10, 64, false, { agent: 'agent-a', groupId: 8, documentToken: token(10) }))
      .toMatchObject({ success: true, tabIds: [10] })
    expect(await deep.enableDeepCapture(20, 64, false, { agent: 'agent-b', groupId: 8, documentToken: token(20) }))
      .toMatchObject({ success: true, tabIds: [20] })
  })

  it('starts fresh across document generations and quarantines synchronously on ownership change', async () => {
    await deep.enableDeepCapture(10, 64, false, { agent: 'agent-a', groupId: 8, documentToken: token(10) })
    fixture.event!({ tabId: 10 }, 'Network.requestWillBeSent', requestParams('old'))
    await vi.waitFor(() => expect(deep.getDeepNetworkRequests(10, 'agent-a')).toHaveLength(1))

    await deep.enableDeepCapture(10, 64, false, { agent: 'agent-a', groupId: 8, documentToken: token(10, 'doc-b', 2) })
    expect(deep.getDeepNetworkRequests(10, 'agent-a')).toEqual([])
    fixture.ownershipListeners.forEach(listener => listener(10))
    expect(deep.isDeepCaptureActive(10, 'agent-a')).toBe(false)
    expect(deep.getDeepNetworkRequests(10, 'agent-a')).toEqual([])
    await vi.waitFor(() => expect(fixture.command).toHaveBeenCalledWith({ tabId: 10 }, 'Network.disable'))
    expect(fixture.detach).toHaveBeenCalledWith({ tabId: 10 })
  })

  it('projects unique bounded redirect hops through the real event queue', async () => {
    await deep.enableDeepCapture(10, 64_000, false, { agent: 'agent-a', groupId: 8, documentToken: token(10) })
    fixture.event!({ tabId: 10 }, 'Network.requestWillBeSent', requestParams('redirect', 'https://site.test/start'))
    await vi.waitFor(() => expect(deep.getDeepNetworkRequests(10, 'agent-a')).toHaveLength(1))
    fixture.event!({ tabId: 10 }, 'Network.requestWillBeSent', {
      ...requestParams('redirect', 'https://site.test/end'),
      redirectResponse: {
        status: 302, statusText: 'Found', mimeType: 'text/html',
        headers: { 'Set-Cookie': 'session=synthetic-secret', Location: 'https://site.test/end' }
      }
    })
    await vi.waitFor(() => expect(deep.getDeepNetworkRequests(10, 'agent-a')).toHaveLength(2))
    expect(deep.getDeepNetworkRequests(10, 'agent-a')).toEqual(expect.arrayContaining([
      expect.objectContaining({
        requestId: 'redirect:r1', redirectHop: 1, redirectedTo: 'https://site.test/end',
        status: 302, statusText: 'Found', responseHeaders: { 'Set-Cookie': '[redacted]', Location: 'https://site.test/end' }
      }),
      expect.objectContaining({ requestId: 'redirect', url: 'https://site.test/end' })
    ]))
    expect(JSON.stringify(deep.getDeepNetworkRequests(10, 'agent-a'))).not.toContain('synthetic-secret')
  })

  it('drops late events after an immutable owner recheck fails', async () => {
    await deep.enableDeepCapture(10, 64, false, { agent: 'agent-a', groupId: 8, documentToken: token(10) })
    fixture.owner = 'agent-b'
    fixture.event!({ tabId: 10 }, 'Network.requestWillBeSent', requestParams('late'))
    await vi.waitFor(() => expect(deep.isDeepCaptureActive(10, 'agent-a')).toBe(false))
    expect(deep.getDeepNetworkRequests(10, 'agent-a')).toEqual([])
  })

  it('does not let a stale queued callback stop a replacement document session', async () => {
    let releaseOwner!: (value: string) => void
    const delayedOwner = new Promise<string>(resolve => { releaseOwner = resolve })
    await deep.enableDeepCapture(10, 64_000, false, { agent: 'agent-a', groupId: 8, documentToken: token(10) })
    fixture.ownerLookup.mockImplementationOnce(() => delayedOwner)
    fixture.event!({ tabId: 10 }, 'Network.requestWillBeSent', requestParams('old-queued'))

    await deep.enableDeepCapture(10, 64_000, false, {
      agent: 'agent-a', groupId: 8, documentToken: token(10, 'doc-b', 2)
    })
    releaseOwner('agent-a')
    await Promise.resolve()
    await Promise.resolve()
    expect(deep.isDeepCaptureActive(10, 'agent-a')).toBe(true)

    fixture.event!({ tabId: 10 }, 'Network.requestWillBeSent', requestParams('new-session'))
    await vi.waitFor(() => expect(deep.getDeepNetworkRequests(10, 'agent-a').map(row => row.requestId)).toEqual(['new-session']))
  })

  it('bounds pending redacted event memory while a response-body read is delayed', async () => {
    let releaseBody!: (value: { body: string; base64Encoded: boolean }) => void
    const delayedBody = new Promise<{ body: string; base64Encoded: boolean }>(resolve => { releaseBody = resolve })
    fixture.command.mockImplementation(async (_target, method: string) =>
      method === 'Network.getResponseBody' ? delayedBody : {})
    await deep.enableDeepCapture(10, 64_000, false, { agent: 'agent-a', groupId: 8, documentToken: token(10) })
    fixture.event!({ tabId: 10 }, 'Network.requestWillBeSent', requestParams('burst'))
    await vi.waitFor(() => expect(deep.getDeepNetworkRequests(10, 'agent-a')).toHaveLength(1))
    fixture.event!({ tabId: 10 }, 'Network.loadingFinished', { requestId: 'burst', encodedDataLength: 1 })
    await vi.waitFor(() => expect(fixture.command).toHaveBeenCalledWith({ tabId: 10 }, 'Network.getResponseBody', { requestId: 'burst' }))

    for (let index = 0; index < 250; index++) {
      fixture.event!({ tabId: 10 }, 'Network.eventSourceMessageReceived', {
        requestId: 'burst', data: JSON.stringify({ index, token: `secret-${index}`, value: 'x'.repeat(4_000) })
      })
    }
    const queued = deep.getDeepNetworkRequests(10, 'agent-a')[0]
    expect(queued.droppedPendingEvents).toBeGreaterThan(0)
    expect(JSON.stringify(queued)).not.toContain('secret-249')
    releaseBody({ body: JSON.stringify({ okay: true }), base64Encoded: false })
    await vi.waitFor(() => expect(deep.getDeepResponseBody({ requestId: 'burst', tabId: 10, agent: 'agent-a' }).success).toBe(true))
  })

  it('stops on main-frame navigation and disables Network before detach', async () => {
    await deep.enableDeepCapture(10, 64, false, { agent: 'agent-a', groupId: 8, documentToken: token(10) })
    fixture.command.mockClear()
    fixture.detach.mockClear()
    fixture.lifecycleListeners.forEach(listener => listener({ type: 'before-navigate', tabId: 10, frameId: 0 }))
    expect(deep.isDeepCaptureActive(10, 'agent-a')).toBe(false)
    await vi.waitFor(() => expect(fixture.detach).toHaveBeenCalled())
    expect(fixture.command.mock.invocationCallOrder[0]).toBeLessThan(fixture.detach.mock.invocationCallOrder[0])
    expect(fixture.command).toHaveBeenCalledWith({ tabId: 10 }, 'Network.disable')
  })

  it('does not start capture after the original debugger queue deadline', async () => {
    vi.useFakeTimers()
    fixture.exclusive.mockImplementationOnce(async (_tabId: number, work: () => unknown) => {
      await vi.advanceTimersByTimeAsync(20)
      return work()
    })
    const result = await deep.enableDeepCapture(10, 64, false, {
      agent: 'agent-a', groupId: 8, documentToken: token(10), expiresAt: Date.now() + 10
    })
    expect(result).toMatchObject({ success: false, error: expect.stringContaining('expired') })
    expect(fixture.attach).not.toHaveBeenCalled()
    expect(fixture.command).not.toHaveBeenCalledWith({ tabId: 10 }, 'Network.enable', expect.anything())
    vi.useRealTimers()
  })
})
