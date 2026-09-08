/**
 * Browser MCP - screenshot save paths
 *
 * chrome.downloads can only write inside the user's Downloads folder, so
 * every path here is RELATIVE to it and forward-slashed. This module is pure:
 * it takes the configured folder, the per-connection toggle, the connection's
 * label or id, the capture kind, a timestamp, and an optional per-call
 * outputPath, and answers the single filename handed to
 * chrome.downloads.download. Keeping it free of chrome APIs is what makes the
 * rules testable.
 */

/** Where captures land when the user has configured nothing. */
export const DEFAULT_SCREENSHOT_FOLDER = 'tabz/screenshots'

/** chrome.storage.local keys the MCP Settings page writes and captures read. */
export const SCREENSHOT_FOLDER_KEY = 'screenshotFolder'
export const SCREENSHOT_PER_CONNECTION_KEY = 'screenshotPerConnection'

/** The subfolder used when a connection has neither a label nor an id. */
export const DEFAULT_CONNECTION_SEGMENT = 'default'

/** How many characters of a connection id name its subfolder. */
const SHORT_CONNECTION_ID_LENGTH = 8

export type ScreenshotKind = 'viewport' | 'full' | 'zoom' | 'element'

export interface ScreenshotFolderResult {
  /** The folder to save under, always valid and never empty. */
  folder: string
  /**
   * Set when the configured value was rejected and the default is being used
   * instead. The caller logs it once rather than on every capture.
   */
  invalidReason?: string
}

export interface ScreenshotPathInput {
  /** The configured folder, straight from storage (may be anything). */
  folder?: unknown
  /** Whether each connection gets its own subfolder. Defaults to false. */
  perConnection?: boolean
  /** The connection's group title (TABZ_AGENT_LABEL / X-Tabz-Agent). */
  connectionLabel?: string
  /** The connection id the MCP request carried, when there is no label. */
  connectionId?: string
  /** What was captured, which picks the default file name. */
  kind: ScreenshotKind
  /** Filename-safe timestamp, e.g. new Date().toISOString() with : and . replaced. */
  timestamp: string
  /** Per-call override from tabz_act's screenshot action. */
  outputPath?: string
}

/** Thrown for an outputPath chrome.downloads could never write. */
export class ScreenshotPathError extends Error {}

const DRIVE_LETTER = /^[A-Za-z]:/
const SAFE_SEGMENT_CHARS = /[^A-Za-z0-9._-]+/g
const INVALID_SEGMENT_CHARS = /[\u0000-\u001f\u007f<>:"|?*]/
const RESERVED_SEGMENT = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/**
 * Split a relative path into clean segments, or say why it cannot be one.
 * Rejects backslashes (Downloads paths are forward-slashed), a leading slash
 * or drive letter (both mean "outside Downloads"), and any `..` segment.
 */
function parseRelativePath(raw: string): { segments: string[] } | { error: string } {
  if (/[\u0000-\u001f\u007f]/.test(raw)) {
    return { error: 'control characters are not allowed in a Downloads path' }
  }
  const value = raw.trim()
  if (!value) return { segments: [] }
  if (value.includes('\\')) {
    return { error: 'use forward slashes, not backslashes' }
  }
  if (DRIVE_LETTER.test(value)) {
    return { error: 'a drive letter is outside the Downloads folder' }
  }
  if (value.startsWith('/')) {
    return { error: 'an absolute path is outside the Downloads folder' }
  }

  const segments: string[] = []
  for (const segment of value.split('/')) {
    const trimmed = segment.trim()
    if (trimmed === '' || trimmed === '.') continue
    if (trimmed === '..') {
      return { error: '".." is not allowed in a Downloads path' }
    }
    if (INVALID_SEGMENT_CHARS.test(trimmed) || trimmed.endsWith('.') || RESERVED_SEGMENT.test(trimmed)) {
      return { error: 'use folder and file names supported on all platforms; avoid reserved names, trailing dots and <>:"|?*' }
    }
    if (new TextEncoder().encode(trimmed).length > 255) {
      return { error: 'each folder or file name must fit within 255 UTF-8 bytes' }
    }
    segments.push(trimmed)
  }
  return { segments }
}

/**
 * Validate the configured folder. Anything unusable falls back to the default
 * and reports why, so the caller can log it once instead of failing a capture.
 */
export function normalizeScreenshotFolder(value: unknown): ScreenshotFolderResult {
  if (value === undefined || value === null) {
    return { folder: DEFAULT_SCREENSHOT_FOLDER }
  }
  if (typeof value !== 'string') {
    return {
      folder: DEFAULT_SCREENSHOT_FOLDER,
      invalidReason: 'the screenshot folder setting must be text'
    }
  }
  if (value.trim() === '') {
    // An empty box means "unset", not "broken": no warning.
    return { folder: DEFAULT_SCREENSHOT_FOLDER }
  }

  const parsed = parseRelativePath(value)
  if ('error' in parsed) {
    return {
      folder: DEFAULT_SCREENSHOT_FOLDER,
      invalidReason: `screenshot folder "${value}" ignored: ${parsed.error}`
    }
  }
  if (parsed.segments.length === 0) {
    return { folder: DEFAULT_SCREENSHOT_FOLDER }
  }
  return { folder: parsed.segments.join('/') }
}

/**
 * The subfolder name for one MCP connection: its label when it has one (the
 * tab group title, from TABZ_AGENT_LABEL or X-Tabz-Agent), else a short slice
 * of its connection id, else a shared "default".
 */
export function connectionFolderSegment(label?: string, connectionId?: string): string {
  const fromLabel = sanitizeSegment(label)
  if (fromLabel) return fromLabel

  const fromId = sanitizeSegment(connectionId?.slice(0, SHORT_CONNECTION_ID_LENGTH))
  if (fromId) return fromId

  return DEFAULT_CONNECTION_SEGMENT
}

/** Reduce a name to [A-Za-z0-9._-], collapsing anything else to a dash. */
function sanitizeSegment(value?: string): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value
    .trim()
    .replace(SAFE_SEGMENT_CHARS, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, 80)
    .replace(/[-.]+$/, '')
  return cleaned ? (RESERVED_SEGMENT.test(cleaned) ? `_${cleaned}` : cleaned) : undefined
}

/** The default file name for a capture, by what was captured. */
export function defaultScreenshotFileName(kind: ScreenshotKind, timestamp: string): string {
  switch (kind) {
    case 'full':
      return `screenshot-full-${timestamp}.png`
    case 'zoom':
      return `screenshot-zoom-${timestamp}.png`
    case 'element':
      return `screenshot-element-${timestamp}.png`
    default:
      return `screenshot-${timestamp}.png`
  }
}

/**
 * Build the chrome.downloads filename for one capture.
 *
 * An explicit outputPath still wins and remains relative to Downloads, as in
 * the legacy screenshot API. A ".." anywhere in it is refused rather than
 * quietly rewritten.
 */
export function buildScreenshotPath(input: ScreenshotPathInput): {
  filename: string
  folder: string
  invalidReason?: string
} {
  const { folder, invalidReason } = normalizeScreenshotFolder(input.folder)
  const perConnection = input.perConnection === true
  const base = perConnection
    ? `${folder}/${connectionFolderSegment(input.connectionLabel, input.connectionId)}`
    : folder

  if (input.outputPath !== undefined && input.outputPath.trim() !== '') {
    const parsed = parseRelativePath(input.outputPath)
    if ('error' in parsed) {
      throw new ScreenshotPathError(
        `outputPath "${input.outputPath}" is not a path inside the Downloads folder: ${parsed.error}`
      )
    }
    if (parsed.segments.length === 0) {
      throw new ScreenshotPathError('outputPath is empty; give a file name relative to Downloads')
    }

    const requested = parsed.segments.join('/')
    return {
      // Preserve the legacy contract: an explicit outputPath is already
      // relative to Downloads and is not rewritten under a configured folder.
      filename: requested,
      folder,
      ...(invalidReason ? { invalidReason } : {})
    }
  }

  return {
    filename: `${base}/${defaultScreenshotFileName(input.kind, input.timestamp)}`,
    folder,
    ...(invalidReason ? { invalidReason } : {})
  }
}
