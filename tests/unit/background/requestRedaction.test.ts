import { describe, expect, it } from 'vitest'
import { redactBody, redactFormData, redactHeaders, redactTextPayload } from '../../../extension/background/requestRedaction'

const SENTINEL = 'SENTINEL-SECRET-9274'

describe('request redaction', () => {
  it('redacts urlencoded credential fields and keeps ordinary fields', () => {
    const result = redactBody(`username=alice&password=${SENTINEL}&api_key=k&keep=yes`, 'application/x-www-form-urlencoded')
    expect(result.postData).toBe('username=alice&password=%5Bredacted%5D&api_key=%5Bredacted%5D&keep=yes')
    expect(JSON.stringify(result)).not.toContain(SENTINEL)
  })

  it('redacts nested JSON keys recursively', () => {
    const body = JSON.stringify({ user: 'alice', credentials: { password: SENTINEL, nested: { apiKey: SENTINEL, keep: 'x' } }, tokens: [SENTINEL] })
    const result = redactBody(body, 'application/json')
    expect(JSON.parse(result.postData!)).toEqual({
      user: 'alice',
      credentials: { password: '[redacted]', nested: { apiKey: '[redacted]', keep: 'x' } },
      tokens: '[redacted]'
    })
    expect(JSON.stringify(result)).not.toContain(SENTINEL)
  })

  it('redacts parsed form data and preserves useful ordinary values', () => {
    const result = redactFormData({ username: ['alice'], Secret: [SENTINEL], card_number: [SENTINEL], keep: ['ok'] }, 'multipart/form-data')
    expect(JSON.parse(result.postData!)).toEqual({
      username: ['alice'], Secret: ['[redacted]'], card_number: ['[redacted]'], keep: ['ok']
    })
    expect(JSON.stringify(result)).not.toContain(SENTINEL)
  })

  it('drops opaque and malformed typed bodies while retaining metadata', () => {
    const opaque = redactBody(SENTINEL, 'application/octet-stream')
    expect(opaque).toEqual({ postDataContentType: 'application/octet-stream', postDataByteLength: SENTINEL.length })
    const malformed = redactBody(`{"password":"${SENTINEL}`, 'application/json')
    expect(malformed.postData).toBe('[redacted]')
    expect(JSON.stringify([opaque, malformed])).not.toContain(SENTINEL)
  })

  it('redacts sensitive JSON fields in captured text payloads', () => {
    const result = redactTextPayload(JSON.stringify({ error: 'useful', password: SENTINEL, nested: { token: SENTINEL } }))
    expect(JSON.parse(result)).toEqual({ error: 'useful', password: '[redacted]', nested: { token: '[redacted]' } })
    expect(result).not.toContain(SENTINEL)
  })

  it('redacts request and response credential headers', () => {
    const result = redactHeaders({
      Cookie: `session=${SENTINEL}`,
      'Set-Cookie': `session=${SENTINEL}`,
      Authorization: `Bearer ${SENTINEL}`,
      'Proxy-Authorization': SENTINEL,
      'X-Api-Key': SENTINEL,
      'X-Csrf-Token': SENTINEL,
      'Content-Type': 'application/json'
    })
    expect(result['Content-Type']).toBe('application/json')
    expect(JSON.stringify(result)).not.toContain(SENTINEL)
    expect(Object.values(result).filter(value => value === '[redacted]')).toHaveLength(6)
  })
})
