import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  resolveAgentTab: vi.fn(async (_agent: string | undefined, tabId?: number) => ({
    id: tabId ?? 42, groupId: 7, status: 'complete', url: 'https://example.test/login'
  })),
  assertOwned: vi.fn(async () => undefined)
}))

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: mocks.send }))
vi.mock('../../../extension/background/browserMcp/tabGroups', () => ({
  subscribeToTabOwnershipChanges: vi.fn(() => () => undefined),
  resolveAgentTab: mocks.resolveAgentTab,
  assertTabInAgentGroup: mocks.assertOwned
}))

import { handleBrowserAct } from '../../../extension/background/browserMcp/act'
import {
  preflightAndProtectDocument,
  resetDocumentProtectionMemoryForTests,
  runWithDocumentAdmission
} from '../../../extension/background/browserMcp/documentProtection'
import { rememberPageRefs, resetPageRefsForTests } from '../../../extension/background/browserMcp/pageRefs'

describe('act and real document protection integration', () => {
  let stored: Record<string, unknown>
  let documentId: string

  beforeEach(() => {
    vi.clearAllMocks()
    resetDocumentProtectionMemoryForTests()
    resetPageRefsForTests()
    stored = {}
    documentId = 'doc-login'
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
          set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(stored, values) }),
          remove: vi.fn(async (key: string) => { delete stored[key] })
        }
      },
      tabs: {
        get: vi.fn(async () => ({ id: 42, groupId: 7, status: 'complete', url: 'https://example.test/login' })),
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() }
      },
      scripting: {
        executeScript: vi.fn(async ({ target, func, args = [] }: {
          target: { allFrames?: boolean }; func: (...args: unknown[]) => unknown; args?: unknown[]
        }) => target.allFrames
          ? [{ frameId: 0, documentId, result: true }]
          : [{ frameId: 0, documentId, result: await func(...args) }])
      }
    })
    document.body.innerHTML = '<button id="submit" data-tabz-ref="ref-submit">Sign in</button>'
    Element.prototype.getBoundingClientRect = () => ({
      x: 10, y: 20, left: 10, top: 20, width: 100, height: 40,
      right: 110, bottom: 60, toJSON() { return {} }
    }) as DOMRect
  })

  it('keeps a prepublished ref usable after multiple protection generations on the same document', async () => {
    rememberPageRefs(42, ['ref-submit'], { agent: 'alpha', documentId })
    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))
    await runWithDocumentAdmission(42, () =>
      preflightAndProtectDocument(42, { reason: 'saved-fill' }))
    const click = vi.fn()
    document.querySelector('#submit')?.addEventListener('click', click)

    await handleBrowserAct({
      requestId: 'protected-submit', action: 'click', ref: 'ref-submit', tabId: 42, agent: 'alpha'
    })

    expect(click).toHaveBeenCalledTimes(1)
    expect(mocks.send).toHaveBeenCalledWith({
      type: 'browser-act-result',
      requestId: 'protected-submit',
      action: 'click',
      trusted: false,
      success: true,
      protected: true,
      verified: true,
      tabId: 42
    })
  })
})
