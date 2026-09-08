/** Pure, value-free helpers for the manual login prompt probe. */

export const AUTH_URL_PATTERN =
  /(^|[./_-])(login|log-in|logon|signin|sign-in|sign_in|auth|authorize|oauth|oidc|saml|sso|idp|okta|mfa|2fa|otp|challenge|verify|passwd|password|session)([./_?#-]|$)/i

export interface LoginProbe {
  passwordInputs: number
  oneTimeCodeInputs: number
  identifierInputs: number
}

export interface LoginStateInput extends LoginProbe {
  url: string
}

export interface LoginState {
  url: string
  host: string
  authUrl: boolean
  hasPasswordField: boolean
  hasLoginForm: boolean
}

export function isAuthUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return AUTH_URL_PATTERN.test(`${parsed.hostname}${parsed.pathname}`)
  } catch {
    return false
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

/** Remove URL components that commonly carry credentials or OAuth tokens. */
export function sanitizeLoginUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return ''
  }
}

export function classifyLoginState(input: LoginStateInput): LoginState {
  const authUrl = isAuthUrl(input.url)
  const hasPasswordField = input.passwordInputs > 0
  const hasCredentialInput = hasPasswordField || input.oneTimeCodeInputs > 0
  return {
    url: sanitizeLoginUrl(input.url),
    host: hostOf(input.url),
    authUrl,
    hasPasswordField,
    hasLoginForm: hasCredentialInput || (authUrl && input.identifierInputs > 0)
  }
}
