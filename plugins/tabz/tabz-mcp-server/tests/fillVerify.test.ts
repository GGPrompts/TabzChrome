import { describe, expect, it } from 'vitest'
import { describeFillResult } from '../src/tools/interaction.js'

const SECRET = 'never-show-this-value'

describe('describeFillResult', () => {
  it('reports success only for an explicitly verified ordinary read-back', () => {
    const result = describeFillResult('#city', 'Denver', {
      success: true,
      verified: true,
      sensitive: false,
      actualLength: 6,
      actualValue: 'Denver'
    })

    expect(result.isError).toBe(false)
    expect(result.text).toContain('Fill Successful')
    expect(result.text).toContain('"Denver"')
    expect(result.text).toContain('read back')
  })

  it('renders an explicitly verified boolean checked state', () => {
    const result = describeFillResult('#agree', true, {
      success: true,
      verified: true,
      sensitive: false,
      actualValue: true
    })

    expect(result.isError).toBe(false)
    expect(result.text).toContain('**Value:** true')
  })

  it('treats a false read-back verdict as an error without presenting it as confirmed', () => {
    const result = describeFillResult('#zip', '802021234', {
      success: true,
      verified: false,
      sensitive: false,
      actualLength: 5,
      actualValue: '80202'
    })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('FAILED verification')
    expect(result.text).toContain('[redacted] (5 chars)')
    expect(result.text).toContain('do NOT submit')
  })

  it('treats a missing verdict as unverified', () => {
    const result = describeFillResult('#legacy', 'value', { success: true })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('UNVERIFIED')
    expect(result.text).not.toContain('Fill Successful')
  })

  it('keeps sensitive requested and actual values out of the result', () => {
    const result = describeFillResult('#password', SECRET, {
      success: true,
      verified: false,
      sensitive: true,
      actualLength: 3
    })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('[redacted] (3 chars)')
    expect(result.text).toContain(`[redacted] (${SECRET.length} chars)`)
    expect(result.text).not.toContain(SECRET)
  })

  it('scrubs a submitted value quoted by a backend failure', () => {
    const result = describeFillResult('#name', SECRET, {
      success: false,
      error: 'Rejected [redacted]'
    })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('Rejected [redacted]')
    expect(result.text).not.toContain(SECRET)
  })
})
