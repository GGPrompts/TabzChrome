/** Browser MCP handler for the value-free manual login state probe. */

import { sendToWebSocket } from '../websocket'
import { assertAgentReadableTab } from './pageGuard'
import { classifyLoginState, type LoginProbe } from './loginState'
import { resolveAgentTab } from './tabGroups'
import {
  assertDocumentReadCurrent,
  assertDocumentReadable,
  assertProtectedDocumentCurrent,
  completeManualLoginHandoff,
  currentDocumentProtection,
  preflightAndProtectDocument,
  protectedDocumentTarget,
  runWithDocumentAdmission,
  type DocumentProtectionToken
} from './documentProtection'

interface PageLoginProbe extends LoginProbe {
  documentUrl: string
}

const EMPTY_PROBE: LoginProbe = {
  passwordInputs: 0,
  oneTimeCodeInputs: 0,
  identifierInputs: 0
}

/** Runs in the page and deliberately returns counts only, never field values. */
export function probeLoginInputs(): PageLoginProbe {
  const isVisible = (element: Element): boolean => {
    const htmlElement = element as HTMLElement
    if (htmlElement.hidden) return false
    const style = window.getComputedStyle(htmlElement)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = htmlElement.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }
  const attr = (element: HTMLInputElement, name: string) =>
    (element.getAttribute(name) || '').toLowerCase()

  let passwordInputs = 0
  let oneTimeCodeInputs = 0
  let identifierInputs = 0
  for (const element of Array.from(document.querySelectorAll('input')).filter(isVisible) as HTMLInputElement[]) {
    const type = attr(element, 'type') || 'text'
    const autocomplete = attr(element, 'autocomplete')
    const nameId = `${attr(element, 'name')} ${attr(element, 'id')}`
    if (type === 'password') {
      passwordInputs++
    } else if (autocomplete === 'one-time-code' || /\b(otp|totp|mfa|2fa|verification[-_]?code|passcode)\b/.test(nameId)) {
      oneTimeCodeInputs++
    } else if (
      type === 'email' || autocomplete === 'username' || autocomplete === 'email' ||
      /\b(user(name)?|email|login|account|identifier)\b/.test(nameId)
    ) {
      identifierInputs++
    }
  }
  return { documentUrl: location.href, passwordInputs, oneTimeCodeInputs, identifierInputs }
}

function sendLoginResult(requestId: string, payload: Record<string, unknown>): void {
  sendToWebSocket({ type: 'browser-login-state-result', requestId, ...payload })
}

function sameNavigation(before: chrome.tabs.Tab, after: chrome.tabs.Tab, documentUrl: string): boolean {
  return !before.pendingUrl && !after.pendingUrl && before.status !== 'loading' && after.status !== 'loading' &&
    (before.url || '') === (after.url || '') && documentUrl === (after.url || '')
}

function originOnly(raw: string): string {
  try {
    const parsed = new URL(raw)
    return parsed.origin === 'null' ? '' : parsed.origin
  } catch {
    return ''
  }
}

function lifecycleExpiresAt(requestTimeoutMs: unknown): number {
  if (typeof requestTimeoutMs !== 'number' || !Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error('requestTimeoutMs must be a positive finite number for login handoff lifecycle requests')
  }
  return Date.now() + Math.min(Math.floor(requestTimeoutMs), 9000)
}

function assertLifecycleActive(expiresAt: number): void {
  if (Date.now() >= expiresAt) throw new Error('The login handoff lifecycle request expired before document admission')
}

export async function handleBrowserLoginState(message: {
  requestId: string
  tabId?: number
  agent?: string
  beginHandoff?: boolean
  completeHandoff?: boolean
  requestTimeoutMs?: number
}): Promise<void> {
  try {
    if (message.beginHandoff === true && message.completeHandoff === true) {
      throw new Error('beginHandoff and completeHandoff cannot both be true')
    }
    const lifecycleRequest = message.beginHandoff === true || message.completeHandoff === true
    const expiresAt = lifecycleRequest ? lifecycleExpiresAt(message.requestTimeoutMs) : undefined
    const before = await resolveAgentTab(message.agent, message.tabId)
    if (!before || before.id === undefined) throw new Error('No active tab found')
    await assertAgentReadableTab('tabz_request_login', before)

    if (message.beginHandoff === true) {
      await runWithDocumentAdmission(before.id, async () => {
        assertLifecycleActive(expiresAt!)
        const owned = await resolveAgentTab(message.agent, before.id)
        if (!owned || owned.id === undefined) throw new Error('The login tab is no longer available')
        await assertAgentReadableTab('tabz_request_login', owned)
        const token = await preflightAndProtectDocument(owned.id, { reason: 'manual-login', expiresAt })
        const after = await resolveAgentTab(message.agent, owned.id)
        if (!after || after.id === undefined) throw new Error('The login tab is no longer available')
        await assertAgentReadableTab('tabz_request_login', after)
        await assertProtectedDocumentCurrent(after.id, token, { expiresAt })
      })
      sendLoginResult(message.requestId, { success: true, tabId: before.id, protected: true })
      return
    }

    if (message.completeHandoff === true) {
      await runWithDocumentAdmission(before.id, async () => {
        assertLifecycleActive(expiresAt!)
        const owned = await resolveAgentTab(message.agent, before.id)
        if (!owned || owned.id === undefined) throw new Error('The login tab is no longer available')
        await assertAgentReadableTab('tabz_request_login', owned)
        await completeManualLoginHandoff(owned.id, { expiresAt })
        const after = await resolveAgentTab(message.agent, owned.id)
        if (!after || after.id === undefined) throw new Error('The login tab is no longer available')
        await assertAgentReadableTab('tabz_request_login', after)
      })
      sendLoginResult(message.requestId, { success: true, tabId: before.id, protected: true })
      return
    }

    await runWithDocumentAdmission(before.id, async () => {
      const owned = await resolveAgentTab(message.agent, before.id)
      if (!owned || owned.id === undefined) throw new Error('The login tab is no longer available')
      await assertAgentReadableTab('tabz_request_login', owned)

      let result: PageLoginProbe | undefined
      let resultDocumentId: string | undefined
      let token: DocumentProtectionToken | undefined
      let protectedProbe = false
      if (!owned.pendingUrl && owned.status !== 'loading') {
        try {
          const existingProtection = await currentDocumentProtection(owned.id)
          token = existingProtection ?? await assertDocumentReadable(owned.id, 'tabz_request_login')
          protectedProbe = existingProtection !== null
          const injection = (await chrome.scripting.executeScript({
            target: protectedDocumentTarget(token),
            func: probeLoginInputs
          }))?.[0]
          result = injection?.result as PageLoginProbe | undefined
          resultDocumentId = injection?.documentId
          if (protectedProbe) await assertProtectedDocumentCurrent(owned.id, token)
          else await assertDocumentReadCurrent(owned.id, token, { documentId: resultDocumentId })
        } catch {
          // Script refusal or a navigation race is a value-free inconclusive probe.
          result = undefined
        }
      }

      const after = await resolveAgentTab(message.agent, owned.id)
      if (!after || after.id === undefined) throw new Error('The login tab is no longer available')
      await assertAgentReadableTab('tabz_request_login', after)

      const observed = result && sameNavigation(owned, after, result.documentUrl) ? result : EMPTY_PROBE
      const url = after.url || ''
      const state = classifyLoginState({ url, ...observed })
      sendLoginResult(message.requestId, {
        success: true,
        tabId: after.id,
        tabStatus: after.status || 'unknown',
        probed: Boolean(result && sameNavigation(owned, after, result.documentUrl)),
        url: protectedProbe ? originOnly(state.url) : state.url,
        host: state.host,
        authUrl: state.authUrl,
        hasPasswordField: state.hasPasswordField,
        hasLoginForm: state.hasLoginForm
      })
    })
  } catch (error) {
    sendLoginResult(message.requestId, { success: false, error: (error as Error).message })
  }
}
