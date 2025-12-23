/**
 * Browser MCP - Script execution and page info handlers
 * Execute safe predefined operations, get page information
 */

import { sendToWebSocket } from '../websocket'

/**
 * Handle script execution request from backend (MCP server)
 * Uses safe predefined operations - no eval for security
 */
export async function handleBrowserExecuteScript(message: { requestId: string; code: string; tabId?: number; allFrames?: boolean }): Promise<void> {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-script-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    // Execute predefined operations without eval (CSP-safe)
    // For arbitrary code, we use a set of safe predefined functions
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId, allFrames: message.allFrames || false },
      func: (code: string) => {
        try {
          // Predefined safe operations that don't require eval
          // These cover common use cases for browser automation

          // Get all links
          if (code === 'document.links' || code.includes('document.links')) {
            const links = [...document.links].map(a => ({
              text: a.textContent?.trim() || '',
              href: a.href
            }))
            return { success: true, result: links }
          }

          // Get page title
          if (code === 'document.title') {
            return { success: true, result: document.title }
          }

          // Get page HTML (truncated)
          if (code.includes('outerHTML') || code.includes('innerHTML')) {
            return { success: true, result: document.documentElement.outerHTML.slice(0, 10000) }
          }

          // Get all images
          if (code.includes('document.images')) {
            const images = [...document.images].map(img => ({
              src: img.src,
              alt: img.alt
            }))
            return { success: true, result: images }
          }

          // Get text content
          if (code.includes('textContent') || code.includes('innerText')) {
            return { success: true, result: document.body.innerText.slice(0, 10000) }
          }

          // Query selector - extract selector from code
          const selectorMatch = code.match(/querySelector\(['"]([^'"]+)['"]\)/)
          if (selectorMatch) {
            const el = document.querySelector(selectorMatch[1])
            if (el) {
              return { success: true, result: {
                tagName: el.tagName,
                text: el.textContent?.trim(),
                html: el.outerHTML.slice(0, 1000)
              }}
            }
            return { success: false, error: `Element not found: ${selectorMatch[1]}` }
          }

          // Query selector all
          const selectorAllMatch = code.match(/querySelectorAll\(['"]([^'"]+)['"]\)/)
          if (selectorAllMatch) {
            const els = document.querySelectorAll(selectorAllMatch[1])
            const results = [...els].slice(0, 100).map(el => ({
              tagName: el.tagName,
              text: el.textContent?.trim()
            }))
            return { success: true, result: results }
          }

          // localStorage
          if (code.includes('localStorage')) {
            const storage: Record<string, string> = {}
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i)
              if (key) storage[key] = localStorage.getItem(key) || ''
            }
            return { success: true, result: storage }
          }

          // For any other code, return an error explaining the limitation
          return {
            success: false,
            error: 'Arbitrary code execution blocked by CSP. Use predefined operations: document.links, document.title, document.images, querySelector("selector"), querySelectorAll("selector"), localStorage, textContent, outerHTML'
          }
        } catch (e) {
          return { success: false, error: (e as Error).message }
        }
      },
      args: [message.code]
    })

    const result = results[0]?.result as { success: boolean; result?: unknown; error?: string } | undefined
    sendToWebSocket({
      type: 'browser-script-result',
      requestId: message.requestId,
      success: result?.success || false,
      result: result?.result,
      error: result?.error
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-script-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Handle page info request from backend (MCP server)
 */
export async function handleBrowserGetPageInfo(message: { requestId: string; tabId?: number }): Promise<void> {
  try {
    const tabs = message.tabId
      ? [await chrome.tabs.get(message.tabId)]
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    const tab = tabs[0]

    if (tab) {
      sendToWebSocket({
        type: 'browser-page-info',
        requestId: message.requestId,
        url: tab.url || '',
        title: tab.title || '',
        tabId: tab.id || -1,
        favIconUrl: tab.favIconUrl
      })
    } else {
      sendToWebSocket({
        type: 'browser-page-info',
        requestId: message.requestId,
        url: '',
        title: '',
        tabId: -1,
        error: 'No active tab found'
      })
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-page-info',
      requestId: message.requestId,
      url: '',
      title: '',
      tabId: -1,
      error: (err as Error).message
    })
  }
}
