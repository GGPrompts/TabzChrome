/** Browser MCP script execution and page-info handlers. */

import { sendToWebSocket } from '../websocket'
import { DebuggerAttachError, sendDebuggerCommand, withDebugger } from './debugger'
import { assertAgentReadableTab } from './pageGuard'
import { resolveAgentTab } from './tabGroups'
import {
  assertDocumentReadable,
  assertDocumentReadCurrent,
  assertProtectedDocumentCurrent,
  currentDocumentProtection,
  markDocumentReadUncertain,
  protectedDocumentTarget,
  runWithDocumentAdmission
} from './documentProtection'

const MAX_SERIALIZED_RESULT_CHARS = 50_000
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const SCRIPT_OPERATION_TIMEOUT_MS = 25_000
const RESPONSE_RESERVE_MS = 1000
const TERMINATION_RESERVE_MS = 2000
const COMMAND_CALLBACK_GRACE_MS = 250
const TERMINATION_TIMEOUT_MS = 1500

interface ScriptExecutionResult {
  success: boolean
  result?: unknown
  error?: string
  executionPath: 'debugger' | 'whitelist-fallback' | 'whitelist-all-frames'
  resultTruncated?: boolean
  warning?: string
  timedOut?: boolean
  uncertain?: boolean
  terminationAttempted?: boolean
  terminationAcknowledged?: boolean
}

interface RuntimeRemoteObject {
  value?: unknown
  unserializableValue?: string
  description?: string
}

interface RuntimeEvaluateResponse {
  result: RuntimeRemoteObject
  exceptionDetails?: { text?: string; exception?: RuntimeRemoteObject }
}

function capSerializedResult(value: unknown): { result: unknown; resultTruncated?: boolean } {
  const serialized = JSON.stringify(value)
  if (serialized === undefined || serialized.length <= MAX_SERIALIZED_RESULT_CHARS) return { result: value }
  const marker = '\n... [result truncated at 50,000 serialized characters]'
  return {
    result: serialized.slice(0, MAX_SERIALIZED_RESULT_CHARS - marker.length) + marker,
    resultTruncated: true
  }
}

function timeoutResult(terminationAttempted: boolean, terminationAcknowledged: boolean): ScriptExecutionResult {
  const termination = terminationAcknowledged
    ? 'Chrome acknowledged the best-effort termination request.'
    : 'Chrome did not acknowledge a best-effort termination request.'
  return {
    success: false,
    error: `Script evaluation timed out. ${termination} Execution may already have changed the page; inspect state before retrying.`,
    executionPath: 'debugger',
    timedOut: true,
    uncertain: true,
    terminationAttempted,
    terminationAcknowledged
  }
}

/** Exact fallback used only when Chrome refuses debugger attachment. */
export function executeWhitelistFallback(code: string, mutationDeadlineMs?: number): Omit<ScriptExecutionResult, 'executionPath'> {
  const expired = () => mutationDeadlineMs !== undefined && Date.now() >= mutationDeadlineMs
  if (expired()) {
    return { success: false, error: 'Refused: the request deadline expired before fallback execution; nothing was executed' }
  }

  try {
    const selectorMatch = code.match(/^\s*document\.querySelector\(\s*(['"])(.*?)\1\s*\)(?:\.(outerHTML|innerHTML|textContent|innerText|value|click\(\)))?\s*;?\s*$/)
    if (selectorMatch) {
      const selector = selectorMatch[2]
      const operation = selectorMatch[3]
      const element = document.querySelector(selector)
      if (!element) return { success: false, error: `Element not found: ${selector}` }
      if (operation === 'outerHTML') return { success: true, result: element.outerHTML }
      if (operation === 'innerHTML') return { success: true, result: element.innerHTML }
      if (operation === 'textContent') return { success: true, result: element.textContent }
      if (operation === 'innerText') return { success: true, result: (element as HTMLElement).innerText }
      if (operation === 'value') return { success: true, result: (element as HTMLInputElement).value }
      if (operation === 'click()') {
        if (expired()) {
          return { success: false, error: 'Refused: the request deadline expired before fallback click; nothing was clicked' }
        }
        ;(element as HTMLElement).click()
        return { success: true, result: null }
      }
      return {
        success: true,
        result: {
          tagName: element.tagName,
          text: element.textContent?.trim() || '',
          html: element.outerHTML.slice(0, 1000)
        }
      }
    }

    const selectorAllMatch = code.match(/^\s*document\.querySelectorAll\(\s*(['"])(.*?)\1\s*\)\s*;?\s*$/)
    if (selectorAllMatch) {
      const elements = document.querySelectorAll(selectorAllMatch[2])
      return {
        success: true,
        result: [...elements].slice(0, 100).map(element => ({
          tagName: element.tagName,
          text: element.textContent?.trim() || ''
        }))
      }
    }
    if (/^\s*document\.title\s*;?\s*$/.test(code)) return { success: true, result: document.title }
    if (/^\s*document\.links\s*;?\s*$/.test(code)) {
      return { success: true, result: [...document.links].map(link => ({ text: link.textContent?.trim() || '', href: link.href })) }
    }
    if (/^\s*document\.images\s*;?\s*$/.test(code)) {
      return { success: true, result: [...document.images].map(image => ({ src: image.src, alt: image.alt })) }
    }
    if (/^\s*document\.documentElement\.(outerHTML|innerHTML)\s*;?\s*$/.test(code)) {
      const property = code.includes('.outerHTML') ? 'outerHTML' : 'innerHTML'
      return { success: true, result: document.documentElement[property] }
    }
    if (/^\s*document\.body\.(innerText|textContent)\s*;?\s*$/.test(code)) {
      const property = code.includes('.innerText') ? 'innerText' : 'textContent'
      return { success: true, result: document.body[property] }
    }
    if (/^\s*(?:localStorage|JSON\.stringify\(\s*localStorage\s*\))\s*;?\s*$/.test(code)) {
      const storage: Record<string, string> = {}
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (key) storage[key] = localStorage.getItem(key) || ''
      }
      return { success: true, result: storage }
    }
    return {
      success: false,
      error: 'Debugger attachment was refused and the code does not exactly match a whitelist fallback shape. Supported shapes: document.querySelector("selector")[.outerHTML|.innerHTML|.textContent|.innerText|.value|.click()], document.querySelectorAll("selector"), document.title, document.links, document.images, document.documentElement.outerHTML, document.documentElement.innerHTML, document.body.innerText, document.body.textContent, localStorage, JSON.stringify(localStorage).'
    }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
}

export async function handleBrowserExecuteScript(message: {
  requestId: string
  code: string
  tabId?: number
  allFrames?: boolean
  requestTimeoutMs?: number
  agent?: string
}): Promise<void> {
  const receivedAt = Date.now()
  try {
    const targetTabId = (await resolveAgentTab(message.agent, message.tabId))?.id
    if (!targetTabId) {
      sendToWebSocket({ type: 'browser-script-result', requestId: message.requestId, success: false, error: 'No active tab found', executionPath: 'debugger' })
      return
    }
    await assertAgentReadableTab('tabz_execute_script', targetTabId)
    await runWithDocumentAdmission(targetTabId, async () => {
      const documentToken = await assertDocumentReadable(targetTabId, 'tabz_execute_script')

    const requestBudget = message.requestTimeoutMs
    if (requestBudget !== undefined && (!Number.isFinite(requestBudget) || requestBudget <= RESPONSE_RESERVE_MS + TERMINATION_RESERVE_MS)) {
      sendToWebSocket({
        type: 'browser-script-result', requestId: message.requestId, success: false,
        error: 'Refused: the request deadline leaves no time to start script evaluation; nothing was executed', executionPath: 'debugger'
      })
      return
    }

    const responseDeadline = requestBudget === undefined
      ? receivedAt + DEFAULT_REQUEST_TIMEOUT_MS - RESPONSE_RESERVE_MS
      : receivedAt + requestBudget - RESPONSE_RESERVE_MS
    const guard = () => {
      if (Date.now() >= responseDeadline - TERMINATION_RESERVE_MS) {
        throw new Error('Refused: the request deadline expired before script evaluation started; nothing was executed')
      }
    }

    // All-frame execution stays on the exact whitelist path. Discover the
    // current frame document IDs with a value-free probe, validate each
    // against protection history, then target that frozen ID set.
    if (message.allFrames === true) {
      const frameProbe = await chrome.scripting.executeScript({
        target: { tabId: targetTabId, allFrames: true },
        func: () => true
      })
      const documentIds = frameProbe.map(result => result.documentId)
      if (documentIds.length === 0 || documentIds.some(id => typeof id !== 'string' || !id)) {
        throw new Error('Refused: allFrames script execution could not bind every frame to a Chrome document ID')
      }
      if (!frameProbe.some(result => result.frameId === 0 && result.documentId === documentToken.documentId)) {
        throw new Error('Refused: allFrames script execution could not verify the current main document')
      }
      for (const documentId of documentIds as string[]) {
        await assertDocumentReadCurrent(targetTabId, documentToken, { captureDocumentId: documentId })
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId: targetTabId, documentIds: documentIds as string[] },
        func: executeWhitelistFallback,
        args: [message.code, responseDeadline - TERMINATION_RESERVE_MS]
      })
      const returnedIds = results.map(result => result.documentId)
      if (returnedIds.length !== documentIds.length ||
          returnedIds.some(id => typeof id !== 'string' || !(documentIds as string[]).includes(id))) {
        throw new Error('Refused: the frame set changed during allFrames script execution')
      }
      for (const result of results) {
        await assertDocumentReadCurrent(targetTabId, documentToken, { captureDocumentId: result.documentId })
      }
      const values = results.map(result => result.result as Omit<ScriptExecutionResult, 'executionPath'> | undefined)
      const failure = values.find(value => !value?.success)
      const mainResult = results.find(result => result.frameId === 0)
      const mainValue = mainResult?.result as Omit<ScriptExecutionResult, 'executionPath'> | undefined
      if (!mainResult || mainResult.documentId !== documentToken.documentId || !mainValue) {
        throw new Error('Refused: allFrames script execution returned no verified main-frame result')
      }
      sendToWebSocket({
        type: 'browser-script-result', requestId: message.requestId,
        success: !failure,
        ...(failure ? { error: failure.error } : capSerializedResult(mainValue.result)),
        executionPath: 'whitelist-all-frames',
        warning: 'allFrames ran the exact whitelist operation in each verified frame; this response contains the main-frame result.'
      })
      return
    }

    let evaluationStarted = false
    let result: ScriptExecutionResult
    try {
      result = await withDebugger(targetTabId, async target => {
        guard()
        const evaluationTimeout = Math.min(SCRIPT_OPERATION_TIMEOUT_MS, Math.max(1, responseDeadline - TERMINATION_RESERVE_MS - Date.now()))
        evaluationStarted = true
        try {
          const evaluation = await sendDebuggerCommand<RuntimeEvaluateResponse>(target, 'Runtime.evaluate', {
            expression: message.code,
            returnByValue: true,
            awaitPromise: true,
            userGesture: true,
            timeout: evaluationTimeout
          }, evaluationTimeout + COMMAND_CALLBACK_GRACE_MS)

          if (evaluation.exceptionDetails) {
            const error = evaluation.exceptionDetails.exception?.description
              || evaluation.exceptionDetails.text || evaluation.result.description || 'JavaScript evaluation failed'
            if (/timed out|execution was terminated/i.test(error)) {
              return {
                ...timeoutResult(false, false),
                error: 'Script evaluation timed out. Chrome reported that evaluation settled, but earlier statements may have changed the page; inspect state before retrying.'
              }
            }
            return { success: false, error: error.slice(0, MAX_SERIALIZED_RESULT_CHARS), executionPath: 'debugger' }
          }
          const value = Object.prototype.hasOwnProperty.call(evaluation.result, 'value')
            ? evaluation.result.value
            : evaluation.result.unserializableValue ?? evaluation.result.description ?? null
          return { success: true, ...capSerializedResult(value), executionPath: 'debugger' }
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          const callbackTimedOut = /^Debugger command 'Runtime\.evaluate' timed out after \d+(?:\.\d+)?ms$/.test(detail)
          if (!callbackTimedOut) {
            if (/timed out|execution was terminated/i.test(detail)) {
              return {
                ...timeoutResult(false, false),
                error: 'Script evaluation timed out. Chrome reported that evaluation settled, but earlier statements may have changed the page; inspect state before retrying.'
              }
            }
            throw error
          }

          let terminationAcknowledged = false
          try {
            const cleanupBudget = Math.max(1, Math.min(TERMINATION_TIMEOUT_MS, responseDeadline - Date.now()))
            await sendDebuggerCommand(target, 'Runtime.terminateExecution', undefined, cleanupBudget)
            terminationAcknowledged = true
          } catch {
            // Runtime.terminateExecution is experimental and best effort.
          }
          return timeoutResult(true, terminationAcknowledged)
        }
      }, { guard })
    } catch (error) {
      if (error instanceof DebuggerAttachError && !evaluationStarted) {
        const fallbackDeadline = responseDeadline - TERMINATION_RESERVE_MS
        const results = await chrome.scripting.executeScript({
          target: protectedDocumentTarget(documentToken),
          func: executeWhitelistFallback,
          args: [message.code, fallbackDeadline]
        })
        const fallback = results[0]?.result as Omit<ScriptExecutionResult, 'executionPath'> | undefined
        result = {
          success: fallback?.success || false,
          ...(fallback?.success ? capSerializedResult(fallback.result) : {}),
          error: fallback?.error,
          executionPath: 'whitelist-fallback',
          warning: `Debugger attachment was refused: ${error.message}`
        }
      } else {
        result = { success: false, error: error instanceof Error ? error.message : String(error), executionPath: 'debugger' }
      }
    }

    if (result.uncertain) {
      await markDocumentReadUncertain(targetTabId, documentToken)
      sendToWebSocket({ type: 'browser-script-result', requestId: message.requestId, ...result })
      return
    }
    await assertDocumentReadCurrent(targetTabId, documentToken)
    sendToWebSocket({ type: 'browser-script-result', requestId: message.requestId, ...result })
    })
  } catch (error) {
    sendToWebSocket({
      type: 'browser-script-result', requestId: message.requestId, success: false,
      error: error instanceof Error ? error.message : String(error), executionPath: 'debugger'
    })
  }
}

export async function handleBrowserGetPageInfo(message: { requestId: string; tabId?: number; agent?: string }): Promise<void> {
  try {
    const tab = await resolveAgentTab(message.agent, message.tabId)
    if (tab) {
      await assertAgentReadableTab('tabz_get_page_info', tab)
      if (tab.id === undefined) throw new Error('No active tab found')
      await runWithDocumentAdmission(tab.id, async () => {
        const protection = await currentDocumentProtection(tab.id!)
        if (protection) {
          const currentTab = await chrome.tabs.get(tab.id!)
          await assertProtectedDocumentCurrent(tab.id!, protection)
          let safeUrl = ''
          try {
            const parsed = new URL(currentTab.url || '')
            safeUrl = parsed.origin
          } catch {
            // The page guard already rejects unsupported URLs. Keep metadata
            // empty if Chrome returns an unexpected value after that check.
          }
          sendToWebSocket({
            type: 'browser-page-info', requestId: message.requestId, url: safeUrl, title: '',
            tabId: tab.id || -1, protectedFillVersion: 1
          })
          return
        }
        const token = await assertDocumentReadable(tab.id!, 'tabz_get_page_info')
        const injection = (await chrome.scripting.executeScript({
          target: protectedDocumentTarget(token),
          func: () => ({ url: location.href, title: document.title })
        }))[0]
        await assertDocumentReadCurrent(tab.id!, token, { documentId: injection?.documentId })
        const metadata = injection?.result as { url?: string; title?: string } | undefined
        if (!metadata) throw new Error('Page metadata could not be bound to the current document')
        sendToWebSocket({
          type: 'browser-page-info', requestId: message.requestId, url: metadata.url || '', title: metadata.title || '',
          tabId: tab.id || -1, protectedFillVersion: 1
        })
      })
    } else {
      sendToWebSocket({ type: 'browser-page-info', requestId: message.requestId, url: '', title: '', tabId: -1, error: 'No active tab found' })
    }
  } catch (error) {
    sendToWebSocket({
      type: 'browser-page-info', requestId: message.requestId, url: '', title: '', tabId: -1,
      error: (error as Error).message
    })
  }
}
