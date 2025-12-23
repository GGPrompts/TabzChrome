/**
 * Browser MCP - Tab management handlers
 * List tabs, switch tabs, get active tab, open URLs
 */

import { sendToWebSocket } from '../websocket'

/**
 * List all browser tabs with accurate active state
 * Unlike CDP, extension API knows the REAL focused tab
 */
export async function handleBrowserListTabs(message: { requestId: string }): Promise<void> {
  try {
    // Get all tabs in the current window
    const allTabs = await chrome.tabs.query({ lastFocusedWindow: true })

    // Filter out chrome:// and extension pages
    const tabs = allTabs.filter(tab =>
      tab.url &&
      !tab.url.startsWith('chrome://') &&
      !tab.url.startsWith('chrome-extension://')
    )

    const tabList = tabs.map((tab, index) => ({
      tabId: tab.id || -1,
      index: index + 1, // 1-based for user display
      url: tab.url || '',
      title: tab.title || '',
      active: tab.active,
      favIconUrl: tab.favIconUrl
    }))

    sendToWebSocket({
      type: 'browser-list-tabs-result',
      requestId: message.requestId,
      tabs: tabList,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-list-tabs-result',
      requestId: message.requestId,
      tabs: [],
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Switch to a specific tab by Chrome tab ID
 */
export async function handleBrowserSwitchTab(message: { requestId: string; tabId: number }): Promise<void> {
  try {
    await chrome.tabs.update(message.tabId, { active: true })

    // Also focus the window containing this tab
    const tab = await chrome.tabs.get(message.tabId)
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true })
    }

    sendToWebSocket({
      type: 'browser-switch-tab-result',
      requestId: message.requestId,
      success: true,
      tabId: message.tabId
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-switch-tab-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Get the currently active tab
 */
export async function handleBrowserGetActiveTab(message: { requestId: string }): Promise<void> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    if (tab) {
      sendToWebSocket({
        type: 'browser-get-active-tab-result',
        requestId: message.requestId,
        success: true,
        tab: {
          tabId: tab.id || -1,
          url: tab.url || '',
          title: tab.title || '',
          favIconUrl: tab.favIconUrl
        }
      })
    } else {
      sendToWebSocket({
        type: 'browser-get-active-tab-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-active-tab-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Open a URL in a new or existing tab
 * Replaces CDP-based URL opening with Chrome Extension API
 */
export async function handleBrowserOpenUrl(message: {
  requestId: string
  url: string
  newTab: boolean
  background: boolean
  reuseExisting: boolean
}): Promise<void> {
  try {
    const { url, newTab, background, reuseExisting } = message

    // If reuseExisting, check if URL is already open
    if (reuseExisting) {
      const allTabs = await chrome.tabs.query({})
      const existingTab = allTabs.find(tab => {
        if (!tab.url) return false
        // Check for exact match or match without trailing slash
        return tab.url === url ||
               tab.url === url + '/' ||
               tab.url + '/' === url
      })

      if (existingTab && existingTab.id) {
        // Tab already exists - switch to it
        await chrome.tabs.update(existingTab.id, { active: true })
        if (existingTab.windowId) {
          await chrome.windows.update(existingTab.windowId, { focused: true })
        }

        sendToWebSocket({
          type: 'browser-open-url-result',
          requestId: message.requestId,
          success: true,
          tabId: existingTab.id,
          url: existingTab.url || url,
          reused: true
        })
        return
      }
    }

    let resultTabId: number
    let resultUrl: string

    if (newTab) {
      // Open in new tab
      const tab = await chrome.tabs.create({
        url,
        active: !background
      })
      resultTabId = tab.id || -1
      resultUrl = tab.url || url

      // If not background, focus the window
      if (!background && tab.windowId) {
        await chrome.windows.update(tab.windowId, { focused: true })
      }
    } else {
      // Navigate current tab
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      if (activeTab && activeTab.id) {
        const tab = await chrome.tabs.update(activeTab.id, { url })
        resultTabId = tab?.id || activeTab.id
        resultUrl = url
      } else {
        // No active tab, create new one
        const tab = await chrome.tabs.create({ url, active: true })
        resultTabId = tab.id || -1
        resultUrl = tab.url || url
      }
    }

    sendToWebSocket({
      type: 'browser-open-url-result',
      requestId: message.requestId,
      success: true,
      tabId: resultTabId,
      url: resultUrl,
      reused: false
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-open-url-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
