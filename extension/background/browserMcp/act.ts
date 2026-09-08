/**
 * Browser MCP - tabz_act, the one action-style interaction handler.
 *
 * One frame (`browser-act`) carries every page verb the old per-verb tools
 * spread out (click, double, triple, right click, hover, type, key, scroll,
 * scroll_to, drag). The target is a CSS selector, visible text, or a
 * viewport coordinate pair (resolved to the element at that point), or an
 * opaque ref from tabz_read_page.
 *
 * Two paths. SYNTHETIC (default) runs `performPageAction` in the page
 * through chrome.scripting.executeScript and dispatches a faithful event
 * sequence; the plain `click` action keeps the single-activation rule the
 * tabz_click path settled (HTMLElement.click() once, dispatchEvent only for
 * non-HTML elements). TRUSTED (`trusted: true`) goes through withDebugger
 * and Input.dispatchMouseEvent / Input.dispatchKeyEvent (Input.insertText for
 * a run of printable typing) at the element's centre from
 * getBoundingClientRect, so the page sees isTrusted events with
 * clickCount and modifiers; Chrome shows its debugging bar, the attachment
 * is exclusive per tab, and withDebugger always detaches, including on a
 * thrown dispatch. Both paths resolve and recheck the caller-owned tab inside
 * one document admission. Page guards and exact Chrome document IDs apply
 * before anything is injected or attached.
 *
 * Deliberately NOT here: setting a form value (tabz_fill, with its read-back
 * verdict) and saved logins (tabz_fill_secret). This module never touches the
 * credential store, never carries expectedHost, and never reaches the
 * fill-secret relay.
 */

import { isSensitiveInput } from './sensitiveFields'
import { withDebugger, sendDebuggerCommand } from './debugger'
import { resolvePageRef, setupPageRefPruning, stalePageRefMessage } from './pageRefs'
import { gatherActRecovery } from './actRecovery'
import { captureViewportInline } from './screenshots'
import { ACT_ACTIONS } from '../../shared/actActions'
import { sendToWebSocket } from '../websocket'
import {
  assertDocumentReadCurrent,
  assertDocumentReadable,
  assertProtectedDocumentCurrent,
  currentDocumentProtection,
  markDocumentReadUncertain,
  protectedDocumentTarget,
  runWithDocumentAdmission,
  type DocumentProtectionToken
} from './documentProtection'
import { assertTabInAgentGroup, resolveAgentTab } from './tabGroups'

export { ACT_ACTIONS } from '../../shared/actActions'

export type ActAction = typeof ACT_ACTIONS[number]

export interface ActMessage {
  requestId: string
  action: ActAction
  ref?: string
  selector?: string
  text?: string
  x?: number
  y?: number
  value?: string
  key?: string
  repeat?: number
  modifiers?: string
  direction?: 'up' | 'down' | 'left' | 'right'
  ticks?: number
  toX?: number
  toY?: number
  toSelector?: string
  trusted?: boolean
  observe?: boolean
  tabId?: number
  waitTimeout?: number
  /**
   * Relative backend request budget used to bound selector waits without
   * comparing clocks across the WSL/host boundary.
   */
  requestTimeoutMs?: number
  agent?: string
}

/**
 * The argument object handed to the injected function. Every field is
 * present (null when unset) because chrome.scripting.executeScript rejects
 * undefined inside args.
 */
export interface PageActSpec {
  action: ActAction
  selector: string | null
  text: string | null
  x: number | null
  y: number | null
  value: string | null
  key: string | null
  repeat: number
  modifiers: string | null
  direction: 'up' | 'down' | 'left' | 'right' | null
  ticks: number
  toX: number | null
  toY: number | null
  toSelector: string | null
  timeout: number
  /** Absolute extension-host deadline; selector retries must never reset it. */
  expiresAt?: number
  modifierFlags: ModifierFlags
  keyDescriptors: KeyDescriptor[]
  located: LocatedActTarget | null
  /** Present only on synthetic actions to hand one DOM target between injections. */
  handoffToken?: string
}

export interface LocatedActTarget {
  found: boolean
  error?: string
  x?: number
  y?: number
  tagName?: string
  description?: string
  devicePixelRatio: number
  targetGiven: boolean
  documentPoint?: boolean
}

export interface PageActOutcome {
  success: boolean
  error?: string
  tagName?: string
  description?: string
  x?: number
  y?: number
  /** Event types dispatched, in order. */
  events?: string[]
  /**
   * Set for `type`: the field's attributes, what it held afterwards, what it
   * SHOULD hold if every keystroke landed at the caret (absent for a
   * contenteditable, whose insertion the DOM may normalize), and whether the
   * page prevented any keystroke.
   */
  field?: { tagName: string; type?: string; name?: string; id?: string; autocomplete?: string; actualValue: string; expectedValue?: string; dropped?: boolean }
  /** Set for scroll and scroll_to: the window scroll position afterwards. */
  scroll?: { x: number; y: number }
}

/** Boolean-only protected submit. It reads no labels, values, or page metadata. */
export function clickProtectedPageRef(ref: string, expiresAt: number): boolean {
  if (Date.now() >= expiresAt) return false
  const element = Array.from(document.querySelectorAll('[data-tabz-ref]'))
    .find(node => node.getAttribute('data-tabz-ref') === ref)
  if (!element) return false
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  if (style.display === 'none' || style.visibility === 'hidden' || (rect.width === 0 && rect.height === 0)) return false
  if (Date.now() >= expiresAt || !element.isConnected || element.getAttribute('data-tabz-ref') !== ref) return false
  if (element instanceof HTMLElement) element.click()
  else element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }))
  return true
}

export interface ModifierFlags {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
}

/**
 * Parse a modifier string ('ctrl+shift', 'cmd+alt') into event flags.
 * Unknown words are ignored rather than refused so 'control' and 'ctrl',
 * 'cmd', 'meta' and 'command' all work.
 */
export function parseModifiers(modifiers: string | null | undefined): ModifierFlags {
  const flags: ModifierFlags = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
  if (!modifiers) return flags
  for (const raw of modifiers.split(/[+\s,]+/)) {
    const word = raw.trim().toLowerCase()
    if (word === 'ctrl' || word === 'control') flags.ctrlKey = true
    else if (word === 'shift') flags.shiftKey = true
    else if (word === 'alt' || word === 'option' || word === 'opt') flags.altKey = true
    else if (word === 'cmd' || word === 'command' || word === 'meta' || word === 'super' || word === 'win') flags.metaKey = true
  }
  return flags
}

/** CDP Input.* modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8. */
export function modifierBitmask(flags: ModifierFlags): number {
  return (flags.altKey ? 1 : 0) | (flags.ctrlKey ? 2 : 0) | (flags.metaKey ? 4 : 0) | (flags.shiftKey ? 8 : 0)
}

export interface KeyDescriptor {
  key: string
  code: string
  keyCode: number
  /** True for a key whose press inserts text (letters, digits, space). */
  printable: boolean
  flags: ModifierFlags
}

const KEY_ALIASES: Record<string, string> = {
  enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab',
  backspace: 'Backspace', delete: 'Delete', del: 'Delete', space: ' ',
  up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
  arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
  home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown', insert: 'Insert',
  capslock: 'CapsLock'
}

const KEY_CODES: Record<string, number> = {
  Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46, ' ': 32,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
  Home: 36, End: 35, PageUp: 33, PageDown: 34, Insert: 45, CapsLock: 20
}

/**
 * Turn one key token ('Enter', 'ctrl+a', 'F5', 'Backspace') plus the shared
 * modifier string into a descriptor with the DOM `key`, `code`, legacy
 * keyCode, and modifier flags.
 */
export function describeKey(token: string, modifiers: string | null | undefined): KeyDescriptor {
  const parts = token.split('+').filter(Boolean)
  const name = parts.length > 1 ? parts[parts.length - 1] : token
  const flags = parseModifiers([modifiers ?? '', ...parts.slice(0, -1)].filter(Boolean).join('+'))
  const lower = name.toLowerCase()
  let key = KEY_ALIASES[lower] ?? name
  const functionKey = /^f([1-9]|1[0-2])$/i.exec(name)
  if (functionKey) key = `F${functionKey[1]}`
  if (key.length === 1 && flags.shiftKey && /[a-z]/.test(key)) key = key.toUpperCase()

  let code: string
  if (/^[a-zA-Z]$/.test(key)) code = `Key${key.toUpperCase()}`
  else if (/^[0-9]$/.test(key)) code = `Digit${key}`
  else if (key === ' ') code = 'Space'
  else code = key

  let keyCode = KEY_CODES[key] ?? 0
  if (/^[a-zA-Z]$/.test(key)) keyCode = key.toUpperCase().charCodeAt(0)
  else if (/^[0-9]$/.test(key)) keyCode = key.charCodeAt(0)
  else if (functionKey) keyCode = 111 + Number(functionKey[1])

  return { key, code, keyCode, printable: key.length === 1, flags }
}

/** Split 'Backspace Backspace Delete' into its tokens. */
export function splitKeys(keys: string): string[] {
  return keys.split(/\s+/).map(token => token.trim()).filter(Boolean)
}

/**
 * The page-side action. Serialized by chrome.scripting.executeScript and run
 * standalone in the page's JS world, so it imports nothing. Modifier and key
 * descriptors are computed once by the service worker and arrive in `spec`.
 * The unit tests run this function for real in jsdom.
 */
export function performPageAction(spec: PageActSpec): Promise<PageActOutcome> {
  // chrome.scripting.executeScript drops null-valued keys from `args`, so a
  // field the service worker sent as null arrives as a missing key. Every
  // `!== null` check below would then read "given", so restore the nulls
  // first. Self-contained on purpose: this function is serialized alone.
  for (const k of ['selector', 'text', 'x', 'y', 'value', 'key', 'modifiers', 'direction', 'toX', 'toY', 'toSelector', 'located'] as const) {
    if (spec[k] === undefined) (spec as unknown as Record<string, unknown>)[k] = null
  }
  if (spec.repeat === undefined) spec.repeat = 1
  if (spec.ticks === undefined) spec.ticks = 3
  if (spec.timeout === undefined) spec.timeout = 5000
  if (spec.expiresAt !== undefined && Date.now() >= spec.expiresAt) {
    return Promise.resolve({ success: false, error: 'Refused: the action deadline expired before dispatch' })
  }
  const ensureFresh = () => {
    if (spec.expiresAt !== undefined && Date.now() >= spec.expiresAt) {
      throw new Error('Refused: the action deadline expired before dispatch')
    }
  }
  if (spec.modifierFlags === undefined) spec.modifierFlags = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }
  if (spec.keyDescriptors === undefined) spec.keyDescriptors = []
  const events: string[] = []
  const mods = spec.modifierFlags
  const targetDescription = spec.located?.description ?? 'the located element'

  const centre = (el: Element) => {
    const rect = el.getBoundingClientRect()
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
  }

  const fire = (el: EventTarget, ev: Event): boolean => {
    events.push(ev.type)
    return el.dispatchEvent(ev)
  }

  const mouseEvent = (type: string, point: { x: number; y: number }, init: { button?: number; buttons?: number; detail?: number } = {}) =>
    new MouseEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      clientX: point.x, clientY: point.y, screenX: point.x, screenY: point.y,
      button: init.button ?? 0, buttons: init.buttons ?? 0, detail: init.detail ?? 0,
      ...mods
    })

  const pointerEvent = (type: string, point: { x: number; y: number }, init: { button?: number; buttons?: number } = {}) => {
    const PE = (window as unknown as { PointerEvent?: typeof PointerEvent }).PointerEvent
    const base = {
      bubbles: true, cancelable: true, composed: true,
      clientX: point.x, clientY: point.y, screenX: point.x, screenY: point.y,
      button: init.button ?? 0, buttons: init.buttons ?? 0, ...mods
    }
    return PE
      ? new PE(type, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true })
      : new MouseEvent(type, base)
  }

  const buttonsMask = (button: number) => (button === 2 ? 2 : button === 1 ? 4 : 1)

  /** pointerdown/mousedown/pointerup/mouseup then click (or contextmenu) with `detail`. */
  const press = (el: Element, point: { x: number; y: number }, button: number, detail: number, terminal: 'click' | 'contextmenu' | 'none') => {
    const held = buttonsMask(button)
    fire(el, pointerEvent('pointerdown', point, { button, buttons: held }))
    fire(el, mouseEvent('mousedown', point, { button, buttons: held, detail }))
    fire(el, pointerEvent('pointerup', point, { button, buttons: 0 }))
    fire(el, mouseEvent('mouseup', point, { button, buttons: 0, detail }))
    if (terminal === 'click') fire(el, mouseEvent('click', point, { button, detail }))
    else if (terminal === 'contextmenu') fire(el, mouseEvent('contextmenu', point, { button, detail }))
  }

  const hover = (el: Element, point: { x: number; y: number }) => {
    fire(el, pointerEvent('pointerover', point))
    fire(el, pointerEvent('pointerenter', point))
    fire(el, mouseEvent('mouseover', point))
    fire(el, mouseEvent('mouseenter', point))
    fire(el, pointerEvent('pointermove', point))
    fire(el, mouseEvent('mousemove', point))
  }

  const keyEvent = (type: string, d: KeyDescriptor, repeatFlag: boolean) =>
    new KeyboardEvent(type, {
      bubbles: true, cancelable: true, composed: true,
      key: d.key, code: d.code, keyCode: d.keyCode, which: d.keyCode, charCode: type === 'keypress' && d.printable ? d.key.charCodeAt(0) : 0,
      repeat: repeatFlag, ...d.flags
    } as KeyboardEventInit)

  const nativeWrite = (target: HTMLInputElement | HTMLTextAreaElement, next: string) => {
    const proto = target instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value')
    if (descriptor && typeof descriptor.set === 'function') descriptor.set.call(target, next)
    else target.value = next
  }

  const isEditable = (el: Element | null): el is HTMLElement => {
    if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly
    if (el instanceof HTMLInputElement) {
      return !el.disabled && !el.readOnly && ['text', 'search', 'tel', 'url', 'password', 'email'].includes(el.type)
    }
    return !!el && (el as HTMLElement).isContentEditable === true
  }

  /** The caret, or the end of the value for an input type with no selection. */
  const caretRange = (el: HTMLInputElement | HTMLTextAreaElement): { start: number; end: number } => {
    const length = el.value.length
    try {
      const start = typeof el.selectionStart === 'number' ? el.selectionStart : length
      const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start
      return { start, end: Math.max(start, end) }
    } catch {
      // selectionStart throws on input types that carry no text selection.
      return { start: length, end: length }
    }
  }

  /**
   * Insert one character AT THE CARET, replacing any selection, the way a
   * keystroke does (appending to the whole value turned "John" selected plus
   * "Jane" into "JohnJane"). Returns the value the field should now hold, so
   * the verdict can compare against it, or null for a contenteditable.
   */
  const insertChar = (el: HTMLElement, ch: string): string | null => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const before = el.value
      const { start, end } = caretRange(el)
      const next = before.slice(0, start) + ch + before.slice(end)
      const caret = start + ch.length
      // setRangeText is the faithful path and advances the caret itself; the
      // native value setter is the fallback. Either bypasses React's
      // instance-level setter, so the input event below reads as a change.
      let wrote = false
      if (typeof el.setRangeText === 'function') {
        try {
          el.setRangeText(ch, start, end, 'end')
          wrote = el.value === next
        } catch {
          wrote = false
        }
      }
      if (!wrote) {
        nativeWrite(el, next)
        try { el.setSelectionRange(caret, caret) } catch { /* no selection on this input type */ }
      }
      const InputEventCtor = (window as unknown as { InputEvent?: typeof InputEvent }).InputEvent
      const ev = InputEventCtor
        ? new InputEventCtor('input', { bubbles: true, inputType: 'insertText', data: ch })
        : new Event('input', { bubbles: true })
      fire(el, ev)
      return next
    }
    let inserted = false
    try {
      inserted = typeof document.execCommand === 'function' && document.execCommand('insertText', false, ch)
    } catch {
      inserted = false
    }
    if (!inserted) {
      // Insert at the selection when one sits inside the element, so a caret
      // in the middle of the text is honoured; append when there is none.
      const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null
      if (selection && range && el.contains(range.commonAncestorContainer)) {
        range.deleteContents()
        const node = document.createTextNode(ch)
        range.insertNode(node)
        range.setStartAfter(node)
        range.setEndAfter(node)
        selection.removeAllRanges()
        selection.addRange(range)
      } else {
        el.textContent = (el.textContent ?? '') + ch
      }
      fire(el, new Event('input', { bubbles: true }))
    }
    return null
  }

  const wordBounds = (value: string, rawOffset: number): { start: number; end: number } => {
    if (value.length === 0) return { start: 0, end: 0 }
    let offset = Math.max(0, Math.min(value.length - 1, rawOffset))
    const word = (ch: string) => /[\p{L}\p{N}_]/u.test(ch)
    if (!word(value[offset]) && offset > 0 && word(value[offset - 1])) offset--
    const wordAtOffset = word(value[offset])
    let start = offset
    let end = offset + 1
    while (start > 0 && word(value[start - 1]) === wordAtOffset) start--
    while (end < value.length && word(value[end]) === wordAtOffset) end++
    return { start, end }
  }

  const inputOffsetAtPoint = (el: HTMLInputElement | HTMLTextAreaElement, point: { x: number; y: number }): number => {
    const value = el.value
    if (value.length === 0) return 0
    const rect = el.getBoundingClientRect()
    const style = window.getComputedStyle(el)
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0
    const paddingRight = Number.parseFloat(style.paddingRight) || 0
    const contentX = Math.max(0, point.x - rect.left - paddingLeft + el.scrollLeft)
    const usableWidth = Math.max(1, rect.width - paddingLeft - paddingRight)
    let segmentStart = 0
    let segment = value
    if (el instanceof HTMLTextAreaElement) {
      const paddingTop = Number.parseFloat(style.paddingTop) || 0
      const fontSize = Number.parseFloat(style.fontSize) || 16
      const lineHeight = Number.parseFloat(style.lineHeight) || fontSize * 1.2
      const lineIndex = Math.max(0, Math.floor((point.y - rect.top - paddingTop + el.scrollTop) / lineHeight))
      const lines = value.split('\n')
      const boundedLine = Math.min(lines.length - 1, lineIndex)
      for (let index = 0; index < boundedLine; index++) segmentStart += lines[index].length + 1
      segment = lines[boundedLine]
    }

    // Chrome can measure the rendered text closely enough to map the click to
    // a caret. jsdom has no canvas implementation, so its unit tests take the
    // proportional fallback below; the live browser gate proves real layout.
    if (!/jsdom/i.test(navigator.userAgent)) {
      try {
        const context = document.createElement('canvas').getContext('2d')
        if (context) {
          context.font = style.font || `${style.fontSize} ${style.fontFamily}`
          let previousWidth = 0
          for (let offset = 1; offset <= segment.length; offset++) {
            const width = context.measureText(segment.slice(0, offset)).width
            if (contentX < (previousWidth + width) / 2) return segmentStart + offset - 1
            previousWidth = width
          }
          return segmentStart + segment.length
        }
      } catch { /* fall through to proportional positioning */ }
    }
    return segmentStart + Math.round(Math.min(1, contentX / usableWidth) * segment.length)
  }

  const textPositionAtPoint = (el: Element, point: { x: number; y: number }): { node: Text; offset: number } | null => {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
      caretRangeFromPoint?: (x: number, y: number) => Range | null
    }
    const position = doc.caretPositionFromPoint?.(point.x, point.y)
    if (position?.offsetNode.nodeType === Node.TEXT_NODE && el.contains(position.offsetNode)) {
      return { node: position.offsetNode as Text, offset: position.offset }
    }
    const caret = doc.caretRangeFromPoint?.(point.x, point.y)
    if (caret?.startContainer.nodeType === Node.TEXT_NODE && el.contains(caret.startContainer)) {
      return { node: caret.startContainer as Text, offset: caret.startOffset }
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    let node = walker.nextNode()
    while (node) {
      nodes.push(node as Text)
      node = walker.nextNode()
    }
    const fallback = nodes.find(candidate => (candidate.data ?? '').length > 0)
    return fallback ? { node: fallback, offset: Math.floor(fallback.data.length / 2) } : null
  }

  const selectClickedText = (el: Element, point: { x: number; y: number }, whole: boolean) => {
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      try {
        el.focus()
        if (whole) {
          el.setSelectionRange(0, el.value.length)
        } else {
          const bounds = wordBounds(el.value, inputOffsetAtPoint(el, point))
          el.setSelectionRange(bounds.start, bounds.end)
        }
      } catch { /* input types without text selection keep the event sequence */ }
      return
    }
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()
    if (whole) {
      range.selectNodeContents(el)
    } else {
      const position = textPositionAtPoint(el, point)
      if (!position) return
      const bounds = wordBounds(position.node.data, position.offset)
      range.setStart(position.node, bounds.start)
      range.setEnd(position.node, bounds.end)
    }
    selection.removeAllRanges()
    selection.addRange(range)
  }

  const performEditingKey = (el: EventTarget, d: KeyDescriptor) => {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return
    if (el.disabled || el.readOnly) return
    if (el instanceof HTMLInputElement && !['text', 'search', 'tel', 'url', 'password', 'email'].includes(el.type)) return
    // ctrl+a / cmd+a: the one chord a synthetic keydown has to emulate, or
    // 'ctrl+a Backspace' reports success while deleting a single character.
    if ((d.flags.ctrlKey || d.flags.metaKey) && !d.flags.altKey && d.key.toLowerCase() === 'a') {
      try { el.setSelectionRange(0, el.value.length) } catch { /* no selection on this input type */ }
      return
    }
    if (d.flags.ctrlKey || d.flags.metaKey || d.flags.altKey) return
    if (d.key !== 'Backspace' && d.key !== 'Delete' && !(d.key === 'Enter' && el instanceof HTMLTextAreaElement)) return

    const before = el.value
    const { start, end } = caretRange(el)
    let replaceStart = start
    let replaceEnd = end
    let inserted = ''
    let inputType = 'deleteContentBackward'
    if ((d.key === 'Backspace' || d.key === 'Delete') && start === end) {
      type Segment = { index: number; segment: string }
      type Segmenter = { segment: (value: string) => Iterable<Segment> }
      type SegmenterConstructor = new (
        locales?: string | string[],
        options?: { granularity: 'grapheme' }
      ) => Segmenter
      const Segmenter = (Intl as unknown as { Segmenter?: SegmenterConstructor }).Segmenter

      if (Segmenter) {
        const segments = Array.from(
          new Segmenter(undefined, { granularity: 'grapheme' }).segment(before),
          part => ({ start: part.index, end: part.index + part.segment.length })
        )
        const adjacent = d.key === 'Backspace'
          ? segments.find(part => part.start < start && start <= part.end)
          : segments.find(part => part.start <= start && start < part.end)
        if (adjacent) {
          replaceStart = adjacent.start
          replaceEnd = adjacent.end
        }
      } else if (d.key === 'Backspace' && start > 0) {
        // The supported Chrome versions have Intl.Segmenter. This fallback
        // still keeps a caret inside or after a surrogate pair from splitting it.
        replaceStart = start - 1
        const unit = before.charCodeAt(replaceStart)
        if (unit >= 0xdc00 && unit <= 0xdfff && replaceStart > 0) {
          const previous = before.charCodeAt(replaceStart - 1)
          if (previous >= 0xd800 && previous <= 0xdbff) replaceStart--
        } else if (unit >= 0xd800 && unit <= 0xdbff && start < before.length) {
          const next = before.charCodeAt(start)
          if (next >= 0xdc00 && next <= 0xdfff) replaceEnd++
        }
      } else if (d.key === 'Delete' && start < before.length) {
        replaceEnd = start + 1
        const unit = before.charCodeAt(start)
        if (unit >= 0xd800 && unit <= 0xdbff && replaceEnd < before.length) {
          const next = before.charCodeAt(replaceEnd)
          if (next >= 0xdc00 && next <= 0xdfff) replaceEnd++
        } else if (unit >= 0xdc00 && unit <= 0xdfff && start > 0) {
          const previous = before.charCodeAt(start - 1)
          if (previous >= 0xd800 && previous <= 0xdbff) replaceStart--
        }
      }
    }
    if (d.key === 'Delete') {
      inputType = 'deleteContentForward'
    }
    if (d.key === 'Enter') {
      inputType = 'insertLineBreak'
      inserted = '\n'
    }
    if (replaceStart === replaceEnd && inserted === '') return

    const next = before.slice(0, replaceStart) + inserted + before.slice(replaceEnd)
    const caret = replaceStart + inserted.length
    nativeWrite(el, next)
    try { el.setSelectionRange(caret, caret) } catch { /* no selection on this input type */ }
    const InputEventCtor = (window as unknown as { InputEvent?: typeof InputEvent }).InputEvent
    const ev = InputEventCtor
      ? new InputEventCtor('input', { bubbles: true, inputType, data: inserted || null })
      : new Event('input', { bubbles: true })
    fire(el, ev)
  }

  const pressKey = (el: EventTarget, d: KeyDescriptor, repeatFlag: boolean) => {
    const proceed = fire(el, keyEvent('keydown', d, repeatFlag))
    if (proceed && d.printable && !d.flags.ctrlKey && !d.flags.metaKey && !d.flags.altKey) {
      fire(el, keyEvent('keypress', d, repeatFlag))
    }
    if (proceed) performEditingKey(el, d)
    fire(el, keyEvent('keyup', d, false))
  }

  const scrollableAncestor = (start: Element | null): Element | null => {
    let node: Element | null = start
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node)
      const scrolls = /(auto|scroll|overlay)/.test(style.overflowY + style.overflowX)
      if (scrolls && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) return node
      node = node.parentElement
    }
    return null
  }

  const targetGiven = spec.located?.targetGiven
    ?? (spec.selector !== null || spec.text !== null || (spec.x !== null && spec.y !== null))
  const takeHandoffElement = (): Element | null => {
    if (!spec.handoffToken) return document.querySelector('[data-tabz-last-act]')
    const candidates = Array.from(document.querySelectorAll('[data-tabz-act-handoff]'))
    const el = candidates.find(candidate =>
      (candidate.getAttribute('data-tabz-act-handoff') ?? '').split(/\s+/).includes(spec.handoffToken!)
    ) ?? null
    if (!el) return null
    const remaining = (el.getAttribute('data-tabz-act-handoff') ?? '')
      .split(/\s+/)
      .filter(token => token && token !== spec.handoffToken)
    if (remaining.length > 0) el.setAttribute('data-tabz-act-handoff', remaining.join(' '))
    else el.removeAttribute('data-tabz-act-handoff')
    return el
  }
  const locatedElement = spec.located?.found && !spec.located.documentPoint
    ? takeHandoffElement()
    : null
  if (locatedElement && spec.handoffToken) {
    document.querySelectorAll('[data-tabz-last-act]').forEach((prev) => prev.removeAttribute('data-tabz-last-act'))
    locatedElement.setAttribute('data-tabz-last-act', 'true')
  }
  const found = locatedElement && spec.located?.x !== undefined && spec.located.y !== undefined
    ? { el: locatedElement, point: { x: spec.located.x, y: spec.located.y } }
    : null

  const locateEnd = (): { el: Element | null; point: { x: number; y: number } } | null => {
    if (spec.toSelector) {
      const el = document.querySelector(spec.toSelector)
      return el ? { el, point: centre(el) } : null
    }
    if (spec.toX !== null && spec.toY !== null) {
      return { el: document.elementFromPoint(spec.toX, spec.toY), point: { x: spec.toX, y: spec.toY } }
    }
    return null
  }

  return new Promise<PageActOutcome>((resolve) => {
    const run = (found: { el: Element; point: { x: number; y: number } } | null): void => {
      try {
        ensureFresh()
        const base = (): Partial<PageActOutcome> => found
          ? { tagName: spec.located?.tagName, description: spec.located?.description, x: found.point.x, y: found.point.y }
          : {}

        switch (spec.action) {
          case 'hover': {
            if (!found) throw new Error('hover needs a target')
            hover(found.el, found.point)
            resolve({ success: true, ...base(), events })
            return
          }
          case 'click': {
            if (!found) throw new Error('click needs a target')
            // Exactly ONE activation, the rule the tabz_click path settled:
            // HTMLElement.click() is the faithful path; dispatchEvent covers
            // SVG and other non-HTML elements, which have no .click().
            // A held modifier is the exception: .click() carries no flags, so
            // a modified click goes through the press sequence, which still
            // ends in exactly one click event, this time with the flags.
            const heldModifier = mods.ctrlKey || mods.shiftKey || mods.altKey || mods.metaKey
            if (heldModifier) {
              press(found.el, found.point, 0, 1, 'click')
            } else if (found.el instanceof HTMLElement) {
              events.push('click')
              found.el.click()
            } else {
              fire(found.el, new MouseEvent('click', { bubbles: true, cancelable: true }))
            }
            resolve({ success: true, ...base(), events })
            return
          }
          case 'double_click': {
            if (!found) throw new Error('double_click needs a target')
            press(found.el, found.point, 0, 1, 'click')
            press(found.el, found.point, 0, 2, 'click')
            selectClickedText(found.el, found.point, false)
            fire(found.el, mouseEvent('dblclick', found.point, { detail: 2 }))
            resolve({ success: true, ...base(), events })
            return
          }
          case 'triple_click': {
            if (!found) throw new Error('triple_click needs a target')
            press(found.el, found.point, 0, 1, 'click')
            press(found.el, found.point, 0, 2, 'click')
            selectClickedText(found.el, found.point, false)
            fire(found.el, mouseEvent('dblclick', found.point, { detail: 2 }))
            selectClickedText(found.el, found.point, true)
            press(found.el, found.point, 0, 3, 'click')
            resolve({ success: true, ...base(), events })
            return
          }
          case 'right_click': {
            if (!found) throw new Error('right_click needs a target')
            press(found.el, found.point, 2, 1, 'contextmenu')
            resolve({ success: true, ...base(), events })
            return
          }
          case 'type': {
            const value = spec.value ?? ''
            if (found) (found.el as HTMLElement).focus?.()
            const el: Element | null = found?.el ?? null
            if (!isEditable(el)) {
              resolve({ success: false, ...base(), error: !found
                ? 'type needs a focused element; focus an input, textarea, or contenteditable, or give a target'
                : !targetGiven
                  ? `type focused element cannot take text: ${targetDescription} (focus an input, textarea, or contenteditable, or give a target)`
                  : `type target is not editable: ${targetDescription} (use tabz_fill for a <select>, or give an input, textarea, or contenteditable)` })
              return
            }
            const field = el
            // The value the field should hold once every keystroke has landed
            // at the caret. null for a contenteditable, where the DOM decides
            // the markup and only the fallback verdict can judge.
            let expectedValue: string | null = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
              ? field.value
              : null
            let dropped = false
            const characters = Array.from(value)
            for (let index = 0; index < characters.length; index++) {
              ensureFresh()
              const ch = characters[index]
              const descriptor = spec.keyDescriptors[index]
              if (!descriptor) throw new Error('type key descriptors do not match value')
              if (ch === '\n') {
                fire(field, keyEvent('keydown', descriptor, false))
                if (field instanceof HTMLTextAreaElement) {
                  const written = insertChar(field, '\n')
                  if (written !== null) expectedValue = written
                }
                fire(field, keyEvent('keyup', descriptor, false))
                continue
              }
              const proceed = fire(field, keyEvent('keydown', descriptor, false))
              if (!proceed) { fire(field, keyEvent('keyup', descriptor, false)); dropped = true; continue }
              const pressed = fire(field, keyEvent('keypress', descriptor, false))
              if (pressed) {
                const written = insertChar(field, ch)
                if (written !== null) expectedValue = written
              } else {
                dropped = true
              }
              fire(field, keyEvent('keyup', descriptor, false))
            }
            const readValue = () => field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
              ? field.value
              : (field.textContent ?? '')
            setTimeout(() => {
              resolve({
                success: true,
                tagName: field.tagName.toLowerCase(),
                description: spec.located?.description,
                ...(found ? { x: found.point.x, y: found.point.y } : {}),
                events,
                field: {
                  tagName: field.tagName.toLowerCase(),
                  type: field instanceof HTMLInputElement ? field.type : undefined,
                  name: field.getAttribute('name') || undefined,
                  id: field.id || undefined,
                  autocomplete: field.getAttribute('autocomplete') || undefined,
                  actualValue: readValue(),
                  ...(expectedValue !== null ? { expectedValue } : {}),
                  ...(dropped ? { dropped: true } : {})
                }
              })
            }, 50)
            return
          }
          case 'key': {
            if (!found) {
              resolve({ success: false, ...base(), error: 'key needs a focused element; focus an input, textarea, or contenteditable, or give a target' })
              return
            }
            if (!targetGiven && !isEditable(found.el)) {
              resolve({ success: false, ...base(), error: `key focused element cannot take text: ${targetDescription} (focus an input, textarea, or contenteditable, or give a target)` })
              return
            }
            ;(found.el as HTMLElement).focus?.()
            const el: EventTarget = found.el
            if (spec.keyDescriptors.length === 0) throw new Error('key needs at least one key name')
            const repeat = Math.max(1, Math.min(100, spec.repeat || 1))
            for (let i = 0; i < repeat; i++) {
              for (const descriptor of spec.keyDescriptors) {
                ensureFresh()
                pressKey(el, descriptor, i > 0)
              }
            }
            resolve({ success: true, ...base(), events })
            return
          }
          case 'scroll': {
            if (!found) throw new Error('Could not resolve the viewport-centre scrolling element')
            const point = found.point
            const el = found.el
            const ticks = Math.max(1, Math.min(10, spec.ticks || 3))
            const amount = ticks * 100
            // No direction means down, the documented default; an older
            // caller that sends none must still move the page.
            const direction = spec.direction ?? 'down'
            const deltaX = direction === 'left' ? -amount : direction === 'right' ? amount : 0
            const deltaY = direction === 'up' ? -amount : direction === 'down' ? amount : 0
            const WheelCtor = (window as unknown as { WheelEvent?: typeof WheelEvent }).WheelEvent
            const wheel = WheelCtor
              ? new WheelCtor('wheel', { bubbles: true, cancelable: true, composed: true, clientX: point.x, clientY: point.y, deltaX, deltaY, deltaMode: 0, ...mods })
              : mouseEvent('wheel', point)
            const proceed = fire(el, wheel)
            if (proceed) {
              // A synthetic wheel event scrolls nothing on its own, so move
              // the nearest scrollable container (or the window) by the same
              // amount the wheel reported.
              const container = scrollableAncestor(el)
              if (container) container.scrollBy({ left: deltaX, top: deltaY })
              else window.scrollBy({ left: deltaX, top: deltaY })
            }
            resolve({ success: true, ...base(), events, scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) } })
            return
          }
          case 'scroll_to': {
            if (found && (spec.selector || spec.text || !targetGiven)) {
              found.el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center', inline: 'center' })
              const after = centre(found.el)
              resolve({ success: true, tagName: spec.located?.tagName, description: spec.located?.description, x: after.x, y: after.y, events, scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) } })
              return
            }
            if (spec.x !== null && spec.y !== null) {
              window.scrollTo({ left: spec.x, top: spec.y })
              resolve({ success: true, events, scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) } })
              return
            }
            throw new Error('scroll_to needs a target (selector, text, or document x/y)')
          }
          case 'drag': {
            if (!found) throw new Error('drag needs a start target')
            const end = locateEnd()
            if (!end) {
              resolve({ success: false, ...base(), error: 'drag needs an end point: toX/toY or toSelector' })
              return
            }
            const endEl = end.el ?? found.el
            const mid = { x: Math.round((found.point.x + end.point.x) / 2), y: Math.round((found.point.y + end.point.y) / 2) }
            fire(found.el, pointerEvent('pointerdown', found.point, { buttons: 1 }))
            fire(found.el, mouseEvent('mousedown', found.point, { buttons: 1, detail: 1 }))
            const DragCtor = (window as unknown as { DragEvent?: typeof DragEvent }).DragEvent
            let dataTransfer: DataTransfer | null = null
            try { dataTransfer = new DataTransfer() } catch { dataTransfer = null }
            const dragEvent = (type: string, at: { x: number; y: number }) => DragCtor
              ? new DragCtor(type, { bubbles: true, cancelable: true, composed: true, clientX: at.x, clientY: at.y, dataTransfer, ...mods })
              : null
            const started = dragEvent('dragstart', found.point)
            if (started) fire(found.el, started)
            for (const at of [mid, end.point]) {
              fire(endEl, pointerEvent('pointermove', at, { buttons: 1 }))
              fire(endEl, mouseEvent('mousemove', at, { buttons: 1 }))
              const over = dragEvent(at === mid ? 'dragenter' : 'dragover', at)
              if (over && started) fire(endEl, over)
            }
            const drop = dragEvent('drop', end.point)
            if (drop && started) fire(endEl, drop)
            fire(endEl, pointerEvent('pointerup', end.point))
            fire(endEl, mouseEvent('mouseup', end.point, { detail: 1 }))
            const ended = dragEvent('dragend', end.point)
            if (ended && started) fire(found.el, ended)
            resolve({ success: true, ...base(), events })
            return
          }
        }
      } catch (err) {
        resolve({ success: false, error: (err as Error).message, events })
      }
    }

    if (spec.located?.documentPoint) {
      run(null)
      return
    }
    if (!found) {
      resolve({ success: false, error: 'Element not found after target location' })
      return
    }
    run(found)
  })
}

/**
 * Locate and stamp the target for either execution path, then return its
 * point in CSS viewport pixels. Serialized like performPageAction and imports
 * nothing. Selector and text targets use the same bounded retry here.
 */
export function locateActTarget(spec: PageActSpec): Promise<LocatedActTarget> {
  // chrome.scripting.executeScript drops null-valued keys from `args`, so a
  // field the service worker sent as null arrives as a missing key. Every
  // `!== null` check below would then read "given", so restore the nulls
  // first. Self-contained on purpose: this function is serialized alone.
  for (const k of ['selector', 'text', 'x', 'y', 'value', 'key', 'modifiers', 'direction', 'toX', 'toY', 'toSelector', 'located'] as const) {
    if (spec[k] === undefined) (spec as unknown as Record<string, unknown>)[k] = null
  }
  if (spec.repeat === undefined) spec.repeat = 1
  if (spec.ticks === undefined) spec.ticks = 3
  if (spec.timeout === undefined) spec.timeout = 5000
  if (spec.expiresAt === undefined) spec.expiresAt = Number.MAX_SAFE_INTEGER
  const CLICKABLE_SELECTOR = 'button, a, [role="button"], [onclick]'
  const targetGiven = spec.selector !== null || spec.text !== null || (spec.x !== null && spec.y !== null)
  const outcome = (fields: Omit<LocatedActTarget, 'devicePixelRatio' | 'targetGiven'>): LocatedActTarget => ({
    ...fields,
    devicePixelRatio: window.devicePixelRatio,
    targetGiven
  })
  const describe = (el: Element): string => {
    const tag = el.tagName.toLowerCase()
    const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : ''
    const aria = el.getAttribute('aria-label')
    const label = aria ? ` aria-label="${aria}"` : ''
    const snippet = ((el as HTMLElement).innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)
    return `<${tag}${id}${label}>${snippet ? ` "${snippet}"` : ''}`
  }
  const isEditable = (el: Element): boolean => {
    if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly
    if (el instanceof HTMLInputElement) {
      return !el.disabled && !el.readOnly && ['text', 'search', 'tel', 'url', 'password', 'email'].includes(el.type)
    }
    return (el as HTMLElement).isContentEditable
  }
  const scrollableAncestor = (start: Element | null): Element | null => {
    let node: Element | null = start
    while (node && node !== document.documentElement) {
      const style = window.getComputedStyle(node)
      const scrolls = /(auto|scroll|overlay)/.test(style.overflowY + style.overflowX)
      if (scrolls && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) return node
      node = node.parentElement
    }
    return null
  }
  const needsTarget = spec.action !== 'type' && spec.action !== 'key' && spec.action !== 'scroll' && spec.action !== 'scroll_to'
  if (!targetGiven && needsTarget) {
    return Promise.resolve(outcome({ found: false, error: `${spec.action} needs a target: selector, text, or x/y` }))
  }

  // scroll_to x/y is a document position, not an element under a point.
  if (spec.action === 'scroll_to' && spec.selector === null && spec.text === null
      && spec.x !== null && spec.y !== null) {
    return Promise.resolve(outcome({ found: true, documentPoint: true, x: spec.x, y: spec.y }))
  }

  const locate = (): { el: Element; point: { x: number; y: number } } | null => {
    if (spec.selector) {
      const el = document.querySelector(spec.selector)
      if (!el) return null
      el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center', inline: 'center' })
      const rect = el.getBoundingClientRect()
      return { el, point: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } }
    }
    if (spec.text) {
      const normalized = spec.text.trim().toLowerCase()
      const clickable = Array.from(document.querySelectorAll(CLICKABLE_SELECTOR)).map(node => ({
        node, text: ((node as HTMLElement).innerText || node.textContent || '').trim().toLowerCase()
      }))
      const el = clickable.find(c => c.text === normalized)?.node ?? clickable.find(c => c.text.includes(normalized))?.node
      if (!el) return null
      el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'center', inline: 'center' })
      const rect = el.getBoundingClientRect()
      return { el, point: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } }
    }
    if (spec.x !== null && spec.y !== null) {
      const el = document.elementFromPoint(spec.x, spec.y)
      return el ? { el, point: { x: spec.x, y: spec.y } } : null
    }
    if (spec.action === 'type' || spec.action === 'key') {
      const el = document.activeElement
      if (!el || el === document.body || el === document.documentElement) return null
      const rect = el.getBoundingClientRect()
      return { el, point: { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } }
    }
    if (spec.action === 'scroll' || spec.action === 'scroll_to') {
      const point = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) }
      const hit = document.elementFromPoint(point.x, point.y)
      const el = scrollableAncestor(hit) ?? document.scrollingElement ?? document.documentElement
      return { el, point }
    }
    return null
  }

  return new Promise<LocatedActTarget>((resolve) => {
    const deadline = Math.min(Date.now() + spec.timeout, spec.expiresAt!)
    const attempt = () => {
      if (Date.now() >= deadline) {
        const label = spec.selector || `text="${spec.text}"`
        resolve(outcome({ found: false, error: `Element not found within ${spec.timeout}ms: ${label}` }))
        return
      }
      const found = locate()
      if (!found) {
        if ((spec.selector !== null || spec.text !== null) && Date.now() < deadline) {
          setTimeout(attempt, Math.min(100, Math.max(0, deadline - Date.now())))
          return
        }
        if (spec.x !== null && spec.y !== null) {
          resolve(outcome({ found: false, error: `No element at (${spec.x}, ${spec.y}); coordinates are CSS pixels inside the viewport (${window.innerWidth} x ${window.innerHeight})` }))
          return
        }
        if (!targetGiven && (spec.action === 'type' || spec.action === 'key')) {
          resolve(outcome({ found: false, error: `${spec.action} needs a focused element; focus an input, textarea, or contenteditable, or give a target` }))
          return
        }
        const label = spec.selector || `text="${spec.text}"`
        resolve(outcome({ found: false, error: `Element not found within ${spec.timeout}ms: ${label}` }))
        return
      }

      if (!targetGiven && (spec.action === 'type' || spec.action === 'key') && !isEditable(found.el)) {
        resolve(outcome({ found: false, error: `${spec.action} focused element cannot take text: ${describe(found.el)} (focus an input, textarea, or contenteditable, or give a target)` }))
        return
      }
      const coordinateActions: ActAction[] = ['click', 'right_click', 'double_click', 'triple_click', 'hover', 'drag', 'scroll']
      const rect = found.el.getBoundingClientRect()
      if (coordinateActions.includes(spec.action) && rect.width === 0 && rect.height === 0) {
        resolve(outcome({ found: false, error: `Element found but has zero dimensions: ${describe(found.el)}` }))
        return
      }
      if (spec.handoffToken) {
        const tokens = (found.el.getAttribute('data-tabz-act-handoff') ?? '').split(/\s+/).filter(Boolean)
        if (!tokens.includes(spec.handoffToken)) tokens.push(spec.handoffToken)
        found.el.setAttribute('data-tabz-act-handoff', tokens.join(' '))
      } else {
        document.querySelectorAll('[data-tabz-last-act]').forEach((prev) => prev.removeAttribute('data-tabz-last-act'))
        found.el.setAttribute('data-tabz-last-act', 'true')
      }
      resolve(outcome({
        found: true,
        x: found.point.x,
        y: found.point.y,
        tagName: found.el.tagName.toLowerCase(),
        description: describe(found.el)
      }))
    }
    attempt()
  })
}

function toSpec(message: ActMessage, resolvedRefSelector?: string): PageActSpec {
  const modifierFlags = parseModifiers(message.modifiers)
  const keyDescriptors = message.action === 'key'
    ? splitKeys(message.key ?? '').map(token => describeKey(token, message.modifiers))
    : message.action === 'type'
      ? Array.from(message.value ?? '').map(character => describeKey(character === '\n' ? 'Enter' : character, message.modifiers))
      : []
  return {
    action: message.action,
    selector: resolvedRefSelector ?? message.selector ?? null,
    text: message.text ?? null,
    x: typeof message.x === 'number' ? message.x : null,
    y: typeof message.y === 'number' ? message.y : null,
    value: message.value ?? null,
    key: message.key ?? null,
    repeat: typeof message.repeat === 'number' ? message.repeat : 1,
    modifiers: message.modifiers ?? null,
    direction: message.direction ?? null,
    ticks: typeof message.ticks === 'number' ? message.ticks : 3,
    toX: typeof message.toX === 'number' ? message.toX : null,
    toY: typeof message.toY === 'number' ? message.toY : null,
    toSelector: message.toSelector ?? null,
    timeout: message.waitTimeout || 5000,
    modifierFlags,
    keyDescriptors,
    located: null
  }
}

type CdpMouseButton = 'none' | 'left' | 'middle' | 'right'

/**
 * Real input through the debugger: Input.dispatchMouseEvent and
 * Input.dispatchKeyEvent with clickCount and the CDP modifier bitmask.
 * Runs inside withDebugger, which attaches once, reuses a persistent
 * emulation or deep-capture attachment, and ALWAYS detaches what it
 * attached, so a thrown dispatch never leaves the debugging bar up.
 */
async function runTrustedAction(
  tabId: number,
  token: DocumentProtectionToken,
  spec: PageActSpec,
  guard: () => void,
  onDispatch: () => void,
  expiresAt: number
): Promise<PageActOutcome> {
  const flags = spec.modifierFlags
  const modifiers = modifierBitmask(flags)
  const events: string[] = []

  // scroll_to has no input to dispatch; it is the same scrollIntoView on
  // either path.
  if (spec.action === 'scroll_to') {
    const results = await chrome.scripting.executeScript({ target: protectedDocumentTarget(token), func: performPageAction, args: [spec] })
    return (results[0]?.result as PageActOutcome | undefined) ?? injectionFailure(results)
  }

  const hasTarget = spec.selector !== null || spec.text !== null || (spec.x !== null && spec.y !== null)
  const located = spec.located
  const point = located?.found && located.x !== undefined && located.y !== undefined
    ? { x: located.x, y: located.y }
    : null

  const base = (): Partial<PageActOutcome> => located?.found
    ? { tagName: located.tagName, description: located.description, x: located.x, y: located.y }
    : {}

  return withDebugger(tabId, async (target) => {
    const mouse = async (type: 'mousePressed' | 'mouseReleased' | 'mouseMoved' | 'mouseWheel', at: { x: number; y: number }, extra: { button?: CdpMouseButton; clickCount?: number; deltaX?: number; deltaY?: number; buttons?: number } = {}) => {
      guard()
      onDispatch()
      events.push(`${type}${extra.clickCount ? `:${extra.clickCount}` : ''}`)
      await sendDebuggerCommand(target, 'Input.dispatchMouseEvent', { type, x: at.x, y: at.y, modifiers, ...extra }, Math.max(1, expiresAt - Date.now()))
    }
    const clicks = async (at: { x: number; y: number }, count: number, button: CdpMouseButton) => {
      await mouse('mouseMoved', at)
      for (let n = 1; n <= count; n++) {
        await mouse('mousePressed', at, { button, clickCount: n })
        await mouse('mouseReleased', at, { button, clickCount: n })
      }
    }
    const keyDown = async (d: KeyDescriptor, text?: string) => {
      guard()
      onDispatch()
      const mods = modifierBitmask(d.flags) | modifiers
      events.push(`keyDown:${d.key}`)
      await sendDebuggerCommand(target, 'Input.dispatchKeyEvent', {
        type: text !== undefined ? 'keyDown' : 'rawKeyDown',
        key: d.key, code: d.code, windowsVirtualKeyCode: d.keyCode, nativeVirtualKeyCode: d.keyCode,
        modifiers: mods, ...(text !== undefined ? { text, unmodifiedText: text } : {})
      }, Math.max(1, expiresAt - Date.now()))
      events.push(`keyUp:${d.key}`)
      await sendDebuggerCommand(target, 'Input.dispatchKeyEvent', {
        type: 'keyUp', key: d.key, code: d.code, windowsVirtualKeyCode: d.keyCode, nativeVirtualKeyCode: d.keyCode, modifiers: mods
      }, Math.max(1, expiresAt - Date.now()))
    }

    switch (spec.action) {
      case 'hover':
        await mouse('mouseMoved', point!)
        break
      case 'click':
        await clicks(point!, 1, 'left')
        break
      case 'double_click':
        await clicks(point!, 2, 'left')
        break
      case 'triple_click':
        await clicks(point!, 3, 'left')
        break
      case 'right_click':
        await clicks(point!, 1, 'right')
        break
      case 'type': {
        if (point && hasTarget) await clicks(point, 1, 'left')
        // Input.insertText commits a whole run of printable characters in one
        // CDP call, instead of two per character (a keyDown and a keyUp), so
        // a long value is one round trip rather than hundreds. Non-printables
        // (the newline) and a chord (a modifier held down for the typing)
        // still go through Input.dispatchKeyEvent, which is the only way the
        // page sees the key.
        const held = flags.ctrlKey || flags.metaKey || flags.altKey
        let run = ''
        const flushRun = async () => {
          if (run === '') return
          // The length only: the run itself may be a credential.
          events.push(`insertText:${run.length}`)
          // Input.insertText is EXPERIMENTAL at CDP tip of tree; if typing stops working, suspect it first.
          guard()
          onDispatch()
          await sendDebuggerCommand(target, 'Input.insertText', { text: run }, Math.max(1, expiresAt - Date.now()))
          run = ''
        }
        const characters = Array.from(spec.value ?? '')
        for (let index = 0; index < characters.length; index++) {
          const ch = characters[index]
          const descriptor = spec.keyDescriptors[index]
          if (!descriptor) throw new Error('type key descriptors do not match value')
          if (ch === '\n') {
            await flushRun()
            await keyDown(descriptor, '\r')
            continue
          }
          if (held) {
            await keyDown(descriptor, ch)
            continue
          }
          run += ch
        }
        await flushRun()
        break
      }
      case 'key': {
        if (point && hasTarget) await clicks(point, 1, 'left')
        if (spec.keyDescriptors.length === 0) throw new Error('key needs at least one key name')
        const repeat = Math.max(1, Math.min(100, spec.repeat || 1))
        for (let i = 0; i < repeat; i++) {
          for (const d of spec.keyDescriptors) {
            const plain = !d.flags.ctrlKey && !d.flags.metaKey && !d.flags.altKey && !flags.ctrlKey && !flags.metaKey && !flags.altKey
            const text = d.key === 'Enter' ? '\r' : (d.printable && plain ? d.key : undefined)
            await keyDown(d, text)
          }
        }
        break
      }
      case 'scroll': {
        const ticks = Math.max(1, Math.min(10, spec.ticks || 3))
        const amount = ticks * 100
        const direction = spec.direction ?? 'down'
        const deltaX = direction === 'left' ? -amount : direction === 'right' ? amount : 0
        const deltaY = direction === 'up' ? -amount : direction === 'down' ? amount : 0
        const at = point!
        await mouse('mouseWheel', at, { deltaX, deltaY })
        break
      }
      case 'drag': {
        const end = await locateDragEnd(tabId, token, spec)
        if (!end) return { success: false, ...base(), error: 'drag needs an end point: toX/toY or toSelector', events }
        const mid = { x: Math.round((point!.x + end.x) / 2), y: Math.round((point!.y + end.y) / 2) }
        await mouse('mouseMoved', point!)
        await mouse('mousePressed', point!, { button: 'left', clickCount: 1 })
        await mouse('mouseMoved', mid, { button: 'left', buttons: 1 })
        await mouse('mouseMoved', end, { button: 'left', buttons: 1 })
        await mouse('mouseReleased', end, { button: 'left', clickCount: 1 })
        break
      }
    }
    return { success: true, ...base(), events }
  }, { guard })
}

async function locateDragEnd(tabId: number, token: DocumentProtectionToken, spec: PageActSpec): Promise<{ x: number; y: number } | null> {
  if (spec.toX !== null && spec.toY !== null) return { x: spec.toX, y: spec.toY }
  if (!spec.toSelector) return null
  const results = await chrome.scripting.executeScript({
    target: protectedDocumentTarget(token),
    func: (selector: string) => {
      const el = document.querySelector(selector)
      if (!el) return null
      const rect = el.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) }
    },
    args: [spec.toSelector]
  })
  return (results[0]?.result as { x: number; y: number } | null | undefined) ?? null
}

/**
 * Chrome reports an exception thrown by an injected function as an
 * InjectionResult with `result` undefined and `error` set (Chrome 129+), and
 * older builds leave both empty. Read the error so the caller sees the real
 * exception instead of a bare "No result from the page".
 */
function injectionFailure(results: chrome.scripting.InjectionResult[] | undefined): PageActOutcome {
  const first = results?.[0] as (chrome.scripting.InjectionResult & { error?: unknown }) | undefined
  const err = first?.error
  const detail = err instanceof Error ? err.message : typeof err === 'string' ? err : err ? JSON.stringify(err) : ''
  console.warn('Browser MCP: act injection returned no result', { hasError: detail !== '', frames: results?.length ?? 0 })
  return { success: false, error: detail ? `Injected script failed: ${detail}` : 'No result from the page' }
}

/**
 * The actions whose trusted path dispatches at a POINT, so an element that
 * covers the target receives the input instead of the target. The synthetic
 * path dispatches on the element itself and is unaffected.
 */
const POINT_DISPATCH_ACTIONS: ActAction[] = ['click', 'right_click', 'double_click', 'triple_click', 'hover', 'drag']

/** What the caller asked for, for ranking a failure's recovery suggestions. */
function wantedTarget(message: ActMessage): string | null {
  return message.selector ?? message.text ?? message.ref ?? null
}

function redactActValue(error: string | undefined, value: string | undefined): string | undefined {
  return error && value ? error.split(value).join('[redacted]') : error
}

async function beforeDeadline<T>(promise: Promise<T>, expiresAt: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), Math.max(0, expiresAt - Date.now()))
      })
    ])
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

/**
 * Handle a `browser-act` frame: resolve the tab (group-scoped, pageGuard),
 * run the synthetic or trusted path, answer with one result shape.
 */
export async function handleBrowserAct(message: ActMessage): Promise<void> {
  const trusted = message.trusted === true
  const receivedAt = Date.now()
  const relativeBudget = message.requestTimeoutMs
  const budget = typeof relativeBudget === 'number' && Number.isFinite(relativeBudget)
    ? Math.max(0, relativeBudget - 1000)
    : (trusted ? 24_000 : 14_000)
  const expiresAt = receivedAt + budget
  const answer = (fields: Record<string, unknown>) => sendToWebSocket({
    type: 'browser-act-result',
    requestId: message.requestId,
    action: message.action,
    trusted,
    ...fields
  })
  let dispatchStarted = false
  let protectedAction = false
  let targetTabId: number | undefined

  try {
    setupPageRefPruning()
    if (!ACT_ACTIONS.includes(message.action)) {
      answer({ success: false, error: `Unknown action: ${String(message.action)}. Valid actions: ${ACT_ACTIONS.join(', ')}` })
      return
    }
    const resolved = await resolveAgentTab(message.agent, message.tabId)
    if (resolved?.id === undefined) throw new Error('No active tab found')
    const tabId = resolved.id
    targetTabId = tabId
    const guard = () => {
      if (Date.now() >= expiresAt) throw new Error('Refused: the action deadline expired before dispatch')
    }

    const result = await runWithDocumentAdmission(tabId, async () => {
      guard()
      await assertTabInAgentGroup(message.agent, tabId)
      const protection = await currentDocumentProtection(tabId, { guard, expiresAt })
      protectedAction = protection !== null

      if (protection) {
        if (trusted || message.observe || message.action !== 'click' || !message.ref ||
            message.selector !== undefined || message.text !== undefined ||
            message.x !== undefined || message.y !== undefined) {
          throw new Error('Refused: a protected document only permits a synthetic click on an opaque ref from its latest tabz_read_page result')
        }
        resolvePageRef(tabId, message.ref, {
          agent: message.agent,
          documentId: protection.documentId
        })
        guard()
        dispatchStarted = true
        const actionResult = (await beforeDeadline(chrome.scripting.executeScript({
          target: protectedDocumentTarget(protection),
          func: clickProtectedPageRef,
          args: [message.ref, expiresAt]
        }), expiresAt, 'Protected submit outcome is unknown because its deadline expired'))[0]
        await assertProtectedDocumentCurrent(tabId, protection, { guard, expiresAt })
        await assertTabInAgentGroup(message.agent, tabId)
        if (actionResult?.documentId !== protection.documentId) {
          throw new Error('Protected submit result came from a different document')
        }
        if (actionResult.result === false) {
          return {
            success: false,
            protected: true,
            verified: false,
            tabId,
            error: 'Protected submit could not be verified; inspect the page manually before deciding whether to retry'
          }
        }
        if (actionResult.result !== true) {
          throw new Error('Protected submit returned no verified dispatch result')
        }
        return { success: true, protected: true, verified: true, tabId }
      }

      const token = await assertDocumentReadable(tabId, 'tabz_act', { guard, expiresAt })
      const verifyReadable = async (options: { documentId?: string; guard?: () => void } = {}) => {
        try {
          await assertDocumentReadCurrent(tabId, token, options)
        } catch (error) {
          await markDocumentReadUncertain(tabId, token).catch(() => undefined)
          throw error
        }
      }
      const resolvedRefSelector = message.ref === undefined ? undefined : resolvePageRef(tabId, message.ref, {
        agent: message.agent,
        documentId: token.documentId
      })
      const spec = toSpec(message, resolvedRefSelector)
      if (!trusted) spec.handoffToken = crypto.randomUUID()
      spec.timeout = Math.max(0, Math.min(spec.timeout, expiresAt - Date.now()))
      spec.expiresAt = expiresAt

      guard()
      let locateResults: chrome.scripting.InjectionResult[]
      try {
        locateResults = await beforeDeadline(chrome.scripting.executeScript({
          target: protectedDocumentTarget(token),
          func: locateActTarget,
          args: [spec]
        }), expiresAt, 'Refused: the action deadline expired while locating the target')
      } catch (error) {
        await markDocumentReadUncertain(tabId, token).catch(() => undefined)
        throw error
      }
      const locateResult = locateResults[0]
      await verifyReadable({ documentId: locateResult?.documentId, guard })
      await assertTabInAgentGroup(message.agent, tabId)
      const located = locateResult?.result as LocatedActTarget | undefined
      if (!located?.found) {
        const failure = located?.error || injectionFailure(locateResults).error || 'Could not locate the target'
        const recovery = await gatherActRecovery(tabId, {
          token,
          agent: message.agent,
          x: message.x,
          y: message.y,
          wanted: wantedTarget(message),
          expiresAt
        })
        return {
          success: false,
          tabId,
          error: message.ref !== undefined && failure.includes('Element not found')
            ? stalePageRefMessage(message.ref, tabId)
            : redactActValue(failure, message.value),
          ...(recovery ? { recovery } : {})
        }
      }
      spec.located = located

      if (trusted && POINT_DISPATCH_ACTIONS.includes(message.action) && message.x === undefined &&
          located.x !== undefined && located.y !== undefined) {
        const covered = await gatherActRecovery(tabId, {
          token,
          agent: message.agent,
          x: located.x,
          y: located.y,
          wanted: wantedTarget(message),
          checkObscured: true,
          suggestOnlyWhenCovered: true,
          expiresAt
        })
        if (covered?.covering) {
          return {
            success: false,
            tabId,
            error: `${message.action} target is covered at (${located.x}, ${located.y}) by ${covered.covering.description}; trusted input would reach that element`,
            recovery: covered
          }
        }
      }

      let outcome: PageActOutcome
      let outcomeDocumentId: string | undefined
      if (trusted) {
        await verifyReadable({ guard })
        try {
          outcome = await runTrustedAction(tabId, token, spec, guard, () => { dispatchStarted = true }, expiresAt)
        } catch (error) {
          await markDocumentReadUncertain(tabId, token).catch(() => undefined)
          throw error
        }
      } else {
        guard()
        dispatchStarted = true
        let results: chrome.scripting.InjectionResult[]
        try {
          results = await beforeDeadline(chrome.scripting.executeScript({
            target: protectedDocumentTarget(token),
            func: performPageAction,
            args: [spec]
          }), expiresAt, 'Action outcome is unknown because its deadline expired')
        } catch (error) {
          await markDocumentReadUncertain(tabId, token).catch(() => undefined)
          throw error
        }
        const injection = results[0]
        outcomeDocumentId = injection?.documentId
        outcome = (injection?.result as PageActOutcome | undefined) ?? injectionFailure(results)
      }
      await verifyReadable({ documentId: outcomeDocumentId, guard })
      await assertTabInAgentGroup(message.agent, tabId)

      if (message.ref !== undefined && !outcome.success && outcome.error?.includes('Element not found')) {
        outcome.error = stalePageRefMessage(message.ref, tabId)
      }
      let recovery: Record<string, unknown> = {}
      if (!outcome.success) {
        const gathered = await gatherActRecovery(tabId, {
          token,
          agent: message.agent,
          x: located.x,
          y: located.y,
          wanted: wantedTarget(message),
          checkObscured: true,
          expiresAt
        })
        if (gathered) recovery = { recovery: gathered }
      }

      let verification: Record<string, unknown> = {}
      if (outcome.success && outcome.field) {
        const field = outcome.field
        const sensitive = isSensitiveInput(field.tagName, field.type, field.name, field.id, field.autocomplete)
        const verified = field.expectedValue !== undefined && !field.dropped && field.actualValue === field.expectedValue
        verification = {
          verified,
          sensitive,
          actualLength: field.actualValue.length,
          ...(sensitive ? {} : { actualValue: field.actualValue })
        }
      }
      let observation: Record<string, unknown> = {}
      if (message.observe) {
        try {
          const image = await captureViewportInline(tabId, { agent: message.agent, token, expiresAt })
          observation = { observed: true, ...image }
        } catch {
          // Observation failure never changes or replays the already verified action.
          observation = { observed: false, observationError: 'Viewport observation unavailable; the action was not replayed' }
        }
      }
      return {
        success: outcome.success,
        tabId,
        ...observation,
        error: redactActValue(outcome.error, message.value),
        target: outcome.description || outcome.tagName || outcome.x !== undefined
          ? { description: outcome.description, tagName: outcome.tagName, x: outcome.x, y: outcome.y }
          : undefined,
        events: outcome.events,
        scroll: outcome.scroll,
        ...verification,
        ...recovery
      }
    })

    answer(result)
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    const redacted = redactActValue(raw, message.value) || 'Browser action failed'
    answer({
      success: dispatchStarted ? null : false,
      ...(dispatchStarted ? { status: 'unknown' } : {}),
      ...(targetTabId !== undefined ? { tabId: targetTabId } : {}),
      ...(protectedAction ? { protected: true, verified: false } : {}),
      error: protectedAction
        ? (dispatchStarted
            ? 'Protected submit outcome is unknown; inspect the page manually before deciding whether to retry'
            : 'Protected action was refused; use an opaque ref published for this exact document and caller')
        : dispatchStarted
          ? 'Action outcome is unknown because dispatch could not be verified; read the current page before deciding whether to retry'
          : redacted
    })
  }
}
