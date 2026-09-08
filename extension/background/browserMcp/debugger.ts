/**
 * Browser MCP - Chrome Debugger handlers
 * DOM tree inspection, performance profiling, code coverage
 */

import { sendToWebSocket } from '../websocket'
import { isSensitiveInput } from './sensitiveFields'
import { assertAgentReadableTab } from './pageGuard'
import { resolveAgentTab } from './tabGroups'
import {
  assertDocumentReadable,
  assertDocumentReadCurrent,
  runWithDocumentAdmission
} from './documentProtection'

// ============================================
// Debugger Helpers
// ============================================

export class DebuggerAttachError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DebuggerAttachError'
  }
}

const debuggerQueueTails = new Map<number, Promise<void>>()
const emulatedTabIds = new Set<number>()
const deepCapturedTabIds = new Set<number>()

/** Serialize debugger sessions for one tab while allowing different tabs to run concurrently. */
export async function runExclusivePerTab<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const previous = debuggerQueueTails.get(tabId) ?? Promise.resolve()
  let release!: () => void
  const slot = new Promise<void>(resolve => { release = resolve })
  const tail = previous.catch(() => undefined).then(() => slot)
  debuggerQueueTails.set(tabId, tail)

  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
    if (debuggerQueueTails.get(tabId) === tail) debuggerQueueTails.delete(tabId)
  }
}

export function isEmulatedTabAttached(tabId: number): boolean {
  return emulatedTabIds.has(tabId)
}

export function isDeepCaptureTabAttached(tabId: number): boolean {
  return deepCapturedTabIds.has(tabId)
}

export function isPersistentDebuggerAttached(tabId: number): boolean {
  return emulatedTabIds.has(tabId) || deepCapturedTabIds.has(tabId)
}

export function markEmulatedTabAttached(tabId: number): void {
  emulatedTabIds.add(tabId)
}

export function markEmulatedTabDetached(tabId: number): void {
  emulatedTabIds.delete(tabId)
}

export function markDeepCaptureTabAttached(tabId: number): void {
  deepCapturedTabIds.add(tabId)
}

export function markDeepCaptureTabDetached(tabId: number): void {
  deepCapturedTabIds.delete(tabId)
}

const ENTERPRISE_POLICY_ATTACH_MARKERS = [
  'host access is restricted by policy',
  'screenshot capture is restricted by policy'
] as const

export function isEnterprisePolicyDebuggerError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return ENTERPRISE_POLICY_ATTACH_MARKERS.some(marker => message.includes(marker))
}

export function enterprisePolicyDebuggerMessage(originalMessage: string): string {
  return `Chrome debugger attach is blocked by enterprise policy on this browser (${originalMessage}). `
    + 'Synthetic-path actions still work; the trusted path, full-page screenshots, execute_script, '
    + 'deep capture, and emulation need the admin to lift ExtensionSettings runtime_blocked_hosts '
    + 'or DisableScreenshots.'
}

export function isDebuggerBusyError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('Another debugger is already attached')
}

export function debuggerAttachError(tabId: number, err: unknown): DebuggerAttachError {
  const message = err instanceof Error ? err.message : String(err)
  if (isEnterprisePolicyDebuggerError(err)) {
    return new DebuggerAttachError(enterprisePolicyDebuggerMessage(message))
  }
  if (
    message.includes('Cannot access a chrome-extension:// URL of different extension')
    || isDebuggerBusyError(err)
  ) {
    return new DebuggerAttachError(`Debugger busy on tab ${tabId}; ask the user to close/disable DevTools, a password manager/inline-autofill extension, or an earlier deep-capture session, not retry.`)
  }
  return new DebuggerAttachError(message)
}

const BUSY_ATTACH_RETRY_DELAYS_MS = [100, 250, 500] as const

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function attachWithBusyRetry(
  target: chrome.debugger.Debuggee,
  tabId: number,
  delaysMs: readonly number[] = BUSY_ATTACH_RETRY_DELAYS_MS,
  guard: () => void = () => undefined
): Promise<void> {
  let attempt = 0
  let staleAttachmentTried = false

  for (;;) {
    guard()
    try {
      await chrome.debugger.attach(target, '1.3')
      return
    } catch (err) {
      if (!isDebuggerBusyError(err)) throw debuggerAttachError(tabId, err)
      guard()

      if (!staleAttachmentTried) {
        staleAttachmentTried = true
        let detached = false
        try {
          await chrome.debugger.detach(target)
          detached = true
        } catch {
          // Another debugger client owns the tab; bounded retries may outlive it.
        }
        if (detached) {
          markEmulatedTabDetached(tabId)
          markDeepCaptureTabDetached(tabId)
          continue
        }
      }

      if (attempt >= delaysMs.length) throw debuggerAttachError(tabId, err)
      await delay(delaysMs[attempt])
      guard()
      attempt += 1
    }
  }
}

export async function withDebugger<T>(
  tabId: number,
  fn: (target: chrome.debugger.Debuggee) => Promise<T>,
  options: { guard?: () => void } = {}
): Promise<T> {
  return runExclusivePerTab(tabId, async () => {
    const guard = options.guard ?? (() => undefined)
    guard()
    const target: chrome.debugger.Debuggee = { tabId }
    const reuseExistingAttachment = isPersistentDebuggerAttached(tabId)
    let attachedHere = false

    try {
      if (!reuseExistingAttachment) {
        await attachWithBusyRetry(target, tabId, BUSY_ATTACH_RETRY_DELAYS_MS, guard)
        attachedHere = true
      }
      guard()
      return await fn(target)
    } finally {
      if (attachedHere) {
        try { await chrome.debugger.detach(target) } catch { /* best effort */ }
      }
    }
  })
}

/**
 * Send a debugger command and return the result
 */
export function sendDebuggerCommand<T>(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: object,
  timeoutMs: number = 10000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Debugger command '${method}' timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    chrome.debugger.sendCommand(target, method, params as { [key: string]: unknown } | undefined, (result) => {
      clearTimeout(timeout)
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(result as T)
      }
    })
  })
}

export type CancelableTabLoad = Promise<void> & { cancel: () => void }

export function waitForTabLoadComplete(tabId: number, timeoutMs = 15000): CancelableTabLoad {
  let cancel = () => undefined
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false
    const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        settled = true
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    const timeout = setTimeout(() => {
      settled = true
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error(`Tab did not finish loading within ${Math.round(timeoutMs / 1000)} seconds`))
    }, timeoutMs)
    cancel = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(listener)
      resolve()
    }
    chrome.tabs.onUpdated.addListener(listener)
  })
  return Object.assign(promise, { cancel })
}

// ============================================
// DOM Tree Types and Helpers
// ============================================

export interface DOMNode {
  nodeId: number
  nodeName: string
  nodeType: number
  nodeValue?: string
  localName?: string
  attributes?: string[]
  children?: DOMNode[]
  childNodeCount?: number
}

interface SimplifiedDOMNode {
  tag: string
  id?: string
  classes?: string[]
  text?: string
  value?: string
  children?: SimplifiedDOMNode[]
  childCount?: number
}

/**
 * Simplify DOM node for output
 */
export function simplifyDOMNode(
  node: DOMNode,
  maxDepth: number,
  currentDepth: number = 0,
  ancestorSensitive: boolean = false
): SimplifiedDOMNode | null {
  // Skip non-element nodes except text nodes with content
  if (node.nodeType === 3) { // Text node
    if (ancestorSensitive) return null
    const text = node.nodeValue?.trim()
    if (text && text.length > 0) {
      return { tag: '#text', text: text.slice(0, 200) }
    }
    return null
  }

  // Handle document node (nodeType 9) - traverse to children
  if (node.nodeType === 9) { // Document node
    if (node.children && node.children.length > 0) {
      // Find the html element (skip DOCTYPE)
      for (const child of node.children) {
        if (child.nodeType === 1) { // Element
          return simplifyDOMNode(child, maxDepth, currentDepth, ancestorSensitive)
        }
      }
    }
    return null
  }

  if (node.nodeType !== 1) { // Not an element
    return null
  }

  const simplified: SimplifiedDOMNode = {
    tag: node.localName || node.nodeName.toLowerCase()
  }
  let sensitive = ancestorSensitive

  // Keep useful values for ordinary inputs while dropping credential-shaped values.
  if (node.attributes) {
    let type: string | undefined
    let attrName: string | undefined
    let autocomplete: string | undefined
    let rawValue: string | undefined
    for (let i = 0; i < node.attributes.length; i += 2) {
      const name = node.attributes[i]
      const value = node.attributes[i + 1]
      if (name === 'id') {
        simplified.id = value
      } else if (name === 'class') {
        simplified.classes = value.split(/\s+/).filter(Boolean).slice(0, 5)
      } else if (name === 'type') {
        type = value
      } else if (name === 'name') {
        attrName = value
      } else if (name === 'autocomplete') {
        autocomplete = value
      } else if (name === 'value') {
        rawValue = value
      }
    }
    sensitive = ancestorSensitive || isSensitiveInput(simplified.tag, type, attrName, simplified.id, autocomplete)
    if (rawValue !== undefined && !sensitive) {
      simplified.value = rawValue
    }
  }

  // Add child count for truncated branches
  if (node.childNodeCount !== undefined && node.childNodeCount > 0) {
    simplified.childCount = node.childNodeCount
  }

  // Process children if within depth limit
  if (node.children && currentDepth < maxDepth) {
    const childNodes = node.children
      .map(child => simplifyDOMNode(child, maxDepth, currentDepth + 1, sensitive))
      .filter((n): n is SimplifiedDOMNode => n !== null)

    if (childNodes.length > 0) {
      simplified.children = childNodes.slice(0, 50) // Limit children per node
    }
  }

  return simplified
}

/**
 * Count nodes in simplified tree
 */
function countNodes(node: SimplifiedDOMNode | null): number {
  if (!node) return 0
  let count = 1
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}

// ============================================
// DOM Tree Handler
// ============================================

/**
 * Get DOM tree using chrome.debugger
 */
export async function handleBrowserGetDomTree(message: {
  requestId: string
  tabId?: number
  maxDepth?: number
  selector?: string
  agent?: string
}): Promise<void> {
  try {
    const targetTabId = (await resolveAgentTab(message.agent, message.tabId))?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-dom-tree-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }
    await assertAgentReadableTab('tabz_get_dom_tree', targetTabId)

    const maxDepth = Math.min(message.maxDepth || 4, 10) // Cap at 10 levels

    const result = await runWithDocumentAdmission(targetTabId, async () => {
      const token = await assertDocumentReadable(targetTabId, 'tabz_get_dom_tree')
      const tree = await withDebugger(targetTabId, async (target) => {
        // Enable DOM domain
        await sendDebuggerCommand(target, 'DOM.enable')

      // Get document
      const docResult = await sendDebuggerCommand<{ root: DOMNode }>(target, 'DOM.getDocument', {
        depth: maxDepth,
        pierce: true // Pierce through shadow DOM
      })

      // If selector specified, find that node instead
      if (message.selector) {
        try {
          const queryResult = await sendDebuggerCommand<{ nodeId: number }>(
            target,
            'DOM.querySelector',
            { nodeId: docResult.root.nodeId, selector: message.selector }
          )

          if (queryResult.nodeId) {
            const nodeResult = await sendDebuggerCommand<{ node: DOMNode }>(
              target,
              'DOM.describeNode',
              { nodeId: queryResult.nodeId, depth: maxDepth }
            )
            return nodeResult.node
          }
        } catch {
          // Selector not found, return full document
        }
      }

        return docResult.root
      })
      await assertDocumentReadCurrent(targetTabId, token)
      return tree
    })

    // Simplify the DOM tree for output
    const simplified = simplifyDOMNode(result, maxDepth)

    sendToWebSocket({
      type: 'browser-get-dom-tree-result',
      requestId: message.requestId,
      success: true,
      tree: simplified,
      nodeCount: countNodes(simplified)
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-dom-tree-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// Performance Profiling Handler
// ============================================

interface PerformanceMetric {
  name: string
  value: number
}

/**
 * Profile page performance using chrome.debugger
 */
export async function handleBrowserProfilePerformance(message: {
  requestId: string
  tabId?: number
  agent?: string
}): Promise<void> {
  try {
    const targetTabId = (await resolveAgentTab(message.agent, message.tabId))?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-profile-performance-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }
    await assertAgentReadableTab('tabz_profile_performance', targetTabId)

    const result = await runWithDocumentAdmission(targetTabId, async () => {
      const token = await assertDocumentReadable(targetTabId, 'tabz_profile_performance')
      const metrics = await withDebugger(targetTabId, async (target) => {
        // Enable Performance domain
        await sendDebuggerCommand(target, 'Performance.enable')

      // Get metrics
      const metricsResult = await sendDebuggerCommand<{ metrics: PerformanceMetric[] }>(
        target,
        'Performance.getMetrics'
      )

        return metricsResult.metrics
      })
      await assertDocumentReadCurrent(targetTabId, token)
      return metrics
    })

    // Format metrics into categories
    const timing: Record<string, number> = {}
    const memory: Record<string, number> = {}
    const dom: Record<string, number> = {}
    const other: Record<string, number> = {}

    for (const metric of result) {
      const name = metric.name
      const value = metric.value

      // Timing metrics (convert to ms)
      if (name.includes('Time') || name.includes('Duration') || name === 'TaskDuration') {
        timing[name] = Math.round(value * 1000 * 100) / 100 // Round to 2 decimals
      }
      // Memory metrics (convert to MB)
      else if (name.includes('Memory') || name.includes('Size') || name === 'JSHeapUsedSize' || name === 'JSHeapTotalSize') {
        memory[name] = Math.round(value / 1024 / 1024 * 100) / 100 // MB with 2 decimals
      }
      // DOM metrics
      else if (name.includes('Node') || name.includes('Document') || name.includes('Frame') || name.includes('Layout')) {
        dom[name] = Math.round(value)
      }
      // Other metrics
      else {
        other[name] = Math.round(value * 1000) / 1000
      }
    }

    sendToWebSocket({
      type: 'browser-profile-performance-result',
      requestId: message.requestId,
      success: true,
      timing,
      memory,
      dom,
      other,
      rawMetrics: result
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-profile-performance-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// Code Coverage Handler
// ============================================

interface CoverageRange {
  startOffset: number
  endOffset: number
  count: number
}

interface ScriptCoverage {
  scriptId: string
  url: string
  functions: Array<{
    functionName: string
    ranges: CoverageRange[]
  }>
}

export interface CSSRuleUsage {
  styleSheetId: string
  startOffset: number
  endOffset: number
  used: boolean
}

export interface CSSStyleSheetHeader {
  styleSheetId: string
  sourceURL: string
  frameId: string
  isInline: boolean
}

interface PageFrame {
  id: string
  url: string
}

interface PageFrameTree {
  frame: PageFrame
  childFrames?: PageFrameTree[]
}

export interface CSSCoverageFile {
  url: string
  usedBytes: number
  totalBytes: number
  usedPercent: number
}

export function aggregateCssCoverage(
  headers: ReadonlyMap<string, CSSStyleSheetHeader>,
  ruleUsage: CSSRuleUsage[],
  textLengths: ReadonlyMap<string, number>,
  frameUrls: ReadonlyMap<string, string> = new Map()
): CSSCoverageFile[] {
  const rangesByStyleSheet = new Map<string, { usedBytes: number; rangeBytes: number }>()
  for (const rule of ruleUsage) {
    const size = Math.max(0, rule.endOffset - rule.startOffset)
    const entry = rangesByStyleSheet.get(rule.styleSheetId) ?? { usedBytes: 0, rangeBytes: 0 }
    entry.rangeBytes += size
    if (rule.used) entry.usedBytes += size
    rangesByStyleSheet.set(rule.styleSheetId, entry)
  }

  const filesByUrl = new Map<string, { usedBytes: number; totalBytes: number }>()
  for (const [styleSheetId, ranges] of rangesByStyleSheet) {
    const header = headers.get(styleSheetId)
    if (!header) continue
    const sourceURL = header.sourceURL.trim()
    const frameURL = frameUrls.get(header.frameId)?.trim() || ''
    const url = header.isInline || !sourceURL ? frameURL || 'inline' : sourceURL
    if (url.startsWith('chrome-extension://')) continue
    const totalBytes = textLengths.get(styleSheetId) ?? ranges.rangeBytes
    if (totalBytes <= 0) continue
    const file = filesByUrl.get(url) ?? { usedBytes: 0, totalBytes: 0 }
    file.usedBytes += ranges.usedBytes
    file.totalBytes += totalBytes
    filesByUrl.set(url, file)
  }

  return Array.from(filesByUrl.entries()).map(([url, data]) => ({
    url,
    usedBytes: data.usedBytes,
    totalBytes: data.totalBytes,
    usedPercent: Math.round((data.usedBytes / data.totalBytes) * 100)
  }))
}

function collectFrameUrls(frameTree: PageFrameTree, frameUrls: Map<string, string>): void {
  frameUrls.set(frameTree.frame.id, frameTree.frame.url)
  for (const child of frameTree.childFrames ?? []) collectFrameUrls(child, frameUrls)
}

/**
 * Get JS/CSS code coverage using chrome.debugger
 */
export async function handleBrowserGetCoverage(message: {
  requestId: string
  tabId?: number
  coverageType?: 'js' | 'css' | 'both'
  agent?: string
}): Promise<void> {
  try {
    const targetTabId = (await resolveAgentTab(message.agent, message.tabId))?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-coverage-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }
    await assertAgentReadableTab('tabz_get_coverage', targetTabId)

    const coverageType = message.coverageType || 'both'
    const wantsJs = coverageType === 'js' || coverageType === 'both'
    const wantsCss = coverageType === 'css' || coverageType === 'both'

    const result = await runWithDocumentAdmission(targetTabId, async () => {
      // Refuse before triggering the intentional reload if the starting
      // document is protected or has an unresolved read.
      await assertDocumentReadable(targetTabId, 'tabz_get_coverage')
      let reloadedDocumentToken: Awaited<ReturnType<typeof assertDocumentReadable>> | undefined
      const coverageResult = await withDebugger(targetTabId, async (target) => {
      const coverage: {
        js?: Array<{
          url: string
          usedBytes: number
          totalBytes: number
          usedPercent: number
          unusedRanges: number
        }>
        css?: Array<{
          url: string
          usedBytes: number
          totalBytes: number
          usedPercent: number
        }>
      } = {}
      const cssHeaders = new Map<string, CSSStyleSheetHeader>()
      const frameUrls = new Map<string, string>()
      let cssListenerRegistered = false
      let cssTracking = false
      let jsTracking = false
      let cssEnabled = false
      let pageEnabled = false
      let domEnabled = false
      let profilerEnabled = false

      const cssEventListener = (
        source: chrome.debugger.DebuggerSession,
        method: string,
        params?: object
      ): void => {
        if (source.tabId !== targetTabId || !params) return
        if (method === 'CSS.styleSheetAdded') {
          const header = (params as { header?: CSSStyleSheetHeader }).header
          if (header) cssHeaders.set(header.styleSheetId, header)
        } else if (method === 'Page.frameNavigated') {
          const frame = (params as { frame?: PageFrame }).frame
          if (frame) frameUrls.set(frame.id, frame.url)
        }
      }

      try {
        if (wantsJs) {
          await sendDebuggerCommand(target, 'Profiler.enable')
          profilerEnabled = true
          // Treat an unanswered start as potentially active so cleanup still
          // attempts to stop it before disabling the domain.
          jsTracking = true
          await sendDebuggerCommand(target, 'Profiler.startPreciseCoverage', { callCount: true, detailed: true })
        }

        if (wantsCss) {
          chrome.debugger.onEvent.addListener(cssEventListener)
          cssListenerRegistered = true
          await sendDebuggerCommand(target, 'DOM.enable')
          domEnabled = true
          await sendDebuggerCommand(target, 'Page.enable')
          pageEnabled = true
          const frameTreeResult = await sendDebuggerCommand<{ frameTree: PageFrameTree }>(target, 'Page.getFrameTree')
          collectFrameUrls(frameTreeResult.frameTree, frameUrls)
          await sendDebuggerCommand(target, 'CSS.enable')
          cssEnabled = true
          // As above, a timed-out command may still have started tracking.
          cssTracking = true
          await sendDebuggerCommand(target, 'CSS.startRuleUsageTracking')
        }

        const loaded = waitForTabLoadComplete(targetTabId)
        try {
          await Promise.all([chrome.tabs.reload(targetTabId), loaded])
        } catch (err) {
          loaded.cancel()
          await loaded.catch(() => undefined)
          throw err
        }

        // Coverage intentionally reloads. Bind the export to the replacement
        // document after that navigation settles instead of reusing the
        // necessarily stale pre-reload token.
        reloadedDocumentToken = await assertDocumentReadable(targetTabId, 'tabz_get_coverage')

        if (wantsJs) {
          const jsCoverageResult = await sendDebuggerCommand<{ result: ScriptCoverage[] }>(target, 'Profiler.takePreciseCoverage')
          await sendDebuggerCommand(target, 'Profiler.stopPreciseCoverage')
          jsTracking = false
          await sendDebuggerCommand(target, 'Profiler.disable')
          profilerEnabled = false
          coverage.js = jsCoverageResult.result
            .filter(script => script.url && !script.url.startsWith('chrome-extension://'))
            .map(script => {
              let totalBytes = 0
              let usedBytes = 0
              let unusedRanges = 0
              for (const func of script.functions) {
                for (const range of func.ranges) {
                  const rangeSize = range.endOffset - range.startOffset
                  totalBytes += rangeSize
                  if (range.count > 0) usedBytes += rangeSize
                  else unusedRanges++
                }
              }
              return { url: script.url, usedBytes, totalBytes, usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0, unusedRanges }
            })
            .filter(script => script.totalBytes > 0)
            .sort((a, b) => b.totalBytes - a.totalBytes)
            .slice(0, 50)
        }

        if (wantsCss) {
          let cssCoverageResult: { ruleUsage: CSSRuleUsage[] }
          try {
            cssCoverageResult = await sendDebuggerCommand<{ ruleUsage: CSSRuleUsage[] }>(target, 'CSS.stopRuleUsageTracking')
            cssTracking = false
          } finally {
            chrome.debugger.onEvent.removeListener(cssEventListener)
            cssListenerRegistered = false
          }
          const styleSheetIds = new Set(cssCoverageResult.ruleUsage.map(rule => rule.styleSheetId))
          const textLengths = new Map<string, number>()
          await Promise.all(Array.from(styleSheetIds, async styleSheetId => {
            try {
              const textResult = await sendDebuggerCommand<{ text: string }>(target, 'CSS.getStyleSheetText', { styleSheetId })
              textLengths.set(styleSheetId, textResult.text.length)
            } catch { /* range lengths remain an honest fallback */ }
          }))
          coverage.css = aggregateCssCoverage(cssHeaders, cssCoverageResult.ruleUsage, textLengths, frameUrls)
            .sort((a, b) => b.totalBytes - a.totalBytes)
            .slice(0, 50)
          await sendDebuggerCommand(target, 'CSS.disable')
          cssEnabled = false
          await sendDebuggerCommand(target, 'Page.disable')
          pageEnabled = false
          await sendDebuggerCommand(target, 'DOM.disable')
          domEnabled = false
        }

        return coverage
      } finally {
        if (cssTracking) {
          try { await sendDebuggerCommand(target, 'CSS.stopRuleUsageTracking') } catch { /* best effort */ }
        }
        if (cssListenerRegistered) chrome.debugger.onEvent.removeListener(cssEventListener)
        if (jsTracking) {
          try { await sendDebuggerCommand(target, 'Profiler.stopPreciseCoverage') } catch { /* best effort */ }
        }
        if (cssEnabled) {
          try { await sendDebuggerCommand(target, 'CSS.disable') } catch { /* best effort */ }
        }
        if (pageEnabled) {
          try { await sendDebuggerCommand(target, 'Page.disable') } catch { /* best effort */ }
        }
        if (domEnabled) {
          try { await sendDebuggerCommand(target, 'DOM.disable') } catch { /* best effort */ }
        }
        if (profilerEnabled) {
          try { await sendDebuggerCommand(target, 'Profiler.disable') } catch { /* best effort */ }
        }
      }
      })
      if (!reloadedDocumentToken) throw new Error('Coverage reload did not produce a readable document')
      await assertDocumentReadCurrent(targetTabId, reloadedDocumentToken)
      return coverageResult
    })

    // Calculate summary
    const summary = {
      js: result.js ? {
        files: result.js.length,
        totalBytes: result.js.reduce((sum, s) => sum + s.totalBytes, 0),
        usedBytes: result.js.reduce((sum, s) => sum + s.usedBytes, 0),
        usedPercent: 0
      } : undefined,
      css: result.css ? {
        files: result.css.length,
        totalBytes: result.css.reduce((sum, s) => sum + s.totalBytes, 0),
        usedBytes: result.css.reduce((sum, s) => sum + s.usedBytes, 0),
        usedPercent: 0
      } : undefined
    }

    if (summary.js && summary.js.totalBytes > 0) {
      summary.js.usedPercent = Math.round((summary.js.usedBytes / summary.js.totalBytes) * 100)
    }
    if (summary.css && summary.css.totalBytes > 0) {
      summary.css.usedPercent = Math.round((summary.css.usedBytes / summary.css.totalBytes) * 100)
    }

    sendToWebSocket({
      type: 'browser-get-coverage-result',
      requestId: message.requestId,
      success: true,
      coverage: result,
      summary
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-get-coverage-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
