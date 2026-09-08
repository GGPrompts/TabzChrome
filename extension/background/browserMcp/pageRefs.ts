/**
 * Compact page reads and the opaque element refs they publish.
 *
 * Refs are capabilities for one tab's most recent successful read. The
 * extension keeps the allowlist and the page carries an opaque marker on each
 * returned element. A later read, navigation, tab close, or missing marker
 * makes the ref stale instead of falling back to selector or text matching.
 */

import { subscribeToTabOwnershipChanges } from './tabGroups'
import { sendToWebSocket } from '../websocket'
import {
  assertDocumentReadCurrent,
  assertDocumentReadable,
  markDocumentReadUncertain,
  protectedDocumentTarget,
  runWithDocumentAdmission
} from './documentProtection'
import { assertTabInAgentGroup, resolveAgentTab } from './tabGroups'

interface PageRefPublication {
  agent: string
  documentId: string
  refs: Set<string>
}

const pageRefsByTab = new Map<number, PageRefPublication>()
const refSession = (() => {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8)
  } catch {
    return Math.random().toString(36).slice(2, 10)
  }
})()
let refGeneration = 0
let pruningInstalled = false
let unsubscribeOwnership: (() => void) | undefined

export interface ReadPageMessage {
  requestId: string
  tabId?: number
  maxChars?: number
  agent?: string
  expectedOrigin?: string
  requestTimeoutMs?: number
}

export interface ReadPageDocumentResult {
  text: string
  refs: string[]
  nodeCount: number
  truncated: boolean
  title: string
  url: string
}

export function stalePageRefMessage(ref: string, tabId: number): string {
  return `Ref "${ref}" is stale or unknown for tab ${tabId}. Call tabz_read_page again and use a ref from the new result.`
}

function callerKey(agent?: string): string {
  return agent?.trim() || '__default__'
}

export function rememberPageRefs(
  tabId: number,
  refs: string[],
  binding: { agent?: string; documentId: string }
): void {
  pageRefsByTab.set(tabId, {
    agent: callerKey(binding.agent),
    documentId: binding.documentId,
    refs: new Set(refs)
  })
}

/**
 * A fresh prefix for one publication of refs. Each call bumps the generation,
 * so refs issued by a page read and refs issued by a failure's recovery
 * suggestions can never collide.
 */
export function nextPageRefPrefix(): string {
  refGeneration += 1
  return `ref_${refSession}_${refGeneration.toString(36)}_`
}

/**
 * Add refs to a tab's allowlist WITHOUT invalidating the ones already there.
 * A failure's recovery suggestions publish extra refs for the same page; the
 * refs from the last read stay usable because that page state has not moved.
 */
export function addPageRefs(
  tabId: number,
  refs: string[],
  binding: { agent?: string; documentId: string }
): void {
  if (refs.length === 0) return
  const existing = pageRefsByTab.get(tabId)
  if (existing && (
    existing.agent === callerKey(binding.agent) && existing.documentId === binding.documentId
  )) {
    for (const ref of refs) existing.refs.add(ref)
  } else {
    rememberPageRefs(tabId, refs, binding)
  }
}

export function clearPageRefsForTab(tabId: number): void {
  pageRefsByTab.delete(tabId)
}

export function resetPageRefsForTests(): void {
  unsubscribeOwnership?.()
  unsubscribeOwnership = undefined
  pageRefsByTab.clear()
  refGeneration = 0
  pruningInstalled = false
}

export function resolvePageRef(
  tabId: number,
  ref: string,
  binding: { agent?: string; documentId: string }
): string {
  const normalized = ref.trim()
  const publication = pageRefsByTab.get(tabId)
  const bindingMatches = (
    publication?.agent === callerKey(binding.agent) && publication.documentId === binding.documentId
  )
  if (!normalized || !publication?.refs.has(normalized) || !bindingMatches) {
    throw new Error(stalePageRefMessage(ref, tabId))
  }
  return `[data-tabz-ref="${normalized}"]`
}

/** Install the cache invalidation listeners once at service-worker startup. */
export function setupPageRefPruning(): void {
  if (pruningInstalled) return
  pruningInstalled = true
  unsubscribeOwnership = subscribeToTabOwnershipChanges(clearPageRefsForTab)
  chrome.tabs.onRemoved.addListener(clearPageRefsForTab)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading' || changeInfo.url !== undefined) {
      clearPageRefsForTab(tabId)
    }
  })
}

/**
 * Page-side compact accessibility-like outline. This function is serialized
 * by chrome.scripting.executeScript, so it deliberately imports nothing.
 */
export function readPageDocument(refPrefix: string, requestedMaxChars: number, expectedOrigin?: string): ReadPageDocumentResult {
  if (expectedOrigin !== undefined && location.origin !== expectedOrigin) throw new Error('Tab origin changed')
  const maxChars = Math.max(500, Math.min(20_000, Math.floor(requestedMaxChars)))
  const marker = 'data-tabz-ref'
  const interactiveSelector = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
    'summary', '[contenteditable="true"]', '[role="button"]', '[role="link"]',
    '[role="checkbox"]', '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
    '[role="option"]', '[role="switch"]', '[tabindex]:not([tabindex="-1"])'
  ].join(',')

  document.querySelectorAll(`[${marker}]`).forEach(node => node.removeAttribute(marker))

  const visible = (element: Element): boolean => {
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  const roleFor = (element: Element): string => {
    const explicit = element.getAttribute('role')?.trim()
    if (explicit) return explicit
    const tag = element.tagName.toLowerCase()
    if (tag === 'a') return 'link'
    if (tag === 'button' || tag === 'summary') return 'button'
    if (tag === 'select') return 'combobox'
    if (tag === 'textarea' || element.getAttribute('contenteditable') === 'true') return 'textbox'
    if (tag === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase()
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      if (['button', 'submit', 'reset', 'image'].includes(type)) return 'button'
      return 'textbox'
    }
    return tag
  }

  const compact = (value: string | null | undefined, limit = 120): string =>
    (value || '').trim().replace(/\s+/g, ' ').replace(/"/g, '\\"').slice(0, limit)

  const nameFor = (element: Element): string => {
    const aria = compact(element.getAttribute('aria-label'))
    if (aria) return aria
    const labelledBy = element.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) || []
    const labelled = compact(labelledBy.map(id => document.getElementById(id)?.textContent || '').join(' '))
    if (labelled) return labelled
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const label = compact(Array.from(element.labels || []).map(node => node.textContent || '').join(' '))
      if (label) return label
      const type = element instanceof HTMLInputElement ? element.type : ''
      if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(type)) {
        const value = compact(element.value)
        if (value) return value
      }
      const placeholder = compact(element.getAttribute('placeholder'))
      if (placeholder) return placeholder
    }
    return compact(element.getAttribute('alt')) || compact(element.getAttribute('title')) ||
      compact((element as HTMLElement).innerText || element.textContent)
  }

  const all = Array.from(document.querySelectorAll(interactiveSelector)).filter(visible)
  const interactive = new Set(all)
  const depthFor = (element: Element): number => {
    let depth = 0
    let parent = element.parentElement
    while (parent) {
      if (interactive.has(parent)) depth += 1
      parent = parent.parentElement
    }
    return Math.min(depth, 2)
  }

  const title = compact(document.title, 120)
  const url = compact(location.href, 240)
  const header = [`## Page: ${title || '(untitled)'}`, `URL: ${url}`, '', 'Interactive elements:']
  const lines = [...header]
  const refs: string[] = []
  const truncationNote = `[Truncated at ${maxChars} characters. Call tabz_read_page with a larger maxChars to see more elements.]`

  for (let index = 0; index < all.length; index += 1) {
    const element = all[index]
    const ref = `${refPrefix}${index + 1}`
    const role = roleFor(element)
    const name = nameFor(element)
    const states: string[] = []
    if ((element as HTMLButtonElement).disabled === true) states.push('disabled')
    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {
      states.push(element.checked ? 'checked' : 'not checked')
    }
    const expanded = element.getAttribute('aria-expanded')
    if (expanded === 'true' || expanded === 'false') states.push(`expanded=${expanded}`)
    const selected = element.getAttribute('aria-selected')
    if (selected === 'true' || selected === 'false') states.push(`selected=${selected}`)
    const line = `${'  '.repeat(depthFor(element))}- ${role}${name ? ` "${name}"` : ''} [ref=${ref}]${states.length ? ` (${states.join(', ')})` : ''}`
    const candidate = [...lines, line].join('\n')
    const needsNote = index < all.length - 1
    if (candidate.length + (needsNote ? truncationNote.length + 1 : 0) > maxChars) break
    element.setAttribute(marker, ref)
    refs.push(ref)
    lines.push(line)
  }

  if (all.length === 0) lines.push('(none visible)')
  const truncated = refs.length < all.length
  if (truncated) lines.push(truncationNote)
  let text = lines.join('\n')
  if (text.length > maxChars) text = text.slice(0, maxChars)

  return { text, refs, nodeCount: all.length, truncated, title, url }
}

/** Read the current group-scoped tab and replace its ref allowlist. */
export async function handleBrowserReadPage(message: ReadPageMessage): Promise<void> {
  const receivedAt = Date.now()
  const budget = typeof message.requestTimeoutMs === 'number' && Number.isFinite(message.requestTimeoutMs)
    ? Math.max(0, message.requestTimeoutMs - 1000)
    : 14_000
  const expiresAt = receivedAt + budget
  const guard = () => {
    if (Date.now() >= expiresAt) throw new Error('Refused: the page-read deadline expired')
  }
  let targetTabId: number | undefined
  try {
    setupPageRefPruning()
    const resolved = await resolveAgentTab(message.agent, message.tabId)
    if (resolved?.id === undefined) throw new Error('No active tab found')
    targetTabId = resolved.id
    const response = await runWithDocumentAdmission(targetTabId, async () => {
      clearPageRefsForTab(targetTabId!)
      guard()
      await assertTabInAgentGroup(message.agent, targetTabId!)
      const token = await assertDocumentReadable(targetTabId!, 'tabz_read_page', { guard, expiresAt })
      const prefix = nextPageRefPrefix()
      const maxChars = typeof message.maxChars === 'number' ? message.maxChars : 6000
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      let results: chrome.scripting.InjectionResult[]
      try {
        guard()
        results = await Promise.race([
          chrome.scripting.executeScript({
            target: protectedDocumentTarget(token),
            func: readPageDocument,
            args: message.expectedOrigin === undefined ? [prefix, maxChars] : [prefix, maxChars, message.expectedOrigin]
          }),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('Refused: the page-read deadline expired')), Math.max(0, expiresAt - Date.now()))
          })
        ])
      } catch (error) {
        clearPageRefsForTab(targetTabId!)
        await markDocumentReadUncertain(targetTabId!, token)
        throw error
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }
      try {
        guard()
        const injection = results[0]
        const result = injection?.result as ReadPageDocumentResult | undefined
        if (!result || !injection.documentId) throw new Error('No page outline was returned')
        await assertDocumentReadCurrent(targetTabId!, token, { documentId: injection.documentId })
        guard()
        await assertTabInAgentGroup(message.agent, targetTabId!)
        guard()
        rememberPageRefs(targetTabId!, result.refs, { agent: message.agent, documentId: token.documentId })
        return {
          success: true,
          tabId: targetTabId,
          text: result.text,
          nodeCount: result.nodeCount,
          refCount: result.refs.length,
          truncated: result.truncated,
          title: result.title,
          url: result.url
        }
      } catch (error) {
        clearPageRefsForTab(targetTabId!)
        await markDocumentReadUncertain(targetTabId!, token)
        throw error
      }
    })
    sendToWebSocket({ type: 'browser-read-page-result', requestId: message.requestId, ...response })
  } catch (error) {
    if (targetTabId !== undefined) clearPageRefsForTab(targetTabId)
    sendToWebSocket({
      type: 'browser-read-page-result',
      requestId: message.requestId,
      success: false,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
