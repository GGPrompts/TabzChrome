/** Pure redaction helpers used before captured request data is stored. */

const REDACTED = '[redacted]'
const SENSITIVE_KEY_PATTERN = /pass(word|wd)?|pwd|secret|token|api[_-]?key|authorization|otp|mfa|cvv|card/i
const SENSITIVE_HEADER_EXACT = new Set([
  'cookie',
  'set-cookie',
  'authorization',
  'proxy-authorization',
  'x-api-key'
])

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key)
}

export interface RedactedBody {
  postData?: string
  postDataContentType?: string
  postDataByteLength?: number
}

function redactJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactJsonValue)
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactJsonValue(child)
    }
    return out
  }
  return value
}

function sniffContentType(body: string): string | undefined {
  const trimmed = body.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(trimmed)
      return 'application/json'
    } catch {
      // Try the bounded urlencoded grammar below.
    }
  }
  return /^[^=&\s]+=[^&]*(&[^=&\s]+=[^&]*)*$/.test(trimmed)
    ? 'application/x-www-form-urlencoded'
    : undefined
}

function redactUrlEncoded(body: string): string {
  const out = new URLSearchParams()
  for (const [key, value] of new URLSearchParams(body).entries()) {
    out.append(key, isSensitiveKey(key) ? REDACTED : value)
  }
  return out.toString()
}

function redactJson(body: string): string {
  try {
    return JSON.stringify(redactJsonValue(JSON.parse(body)))
  } catch {
    return REDACTED
  }
}

export function redactBody(body: string, contentType?: string): RedactedBody {
  const byteLength = new TextEncoder().encode(body).length
  const effectiveType = (contentType ?? sniffContentType(body))?.toLowerCase()
  if (effectiveType?.includes('application/x-www-form-urlencoded')) {
    return { postData: redactUrlEncoded(body), postDataContentType: contentType, postDataByteLength: byteLength }
  }
  if (effectiveType?.includes('json')) {
    return { postData: redactJson(body), postDataContentType: contentType, postDataByteLength: byteLength }
  }
  return { postDataContentType: contentType, postDataByteLength: byteLength }
}

export function redactTextPayload(text: string): string {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return text
  try {
    const parsed = JSON.parse(trimmed)
    return parsed !== null && typeof parsed === 'object'
      ? JSON.stringify(redactJsonValue(parsed))
      : text
  } catch {
    return text
  }
}

export function redactFormData(formData: Record<string, string[]>, contentType?: string): RedactedBody {
  const redacted: Record<string, string[]> = {}
  for (const [key, values] of Object.entries(formData)) {
    redacted[key] = isSensitiveKey(key) ? values.map(() => REDACTED) : values
  }
  const original = JSON.stringify(formData)
  return {
    postData: JSON.stringify(redacted),
    postDataContentType: contentType,
    postDataByteLength: new TextEncoder().encode(original).length
  }
}

export function redactHeaders(record: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [name, value] of Object.entries(record)) {
    const lower = name.toLowerCase()
    out[name] = SENSITIVE_HEADER_EXACT.has(lower) || lower.includes('token') || lower.includes('secret')
      ? REDACTED
      : value
  }
  return out
}
