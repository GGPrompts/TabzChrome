/**
 * Browser MCP - Interaction handlers
 * Click elements, fill inputs, get element info
 */

import { sendToWebSocket } from '../websocket'

/**
 * Click an element on the page using chrome.scripting.executeScript
 * Waits for element to exist, then dispatches click event
 */
export async function handleBrowserClickElement(message: {
  requestId: string
  selector: string
  tabId?: number
  waitTimeout?: number
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-click-element-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const waitTimeout = message.waitTimeout || 5000

    // Execute click in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (selector: string, timeout: number) => {
        return new Promise<{ success: boolean; error?: string; tagName?: string }>((resolve) => {
          const startTime = Date.now()

          const tryClick = () => {
            const el = document.querySelector(selector)
            if (el) {
              // Check if element is visible
              const rect = el.getBoundingClientRect()
              if (rect.width === 0 && rect.height === 0) {
                resolve({ success: false, error: `Element found but has zero dimensions: ${selector}` })
                return
              }

              // Dispatch click event
              const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
              })
              el.dispatchEvent(clickEvent)

              // For links and buttons, also try the native click
              if (el instanceof HTMLElement) {
                el.click()
              }

              resolve({ success: true, tagName: el.tagName.toLowerCase() })
            } else if (Date.now() - startTime < timeout) {
              // Element not found yet, retry
              setTimeout(tryClick, 100)
            } else {
              resolve({ success: false, error: `Element not found within ${timeout}ms: ${selector}` })
            }
          }

          tryClick()
        })
      },
      args: [message.selector, waitTimeout]
    })

    const result = results[0]?.result as { success: boolean; error?: string; tagName?: string } | undefined

    sendToWebSocket({
      type: 'browser-click-element-result',
      requestId: message.requestId,
      success: result?.success || false,
      tagName: result?.tagName,
      error: result?.error
    })

    // Trigger visual highlight on success
    if (result?.success) {
      chrome.tabs.sendMessage(targetTabId, {
        type: 'HIGHLIGHT_ELEMENT',
        selector: message.selector,
        highlightType: 'click'
      }).catch(() => {}) // Ignore if content script not loaded
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-click-element-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Fill an input field with text using chrome.scripting.executeScript
 * Clears existing value, sets new value, and dispatches input/change events
 */
export async function handleBrowserFillInput(message: {
  requestId: string
  selector: string
  value: string
  tabId?: number
  waitTimeout?: number
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-fill-input-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const waitTimeout = message.waitTimeout || 5000

    // Execute fill in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (selector: string, value: string, timeout: number) => {
        return new Promise<{ success: boolean; error?: string; tagName?: string }>((resolve) => {
          const startTime = Date.now()

          const tryFill = () => {
            const el = document.querySelector(selector)
            if (el) {
              // Check if it's an input-like element
              if (!(el instanceof HTMLInputElement ||
                    el instanceof HTMLTextAreaElement ||
                    el instanceof HTMLSelectElement ||
                    (el as HTMLElement).isContentEditable)) {
                resolve({ success: false, error: `Element is not an input field: ${el.tagName}` })
                return
              }

              // Focus the element
              (el as HTMLElement).focus()

              // Clear and set value
              if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                el.value = ''
                el.value = value
              } else if (el instanceof HTMLSelectElement) {
                el.value = value
              } else if ((el as HTMLElement).isContentEditable) {
                (el as HTMLElement).textContent = value
              }

              // Dispatch input and change events for React/Vue compatibility
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))

              resolve({ success: true, tagName: el.tagName.toLowerCase() })
            } else if (Date.now() - startTime < timeout) {
              // Element not found yet, retry
              setTimeout(tryFill, 100)
            } else {
              resolve({ success: false, error: `Element not found within ${timeout}ms: ${selector}` })
            }
          }

          tryFill()
        })
      },
      args: [message.selector, message.value, waitTimeout]
    })

    const result = results[0]?.result as { success: boolean; error?: string; tagName?: string } | undefined

    sendToWebSocket({
      type: 'browser-fill-input-result',
      requestId: message.requestId,
      success: result?.success || false,
      tagName: result?.tagName,
      error: result?.error
    })

    // Trigger visual highlight on success
    if (result?.success) {
      chrome.tabs.sendMessage(targetTabId, {
        type: 'HIGHLIGHT_ELEMENT',
        selector: message.selector,
        highlightType: 'fill'
      }).catch(() => {}) // Ignore if content script not loaded
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-fill-input-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Get detailed information about an element using chrome.scripting.executeScript
 * Returns HTML, text, attributes, bounds, and computed styles
 */
export async function handleBrowserGetElementInfo(message: {
  requestId: string
  selector: string
  tabId?: number
  includeStyles?: boolean
  styleProperties?: string[] | null
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-element-info-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    // Default style properties to extract
    const defaultStyleProps = [
      'display', 'position', 'top', 'right', 'bottom', 'left',
      'width', 'height', 'margin', 'padding', 'boxSizing',
      'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'gap',
      'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'color',
      'backgroundColor', 'backgroundImage',
      'border', 'borderRadius', 'boxShadow', 'opacity', 'transform', 'zIndex'
    ]

    const styleProps = message.styleProperties || defaultStyleProps
    const includeStyles = message.includeStyles !== false

    // Execute in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
      func: (selector: string, props: string[], getStyles: boolean) => {
        const el = document.querySelector(selector)
        if (!el) {
          return { found: false, error: `Element not found: ${selector}` }
        }

        const rect = el.getBoundingClientRect()

        // Get all attributes
        const attributes: Record<string, string> = {}
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i]
          attributes[attr.name] = attr.value
        }

        // Get computed styles
        let styles: Record<string, string> = {}
        if (getStyles) {
          const computed = window.getComputedStyle(el)
          for (const prop of props) {
            const value = computed.getPropertyValue(
              prop.replace(/([A-Z])/g, '-$1').toLowerCase()
            )
            if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
              styles[prop] = value
            }
          }
        }

        // Try to build a parent selector for context
        let parentSelector = ''
        const parent = el.parentElement
        if (parent) {
          if (parent.id) {
            parentSelector = `#${parent.id}`
          } else if (parent.className && typeof parent.className === 'string') {
            parentSelector = `.${parent.className.split(' ')[0]}`
          } else {
            parentSelector = parent.tagName.toLowerCase()
          }
        }

        return {
          found: true,
          html: el.innerHTML.slice(0, 5000),
          outerHTML: el.outerHTML.slice(0, 5000),
          innerText: (el as HTMLElement).innerText?.slice(0, 500),
          tagName: el.tagName.toLowerCase(),
          attributes,
          bounds: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
            left: Math.round(rect.left)
          },
          styles,
          parentSelector,
          childCount: el.children.length
        }
      },
      args: [message.selector, styleProps, includeStyles]
    })

    const result = results[0]?.result as {
      found: boolean
      error?: string
      html?: string
      outerHTML?: string
      innerText?: string
      tagName?: string
      attributes?: Record<string, string>
      bounds?: { x: number; y: number; width: number; height: number; top: number; right: number; bottom: number; left: number }
      styles?: Record<string, string>
      parentSelector?: string
      childCount?: number
    } | undefined

    if (!result?.found) {
      sendToWebSocket({
        type: 'browser-get-element-info-result',
        requestId: message.requestId,
        success: false,
        error: result?.error || 'Element not found'
      })
      return
    }

    sendToWebSocket({
      type: 'browser-get-element-info-result',
      requestId: message.requestId,
      success: true,
      html: result.html,
      outerHTML: result.outerHTML,
      innerText: result.innerText,
      tagName: result.tagName,
      attributes: result.attributes,
      bounds: result.bounds,
      styles: result.styles,
      parentSelector: result.parentSelector,
      childCount: result.childCount
    })

    // Trigger visual highlight for inspection
    chrome.tabs.sendMessage(targetTabId, {
      type: 'HIGHLIGHT_ELEMENT',
      selector: message.selector,
      highlightType: 'inspect'
    }).catch(() => {}) // Ignore if content script not loaded
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-element-info-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
