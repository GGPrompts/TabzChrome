/** Open the human-owned Logins dashboard outside browser-agent groups. */

import { sendToWebSocket } from '../websocket'

const DASHBOARD_PATH = 'dashboard/index.html'
let openQueue: Promise<void> = Promise.resolve()

function normalizeHost(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim().toLowerCase().replace(/\.$/, '') : ''
  if (!raw || /[\s/@?#]/.test(raw)) throw new Error('A valid host is required')
  try {
    const parsed = new URL(`https://${raw}`)
    if (parsed.port || parsed.pathname !== '/' || !parsed.hostname) throw new Error('invalid host')
    return parsed.hostname.toLowerCase()
  } catch {
    throw new Error('A valid host is required')
  }
}

function isUngrouped(tab: chrome.tabs.Tab): boolean {
  const none = chrome.tabGroups?.TAB_GROUP_ID_NONE ?? -1
  return tab.groupId === undefined || tab.groupId === none
}

function isDashboardTab(tab: chrome.tabs.Tab, prefix: string): boolean {
  const isDashboardUrl = (url: string | undefined) =>
    url === prefix || url?.startsWith(`${prefix}#`) || url?.startsWith(`${prefix}?`)
  // When navigation is pending, its destination is authoritative. Do not
  // hijack a dashboard tab that the user is already navigating elsewhere.
  return tab.pendingUrl !== undefined ? Boolean(isDashboardUrl(tab.pendingUrl)) : Boolean(isDashboardUrl(tab.url))
}

export function loginsPageUrl(host: string): string {
  return chrome.runtime.getURL(`${DASHBOARD_PATH}#/logins?host=${encodeURIComponent(host)}`)
}

async function openLoginsPage(host: string): Promise<{ url: string; tabId?: number }> {
  const url = loginsPageUrl(host)
  const dashboardPrefix = chrome.runtime.getURL(DASHBOARD_PATH)
  // Chrome's `url` query filter is not guaranteed to include pendingUrl.
  // Read metadata for all tabs, then consider only extension dashboard URLs.
  const candidate = (await chrome.tabs.query({}))
    .find(tab => isUngrouped(tab) && isDashboardTab(tab, dashboardPrefix))

  let tab: chrome.tabs.Tab | undefined
  let newlyCreated = false
  if (candidate?.id !== undefined) {
    let current: chrome.tabs.Tab | undefined
    try {
      current = await chrome.tabs.get(candidate.id)
    } catch {
      // This read failed before any navigation was attempted, so replacement
      // cannot replay a mutation.
    }
    if (!current || !isUngrouped(current) || !isDashboardTab(current, dashboardPrefix)) {
      tab = await chrome.tabs.create({ url, active: true })
      newlyCreated = true
    } else {
      // Once update begins its outcome can be uncertain. Never replay it by
      // creating another tab if Chrome rejects or returns no tab.
      tab = await chrome.tabs.update(candidate.id, { url, active: true })
      if (!tab) throw new Error('Chrome did not confirm the Logins page update')
      if (!isUngrouped(tab)) throw new Error('The Logins page moved into a tab group during navigation')
    }
  } else {
    tab = await chrome.tabs.create({ url, active: true })
    newlyCreated = true
  }

  if (!tab) throw new Error('Chrome did not return the Logins tab')
  if (!isUngrouped(tab)) {
    if (!newlyCreated) throw new Error('The Logins page moved into a tab group during navigation')
    if (tab.id === undefined) throw new Error('Chrome grouped the Logins page unexpectedly')
    await chrome.tabs.ungroup(tab.id)
    tab = await chrome.tabs.get(tab.id)
    if (!isUngrouped(tab)) throw new Error('Chrome could not keep the Logins page outside tab groups')
  }
  if (tab.windowId !== undefined) {
    try {
      await chrome.windows.update(tab.windowId, { focused: true })
    } catch {
      // Focusing is best effort; the page has already been opened exactly once.
    }
  }
  return { url, tabId: tab.id }
}

function enqueueOpen<T>(work: () => Promise<T>): Promise<T> {
  const run = openQueue.then(work, work)
  openQueue = run.then(() => undefined, () => undefined)
  return run
}

export function resetOpenLoginsPageQueueForTests(): void {
  openQueue = Promise.resolve()
}

export async function handleBrowserOpenLoginsPage(message: {
  requestId: string
  host: string
  reason?: string
  agent?: string
}): Promise<void> {
  try {
    const host = normalizeHost(message.host)
    const result = await enqueueOpen(() => openLoginsPage(host))
    sendToWebSocket({ type: 'browser-open-logins-page-result', requestId: message.requestId, success: true, ...result })
  } catch (error) {
    sendToWebSocket({
      type: 'browser-open-logins-page-result', requestId: message.requestId,
      success: false, error: (error as Error).message
    })
  }
}
