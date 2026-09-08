export const SENSITIVE_FIELD_PATTERN = /pass(word)?|pwd|secret|token|otp|one-time-code|mfa|api[_-]?key|cvv|cc-|card/i

export function isSensitiveInput(
  tag: string | undefined,
  type: string | undefined,
  name: string | undefined,
  id: string | undefined,
  autocomplete: string | undefined
): boolean {
  if ((tag || '').toLowerCase() === 'input' && (type || '').toLowerCase() === 'password') return true
  return [name, id, autocomplete].some(value => !!value && SENSITIVE_FIELD_PATTERN.test(value))
}
