import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaptureDeadlineError, CaptureScheduler, captureDeadline } from '@/background/browserMcp/captureScheduler'

describe('CaptureScheduler', () => {
  let starts: Array<{ tabId: number; at: number }> = []

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    starts = []
  })

  afterEach(() => vi.useRealTimers())

  function capture(scheduler: CaptureScheduler, tabId: number, deadline: number, events: string[]) {
    return scheduler.run(deadline, transaction => transaction.captureTargeted(tabId, async () => {
      starts.push({ tabId, at: Date.now() })
      events.push(`capture-${tabId}`)
      return `shot-${tabId}`
    }))
  }

  it('runs cross-tab transactions FIFO and spaces global target-bound captures', async () => {
    const scheduler = new CaptureScheduler({ maxCallsPerSecond: 2, boundaryMarginMs: 25 })
    const events: string[] = []
    const first = capture(scheduler, 10, 5000, events)
    const second = capture(scheduler, 20, 5000, events)

    await vi.advanceTimersByTimeAsync(524)
    expect(starts).toEqual([{ tabId: 10, at: 0 }])
    await vi.advanceTimersByTimeAsync(1)
    await expect(Promise.all([first, second])).resolves.toEqual(['shot-10', 'shot-20'])
    expect(starts).toEqual([{ tabId: 10, at: 0 }, { tabId: 20, at: 525 }])
    expect(events).toEqual(['capture-10', 'capture-20'])
  })

  it('removes an expired queued transaction before its capture callback runs', async () => {
    const scheduler = new CaptureScheduler({ maxCallsPerSecond: 2 })
    const blocker = scheduler.run(2000, transaction => transaction.wait(1000))
    const expired = capture(scheduler, 20, 100, []).catch(error => error)

    await vi.advanceTimersByTimeAsync(100)
    expect(await expired).toBeInstanceOf(CaptureDeadlineError)
    expect(starts).toEqual([])
    await vi.advanceTimersByTimeAsync(900)
    await blocker
  })

  it('reserves a quota slot after a rejected target-bound capture', async () => {
    const scheduler = new CaptureScheduler({ maxCallsPerSecond: 2, boundaryMarginMs: 25 })
    const first = scheduler.run(5000, transaction => transaction.captureTargeted(10, async () => {
      starts.push({ tabId: 10, at: Date.now() })
      throw new Error('capture refused')
    })).catch(error => error)
    const second = capture(scheduler, 20, 5000, [])

    await vi.advanceTimersByTimeAsync(525)
    expect(await first).toMatchObject({ message: 'capture refused' })
    await expect(second).resolves.toBe('shot-20')
    expect(starts).toEqual([{ tabId: 10, at: 0 }, { tabId: 20, at: 525 }])
  })

  it('keeps every strip in one scheduled transaction ahead of another tab', async () => {
    const scheduler = new CaptureScheduler({ maxCallsPerSecond: 2, boundaryMarginMs: 25 })
    const events: string[] = []
    const strips = scheduler.run(5000, async transaction => {
      await transaction.captureTargeted(10, async () => { starts.push({ tabId: 10, at: Date.now() }); events.push('strip-1') })
      await transaction.captureTargeted(10, async () => { starts.push({ tabId: 10, at: Date.now() }); events.push('strip-2') })
    })
    const competitor = capture(scheduler, 20, 5000, events)

    await vi.advanceTimersByTimeAsync(1050)
    await Promise.all([strips, competitor])
    expect(starts).toEqual([{ tabId: 10, at: 0 }, { tabId: 10, at: 525 }, { tabId: 20, at: 1050 }])
    expect(events).toEqual(['strip-1', 'strip-2', 'capture-20'])
  })

  it('expires during quota wait without a late capture', async () => {
    const scheduler = new CaptureScheduler({ maxCallsPerSecond: 2, boundaryMarginMs: 25 })
    const first = capture(scheduler, 10, 5000, [])
    const second = capture(scheduler, 20, 500, []).catch(error => error)

    await vi.advanceTimersByTimeAsync(500)
    await first
    expect(await second).toBeInstanceOf(CaptureDeadlineError)
    expect(starts).toEqual([{ tabId: 10, at: 0 }])
  })

  it('reserves response headroom and clips small relative budgets to zero', () => {
    vi.setSystemTime(10000)
    expect(captureDeadline(30000, 5000)).toBe(39000)
    expect(captureDeadline(500, 5000)).toBe(10000)
    expect(captureDeadline(undefined, 5000)).toBe(15000)
  })
})
