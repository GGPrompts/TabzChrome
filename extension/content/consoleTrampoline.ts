import { CONSOLE_TRAMPOLINE_NAME } from '../shared/consoleBridge'

export type ConsoleMethod = (...args: unknown[]) => unknown
export type ConsoleTrampoline = (method: ConsoleMethod, args: readonly unknown[]) => void

const TRAMPOLINE_BODY = `function ${CONSOLE_TRAMPOLINE_NAME}(method, args) { method.apply(void 0, args); }`

type TrampolineWindow = Window & Record<string, unknown>

function trampolineKey(): string {
  return `__tabzTrampoline${Math.random().toString(36).slice(2)}`
}

function readTrampoline(host: Record<string, unknown>, key: string): ConsoleTrampoline | undefined {
  const value = host[key]
  try { delete host[key] } catch { /* The single-use key is harmless on a frozen global. */ }
  return typeof value === 'function' ? value as ConsoleTrampoline : undefined
}

function findPageNonce(doc: Document): string | undefined {
  try {
    const scripts = typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('script') : []
    for (const script of Array.from(scripts)) {
      const nonce = (script as { nonce?: unknown }).nonce
      if (typeof nonce === 'string' && nonce.length > 0) return nonce
    }
  } catch {
    // A document that refuses enumeration offers no usable nonce.
  }
  return undefined
}

function createInlineScriptTrampoline(target: Window): ConsoleTrampoline | undefined {
  try {
    const doc = target.document
    if (!doc || typeof doc.createElement !== 'function') return undefined
    const nonce = findPageNonce(doc)
    if (!nonce) return undefined

    const host = (doc.defaultView || target) as unknown as Record<string, unknown>
    const key = trampolineKey()
    const script = doc.createElement('script')
    script.nonce = nonce
    script.textContent = `window[${JSON.stringify(key)}] = ${TRAMPOLINE_BODY}`
    const mount = doc.head || doc.documentElement || doc.body
    if (!mount || typeof mount.appendChild !== 'function') return undefined

    mount.appendChild(script)
    if (typeof script.remove === 'function') script.remove()
    else script.parentNode?.removeChild(script)
    return readTrampoline(host, key)
  } catch {
    return undefined
  }
}

export function createConsoleTrampoline(target: Window): ConsoleTrampoline | undefined {
  return createInlineScriptTrampoline(target)
}

type Scheduler = (handler: ConsoleMethod, timeout: number, ...handlerArgs: unknown[]) => unknown

/** Capture the page scheduler at document_start so later page replacements cannot intercept calls. */
export function createScheduledTrampoline(target: Window): ConsoleTrampoline {
  const pageSchedule = (target as TrampolineWindow).setTimeout as Scheduler | undefined
  const schedule = typeof pageSchedule === 'function' ? pageSchedule : undefined
  const ambient = setTimeout as unknown as Scheduler
  return (method, args) => {
    const rest = args as unknown[]
    if (schedule) schedule.call(target, method, 0, ...rest)
    else ambient(method, 0, ...rest)
  }
}
