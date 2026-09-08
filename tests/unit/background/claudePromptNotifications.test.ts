import { beforeEach, describe, expect, it, vi } from 'vitest'

const transport = vi.hoisted(() => ({
  connect: vi.fn(),
  send: vi.fn(),
  setReconnect: vi.fn()
}))

vi.mock('@/background/websocket', () => ({
  connectWebSocket: transport.connect,
  sendToWebSocket: transport.send,
  setScheduleReconnect: transport.setReconnect
}))
vi.mock('@/background/utils', () => ({ tryOpenSidebar: vi.fn() }))

interface TerminalFixture {
  id: string
  name?: string
  sessionName?: string
  workingDir?: string
  command?: string
  profile?: { command?: string }
  secret?: boolean
}

const promptStatus = {
  success: true,
  status: 'tool_use',
  pane_command: 'claude',
  last_updated: '2026-09-07T12:00:00.000Z',
  details: { event: 'permission_prompt' }
}

let localData: Record<string, unknown>
let sessionData: Record<string, unknown>
let alarms: typeof import('@/background/alarms')
let state: typeof import('@/background/state')

function setTerminals(terminals: TerminalFixture[]): void {
  localData.terminalSessions = terminals
}

function terminal(id = 'ctt-ordinary'): TerminalFixture {
  return {
    id,
    name: 'Synthetic Claude',
    sessionName: id,
    workingDir: '/synthetic/project',
    profile: { command: 'claude' }
  }
}

function setNotificationSettings(overrides: Record<string, unknown> = {}): void {
  localData.notificationSettings = {
    enabled: true,
    quietHours: { enabled: false, startHour: 22, endHour: 8 },
    events: { questionWaiting: true },
    ...overrides
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(async () => {
  vi.resetModules()
  localData = {}
  sessionData = {}
  transport.connect.mockReset()
  transport.send.mockReset()
  transport.setReconnect.mockReset()
  const storageArea = (data: Record<string, unknown>) => ({
    get: vi.fn(async (key: string) => ({ [key]: data[key] })),
    set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(data, structuredClone(items)) }),
    remove: vi.fn(async (key: string) => { delete data[key] })
  })
  Object.assign(chrome, {
    storage: {
      ...chrome.storage,
      local: storageArea(localData),
      session: storageArea(sessionData)
    },
    alarms: {
      get: vi.fn(async () => undefined),
      create: vi.fn(),
      clear: vi.fn(async () => true),
      onAlarm: { addListener: vi.fn() }
    },
    notifications: {
      create: vi.fn((_id: string, _options: chrome.notifications.NotificationOptions, callback?: () => void) => callback?.()),
      clear: vi.fn((_id: string, callback?: () => void) => callback?.()),
      onClicked: { addListener: vi.fn() }
    },
    windows: {
      ...chrome.windows,
      getLastFocused: vi.fn(async () => ({ id: 10, focused: true })),
      update: vi.fn(async () => ({}))
    },
    runtime: { ...chrome.runtime, getURL: vi.fn((path: string) => `chrome-extension://fixture/${path}`) }
  })
  vi.mocked(fetch).mockReset()
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => promptStatus } as Response)
  alarms = await import('@/background/alarms')
  state = await import('@/background/state')
})

describe('background Claude prompt polling', () => {
  it('does not rearm from a stale storage read after a newer removal sync', async () => {
    const oldRead = deferred<Record<string, unknown>>()
    vi.mocked(chrome.storage.local.get).mockReturnValueOnce(oldRead.promise)
    const older = alarms.syncClaudePromptPolling()
    setTerminals([])
    await alarms.syncClaudePromptPolling()
    oldRead.resolve({ terminalSessions: [terminal()] })
    await older
    expect(chrome.alarms.create).not.toHaveBeenCalled()
    expect(chrome.alarms.clear).toHaveBeenCalledWith('claude-prompt-poll')
  })

  it('clears a stale prompt when the backend disconnects', async () => {
    setTerminals([terminal()])
    setNotificationSettings()
    await alarms.pollClaudePromptNotifications()
    expect(chrome.notifications.create).toHaveBeenCalledTimes(1)
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Synthetic disconnect'))
    await alarms.pollClaudePromptNotifications()
    expect(chrome.notifications.clear).toHaveBeenCalledWith('tabz-claude-waiting:ctt-ordinary', expect.any(Function))
  })

  it('never overlaps polls and rearms one shot only after the bounded request settles', async () => {
    setTerminals([terminal()])
    setNotificationSettings()
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)

    const first = alarms.pollClaudePromptNotifications()
    const overlapping = alarms.pollClaudePromptNotifications()
    await overlapping
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(chrome.alarms.create).not.toHaveBeenCalled()

    response.resolve({ ok: true, json: async () => ({ ...promptStatus, status: 'processing', details: null }) } as Response)
    await first
    expect(chrome.alarms.create).toHaveBeenCalledExactlyOnceWith('claude-prompt-poll', { delayInMinutes: 0.5 })
  })

  it('does not fetch output from secret-marked or protected-prefix terminals', async () => {
    setTerminals([
      { ...terminal('ordinary-id'), secret: true },
      terminal('ctt-secret-synthetic-editor')
    ])

    await alarms.pollClaudePromptNotifications()

    expect(fetch).not.toHaveBeenCalled()
    expect(chrome.notifications.create).not.toHaveBeenCalled()
    expect(chrome.alarms.create).not.toHaveBeenCalled()
  })

  it('drops a late prompt response after terminal removal without notifying or rearming', async () => {
    setTerminals([terminal('ctt-removed')])
    setNotificationSettings()
    const response = deferred<Response>()
    vi.mocked(fetch).mockReturnValueOnce(response.promise)

    const poll = alarms.pollClaudePromptNotifications()
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
    setTerminals([])
    await alarms.syncClaudePromptPolling()
    response.resolve({ ok: true, json: async () => promptStatus } as Response)
    await poll

    expect(chrome.notifications.create).not.toHaveBeenCalled()
    expect(chrome.alarms.clear).toHaveBeenCalledWith('claude-prompt-poll')
    expect(chrome.alarms.create).not.toHaveBeenCalled()
  })

  it('notifies once for one transition and clears after completion', async () => {
    setTerminals([terminal('ctt-transition')])
    setNotificationSettings()

    await alarms.pollClaudePromptNotifications()
    await alarms.pollClaudePromptNotifications()
    expect(chrome.notifications.create).toHaveBeenCalledExactlyOnceWith(
      'tabz-claude-waiting:ctt-transition',
      expect.objectContaining({ title: 'Claude needs you: Synthetic Claude', message: 'Permission prompt' }),
      expect.any(Function)
    )

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true, status: 'processing', pane_command: 'claude',
        last_updated: '2026-09-07T12:00:01.000Z', details: { event: 'tool_completed' }
      })
    } as Response)
    await alarms.pollClaudePromptNotifications()
    expect(chrome.notifications.clear).toHaveBeenCalledWith(
      'tabz-claude-waiting:ctt-transition', expect.any(Function))
  })

  it.each([
    ['master disabled', { enabled: false }],
    ['question event disabled', { events: { questionWaiting: false } }],
    ['quiet hours', { quietHours: { enabled: true, startHour: 0, endHour: 24 } }]
  ])('honors %s notification settings', async (_name, settings) => {
    setTerminals([terminal()])
    setNotificationSettings(settings)
    await alarms.pollClaudePromptNotifications()
    expect(chrome.notifications.create).not.toHaveBeenCalled()
  })

  it('suppresses the visible terminal in the focused Chrome window', async () => {
    setTerminals([terminal('ctt-focused')])
    setNotificationSettings()
    state.terminalViews.set(10, {
      terminalId: 'ctt-focused', visible: true, windowId: 10, isPopout: false
    })

    await alarms.pollClaudePromptNotifications()

    expect(chrome.notifications.create).not.toHaveBeenCalled()
  })

  it('requires Claude evidence from stored metadata or the actual pane command', async () => {
    setTerminals([{
      id: 'ctt-shell', name: 'Shell', sessionName: 'ctt-shell', workingDir: '/synthetic/project',
      profile: { command: 'bash' }
    }])
    setNotificationSettings()
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ ...promptStatus, pane_command: 'bash' })
    } as Response)
    await alarms.pollClaudePromptNotifications()
    expect(chrome.notifications.create).not.toHaveBeenCalled()

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true, json: async () => ({ ...promptStatus, pane_command: 'claude', last_updated: '2026-09-07T12:01:00.000Z' })
    } as Response)
    await alarms.pollClaudePromptNotifications()
    expect(chrome.notifications.create).toHaveBeenCalledTimes(1)
  })
})
