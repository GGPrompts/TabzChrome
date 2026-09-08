/**
 * Browser MCP - Cookie management handlers
 * Get, list, set, delete, and audit cookies
 */

import { sendToWebSocket } from '../websocket'
import { resolveAgentTab } from './tabGroups'

/**
 * Get a specific cookie by URL and name
 */
export async function handleBrowserCookiesGet(message: {
  requestId: string
  url: string
  name: string
}): Promise<void> {
  try {
    const cookie = await chrome.cookies.get({
      url: message.url,
      name: message.name
    })

    sendToWebSocket({
      type: 'browser-cookies-get-result',
      requestId: message.requestId,
      success: true,
      cookie: cookie
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-cookies-get-result',
      requestId: message.requestId,
      success: false,
      cookie: null,
      error: (err as Error).message
    })
  }
}

/**
 * List cookies with optional filters
 */
export async function handleBrowserCookiesList(message: {
  requestId: string
  domain?: string
  url?: string
  name?: string
  secure?: boolean
  session?: boolean
}): Promise<void> {
  try {
    // Build query object with provided filters
    const query: chrome.cookies.GetAllDetails = {}

    if (message.domain) {
      query.domain = message.domain
    }
    if (message.url) {
      query.url = message.url
    }
    if (message.name) {
      query.name = message.name
    }
    if (message.secure !== undefined) {
      query.secure = message.secure
    }
    if (message.session !== undefined) {
      query.session = message.session
    }

    const cookies = await chrome.cookies.getAll(query)

    sendToWebSocket({
      type: 'browser-cookies-list-result',
      requestId: message.requestId,
      success: true,
      cookies: cookies
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-cookies-list-result',
      requestId: message.requestId,
      success: false,
      cookies: [],
      error: (err as Error).message
    })
  }
}

/**
 * Set (create or update) a cookie
 */
export async function handleBrowserCookiesSet(message: {
  requestId: string
  url: string
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'no_restriction' | 'lax' | 'strict'
  expirationDate?: number
}): Promise<void> {
  try {
    const details: chrome.cookies.SetDetails = {
      url: message.url,
      name: message.name,
      value: message.value
    }

    if (message.domain !== undefined) {
      details.domain = message.domain
    }
    if (message.path !== undefined) {
      details.path = message.path
    }
    if (message.secure !== undefined) {
      details.secure = message.secure
    }
    if (message.httpOnly !== undefined) {
      details.httpOnly = message.httpOnly
    }
    if (message.sameSite !== undefined) {
      details.sameSite = message.sameSite
    }
    if (message.expirationDate !== undefined) {
      details.expirationDate = message.expirationDate
    }

    const cookie = await chrome.cookies.set(details)

    sendToWebSocket({
      type: 'browser-cookies-set-result',
      requestId: message.requestId,
      success: true,
      cookie: cookie
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-cookies-set-result',
      requestId: message.requestId,
      success: false,
      cookie: null,
      error: (err as Error).message
    })
  }
}

/**
 * Delete a cookie by URL and name
 */
export async function handleBrowserCookiesDelete(message: {
  requestId: string
  url: string
  name: string
}): Promise<void> {
  try {
    const removed = await chrome.cookies.remove({
      url: message.url,
      name: message.name
    })

    sendToWebSocket({
      type: 'browser-cookies-delete-result',
      requestId: message.requestId,
      success: true,
      removed: removed
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-cookies-delete-result',
      requestId: message.requestId,
      success: false,
      removed: null,
      error: (err as Error).message
    })
  }
}

/**
 * Audit cookies for a page - categorize by first-party/third-party, session/persistent
 */
export async function handleBrowserCookiesAudit(message: {
  requestId: string
  tabId?: number
  agent?: string
}): Promise<void> {
  try {
    const tab = await resolveAgentTab(message.agent, message.tabId)

    if (!tab || !tab.url) {
      sendToWebSocket({
        type: 'browser-cookies-audit-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab or tab has no URL'
      })
      return
    }

    // Parse the page URL to get the domain
    const pageUrl = new URL(tab.url)
    const pageDomain = pageUrl.hostname

    // Get all cookies for this URL
    const cookies = await chrome.cookies.getAll({ url: tab.url })

    // Also get cookies for subdomains and parent domains
    const domainParts = pageDomain.split('.')
    const additionalCookies: chrome.cookies.Cookie[] = []

    // Get cookies for parent domain (e.g., github.com from www.github.com)
    if (domainParts.length > 2) {
      const parentDomain = domainParts.slice(1).join('.')
      const parentCookies = await chrome.cookies.getAll({ domain: parentDomain })
      for (const c of parentCookies) {
        if (!cookies.some(existing => existing.name === c.name && existing.domain === c.domain)) {
          additionalCookies.push(c)
        }
      }
    }

    // Get cookies for the root domain with dot prefix (e.g., .github.com)
    const rootDomain = domainParts.length >= 2
      ? domainParts.slice(-2).join('.')
      : pageDomain
    const dotDomainCookies = await chrome.cookies.getAll({ domain: '.' + rootDomain })
    for (const c of dotDomainCookies) {
      if (!cookies.some(existing => existing.name === c.name && existing.domain === c.domain) &&
          !additionalCookies.some(existing => existing.name === c.name && existing.domain === c.domain)) {
        additionalCookies.push(c)
      }
    }

    const allCookies = [...cookies, ...additionalCookies]

    // Categorize cookies
    const firstParty: chrome.cookies.Cookie[] = []
    const thirdParty: chrome.cookies.Cookie[] = []
    const sessionCookies: chrome.cookies.Cookie[] = []
    const persistentCookies: chrome.cookies.Cookie[] = []

    for (const cookie of allCookies) {
      // Check if first-party (domain matches page domain or is a subdomain)
      const cookieDomain = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain
      const isFirstParty = pageDomain === cookieDomain ||
                           pageDomain.endsWith('.' + cookieDomain) ||
                           cookieDomain.endsWith('.' + pageDomain)

      if (isFirstParty) {
        firstParty.push(cookie)
      } else {
        thirdParty.push(cookie)
      }

      // Check session vs persistent
      if (cookie.session) {
        sessionCookies.push(cookie)
      } else {
        persistentCookies.push(cookie)
      }
    }

    sendToWebSocket({
      type: 'browser-cookies-audit-result',
      requestId: message.requestId,
      success: true,
      url: tab.url,
      domain: pageDomain,
      cookies: allCookies,
      firstParty: firstParty,
      thirdParty: thirdParty,
      sessionCookies: sessionCookies,
      persistentCookies: persistentCookies
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-cookies-audit-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
