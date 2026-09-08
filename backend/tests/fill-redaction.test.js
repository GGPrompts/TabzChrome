import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { redactSubmittedValue } = require('../routes/browser.js')

describe('fill response redaction', () => {
  it('removes the submitted value from nested result and error fields', () => {
    const sentinel = 'SENTINEL-FILL-SECRET'
    const result = redactSubmittedValue({
      success: false,
      error: `Rejected ${sentinel}`,
      nested: { actualValue: sentinel, details: [`read ${sentinel}`] },
      diagnostic: 'selector detached'
    }, sentinel)
    expect(JSON.stringify(result)).not.toContain(sentinel)
    expect(result.error).toBe('Rejected [redacted]')
    expect(result.diagnostic).toBe('selector detached')
  })
})
