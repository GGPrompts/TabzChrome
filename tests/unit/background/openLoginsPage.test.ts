import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))

import { sendToWebSocket } from '../../../extension/background/websocket'
import {
  handleBrowserOpenLoginsPage,
  resetOpenLoginsPageQueueForTests
} from '../../../extension/background/browserMcp/logins'

const PREFIX = 'chrome-extension://fixture/dashboard/index.html'

describe('Logins dashboard handoff', () => {
  const query = vi.fn()
  const get = vi.fn()
  const create = vi.fn()
  const update = vi.fn()
  const ungroup = vi.fn()
  const focus = vi.fn()
  const lastFrame = () => vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0] as Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    resetOpenLoginsPageQueueForTests()
    query.mockResolvedValue([])
    create.mockImplementation(async ({ url }) => ({ id: 7, windowId: 2, url, groupId: -1 }))
    focus.mockResolvedValue(undefined)
    vi.stubGlobal('chrome', {
      runtime: { getURL: vi.fn((path: string) => `chrome-extension://fixture/${path}`) },
      tabs: { query, get, create, update, ungroup },
      tabGroups: { TAB_GROUP_ID_NONE: -1 },
      windows: { update: focus }
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('opens a new ungrouped dashboard with an encoded exact host', async () => {
    await handleBrowserOpenLoginsPage({ requestId: 'open', host: ' App.Example.com ' })
    expect(query).toHaveBeenCalledWith({})
    expect(create).toHaveBeenCalledWith({
      url: `${PREFIX}#/logins?host=app.example.com`, active: true
    })
    expect(lastFrame()).toMatchObject({
      type: 'browser-open-logins-page-result', requestId: 'open', success: true,
      url: `${PREFIX}#/logins?host=app.example.com`, tabId: 7
    })
  })

  it('reuses a pending ungrouped dashboard and ignores grouped dashboards', async () => {
    const grouped = { id: 3, url: PREFIX, groupId: 9 }
    const pending = { id: 4, pendingUrl: `${PREFIX}#/logins`, groupId: -1, windowId: 2 }
    query.mockResolvedValue([grouped, pending])
    get.mockResolvedValue(pending)
    update.mockImplementation(async (_id, changes) => ({ ...pending, url: changes.url, pendingUrl: undefined }))

    await handleBrowserOpenLoginsPage({ requestId: 'reuse', host: 'app.example.com' })

    expect(update).toHaveBeenCalledWith(4, { url: `${PREFIX}#/logins?host=app.example.com`, active: true })
    expect(create).not.toHaveBeenCalled()
    expect(ungroup).not.toHaveBeenCalled()
  })

  it('does not reuse a dashboard tab that is navigating to a user page', async () => {
    query.mockResolvedValue([{
      id: 4, url: PREFIX, pendingUrl: 'https://app.example.com/', groupId: -1
    }])
    await handleBrowserOpenLoginsPage({ requestId: 'leaving', host: 'app.example.com' })
    expect(get).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('serializes concurrent opens so they create only one dashboard tab', async () => {
    let existing: chrome.tabs.Tab | undefined
    query.mockImplementation(async () => existing ? [existing] : [])
    create.mockImplementation(async ({ url }) => {
      existing = { id: 7, windowId: 2, url, groupId: -1 }
      return existing
    })
    get.mockImplementation(async () => existing)
    update.mockImplementation(async (_id, changes) => {
      existing = { ...existing, url: changes.url } as chrome.tabs.Tab
      return existing
    })

    await Promise.all([
      handleBrowserOpenLoginsPage({ requestId: 'one', host: 'one.example.com' }),
      handleBrowserOpenLoginsPage({ requestId: 'two', host: 'two.example.com' })
    ])

    expect(create).toHaveBeenCalledTimes(1)
    expect(update).toHaveBeenCalledTimes(1)
    expect(vi.mocked(sendToWebSocket)).toHaveBeenCalledTimes(2)
  })

  it('never replays a rejected navigation by creating another tab', async () => {
    const existing = { id: 4, url: PREFIX, groupId: -1 }
    query.mockResolvedValue([existing])
    get.mockResolvedValue(existing)
    update.mockRejectedValue(new Error('update outcome unknown'))

    await handleBrowserOpenLoginsPage({ requestId: 'uncertain', host: 'app.example.com' })

    expect(create).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false, error: 'update outcome unknown' })
  })

  it('does not ungroup a reused tab that moved into a group', async () => {
    const existing = { id: 4, url: PREFIX, groupId: -1 }
    query.mockResolvedValue([existing])
    get.mockResolvedValue(existing)
    update.mockResolvedValue({ ...existing, groupId: 11 })

    await handleBrowserOpenLoginsPage({ requestId: 'group-race', host: 'app.example.com' })

    expect(ungroup).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false })
  })

  it('ungroups only a tab positively created by this request', async () => {
    create.mockResolvedValue({ id: 8, url: `${PREFIX}#/logins`, groupId: 12 })
    get.mockResolvedValue({ id: 8, url: `${PREFIX}#/logins`, groupId: -1, windowId: 2 })

    await handleBrowserOpenLoginsPage({ requestId: 'created-grouped', host: 'app.example.com' })

    expect(ungroup).toHaveBeenCalledWith(8)
    expect(lastFrame()).toMatchObject({ success: true, tabId: 8 })
  })

  it('refuses non-host input before touching Chrome tabs', async () => {
    await handleBrowserOpenLoginsPage({ requestId: 'bad', host: 'app.example.com/path?token=x' })
    expect(query).not.toHaveBeenCalled()
    expect(lastFrame()).toMatchObject({ success: false, error: 'A valid host is required' })
  })
})
