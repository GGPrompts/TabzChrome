import type { ConsoleLogLevel } from './messaging'

export const TABZ_CONSOLE_MARKER = '__tabzConsole' as const
export const TABZ_CONSOLE_READY_MARKER = '__tabzConsoleReady' as const
export const MAX_CONSOLE_MESSAGE_LENGTH = 10_000
export const MAX_CONSOLE_STACK_LENGTH = 20_000
export const MAX_BRIDGE_EVENTS_PER_WINDOW = 250
export const BRIDGE_RATE_WINDOW_MS = 1_000

export interface MainWorldConsoleEntry {
  level: ConsoleLogLevel
  message: string
  timestamp: number
  stack?: string
}

export type ConsoleEntryOrigin = 'page' | 'unknown' | `extension:${string}`

export interface MainWorldConsoleMessage {
  [TABZ_CONSOLE_MARKER]: true
  entry: MainWorldConsoleEntry
}

export interface ConsoleBridgeEvent {
  source: unknown
  data: unknown
}

export interface ForwardedConsoleLogMessage {
  type: 'CONSOLE_LOG'
  entry: MainWorldConsoleEntry & {
    url: string
    tabId: -1
    source: 'page'
    origin: ConsoleEntryOrigin
  }
}

function stringifyFallback(value: unknown): string {
  try {
    return String(value)
  } catch {
    return '[Unserializable value]'
  }
}

function serializeConsoleArg(value: unknown): string {
  if (typeof value === 'string') return value

  try {
    if (value instanceof Error) {
      return `${value.name}: ${value.message}\n${value.stack || ''}`
    }
  } catch {
    return stringifyFallback(value)
  }

  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized === undefined ? stringifyFallback(value) : serialized
  } catch {
    return stringifyFallback(value)
  }
}

export function serializeConsoleArgs(args: readonly unknown[]): string {
  return args.map(serializeConsoleArg).join(' ').slice(0, MAX_CONSOLE_MESSAGE_LENGTH)
}

function findErrorStack(args: readonly unknown[]): string | undefined {
  for (const value of args) {
    try {
      if (value instanceof Error) return value.stack
    } catch {
      return undefined
    }
  }
  return undefined
}

function createCaptureStack(): string | undefined {
  try {
    return new Error().stack
  } catch {
    return undefined
  }
}

export const CONSOLE_TRAMPOLINE_NAME = 'tabzConsoleTrampoline'

const CONSOLE_BRIDGE_FUNCTION_NAMES = [
  'createCaptureStack',
  'createConsoleBridgeMessage',
  'postConsoleEntry',
  'captureWindow.console.<computed>',
  CONSOLE_TRAMPOLINE_NAME,
] as const

function isConsoleBridgeFrame(frame: string): boolean {
  if (/content\/consoleMainWorld\.js(?::\d+){0,2}(?:\)?$|[?#])/.test(frame)) return true

  const chromeFunction = frame.match(/^\s*at\s+(.+?)(?:\s+\(|\s+\[as\s|$)/)?.[1]
  const firefoxFunction = frame.match(/^\s*([^@]*)@/)?.[1]
  const functionName = chromeFunction || firefoxFunction
  if (!functionName) return false
  return CONSOLE_BRIDGE_FUNCTION_NAMES.some(name => functionName === name || functionName.endsWith(`.${name}`))
}

export function stripConsoleBridgeFrames(stack: string): string {
  const lines = stack.split('\n')
  const firstFrameIndex = lines.findIndex(line => /^\s*(?:at\s|(?:[^@\s]+)?@)/.test(line))
  if (firstFrameIndex === -1) return stack.slice(0, MAX_CONSOLE_STACK_LENGTH)

  let firstForeignFrameIndex = firstFrameIndex
  while (firstForeignFrameIndex < lines.length && isConsoleBridgeFrame(lines[firstForeignFrameIndex])) {
    firstForeignFrameIndex += 1
  }
  const cleaned = firstForeignFrameIndex === firstFrameIndex
    ? stack
    : [...lines.slice(0, firstFrameIndex), ...lines.slice(firstForeignFrameIndex)].join('\n')
  return cleaned.slice(0, MAX_CONSOLE_STACK_LENGTH)
}

function firstStackFrameUrl(stack?: string): string | undefined {
  if (!stack) return undefined
  for (const line of stack.split('\n')) {
    if (!/^\s*(?:at\s|(?:[^@\s]+)?@)/.test(line)) continue
    return line.match(/(?:chrome-extension|https?|file):\/\/[^\s)]+/)?.[0]
  }
  return undefined
}

function hasSameOrigin(left: URL, right: URL): boolean {
  if (left.origin !== 'null' || right.origin !== 'null') return left.origin === right.origin
  return left.protocol === 'chrome-extension:' && right.protocol === 'chrome-extension:' && left.host === right.host
}

export function classifyConsoleEntryOrigin(
  stack: string | undefined,
  pageUrl: string,
  ownExtensionId: string,
): ConsoleEntryOrigin {
  const frameUrl = firstStackFrameUrl(stack)
  if (!frameUrl) return 'unknown'

  try {
    const frame = new URL(frameUrl)
    if (frame.protocol === 'chrome-extension:' && frame.hostname !== ownExtensionId) {
      return /^[a-p]{32}$/.test(frame.hostname) && /^[a-p]{32}$/.test(ownExtensionId)
        ? `extension:${frame.hostname}`
        : 'unknown'
    }
    return hasSameOrigin(frame, new URL(pageUrl)) ? 'page' : 'unknown'
  } catch {
    return 'unknown'
  }
}

export function createConsoleBridgeMessage(
  level: ConsoleLogLevel,
  args: readonly unknown[],
  timestamp = Date.now(),
  stackOverride?: string,
): MainWorldConsoleMessage {
  const entry: MainWorldConsoleEntry = {
    level,
    message: serializeConsoleArgs(args),
    timestamp,
  }
  let stack = stackOverride
  if (!stack && (level === 'warn' || level === 'error')) {
    const errorStack = findErrorStack(args)
    stack = errorStack || stripConsoleBridgeFrames(createCaptureStack() || '') || undefined
  }
  // Error objects and window error events already carry a page-owned stack.
  // Strip only the stack synthesized inside this bridge above.
  if (stack) entry.stack = stack.slice(0, MAX_CONSOLE_STACK_LENGTH)
  return { [TABZ_CONSOLE_MARKER]: true, entry }
}

const CONSOLE_LEVELS = new Set<ConsoleLogLevel>(['log', 'info', 'warn', 'error', 'debug'])

function readMainWorldConsoleEntry(data: unknown): MainWorldConsoleEntry | null {
  if (!data || typeof data !== 'object') return null
  const message = data as Partial<MainWorldConsoleMessage>
  if (message[TABZ_CONSOLE_MARKER] !== true || !message.entry || typeof message.entry !== 'object') return null

  const { level, timestamp, stack } = message.entry
  if (!CONSOLE_LEVELS.has(level as ConsoleLogLevel)) return null
  if (typeof message.entry.message !== 'string') return null
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return null
  if (stack !== undefined && typeof stack !== 'string') return null
  return {
    level: level as ConsoleLogLevel,
    message: message.entry.message.slice(0, MAX_CONSOLE_MESSAGE_LENGTH),
    timestamp,
    ...(stack ? { stack: stack.slice(0, MAX_CONSOLE_STACK_LENGTH) } : {}),
  }
}

export function createForwardedConsoleLogMessage(
  event: ConsoleBridgeEvent,
  expectedSource: unknown,
  url: string,
  ownExtensionId: string,
): ForwardedConsoleLogMessage | null {
  if (event.source !== expectedSource) return null
  try {
    const entry = readMainWorldConsoleEntry(event.data)
    if (!entry) return null
    return {
      type: 'CONSOLE_LOG',
      entry: {
        ...entry,
        url,
        tabId: -1,
        source: 'page',
        origin: classifyConsoleEntryOrigin(entry.stack, url, ownExtensionId),
      },
    }
  } catch {
    return null
  }
}

export interface ConsoleReadyMessage {
  [TABZ_CONSOLE_READY_MARKER]: true
}

export function createConsoleReadyMessage(): ConsoleReadyMessage {
  return { [TABZ_CONSOLE_READY_MARKER]: true }
}

export function isConsoleReadyEvent(event: ConsoleBridgeEvent, expectedSource: unknown): boolean {
  if (event.source !== expectedSource) return false
  const data = event.data as Partial<ConsoleReadyMessage> | null
  return !!data && typeof data === 'object' && data[TABZ_CONSOLE_READY_MARKER] === true
}

/** Per-frame limiter for marked page messages before they reach extension IPC. */
export function createConsoleBridgeRateLimiter(now: () => number = Date.now): () => boolean {
  let windowStartedAt = now()
  let accepted = 0
  return () => {
    const current = now()
    if (current - windowStartedAt >= BRIDGE_RATE_WINDOW_MS || current < windowStartedAt) {
      windowStartedAt = current
      accepted = 0
    }
    if (accepted >= MAX_BRIDGE_EVENTS_PER_WINDOW) return false
    accepted += 1
    return true
  }
}
