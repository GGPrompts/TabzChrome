import { describe, expect, it } from 'vitest'
import {
  BRIDGE_RATE_WINDOW_MS,
  MAX_BRIDGE_EVENTS_PER_WINDOW,
  MAX_CONSOLE_MESSAGE_LENGTH,
  MAX_CONSOLE_STACK_LENGTH,
  classifyConsoleEntryOrigin,
  createConsoleBridgeMessage,
  createConsoleBridgeRateLimiter,
  createForwardedConsoleLogMessage,
  serializeConsoleArgs,
  stripConsoleBridgeFrames,
} from '@/shared/consoleBridge'

describe('console bridge validation and bounds', () => {
  const currentWindow = {}
  const ownExtensionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

  it('serializes hostile values and caps messages and stacks', () => {
    const circular: { self?: unknown } = {}
    circular.self = circular
    expect(serializeConsoleArgs(['plain', { answer: 42 }, circular])).toBe(
      'plain {\n  "answer": 42\n} [object Object]',
    )
    expect(serializeConsoleArgs(['x'.repeat(MAX_CONSOLE_MESSAGE_LENGTH + 1)]))
      .toHaveLength(MAX_CONSOLE_MESSAGE_LENGTH)

    const forwarded = createForwardedConsoleLogMessage({
      source: currentWindow,
      data: createConsoleBridgeMessage('error', ['failed'], 123, `Error\n    at run (https://example.test/app.js:1:2)${'x'.repeat(MAX_CONSOLE_STACK_LENGTH)}`),
    }, currentWindow, 'https://example.test/page', ownExtensionId)
    expect(forwarded?.entry.stack).toHaveLength(MAX_CONSOLE_STACK_LENGTH)
  })

  it('accepts only marked messages from the same window', () => {
    const bridgeMessage = createConsoleBridgeMessage('warn', ['check this'], 5678)
    expect(createForwardedConsoleLogMessage(
      { source: {}, data: bridgeMessage }, currentWindow, 'https://example.test/page', ownExtensionId,
    )).toBeNull()
    expect(createForwardedConsoleLogMessage(
      { source: currentWindow, data: { entry: bridgeMessage.entry } }, currentWindow, 'https://example.test/page', ownExtensionId,
    )).toBeNull()
    expect(createForwardedConsoleLogMessage(
      { source: currentWindow, data: bridgeMessage }, currentWindow, 'https://example.test/page', ownExtensionId,
    )).toMatchObject({
      type: 'CONSOLE_LOG',
      entry: { level: 'warn', message: 'check this', timestamp: 5678, source: 'page' },
    })
  })

  it('removes bridge and trampoline frames while preserving the first foreign frame', () => {
    const stack = [
      'Error',
      '    at createCaptureStack (chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/content/consoleMainWorld.js:2:10)',
      '    at postConsoleEntry (chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/content/consoleMainWorld.js:2:20)',
      '    at tabzConsoleTrampoline (https://example.test/page:1:1)',
      '    at render (https://example.test/app.js:6:7)',
    ].join('\n')
    expect(stripConsoleBridgeFrames(stack)).toBe('Error\n    at render (https://example.test/app.js:6:7)')
  })

  it('preserves Error stacks and synthesizes warning/error stacks only', () => {
    const error = new Error('failed')
    error.stack = 'Error: failed\n    at run (https://example.test/app.js:1:2)'
    expect(createConsoleBridgeMessage('error', [error], 123).entry.stack).toBe(error.stack)
    expect(createConsoleBridgeMessage('warn', ['warning'], 123).entry.stack).toBeTruthy()
    expect(createConsoleBridgeMessage('log', ['note'], 123).entry.stack).toBeUndefined()
  })

  it('classifies page, foreign extension, unrelated and missing origins', () => {
    expect(classifyConsoleEntryOrigin(
      'Error\n    at run (https://example.test/app.js:4:5)', 'https://example.test/page', ownExtensionId,
    )).toBe('page')
    expect(classifyConsoleEntryOrigin(
      'Error\n    at run (chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/app.js:4:5)',
      'https://example.test/page', ownExtensionId,
    )).toBe('extension:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')
    expect(classifyConsoleEntryOrigin(
      'Error\n    at run (https://other.test/app.js:4:5)', 'https://example.test/page', ownExtensionId,
    )).toBe('unknown')
    expect(classifyConsoleEntryOrigin(undefined, 'https://example.test/page', ownExtensionId)).toBe('unknown')
  })

  it('does not skip a URL-less first frame when classifying origin', () => {
    expect(classifyConsoleEntryOrigin(
      'Error\n    at nativeHandler (native)\n    at run (https://example.test/app.js:4:5)',
      'https://example.test/page', ownExtensionId,
    )).toBe('unknown')
  })

  it('bounds marked bridge traffic and resets its window', () => {
    let now = 100
    const accept = createConsoleBridgeRateLimiter(() => now)
    expect(Array.from({ length: MAX_BRIDGE_EVENTS_PER_WINDOW }, accept).every(Boolean)).toBe(true)
    expect(accept()).toBe(false)
    now += BRIDGE_RATE_WINDOW_MS
    expect(accept()).toBe(true)
  })
})
