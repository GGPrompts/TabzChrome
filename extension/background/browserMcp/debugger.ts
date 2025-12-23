/**
 * Browser MCP - Chrome Debugger handlers
 * DOM tree inspection, performance profiling, code coverage
 */

import { sendToWebSocket } from '../websocket'

// ============================================
// Debugger Helpers
// ============================================

/**
 * Helper to attach debugger to a tab and run a command
 * Auto-detaches after operation completes
 */
async function withDebugger<T>(
  tabId: number,
  fn: (target: chrome.debugger.Debuggee) => Promise<T>
): Promise<T> {
  const target: chrome.debugger.Debuggee = { tabId }

  try {
    // Attach debugger
    await chrome.debugger.attach(target, '1.3')

    // Run the operation
    const result = await fn(target)

    // Detach debugger
    await chrome.debugger.detach(target)

    return result
  } catch (err) {
    // Always try to detach on error
    try {
      await chrome.debugger.detach(target)
    } catch {
      // Ignore detach errors
    }
    throw err
  }
}

/**
 * Send a debugger command and return the result
 */
function sendDebuggerCommand<T>(
  target: chrome.debugger.Debuggee,
  method: string,
  params?: { [key: string]: unknown },
  timeoutMs: number = 10000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Debugger command '${method}' timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    chrome.debugger.sendCommand(target, method, params, (result) => {
      clearTimeout(timeout)
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message))
      } else {
        resolve(result as T)
      }
    })
  })
}

// ============================================
// DOM Tree Types and Helpers
// ============================================

interface DOMNode {
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
  children?: SimplifiedDOMNode[]
  childCount?: number
}

/**
 * Simplify DOM node for output
 */
function simplifyDOMNode(node: DOMNode, maxDepth: number, currentDepth: number = 0): SimplifiedDOMNode | null {
  // Skip non-element nodes except text nodes with content
  if (node.nodeType === 3) { // Text node
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
          return simplifyDOMNode(child, maxDepth, currentDepth)
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

  // Parse attributes
  if (node.attributes) {
    for (let i = 0; i < node.attributes.length; i += 2) {
      const name = node.attributes[i]
      const value = node.attributes[i + 1]
      if (name === 'id') {
        simplified.id = value
      } else if (name === 'class') {
        simplified.classes = value.split(/\s+/).filter(Boolean).slice(0, 5)
      }
    }
  }

  // Add child count for truncated branches
  if (node.childNodeCount !== undefined && node.childNodeCount > 0) {
    simplified.childCount = node.childNodeCount
  }

  // Process children if within depth limit
  if (node.children && currentDepth < maxDepth) {
    const childNodes = node.children
      .map(child => simplifyDOMNode(child, maxDepth, currentDepth + 1))
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
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-dom-tree-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const maxDepth = Math.min(message.maxDepth || 4, 10) // Cap at 10 levels

    const result = await withDebugger(targetTabId, async (target) => {
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
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-profile-performance-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const result = await withDebugger(targetTabId, async (target) => {
      // Enable Performance domain
      await sendDebuggerCommand(target, 'Performance.enable')

      // Get metrics
      const metricsResult = await sendDebuggerCommand<{ metrics: PerformanceMetric[] }>(
        target,
        'Performance.getMetrics'
      )

      return metricsResult.metrics
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

interface CSSCoverage {
  styleSheetId: string
  sourceURL: string
  startOffset: number
  endOffset: number
  used: boolean
}

/**
 * Get JS/CSS code coverage using chrome.debugger
 */
export async function handleBrowserGetCoverage(message: {
  requestId: string
  tabId?: number
  coverageType?: 'js' | 'css' | 'both'
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = message.tabId || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-get-coverage-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const coverageType = message.coverageType || 'both'

    const result = await withDebugger(targetTabId, async (target) => {
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

      // JS Coverage
      if (coverageType === 'js' || coverageType === 'both') {
        // Enable Profiler domain for JS coverage
        await sendDebuggerCommand(target, 'Profiler.enable')
        await sendDebuggerCommand(target, 'Profiler.startPreciseCoverage', {
          callCount: true,
          detailed: true
        })

        // Small delay to collect some coverage data
        await new Promise(resolve => setTimeout(resolve, 100))

        // Get coverage
        const jsCoverageResult = await sendDebuggerCommand<{ result: ScriptCoverage[] }>(
          target,
          'Profiler.takePreciseCoverage'
        )

        await sendDebuggerCommand(target, 'Profiler.stopPreciseCoverage')
        await sendDebuggerCommand(target, 'Profiler.disable')

        // Process JS coverage
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
                if (range.count > 0) {
                  usedBytes += rangeSize
                } else {
                  unusedRanges++
                }
              }
            }

            return {
              url: script.url,
              usedBytes,
              totalBytes,
              usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
              unusedRanges
            }
          })
          .filter(s => s.totalBytes > 0)
          .sort((a, b) => b.totalBytes - a.totalBytes)
          .slice(0, 50) // Top 50 scripts
      }

      // CSS Coverage
      if (coverageType === 'css' || coverageType === 'both') {
        // Enable DOM first (required for CSS)
        await sendDebuggerCommand(target, 'DOM.enable')
        // Enable CSS domain
        await sendDebuggerCommand(target, 'CSS.enable')
        await sendDebuggerCommand(target, 'CSS.startRuleUsageTracking')

        // Small delay to collect coverage
        await new Promise(resolve => setTimeout(resolve, 100))

        const cssCoverageResult = await sendDebuggerCommand<{ ruleUsage: CSSCoverage[] }>(
          target,
          'CSS.stopRuleUsageTracking'
        )

        await sendDebuggerCommand(target, 'CSS.disable')
        await sendDebuggerCommand(target, 'DOM.disable')

        // Group by stylesheet
        const styleSheets = new Map<string, { usedBytes: number; totalBytes: number }>()

        for (const rule of cssCoverageResult.ruleUsage) {
          if (!rule.sourceURL || rule.sourceURL.startsWith('chrome-extension://')) continue

          const existing = styleSheets.get(rule.sourceURL) || { usedBytes: 0, totalBytes: 0 }
          const ruleSize = rule.endOffset - rule.startOffset
          existing.totalBytes += ruleSize
          if (rule.used) {
            existing.usedBytes += ruleSize
          }
          styleSheets.set(rule.sourceURL, existing)
        }

        coverage.css = Array.from(styleSheets.entries())
          .map(([url, data]) => ({
            url,
            usedBytes: data.usedBytes,
            totalBytes: data.totalBytes,
            usedPercent: data.totalBytes > 0 ? Math.round((data.usedBytes / data.totalBytes) * 100) : 0
          }))
          .filter(s => s.totalBytes > 0)
          .sort((a, b) => b.totalBytes - a.totalBytes)
          .slice(0, 50) // Top 50 stylesheets
      }

      return coverage
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
