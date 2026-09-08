/**
 * One extension-wide queue for screenshot transactions.
 *
 * Chrome applies capture quotas across every tab and window. The queue owns
 * the complete transaction while the transaction context owns quota spacing
 * and deadline checks at each capture boundary. The actual capture callback is
 * supplied by the caller so it can stay bound to an exact debugger target.
 */

const FALLBACK_CAPTURE_CALLS_PER_SECOND = 2
const DEFAULT_BOUNDARY_MARGIN_MS = 25
const RESPONSE_MARGIN_MS = 1000
type Timer = ReturnType<typeof setTimeout>
type EntryState = 'queued' | 'running' | 'expired' | 'settled'

export class CaptureDeadlineError extends Error {
  constructor() {
    super('Screenshot capture request expired before it could complete')
    this.name = 'CaptureDeadlineError'
  }
}

export interface CaptureTransaction {
  readonly deadline: number
  remainingMs(): number
  throwIfExpired(): void
  wait(delayMs: number): Promise<void>
  captureTargeted<T>(tabId: number, capture: () => Promise<T>): Promise<T>
}

interface QueueEntry {
  deadline: number
  state: EntryState
  timer?: Timer
  task: (transaction: CaptureTransaction) => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

function chromeCaptureLimit(): number {
  const value = (chrome.tabs as typeof chrome.tabs & {
    MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND?: number
  }).MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : FALLBACK_CAPTURE_CALLS_PER_SECOND
}

export function captureDeadline(requestTimeout: number | undefined, fallbackMs: number): number {
  const budget = typeof requestTimeout === 'number' && Number.isFinite(requestTimeout)
    ? Math.max(0, requestTimeout - RESPONSE_MARGIN_MS)
    : fallbackMs
  return Date.now() + budget
}

export class CaptureScheduler {
  private readonly spacingMs: number
  private readonly queue: QueueEntry[] = []
  private activeEntry: QueueEntry | undefined
  private draining = false
  private nextCaptureStartAt = 0

  constructor(options: { maxCallsPerSecond?: number; boundaryMarginMs?: number } = {}) {
    const maxCalls = options.maxCallsPerSecond ?? chromeCaptureLimit()
    const margin = options.boundaryMarginMs ?? DEFAULT_BOUNDARY_MARGIN_MS
    this.spacingMs = Math.ceil(1000 / Math.max(1, Math.floor(maxCalls))) + Math.max(0, margin)
  }

  run<T>(deadline: number, task: (transaction: CaptureTransaction) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (deadline <= Date.now()) {
        reject(new CaptureDeadlineError())
        return
      }

      const entry: QueueEntry = {
        deadline,
        state: 'queued',
        task,
        resolve: value => resolve(value as T),
        reject
      }
      entry.timer = setTimeout(() => this.expire(entry), Math.max(0, deadline - Date.now()))
      this.queue.push(entry)
      void this.drain()
    })
  }

  /** Test isolation for the module singleton. Only valid while it is idle. */
  resetForTests(): void {
    if (this.activeEntry || this.queue.length > 0) {
      throw new Error('Cannot reset an active capture scheduler')
    }
    this.nextCaptureStartAt = 0
  }

  private expire(entry: QueueEntry): void {
    if (entry.state === 'queued') {
      entry.state = 'expired'
      const index = this.queue.indexOf(entry)
      if (index >= 0) this.queue.splice(index, 1)
      entry.reject(new CaptureDeadlineError())
      return
    }
    if (entry.state === 'running') entry.state = 'expired'
  }

  private async drain(): Promise<void> {
    if (this.draining) return
    this.draining = true
    try {
      while (this.queue.length > 0) {
        const entry = this.queue.shift()!
        if (entry.state !== 'queued' || entry.deadline <= Date.now()) {
          if (entry.timer) clearTimeout(entry.timer)
          if (entry.state === 'queued') entry.reject(new CaptureDeadlineError())
          entry.state = 'settled'
          continue
        }

        entry.state = 'running'
        this.activeEntry = entry
        const transaction = this.transactionFor(entry)
        try {
          const value = await entry.task(transaction)
          transaction.throwIfExpired()
          entry.resolve(value)
        } catch (error) {
          entry.reject(error)
        } finally {
          if (entry.timer) clearTimeout(entry.timer)
          entry.state = 'settled'
          this.activeEntry = undefined
        }
      }
    } finally {
      this.draining = false
      if (this.queue.length > 0) void this.drain()
    }
  }

  private transactionFor(entry: QueueEntry): CaptureTransaction {
    const throwIfExpired = () => {
      if (entry.state === 'expired' || Date.now() >= entry.deadline) {
        throw new CaptureDeadlineError()
      }
    }

    const wait = async (delayMs: number) => {
      throwIfExpired()
      const remaining = entry.deadline - Date.now()
      const boundedDelay = Math.min(Math.max(0, delayMs), remaining)
      if (boundedDelay > 0) {
        await new Promise<void>(resolve => setTimeout(resolve, boundedDelay))
      }
      throwIfExpired()
    }

    return {
      deadline: entry.deadline,
      remainingMs: () => Math.max(0, entry.deadline - Date.now()),
      throwIfExpired,
      wait,
      captureTargeted: async (_tabId, capture) => {
        throwIfExpired()
        const quotaWait = this.nextCaptureStartAt - Date.now()
        if (quotaWait > 0) await wait(quotaWait)
        throwIfExpired()

        // Reserve before invoking Chrome. A rejected call still consumed one
        // quota attempt and the next transaction must retain the spacing.
        this.nextCaptureStartAt = Date.now() + this.spacingMs
        const result = await capture()
        throwIfExpired()
        return result
      }
    }
  }
}

export const captureScheduler = new CaptureScheduler()
