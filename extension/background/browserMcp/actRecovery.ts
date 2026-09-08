/**
 * Recovery context for a failed page interaction (ogl-rmr2).
 *
 * A bare "Element not found within 5000ms" tells a model nothing it can act
 * on. This module answers the three questions that turn a failure into a next
 * call: where the tab actually is (URL and title), what covers the target when
 * one was located, and which interactive elements are nearby, published as
 * FRESH refs so the retry is `tabz_act ref=...` with no selector guessing.
 *
 * VALUE-FREE by rule. Suggestions carry a role, an element LABEL (aria-label,
 * the label element, a button's text or value, placeholder, title, alt), and
 * nothing else: never a field's value, never page prose. The covering element
 * is described by tag, id, class, and aria-label only.
 */

import { addPageRefs, nextPageRefPrefix } from './pageRefs'
import {
  assertDocumentReadCurrent,
  markDocumentReadUncertain,
  protectedDocumentTarget,
  type DocumentProtectionToken
} from './documentProtection'
import { assertTabInAgentGroup } from './tabGroups'

export interface ActRecoverySpec {
  /** Prefix for the refs this pass publishes; one generation per call. */
  refPrefix: string
  /** How many suggestions to return at most (0 for none). */
  limit: number
  /** Viewport point the failure was about; null falls back to the target or the viewport centre. */
  x: number | null
  y: number | null
  /** The selector, text, or ref that was asked for, used to rank suggestions. */
  wanted: string | null
  /** Read `[data-tabz-last-act]` and report what covers it. */
  checkObscured: boolean
  /** Suggest only when a covering element was found (the trusted pre-check). */
  suggestOnlyWhenCovered: boolean
}

export interface ActRecoverySuggestion {
  ref: string
  role: string
  name: string
  tag: string
}

export interface ActRecoveryCovering {
  tag: string
  description: string
}

export interface ActRecovery {
  url: string
  title: string
  viewport: { width: number; height: number }
  point?: { x: number; y: number }
  covering?: ActRecoveryCovering
  suggestions: ActRecoverySuggestion[]
  /** The refs stamped on the page by this pass, for the extension's allowlist. */
  refs: string[]
}

/**
 * The page-side pass. Serialized by chrome.scripting.executeScript and run
 * standalone in the page's JS world, so it imports nothing and repeats the
 * few helpers it shares with the read-page outline.
 */
export function collectActRecovery(spec: ActRecoverySpec): ActRecovery {
  // chrome.scripting.executeScript drops null-valued keys from `args`, so a
  // field the service worker sent as null arrives as a missing key.
  for (const k of ['x', 'y', 'wanted'] as const) {
    if (spec[k] === undefined) (spec as unknown as Record<string, unknown>)[k] = null
  }
  if (spec.limit === undefined) spec.limit = 5
  const INTERACTIVE_SELECTOR = [
    'a[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea',
    'summary', '[contenteditable="true"]', '[role="button"]', '[role="link"]',
    '[role="checkbox"]', '[role="radio"]', '[role="tab"]', '[role="menuitem"]',
    '[role="option"]', '[role="switch"]', '[tabindex]:not([tabindex="-1"])'
  ].join(',')
  const TEXT_BEARING = new Set(['a', 'button', 'summary'])
  const TEXT_ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'option'])
  const STOPWORDS = new Set(['button', 'input', 'div', 'span', 'href', 'class', 'type', 'the', 'and', 'ref'])

  const compact = (value: string | null | undefined, limit = 80): string =>
    (value || '').trim().replace(/\s+/g, ' ').slice(0, limit)

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

  /**
   * The element's LABEL, never its content or its value. Free text is read
   * only from elements whose text IS the label (a link, a button, a tab).
   */
  const nameFor = (element: Element): string => {
    const aria = compact(element.getAttribute('aria-label'))
    if (aria) return aria
    const labelledBy = element.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) || []
    for (const id of labelledBy) {
      const labelled = compact(document.getElementById(id)?.getAttribute('aria-label') || document.getElementById(id)?.textContent)
      if (labelled) return labelled
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
      const label = compact(Array.from(element.labels || []).map(node => node.textContent || '').join(' '))
      if (label) return label
      if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type)) {
        const value = compact(element.value)
        if (value) return value
      }
      const placeholder = compact(element.getAttribute('placeholder'))
      if (placeholder) return placeholder
      return compact(element.getAttribute('title')) || compact(element.getAttribute('name'))
    }
    const tag = element.tagName.toLowerCase()
    const role = (element.getAttribute('role') || '').trim().toLowerCase()
    if (TEXT_BEARING.has(tag) || TEXT_ROLES.has(role)) {
      const own = compact((element as HTMLElement).innerText || element.textContent)
      if (own) return own
    }
    return compact(element.getAttribute('title')) || compact(element.getAttribute('alt')) || ''
  }

  const describeCovering = (element: Element): ActRecoveryCovering => {
    const tag = element.tagName.toLowerCase()
    const id = (element as HTMLElement).id ? `#${(element as HTMLElement).id}` : ''
    const classes = typeof element.className === 'string' && element.className.trim()
      ? `.${element.className.trim().split(/\s+/).slice(0, 2).join('.')}`
      : ''
    const aria = compact(element.getAttribute('aria-label'), 60)
    return { tag, description: `<${tag}${id}${classes}${aria ? ` aria-label="${aria}"` : ''}>` }
  }

  const visible = (element: Element): boolean => {
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }

  const target = spec.checkObscured ? document.querySelector('[data-tabz-last-act]') : null
  let point: { x: number; y: number } | null = spec.x !== null && spec.y !== null ? { x: spec.x, y: spec.y } : null
  if (!point && target) {
    const rect = target.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      point = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    }
  }
  if (!point) point = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) }

  let covering: ActRecoveryCovering | undefined
  if (target) {
    const hit = document.elementFromPoint(point.x, point.y)
    // Covered means the topmost element at the target's own centre is neither
    // the target nor inside it, which is exactly what trusted input would hit.
    if (hit && hit !== target && !target.contains(hit)) covering = describeCovering(hit)
  }

  const recovery: ActRecovery = {
    url: (location.href || '').slice(0, 240),
    title: compact(document.title, 120),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    point,
    ...(covering ? { covering } : {}),
    suggestions: [],
    refs: []
  }
  if (spec.limit <= 0 || (spec.suggestOnlyWhenCovered && !covering)) return recovery

  const tokens = Array.from(new Set((spec.wanted || '').match(/[a-zA-Z][a-zA-Z0-9]{2,}/g) || []))
    .map(token => token.toLowerCase())
    .filter(token => !STOPWORDS.has(token))
  const scored = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR))
    .filter(element => element !== target && visible(element))
    .map(element => {
      const role = roleFor(element)
      const name = nameFor(element)
      const haystack = `${role} ${name}`.toLowerCase()
      const rect = element.getBoundingClientRect()
      const centreX = rect.left + rect.width / 2
      const centreY = rect.top + rect.height / 2
      return {
        element,
        role,
        name,
        tag: element.tagName.toLowerCase(),
        score: tokens.filter(token => haystack.includes(token)).length,
        distance: Math.round(Math.hypot(centreX - point!.x, centreY - point!.y))
      }
    })
  // Label overlap with what was asked for first, then nearest to the point
  // the failure was about: a covered target's own centre, the x/y that hit
  // nothing, or the viewport centre.
  scored.sort((a, b) => (b.score - a.score) || (a.distance - b.distance))

  let issued = 0
  for (const candidate of scored.slice(0, Math.min(spec.limit, 10))) {
    // An element the last read already marked keeps ITS ref: overwriting the
    // marker would leave that ref in the allowlist with nothing on the page.
    const existing = candidate.element.getAttribute('data-tabz-ref')
    const ref = existing || `${spec.refPrefix}${++issued}`
    if (!existing) candidate.element.setAttribute('data-tabz-ref', ref)
    recovery.refs.push(ref)
    recovery.suggestions.push({ ref, role: candidate.role, name: candidate.name, tag: candidate.tag })
  }
  return recovery
}

export interface GatherActRecoveryOptions {
  x?: number
  y?: number
  wanted?: string | null
  limit?: number
  checkObscured?: boolean
  suggestOnlyWhenCovered?: boolean
  token: DocumentProtectionToken
  agent?: string
  expiresAt?: number
}

/**
 * Run the recovery pass in a tab and publish its refs. Best effort by design:
 * a failed injection (a closed tab, a page that navigated away) returns
 * undefined rather than replacing the real error with an injection error.
 */
export async function gatherActRecovery(
  tabId: number,
  options: GatherActRecoveryOptions
): Promise<ActRecovery | undefined> {
  try {
    if (options.expiresAt !== undefined && Date.now() >= options.expiresAt) return undefined
    const spec: ActRecoverySpec = {
      refPrefix: nextPageRefPrefix(),
      limit: options.limit ?? 5,
      x: typeof options.x === 'number' ? options.x : null,
      y: typeof options.y === 'number' ? options.y : null,
      wanted: options.wanted ?? null,
      checkObscured: options.checkObscured === true,
      suggestOnlyWhenCovered: options.suggestOnlyWhenCovered === true
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const injection = chrome.scripting.executeScript({
      target: protectedDocumentTarget(options.token),
      func: collectActRecovery,
      args: [spec]
    })
    const results = options.expiresAt === undefined
      ? await injection
      : await Promise.race([
        injection,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Recovery deadline expired')), Math.max(0, options.expiresAt! - Date.now()))
        })
      ]).finally(() => {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      })
    const result = results[0]
    const recovery = result?.result as ActRecovery | undefined
    if (!recovery || !result.documentId) return undefined
    await assertDocumentReadCurrent(tabId, options.token, { documentId: result.documentId })
    await assertTabInAgentGroup(options.agent, tabId)
    addPageRefs(tabId, recovery.refs, {
      agent: options.agent,
      documentId: options.token.documentId
    })
    return recovery
  } catch {
    await markDocumentReadUncertain(tabId, options.token).catch(() => undefined)
    console.warn('Browser MCP: recovery context unavailable')
    return undefined
  }
}
