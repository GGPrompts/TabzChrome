import {
  createConsoleBridgeMessage,
  isConsoleReadyEvent,
  serializeConsoleArgs,
  type MainWorldConsoleMessage,
} from '../shared/consoleBridge'
import { createConsoleTrampoline, createScheduledTrampoline } from './consoleTrampoline'
import type { ConsoleLogLevel } from '../shared/messaging'

const INSTALL_MARKER = '__tabzConsoleInstalled'
const CONSOLE_METHODS: readonly ConsoleLogLevel[] = ['log', 'info', 'warn', 'error', 'debug']
export const MAX_BUFFERED_ENTRIES = 200

type ConsoleCaptureWindow = Window & Pick<typeof globalThis, 'console'>
type MarkedWindow = ConsoleCaptureWindow & Record<typeof INSTALL_MARKER, boolean | undefined>

function readErrorStack(value: unknown): string | undefined {
  try { return value instanceof Error ? value.stack : undefined } catch { return undefined }
}

export function installMainWorldConsoleCapture(target: Window): void {
  try {
    const markedWindow = target as MarkedWindow
    if (markedWindow[INSTALL_MARKER]) return
    markedWindow[INSTALL_MARKER] = true
  } catch {
    return
  }

  let ready = false
  const pending: MainWorldConsoleMessage[] = []
  const post = (message: MainWorldConsoleMessage) => {
    try { target.postMessage(message, '*') } catch { /* Capture must not affect the page. */ }
  }
  const postConsoleEntry = (level: ConsoleLogLevel, args: readonly unknown[], stack?: string) => {
    let message: MainWorldConsoleMessage
    try { message = createConsoleBridgeMessage(level, args, Date.now(), stack) } catch { return }
    if (ready) return post(message)
    if (pending.length >= MAX_BUFFERED_ENTRIES) pending.shift()
    pending.push(message)
  }

  try {
    target.addEventListener('message', event => {
      if (ready || !isConsoleReadyEvent(event, target)) return
      ready = true
      for (const message of pending.splice(0, pending.length)) post(message)
    })
  } catch {
    return
  }

  const trampoline = createConsoleTrampoline(target) || createScheduledTrampoline(target)
  for (const level of CONSOLE_METHODS) {
    try {
      const captureWindow = target as ConsoleCaptureWindow
      const originalMethod = captureWindow.console[level].bind(captureWindow.console)
      captureWindow.console[level] = (...args: unknown[]) => {
        try { trampoline(originalMethod, args) } catch { /* Preserve page execution if its console is hostile. */ }
        postConsoleEntry(level, args)
      }
    } catch {
      // Continue if the page prevents one method from being wrapped.
    }
  }

  try {
    target.addEventListener('error', event => {
      try {
        const errorEvent = event as ErrorEvent
        const message = errorEvent.message || serializeConsoleArgs([errorEvent.error]) || 'Uncaught error'
        postConsoleEntry('error', [message], readErrorStack(errorEvent.error))
      } catch { /* Error capture must not affect the page. */ }
    })
  } catch { /* Continue if the page prevents the listener. */ }

  try {
    target.addEventListener('unhandledrejection', event => {
      try {
        const rejectionEvent = event as PromiseRejectionEvent
        const reason = serializeConsoleArgs([rejectionEvent.reason])
        postConsoleEntry('error', [`Unhandled promise rejection: ${reason}`], readErrorStack(rejectionEvent.reason))
      } catch { /* Rejection capture must not affect the page. */ }
    })
  } catch { /* Continue if the page prevents the listener. */ }
}

if (typeof window !== 'undefined') installMainWorldConsoleCapture(window)
