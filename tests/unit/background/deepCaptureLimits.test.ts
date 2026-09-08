import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/background/browserMcp/tabGroups', () => ({ subscribeToTabOwnershipChanges: vi.fn() }))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  subscribeToDocumentProtection: vi.fn(), subscribeToDocumentLifecycle: vi.fn()
}))
vi.mock('@/background/browserMcp/debugger', () => ({}))
vi.mock('@/background/browserMcp/pageGuard', () => ({}))

import { applyDeepCaptureEvent, paginateDeepResponseBody, storeDeepResponseBody, type StoredDeepNetworkRequest } from '@/background/deepCapture'

const context = { tabId: 42, maxBodyBytes: 64000, includeSelf: false }
function start(store: Map<string, StoredDeepNetworkRequest>, requestId: string) {
  applyDeepCaptureEvent(store, context, 'Network.requestWillBeSent', {
    requestId, timestamp: 1, wallTime: Date.now() / 1000, type: 'Fetch',
    request: { url: `https://example.test/data/${requestId}`, method: 'GET' }
  })
  return store.get(requestId)!
}
afterEach(() => vi.restoreAllMocks())

describe('deep capture retention and paging limits', () => {
  it('evicts older requests when the per-session count exceeds500', () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now++)
    const store = new Map<string, StoredDeepNetworkRequest>()
    for (let index = 0; index < 502; index++) start(store, `row-${index}`)
    expect(store.size).toBe(500)
    expect(store.has('row-0')).toBe(false)
    expect(store.has('row-1')).toBe(false)
    expect(store.has('row-501')).toBe(true)
  })
  it('expires inactive request rows after five minutes', () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const store = new Map<string, StoredDeepNetworkRequest>()
    start(store, 'old')
    now += 300_001
    start(store, 'fresh')
    expect([...store.keys()]).toEqual(['fresh'])
  })
  it('pages the retained body and reports configured byte truncation honestly', () => {
    const store = new Map<string, StoredDeepNetworkRequest>()
    const request = start(store, 'body')
    storeDeepResponseBody(request, 'abcdefghijklmnop', false, 10)
    const first = paginateDeepResponseBody(request, 0, 4)
    expect(first).toMatchObject({ success: true, text: 'abcd', length: 4, totalLength: 10, hasMore: true, nextOffset: 4, truncated: true })
    const last = paginateDeepResponseBody(request, 8, 4)
    expect(last).toMatchObject({ text: 'ij', length: 2, hasMore: false })
    expect(paginateDeepResponseBody(request, 20, 4)).toMatchObject({ text: '', length: 0, hasMore: false })
  })
  it('keeps retained Unicode text inside its UTF-8 byte budget', () => {
    const store = new Map<string, StoredDeepNetworkRequest>()
    const request = start(store, 'unicode')
    storeDeepResponseBody(request, '😀😀😀', false, 5)
    expect(new TextEncoder().encode(request.responseBody).length).toBeLessThanOrEqual(5)
    expect(request.responseBody).not.toContain('\uFFFD')
    expect(request.responseBodyTruncated).toBe(true)
  })
})
