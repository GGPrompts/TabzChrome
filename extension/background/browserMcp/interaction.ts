/**
 * Browser MCP - Interaction handlers
 * Click elements, fill inputs, get element info
 */

import { sendToWebSocket } from '../websocket'
import { isSensitiveInput } from './sensitiveFields'
import { assertAgentReadableTab } from './pageGuard'
import { resolveAgentTab } from './tabGroups'
import { sendDebuggerCommand, withDebugger } from './debugger'
import {
  assertDocumentReadable,
  assertDocumentReadCurrent,
  assertProtectedDocumentCurrent,
  currentDocumentProtection,
  preflightAndProtectDocument,
  protectTabForUnboundMutation,
  protectedDocumentTarget,
  runWithDocumentAdmission,
  type DocumentProtectionToken,
} from './documentProtection'

const RESPONSE_RESERVE_MS = 1000

function mutationBudget(requestTimeoutMs: number | undefined, waitTimeout: number, receivedAt: number): number {
  if (requestTimeoutMs === undefined) return waitTimeout
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= RESPONSE_RESERVE_MS) return 0
  return Math.min(waitTimeout, requestTimeoutMs - (Date.now() - receivedAt) - RESPONSE_RESERVE_MS)
}

function sanitizeFillError(error: unknown, submittedValue: string | boolean): string {
  const message = error instanceof Error ? error.message : String(error)
  return typeof submittedValue === 'string' && submittedValue ? message.split(submittedValue).join('[redacted]') : message
}

/**
 * Click an element on the page using chrome.scripting.executeScript
 * Waits for element to exist, then dispatches click event
 */
export async function handleBrowserClickElement(message: {
  requestId: string
  selector: string
  tabId?: number
  waitTimeout?: number
  requestTimeoutMs?: number
  agent?: string
}): Promise<void> {
  const receivedAt = Date.now()
  let dispatchStarted = false
  try {
    const targetTabId = (await resolveAgentTab(message.agent, message.tabId))?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-click-element-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }
    await assertAgentReadableTab('tabz_click', targetTabId)

    const waitTimeout = mutationBudget(message.requestTimeoutMs, message.waitTimeout || 5000, receivedAt)
    if (waitTimeout <= 0) {
      sendToWebSocket({
        type: 'browser-click-element-result',
        requestId: message.requestId,
        success: false,
        error: 'Refused: the request deadline leaves no time to click; nothing was clicked'
      })
      return
    }
    const expiresAt = Date.now() + waitTimeout

    const operation = await runWithDocumentAdmission(targetTabId, async () => {
      const guard = () => {
        if (Date.now() >= expiresAt) throw new Error('Refused: the request deadline expired before click; nothing was clicked')
      }
      guard()
      if (await currentDocumentProtection(targetTabId, { guard, expiresAt })) {
        throw new Error('Refused: tabz_click cannot use an arbitrary selector on a protected document; ask the user to submit or navigate')
      }
      guard()
      const token = await assertDocumentReadable(targetTabId, 'tabz_click', { guard, expiresAt })
      guard()
      dispatchStarted = true
      const injection = (await chrome.scripting.executeScript({
        target: protectedDocumentTarget(token),
        func: (selector: string, deadline: number, timeout: number) => {
          return new Promise<{ success: boolean; error?: string; tagName?: string }>((resolve) => {
            const tryClick = () => {
              if (Date.now() >= deadline) {
                resolve({ success: false, error: `Element not found within ${timeout}ms: ${selector}` })
                return
              }
              const el = document.querySelector(selector)
              if (el) {
                const rect = el.getBoundingClientRect()
                if (rect.width === 0 && rect.height === 0) {
                  resolve({ success: false, error: `Element found but has zero dimensions: ${selector}` })
                  return
                }

                if (Date.now() >= deadline) {
                  resolve({ success: false, error: 'Refused: the request deadline expired before click; nothing was clicked' })
                  return
                }

                // Exactly one activation. HTMLElement.click() supplies native
                // activation behavior; non-HTML elements need a MouseEvent.
                if (el instanceof HTMLElement) {
                  el.click()
                } else {
                  el.dispatchEvent(new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  }))
                }

                resolve({ success: true, tagName: el.tagName.toLowerCase() })
              } else {
                setTimeout(tryClick, Math.min(100, Math.max(0, deadline - Date.now())))
              }
            }

            tryClick()
          })
        },
        args: [message.selector, expiresAt, waitTimeout]
      }))[0]
      if (!injection?.documentId) {
        throw new Error('Click outcome is unknown because Chrome did not identify the target document')
      }
      await assertDocumentReadCurrent(targetTabId, token, { documentId: injection?.documentId })
      return { result: injection?.result as { success: boolean; error?: string; tagName?: string } | undefined, documentId: token.documentId }
    })

    const result = operation.result

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
      }, { documentId: operation.documentId }).catch(() => {}) // Ignore if the verified document is gone
    }
  } catch (err) {
    sendToWebSocket({
      type: 'browser-click-element-result',
      requestId: message.requestId,
      success: false,
      error: dispatchStarted
        ? 'Click outcome is unknown because the operation could not be verified; inspect the current page before deciding whether another click is safe'
        : (err as Error).message
    })
  }
}

interface TrustedFillTarget {
  success: boolean
  error?: string
  host?: string
  x?: number
  y?: number
  tagName?: string
  type?: string
  name?: string
  id?: string
  autocomplete?: string
  actualValue?: string
  verifyError?: string
}

interface TrustedCharacterKey {
  key: string
  code: string
  keyCode: number
  modifiers: number
  text: string
}

/** Locate and mark a trusted target without receiving the saved value. */
export function locateTrustedFillTarget(
  selector: string,
  expiresAt: number,
  timeout: number,
  requireInput: boolean,
  requirePasswordType: boolean,
  expectedHost: string,
  marker: string,
  allowSelect: boolean,
  trusted: boolean
): Promise<TrustedFillTarget> {
  return new Promise(resolve => {
    const refuse = (error: string, host = location.hostname.toLowerCase()) => resolve({ success: false, host, error })
    const attempt = () => {
      const pageHost = location.hostname.toLowerCase()
      if (Date.now() >= expiresAt) return refuse(`Element not found within ${timeout}ms: ${selector}`, pageHost)
      if (pageHost !== expectedHost) return refuse(`Refused: the page moved to ${pageHost || 'an unreadable host'} before trusted typing`, pageHost)

      let element: Element | null
      try {
        element = document.querySelector(selector)
      } catch (error) {
        return refuse(`Invalid selector: ${(error as Error).message}`, pageHost)
      }
      if (!element) {
        setTimeout(attempt, Math.min(100, Math.max(0, expiresAt - Date.now())))
        return
      }

      const input = element instanceof HTMLInputElement ? element : null
      const textArea = element instanceof HTMLTextAreaElement ? element : null
      const select = element instanceof HTMLSelectElement ? element : null
      if (!input && !textArea && !select && !(element as HTMLElement).isContentEditable) {
        return refuse(`Saved fill needs an input, textarea, select, or contenteditable target, not ${element.tagName.toLowerCase()}`, pageHost)
      }
      if (requireInput && !input && !(allowSelect && select)) {
        return refuse(`Refused: target is not an <input>${allowSelect ? ' or <select>' : ''} (${element.tagName.toLowerCase()})`, pageHost)
      }
      if (trusted && select) return refuse('Trusted typing does not support select fields', pageHost)
      if (trusted && input && ['hidden', 'file', 'button', 'submit', 'reset', 'image', 'checkbox', 'radio'].includes(input.type)) {
        return refuse(`Trusted typing does not apply to input type="${input.type}"`, pageHost)
      }
      if (requirePasswordType && input?.type !== 'password') {
        return refuse('Refused: a saved password only goes into an input of type="password"', pageHost)
      }
      if (input?.disabled || input?.readOnly || textArea?.disabled || textArea?.readOnly) {
        return refuse(`Refused: target is ${input?.disabled || textArea?.disabled ? 'disabled' : 'readonly'}`, pageHost)
      }

      ;(element as HTMLElement).scrollIntoView({ block: 'center', inline: 'center' })
      if (Date.now() >= expiresAt) return refuse('Refused: the request deadline expired before trusted typing', pageHost)
      if (location.hostname.toLowerCase() !== expectedHost || !element.isConnected || document.querySelector(selector) !== element) {
        return refuse('Refused: the trusted typing target changed during preflight', location.hostname.toLowerCase())
      }
      if (requirePasswordType && (!(element instanceof HTMLInputElement) || element.type !== 'password')) {
        return refuse('Refused: the trusted typing target is no longer an input of type="password"', pageHost)
      }
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return refuse('Trusted typing target has zero dimensions', pageHost)
      if (marker) element.setAttribute('data-tabz-trusted-fill', marker)
      if (Date.now() >= expiresAt || !element.isConnected || document.querySelector(selector) !== element) {
        if (marker) element.removeAttribute('data-tabz-trusted-fill')
        return refuse('Refused: the trusted typing target changed during preflight', location.hostname.toLowerCase())
      }
      resolve({
        success: true,
        host: pageHost,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        tagName: element.tagName.toLowerCase(),
        type: input?.type,
        name: element.getAttribute('name') || undefined,
        id: (element as HTMLElement).id || undefined,
        autocomplete: element.getAttribute('autocomplete') || undefined,
      })
    }
    attempt()
  })
}

/** Re-check the target and page immediately before each debugger mutation. */
export function checkTrustedFillTarget(
  selector: string,
  expectedHost: string,
  marker: string,
  requireFocus: boolean,
  requireInput: boolean,
  requirePasswordType: boolean,
  expiresAt: number
): TrustedFillTarget {
  const pageHost = location.hostname.toLowerCase()
  if (Date.now() >= expiresAt) return { success: false, host: pageHost, error: 'Refused: the request deadline expired during trusted typing' }
  if (pageHost !== expectedHost) return { success: false, host: pageHost, error: `Refused: the page moved to ${pageHost || 'an unreadable host'} during trusted typing` }
  let element: Element | null
  try {
    element = document.querySelector(selector)
  } catch (error) {
    return { success: false, host: pageHost, error: `Invalid selector: ${(error as Error).message}` }
  }
  if (!element || !element.isConnected || element.getAttribute('data-tabz-trusted-fill') !== marker) {
    return { success: false, host: pageHost, error: 'Refused: the trusted typing target changed or left the page' }
  }
  const input = element instanceof HTMLInputElement ? element : null
  if (requireInput && !input) return { success: false, host: pageHost, error: 'Refused: the trusted typing target is no longer an <input>' }
  if (input && ['hidden', 'file', 'button', 'submit', 'reset', 'image', 'checkbox', 'radio'].includes(input.type)) {
    return { success: false, host: pageHost, error: `Refused: the trusted typing target changed to input type="${input.type}"` }
  }
  if (requirePasswordType && input?.type !== 'password') {
    return { success: false, host: pageHost, error: 'Refused: the trusted typing target is no longer an input of type="password"' }
  }
  const textArea = element instanceof HTMLTextAreaElement ? element : null
  if (input?.disabled || input?.readOnly || textArea?.disabled || textArea?.readOnly) {
    return { success: false, host: pageHost, error: 'Refused: the trusted typing target became disabled or readonly' }
  }
  if (requireFocus && document.activeElement !== element) {
    return { success: false, host: pageHost, error: 'Refused: the trusted typing target lost focus' }
  }
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return { success: false, host: pageHost, error: 'Refused: the trusted typing target is no longer visible' }
  return { success: true, host: pageHost, x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
}

/** Read back only inside the extension; protected callers receive a boolean verdict. */
export function readTrustedFillTarget(
  selector: string,
  expectedHost: string,
  marker: string,
  expiresAt: number
): Promise<TrustedFillTarget> {
  return new Promise(resolve => {
    setTimeout(() => {
      const pageHost = location.hostname.toLowerCase()
      if (Date.now() >= expiresAt) return resolve({ success: true, host: pageHost, verifyError: 'the request deadline expired before read-back' })
      if (pageHost !== expectedHost) return resolve({ success: false, host: pageHost, error: 'Refused: the page navigated before trusted typing could be verified' })
      try {
        const marked = Array.from(document.querySelectorAll('[data-tabz-trusted-fill]')).find(element => element.getAttribute('data-tabz-trusted-fill') === marker)
        const element = marked?.isConnected ? marked : document.querySelector(selector)
        if (!element || !element.isConnected) return resolve({ success: true, host: pageHost, verifyError: 'the element left the document after the write' })
        const input = element instanceof HTMLInputElement
        const actualValue = input || element instanceof HTMLTextAreaElement
          ? element.value
          : element instanceof HTMLSelectElement
            ? element.value
            : ((element as HTMLElement).textContent ?? '')
        resolve({
          success: true,
          host: pageHost,
          tagName: element.tagName.toLowerCase(),
          type: input ? element.type : undefined,
          name: element.getAttribute('name') || undefined,
          id: (element as HTMLElement).id || undefined,
          autocomplete: element.getAttribute('autocomplete') || undefined,
          actualValue,
        })
      } catch {
        resolve({ success: true, host: pageHost, verifyError: 'the field could not be read back after the write' })
      }
    }, Math.min(50, Math.max(0, expiresAt - Date.now())))
  })
}

export function clearTrustedFillMarker(marker: string): void {
  document.querySelectorAll('[data-tabz-trusted-fill]').forEach(element => {
    if (element.getAttribute('data-tabz-trusted-fill') === marker) element.removeAttribute('data-tabz-trusted-fill')
  })
}

function trustedCharacterKey(character: string): TrustedCharacterKey | null {
  if (/^[a-z]$/.test(character)) return { key: character, code: `Key${character.toUpperCase()}`, keyCode: character.toUpperCase().charCodeAt(0), modifiers: 0, text: character }
  if (/^[A-Z]$/.test(character)) return { key: character, code: `Key${character}`, keyCode: character.charCodeAt(0), modifiers: 8, text: character }
  if (/^[0-9]$/.test(character)) return { key: character, code: `Digit${character}`, keyCode: character.charCodeAt(0), modifiers: 0, text: character }
  if (character === ' ') return { key: ' ', code: 'Space', keyCode: 32, modifiers: 0, text: character }
  if (character === '\n' || character === '\r') return { key: 'Enter', code: 'Enter', keyCode: 13, modifiers: 0, text: '\r' }
  const punctuation: Record<string, [string, number, boolean]> = {
    '`': ['Backquote', 192, false], '~': ['Backquote', 192, true], '-': ['Minus', 189, false], '_': ['Minus', 189, true],
    '=': ['Equal', 187, false], '+': ['Equal', 187, true], '[': ['BracketLeft', 219, false], '{': ['BracketLeft', 219, true],
    ']': ['BracketRight', 221, false], '}': ['BracketRight', 221, true], '\\': ['Backslash', 220, false], '|': ['Backslash', 220, true],
    ';': ['Semicolon', 186, false], ':': ['Semicolon', 186, true], "'": ['Quote', 222, false], '"': ['Quote', 222, true],
    ',': ['Comma', 188, false], '<': ['Comma', 188, true], '.': ['Period', 190, false], '>': ['Period', 190, true],
    '/': ['Slash', 191, false], '?': ['Slash', 191, true], '!': ['Digit1', 49, true], '@': ['Digit2', 50, true],
    '#': ['Digit3', 51, true], '$': ['Digit4', 52, true], '%': ['Digit5', 53, true], '^': ['Digit6', 54, true],
    '&': ['Digit7', 55, true], '*': ['Digit8', 56, true], '(': ['Digit9', 57, true], ')': ['Digit0', 48, true],
  }
  const mapped = punctuation[character]
  return mapped ? { key: character, code: mapped[0], keyCode: mapped[1], modifiers: mapped[2] ? 8 : 0, text: character } : null
}

async function runTrustedFill(
  tabId: number,
  injectionTarget: chrome.scripting.InjectionTarget,
  protection: DocumentProtectionToken,
  selector: string,
  value: string,
  requireInput: boolean,
  requirePasswordType: boolean,
  expectedHost: string,
  expiresAt: number,
  marker: string
): Promise<{
  result: TrustedFillTarget & { intendedValue?: string }
  protection: DocumentProtectionToken
}> {
  let activeProtection = protection
  const deadlineGuard = () => {
    if (Date.now() >= expiresAt) throw new Error('Refused: the request deadline expired during trusted typing')
  }

  const fresh = async (requireFocus: boolean): Promise<TrustedFillTarget> => {
    try {
      deadlineGuard()
      const tab = await chrome.tabs.get(tabId)
      await assertAgentReadableTab('tabz_fill', tab)
      if (tab.pendingUrl || tab.status === 'loading') throw new Error('Refused: the page began navigating during trusted typing')
      const host = tab.url ? new URL(tab.url).hostname.toLowerCase() : ''
      if (host !== expectedHost) throw new Error(`Refused: the tab moved to ${host || 'an unreadable URL'} during trusted typing`)
      await assertProtectedDocumentCurrent(tabId, activeProtection, { guard: deadlineGuard })
      const checked = (await chrome.scripting.executeScript({
        target: injectionTarget,
        func: checkTrustedFillTarget,
        args: [selector, expectedHost, marker, requireFocus, requireInput, requirePasswordType, expiresAt],
      }))[0]?.result as TrustedFillTarget | undefined
      return checked ?? { success: false, error: 'No result from trusted typing target check' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  const commandTimeout = () => Math.max(1, Math.min(1000, expiresAt - Date.now()))
  const dispatch = async (target: chrome.debugger.Debuggee, method: string, params: object) => {
    deadlineGuard()
    return sendDebuggerCommand(target, method, params, commandTimeout())
  }
  try {
    let isMac = false
    try { isMac = (await chrome.runtime.getPlatformInfo()).os === 'mac' } catch { /* Ctrl+A is the safe default. */ }
    const selectModifier = isMac ? 4 : 2
    const result = await withDebugger(tabId, async target => {
      try {
        let current = await fresh(false)
        if (!current.success || current.x === undefined || current.y === undefined) return current
        deadlineGuard()
        activeProtection = await protectTabForUnboundMutation(tabId, activeProtection)
        current = await fresh(false)
        if (!current.success) return current
        for (const [type, extra] of [
          ['mouseMoved', {}],
          ['mousePressed', { button: 'left', clickCount: 1 }],
          ['mouseReleased', { button: 'left', clickCount: 1 }],
        ] as const) {
          current = await fresh(false)
          if (!current.success || current.x === undefined || current.y === undefined) return current
          await dispatch(target, 'Input.dispatchMouseEvent', { type, x: current.x, y: current.y, ...extra })
        }

        current = await fresh(true)
        if (!current.success) return current
        await dispatch(target, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: selectModifier })
        current = await fresh(true)
        if (!current.success) return current
        await dispatch(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: selectModifier })

        const characters = Array.from(value)
        if (characters.length === 0) {
          current = await fresh(true)
          if (!current.success) return current
          await dispatch(target, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
          current = await fresh(true)
          if (!current.success) return current
          await dispatch(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 })
        }

        for (const character of characters) {
          const mapped = trustedCharacterKey(character)
          current = await fresh(true)
          if (!current.success) return current
          if (!mapped) {
            await dispatch(target, 'Input.insertText', { text: character })
            continue
          }
          await dispatch(target, 'Input.dispatchKeyEvent', { type: 'keyDown', key: mapped.key, code: mapped.code, windowsVirtualKeyCode: mapped.keyCode, nativeVirtualKeyCode: mapped.keyCode, modifiers: mapped.modifiers })
          current = await fresh(true)
          if (!current.success) return current
          await dispatch(target, 'Input.dispatchKeyEvent', { type: 'char', key: mapped.key, code: mapped.code, windowsVirtualKeyCode: mapped.keyCode, nativeVirtualKeyCode: mapped.keyCode, modifiers: mapped.modifiers, text: mapped.text, unmodifiedText: mapped.text })
          current = await fresh(true)
          if (!current.success) return current
          await dispatch(target, 'Input.dispatchKeyEvent', { type: 'keyUp', key: mapped.key, code: mapped.code, windowsVirtualKeyCode: mapped.keyCode, nativeVirtualKeyCode: mapped.keyCode, modifiers: mapped.modifiers })
        }

        current = await fresh(true)
        if (!current.success) return current
        const read = (await chrome.scripting.executeScript({
          target: injectionTarget,
          func: readTrustedFillTarget,
          args: [selector, expectedHost, marker, expiresAt],
        }))[0]?.result as TrustedFillTarget | undefined
        await assertProtectedDocumentCurrent(tabId, activeProtection, { guard: deadlineGuard })
        return read?.success ? { ...read, intendedValue: value } : (read ?? { success: false, error: 'No result from trusted typing read-back' })
      } catch {
        return { success: false, error: 'Trusted typing failed while dispatching input' }
      }
    }, { guard: deadlineGuard })
    return { result, protection: activeProtection }
  } finally {
    try {
      await chrome.scripting.executeScript({ target: injectionTarget, func: clearTrustedFillMarker, args: [marker] })
    } catch {
      // Navigation can remove the protected document and its marker together.
    }
  }
}

interface BrowserFillResult extends TrustedFillTarget {
  selected?: boolean
  intendedValue?: string
  originalTagName?: string
  originalType?: string
  originalName?: string
  originalId?: string
  originalAutocomplete?: string
}

/** Synthetic fill function serialized into one exact Chrome document. */
export function fillInputInDocument(
  selector: string,
  value: string | boolean,
  expiresAt: number,
  timeout: number,
  requireInput: boolean,
  requirePasswordType: boolean,
  expectedHost: string | null,
  allowSelect: boolean
): Promise<BrowserFillResult> {
  return new Promise(resolve => {
    const nativeWrite = (target: HTMLInputElement | HTMLTextAreaElement, next: string) => {
      const prototype = target instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value')
      if (descriptor && typeof descriptor.set === 'function') descriptor.set.call(target, next)
      else target.value = next
    }
    const valueOf = (target: Element): string =>
      target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
        ? target.value
        : ((target as HTMLElement).textContent ?? '')
    const pageHost = () => location.hostname.toLowerCase()
    const expired = () => Date.now() >= expiresAt
    const targetError = (element: Element): string | undefined => {
      const input = element instanceof HTMLInputElement ? element : null
      const selectAllowed = allowSelect && element instanceof HTMLSelectElement
      if (!(input || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || (element as HTMLElement).isContentEditable)) {
        return `Element is not an input field: ${element.tagName}`
      }
      if (requireInput && !input && !selectAllowed) return `Refused: target is not an <input>${allowSelect ? ' or <select>' : ''} (${element.tagName.toLowerCase()})`
      if (requirePasswordType && input?.type !== 'password') return 'Refused: a saved password only goes into an input of type="password"'
      if (input?.disabled || input?.readOnly || (element instanceof HTMLTextAreaElement && (element.disabled || element.readOnly))) {
        return `Refused: target is ${input?.disabled || (element instanceof HTMLTextAreaElement && element.disabled) ? 'disabled' : 'readonly'}`
      }
      return undefined
    }
    const stillCurrent = (element: Element): string | undefined => {
      if (expired()) return 'Refused: the request deadline expired before fill; nothing was typed'
      if (expectedHost && pageHost() !== expectedHost) return `Refused: the page moved to ${pageHost() || 'an unreadable host'} before fill; nothing was typed`
      if (!element.isConnected || document.querySelector(selector) !== element) return 'Refused: the fill target changed before anything was typed'
      return targetError(element)
    }
    const attempt = () => {
      if (expired()) return resolve({ success: false, error: `Element not found within ${timeout}ms: ${selector}` })
      if (expectedHost && pageHost() !== expectedHost) return resolve({ success: false, host: pageHost(), error: `Refused: the page is ${pageHost() || 'an unreadable host'}, not ${expectedHost}; nothing was typed` })
      let element: Element | null
      try { element = document.querySelector(selector) } catch { return resolve({ success: false, host: pageHost(), error: 'Invalid selector' }) }
      if (!element) {
        setTimeout(attempt, Math.min(100, Math.max(0, expiresAt - Date.now())))
        return
      }
      const initialError = targetError(element)
      if (initialError) return resolve({ success: false, host: pageHost(), error: initialError })

      let fillValue = value
      if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio') && typeof fillValue === 'string') {
        const normalized = fillValue.trim().toLowerCase()
        if (['true', 'on', '1'].includes(normalized)) fillValue = true
        else if (['false', 'off', '0'].includes(normalized)) fillValue = false
        else return resolve({ success: false, host: pageHost(), error: 'A checkbox or radio needs true, false, on, off, 1, or 0; pass a boolean' })
      }

      ;(element as HTMLElement).focus()
      if (expired()) return resolve({ success: false, host: pageHost(), error: 'Refused: the request deadline expired during focus; nothing was typed' })
      const focusError = stillCurrent(element)
      if (focusError) return resolve({ success: false, host: pageHost(), error: focusError })

      if (typeof fillValue === 'boolean') {
        if (!(element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio'))) {
          return resolve({ success: false, host: pageHost(), error: 'A boolean value needs a checkbox or radio input' })
        }
        if (element.checked !== fillValue) {
          if (fillValue || element.type === 'checkbox') element.click()
          else {
            element.checked = false
            element.dispatchEvent(new Event('input', { bubbles: true }))
            element.dispatchEvent(new Event('change', { bubbles: true }))
          }
        }
        const intendedValue = String(fillValue)
        setTimeout(() => {
          if (expired()) return resolve({ success: true, host: pageHost(), intendedValue, verifyError: 'the request deadline expired before read-back' })
          const subject = element.isConnected ? element : document.querySelector(selector)
          if (!(subject instanceof HTMLInputElement) || !['checkbox', 'radio'].includes(subject.type)) {
            return resolve({ success: true, host: pageHost(), intendedValue, verifyError: 'the checkbox or radio changed after the write' })
          }
          resolve({ success: true, host: pageHost(), tagName: 'input', type: subject.type, name: subject.getAttribute('name') || undefined, id: subject.id || undefined, intendedValue, actualValue: String(subject.checked) })
        }, Math.min(50, Math.max(0, expiresAt - Date.now())))
        return
      }

      if (allowSelect && element instanceof HTMLSelectElement) {
        const wanted = fillValue.trim()
        const options = Array.from(element.options)
        const match = options.find(option => option.value === wanted)
          || options.find(option => (option.label || option.textContent || '').trim() === wanted)
          || options.find(option => option.value.toLowerCase() === wanted.toLowerCase())
          || options.find(option => (option.label || option.textContent || '').trim().toLowerCase() === wanted.toLowerCase())
        if (!match) return resolve({ success: false, host: pageHost(), error: `Refused: no option in the <select> (${options.length} options) matches the saved value by value or label` })
        const currentError = stillCurrent(element)
        if (currentError) return resolve({ success: false, host: pageHost(), error: currentError })
        element.value = match.value
        element.dispatchEvent(new Event('input', { bubbles: true }))
        element.dispatchEvent(new Event('change', { bubbles: true }))
        const intendedValue = match.value
        setTimeout(() => {
          if (expired()) return resolve({ success: true, host: pageHost(), selected: true, intendedValue, verifyError: 'the request deadline expired before read-back' })
          const subject = element.isConnected ? element : document.querySelector(selector)
          if (!(subject instanceof HTMLSelectElement)) return resolve({ success: true, host: pageHost(), selected: true, intendedValue, verifyError: 'the select changed after the write' })
          resolve({ success: true, host: pageHost(), selected: true, tagName: 'select', name: subject.getAttribute('name') || undefined, id: subject.id || undefined, intendedValue, actualValue: subject.value })
        }, Math.min(50, Math.max(0, expiresAt - Date.now())))
        return
      }

      const textValue = fillValue as string
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) nativeWrite(element, textValue)
      else if (element instanceof HTMLSelectElement) element.value = textValue
      else (element as HTMLElement).textContent = textValue
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
      const intendedValue = textValue
      setTimeout(() => {
        if (expired()) return resolve({ success: true, host: pageHost(), intendedValue, verifyError: 'the request deadline expired before read-back' })
        let subject = element
        if (!subject.isConnected) subject = document.querySelector(selector) || subject
        if (!subject.isConnected) return resolve({ success: true, host: pageHost(), intendedValue, verifyError: 'the element left the document after the write' })
        resolve({
          success: true,
          host: pageHost(),
          tagName: subject.tagName.toLowerCase(),
          type: subject instanceof HTMLInputElement ? subject.type : undefined,
          name: subject.getAttribute('name') || undefined,
          id: (subject as HTMLElement).id || undefined,
          autocomplete: subject.getAttribute('autocomplete') || undefined,
          originalTagName: element.tagName.toLowerCase(),
          originalType: element instanceof HTMLInputElement ? element.type : undefined,
          originalName: element.getAttribute('name') || undefined,
          originalId: (element as HTMLElement).id || undefined,
          originalAutocomplete: element.getAttribute('autocomplete') || undefined,
          intendedValue,
          actualValue: valueOf(subject),
        })
      }, Math.min(50, Math.max(0, expiresAt - Date.now())))
    }
    attempt()
  })
}

/**
 * Fill an input field and verify what the browser retained.
 */
export async function handleBrowserFillInput(message: {
  requestId: string
  selector: string
  value: string | boolean
  tabId?: number
  waitTimeout?: number
  requestTimeoutMs?: number
  agent?: string
  expectedHost?: string
  requireInput?: boolean
  requirePasswordType?: boolean
  allowSelect?: boolean
  trusted?: boolean
}): Promise<void> {
  const receivedAt = Date.now()
  const savedFill = typeof message.expectedHost === 'string' && message.expectedHost.length > 0
  const expectedHost = savedFill ? message.expectedHost!.toLowerCase() : null
  const protectedFailure = 'Protected document fill was refused or could not be verified'

  try {
    const tab = await resolveAgentTab(message.agent, message.tabId)
    const targetTabId = tab?.id
    if (!targetTabId) throw new Error('No active tab found')
    await assertAgentReadableTab('tabz_fill', tab)
    if (tab.pendingUrl || tab.status === 'loading') throw new Error('Refused: the page is navigating; nothing was typed')

    if (expectedHost) {
      let currentHost = ''
      try { currentHost = tab.url ? new URL(tab.url).hostname.toLowerCase() : '' } catch { currentHost = '' }
      if (currentHost !== expectedHost) throw new Error(`Refused: the tab is now on ${currentHost || 'an unreadable URL'}, not ${expectedHost}; nothing was typed`)
    }
    if (message.trusted === true && !savedFill) {
      throw new Error('Trusted typing is available only for saved text fields')
    }

    const waitTimeout = mutationBudget(message.requestTimeoutMs, message.waitTimeout || 5000, receivedAt)
    if (waitTimeout <= 0) throw new Error('Refused: the request deadline leaves no time to fill; nothing was typed')
    const expiresAt = Date.now() + waitTimeout

    const operation = await runWithDocumentAdmission(targetTabId, async () => {
      const guard = () => {
        if (Date.now() >= expiresAt) throw new Error('Refused: the request deadline expired before fill; nothing was typed')
      }
      let protection: DocumentProtectionToken | null = null
      let protectedOutcome = false
      let trustedMarker = ''
      let navigationObserved = false
      const navigationListener: Parameters<typeof chrome.tabs.onUpdated.addListener>[0] = (updatedTabId, changeInfo) => {
        if (updatedTabId === targetTabId && (changeInfo.status === 'loading' || changeInfo.url !== undefined)) navigationObserved = true
      }
      const canWatchNavigation = Boolean(chrome.tabs.onUpdated?.addListener)
      if (canWatchNavigation) chrome.tabs.onUpdated.addListener(navigationListener)

      try {
        if (savedFill) {
          if (message.trusted === true && typeof message.value !== 'string') {
            return { result: { success: false, error: 'Trusted typing is available only for saved text fields' } as BrowserFillResult, protectedOutcome: false, protected: false }
          }
          trustedMarker = message.trusted === true ? crypto.randomUUID() : ''
          const probe = (await chrome.scripting.executeScript({
            target: { tabId: targetTabId },
            func: locateTrustedFillTarget,
            args: [
              message.selector,
              expiresAt,
              waitTimeout,
              Boolean(message.requireInput),
              Boolean(message.requirePasswordType),
              expectedHost!,
              trustedMarker,
              Boolean(message.allowSelect),
              message.trusted === true,
            ],
          }))[0]
          const target = probe?.result as TrustedFillTarget | undefined
          if (!target?.success) return { result: target, protectedOutcome: false, protected: false }
          if (!probe?.documentId) {
            return { result: { success: false, error: 'The target document could not be identified safely' } as BrowserFillResult, protectedOutcome: false, protected: false }
          }

          guard()
          protection = await preflightAndProtectDocument(targetTabId, { reason: 'saved-fill', guard, expiresAt })
          protectedOutcome = true
          if (protection.documentId !== probe.documentId) {
            return { result: { success: false, error: 'The page changed between target validation and protection' } as BrowserFillResult, protectedOutcome, protected: false }
          }
          await assertProtectedDocumentCurrent(targetTabId, protection, { guard })

          if (message.trusted === true) {
            const checked = (await chrome.scripting.executeScript({
              target: protectedDocumentTarget(protection),
              func: checkTrustedFillTarget,
              args: [
                message.selector,
                expectedHost!,
                trustedMarker,
                false,
                Boolean(message.requireInput),
                Boolean(message.requirePasswordType),
                expiresAt,
              ],
            }))[0]?.result as TrustedFillTarget | undefined
            if (!checked?.success) return { result: checked, protectedOutcome, protected: true }
            guard()
          }
        } else {
          protection = await currentDocumentProtection(targetTabId, { guard })
          protectedOutcome = protection !== null
        }

        const injectionTarget = protection ? protectedDocumentTarget(protection) : { tabId: targetTabId }
        let result: BrowserFillResult | undefined
        if (message.trusted === true) {
          const trustedResult = await runTrustedFill(
            targetTabId,
            injectionTarget,
            protection!,
            message.selector,
            message.value as string,
            Boolean(message.requireInput),
            Boolean(message.requirePasswordType),
            expectedHost!,
            expiresAt,
            trustedMarker
          )
          result = trustedResult.result
          protection = trustedResult.protection
        } else {
          result = (await chrome.scripting.executeScript({
            target: injectionTarget,
            func: fillInputInDocument,
            args: [
              message.selector,
              message.value,
              expiresAt,
              waitTimeout,
              Boolean(message.requireInput),
              Boolean(message.requirePasswordType),
              expectedHost,
              Boolean(message.allowSelect),
            ],
          }))[0]?.result as BrowserFillResult | undefined
        }

        if (protection) await assertProtectedDocumentCurrent(targetTabId, protection, { guard })
        if (navigationObserved && result === undefined) {
          return { result: { success: false, error: 'The page navigated before the field could be verified' } as BrowserFillResult, protectedOutcome }
        }
        return { result, protectedOutcome, protected: protection !== null }
      } catch (error) {
        const detail = sanitizeFillError(error, message.value)
        if (navigationObserved || /(?:frame.*(?:removed|detached)|no frame with id|document.*(?:removed|not found))/i.test(detail)) {
          return { result: { success: false, error: 'The page navigated before the field could be verified' } as BrowserFillResult, protectedOutcome, protected: false }
        }
        throw error
      } finally {
        if (trustedMarker) {
          try {
            const target = protection ? protectedDocumentTarget(protection) : { tabId: targetTabId }
            await chrome.scripting.executeScript({ target, func: clearTrustedFillMarker, args: [trustedMarker] })
          } catch {
            // Navigation removes both the protected document and its marker.
          }
        }
        if (canWatchNavigation) chrome.tabs.onUpdated.removeListener(navigationListener)
      }
    })

    const result = operation.result as BrowserFillResult | undefined
    const sensitive = result?.success
      ? isSensitiveInput(result.tagName, result.type, result.name, result.id, result.autocomplete)
        || isSensitiveInput(result.originalTagName, result.originalType, result.originalName, result.originalId, result.originalAutocomplete)
      : undefined
    const normalize = (raw: string | undefined, tagName: string | undefined, inputType: string | undefined): string | number | undefined => {
      if (raw === undefined) return undefined
      if ((tagName || '').toLowerCase() !== 'input') return raw
      const type = (inputType || 'text').toLowerCase()
      const singleLineTypes = ['text', 'search', 'tel', 'url', 'email', 'password']
      let normalized = singleLineTypes.includes(type) ? raw.replace(/[\r\n]/g, '') : raw
      if (type === 'url' || type === 'email') normalized = normalized.trim()
      if (type === 'color') return normalized.toLowerCase()
      if (type === 'number' || type === 'range') {
        if (normalized.trim() === '') return normalized
        const numeric = Number(normalized)
        return Number.isFinite(numeric) ? numeric : normalized
      }
      return normalized
    }
    const targetChanged = result?.success === true && (
      (message.requirePasswordType === true && result.type?.toLowerCase() !== 'password')
      || (message.requireInput === true && result.tagName?.toLowerCase() !== 'input' && !(message.allowSelect && result.tagName?.toLowerCase() === 'select'))
    )
    const verifiable = result?.success === true && !targetChanged && typeof result.actualValue === 'string' && typeof result.intendedValue === 'string'
    const verified = verifiable
      ? normalize(result!.actualValue, result!.tagName, result!.type) === normalize(result!.intendedValue, result!.tagName, result!.type)
      : result?.success ? false : undefined
    const success = result?.success === true && !targetChanged && (!savedFill || verified === true)
    const scrubOutcome = savedFill || operation.protectedOutcome

    sendToWebSocket({
      type: 'browser-fill-input-result',
      requestId: message.requestId,
      success,
      tagName: scrubOutcome ? undefined : result?.tagName,
      inputType: scrubOutcome ? undefined : result?.type?.toLowerCase(),
      sensitive: scrubOutcome ? undefined : sensitive,
      selected: result?.selected,
      host: scrubOutcome ? undefined : result?.host,
      protected: operation.protected === true,
      verified,
      verifyError: scrubOutcome ? undefined : result?.verifyError,
      actualLength: !scrubOutcome && typeof result?.actualValue === 'string' ? result.actualValue.length : undefined,
      actualValue: !scrubOutcome && sensitive === false ? result?.actualValue : undefined,
      error: success ? undefined : scrubOutcome ? protectedFailure : result?.error ? sanitizeFillError(result.error, message.value) : undefined,
    })

    if (success && !scrubOutcome) {
      chrome.tabs.sendMessage(targetTabId, { type: 'HIGHLIGHT_ELEMENT', selector: message.selector, highlightType: 'fill' }).catch(() => {})
    }
  } catch (error) {
    sendToWebSocket({
      type: 'browser-fill-input-result',
      requestId: message.requestId,
      success: false,
      error: savedFill ? protectedFailure : sanitizeFillError(error, message.value),
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
  agent?: string
}): Promise<void> {
  try {
    const targetTabId = (await resolveAgentTab(message.agent, message.tabId))?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-element-info-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }
    await assertAgentReadableTab('tabz_get_element', targetTabId)

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

    const operation = await runWithDocumentAdmission(targetTabId, async () => {
      const token = await assertDocumentReadable(targetTabId, 'tabz_get_element')
      const injection = (await chrome.scripting.executeScript({
      target: protectedDocumentTarget(token),
      func: (selector: string, props: string[], getStyles: boolean) => {
        // This function runs by itself in the page world, so it mirrors the
        // predicate in sensitiveFields.ts rather than importing it.
        const SENSITIVE_FIELD_PATTERN = /pass(word)?|pwd|secret|token|otp|one-time-code|mfa|api[_-]?key|cvv|cc-|card/i
        const isSensitiveField = (
          tag: string | undefined,
          type: string | undefined,
          name: string | undefined,
          id: string | undefined,
          autocomplete: string | undefined
        ): boolean => {
          if ((tag || '').toLowerCase() === 'input' && (type || '').toLowerCase() === 'password') return true
          return [name, id, autocomplete].some(value => !!value && SENSITIVE_FIELD_PATTERN.test(value))
        }
        const el = document.querySelector(selector)
        if (!el) {
          return { found: false, error: `Element not found: ${selector}` }
        }

        const rect = el.getBoundingClientRect()

        const tagName = el.tagName.toLowerCase()
        const sensitive = isSensitiveField(
          tagName,
          el.getAttribute('type') || undefined,
          el.getAttribute('name') || undefined,
          el.getAttribute('id') || undefined,
          el.getAttribute('autocomplete') || undefined
        )

        // Sanitize a clone before serialization, so a long value cannot be
        // truncated before the closing quote and evade masking. Descendant
        // inputs, textareas, and selects are scrubbed when inspecting a form.
        const sanitized = el.cloneNode(true) as Element
        const fields = [sanitized, ...Array.from(sanitized.querySelectorAll('input, textarea, select, [contenteditable]'))]
        for (const field of fields) {
          const fieldSensitive = isSensitiveField(
            field.tagName.toLowerCase(),
            field.getAttribute('type') || undefined,
            field.getAttribute('name') || undefined,
            field.getAttribute('id') || undefined,
            field.getAttribute('autocomplete') || undefined
          )
          if (!fieldSensitive) continue
          if (field.hasAttribute('value')) field.setAttribute('value', '[redacted]')
          if (
            field.tagName.toLowerCase() === 'textarea' ||
            field.tagName.toLowerCase() === 'select' ||
            field.hasAttribute('contenteditable')
          ) {
            field.textContent = '[redacted]'
          }
        }

        // Mask sensitive values before returning attributes to the service worker.
        const attributes: Record<string, string> = {}
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i]
          attributes[attr.name] = sensitive && attr.name === 'value' ? '[redacted]' : attr.value
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
          html: sanitized.innerHTML.slice(0, 5000),
          outerHTML: sanitized.outerHTML.slice(0, 5000),
          innerText: sensitive ? '[redacted]' : sanitized.textContent?.slice(0, 500),
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
      }))[0]
      if (!injection?.documentId) throw new Error('Element inspection could not be bound to a Chrome document')
      await assertDocumentReadCurrent(targetTabId, token, { documentId: injection?.documentId })
      return {
        result: injection?.result as {
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
        } | undefined,
        documentId: token.documentId
      }
    })

    const result = operation.result

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
    }, { documentId: operation.documentId }).catch(() => {}) // Ignore if the verified document is gone
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-element-info-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
