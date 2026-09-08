import { describe, expect, it } from 'vitest'

/**
 * SCREENSHOT SAVE PATHS. chrome.downloads can only write inside
 * the user's Downloads folder, so every path the extension hands it is
 * relative to it. The rules that decide the filename live in one pure module
 * and are pinned here: the folder is a validated setting, the per-connection
 * subfolder is the connection's label (else a short slice of its id), and an
 * explicit outputPath remains Downloads-relative regardless of the setting.
 */
import {
  DEFAULT_SCREENSHOT_FOLDER,
  ScreenshotPathError,
  buildScreenshotPath,
  connectionFolderSegment,
  defaultScreenshotFileName,
  normalizeScreenshotFolder
} from '@/background/browserMcp/screenshotPaths'

const TS = '2026-09-04T12-00-00-000Z'

describe('normalizeScreenshotFolder', () => {
  it('defaults when nothing is configured', () => {
    expect(normalizeScreenshotFolder(undefined)).toEqual({ folder: DEFAULT_SCREENSHOT_FOLDER })
    expect(normalizeScreenshotFolder(null)).toEqual({ folder: DEFAULT_SCREENSHOT_FOLDER })
  })

  it('treats an empty box as unset, with no warning', () => {
    expect(normalizeScreenshotFolder('')).toEqual({ folder: DEFAULT_SCREENSHOT_FOLDER })
    expect(normalizeScreenshotFolder('   ')).toEqual({ folder: DEFAULT_SCREENSHOT_FOLDER })
  })

  it('keeps a valid nested folder and trims stray slashes', () => {
    expect(normalizeScreenshotFolder('shots')).toEqual({ folder: 'shots' })
    expect(normalizeScreenshotFolder('work/shots/')).toEqual({ folder: 'work/shots' })
    expect(normalizeScreenshotFolder('work//shots')).toEqual({ folder: 'work/shots' })
    expect(normalizeScreenshotFolder('  work/shots  ')).toEqual({ folder: 'work/shots' })
  })

  it('falls back to the default and says why for a path outside Downloads', () => {
    for (const bad of ['/var/tmp', 'C:/shots', 'work\\shots', '../escape', 'work/../../escape']) {
      const result = normalizeScreenshotFolder(bad)
      expect(result.folder).toBe(DEFAULT_SCREENSHOT_FOLDER)
      expect(result.invalidReason).toBeTruthy()
    }
  })

  it('falls back when the stored value is not text', () => {
    const result = normalizeScreenshotFolder(42)
    expect(result.folder).toBe(DEFAULT_SCREENSHOT_FOLDER)
    expect(result.invalidReason).toContain('must be text')
  })

  it('rejects non-portable names before they reach Chrome downloads', () => {
    for (const bad of ['work/CON', 'aux.png', 'LPT1', 'work/trailing.', 'work/a:b', 'work/a?b', 'work/line\nbreak', 'work/\u0000', 'é'.repeat(128)]) {
      expect(normalizeScreenshotFolder(bad).invalidReason, bad).toBeTruthy()
      expect(() => buildScreenshotPath({ kind: 'viewport', timestamp: TS, outputPath: bad })).toThrow(ScreenshotPathError)
    }
    expect(normalizeScreenshotFolder('résultats/captures')).toEqual({ folder: 'résultats/captures' })
  })
})

describe('connectionFolderSegment', () => {
  it('prefers the connection label, sanitized', () => {
    expect(connectionFolderSegment('Leadership Ops', 'abc123def456')).toBe('Leadership-Ops')
    expect(connectionFolderSegment('QA/2026', 'abc123def456')).toBe('QA-2026')
    expect(connectionFolderSegment('page-agent', undefined)).toBe('page-agent')
  })

  it('falls back to a short slice of the connection id', () => {
    expect(connectionFolderSegment(undefined, 'abc123def456789')).toBe('abc123de')
    expect(connectionFolderSegment('   ', 'abc123def456789')).toBe('abc123de')
  })

  it('falls back to a shared folder when there is neither', () => {
    expect(connectionFolderSegment(undefined, undefined)).toBe('default')
    // A label of only punctuation sanitizes to nothing, so it is not a label.
    expect(connectionFolderSegment('***', undefined)).toBe('default')
  })

  it('never produces a relative-path segment', () => {
    expect(connectionFolderSegment('..', undefined)).toBe('default')
    expect(connectionFolderSegment('.', undefined)).toBe('default')
  })

  it('keeps generated connection segments portable and bounded', () => {
    expect(connectionFolderSegment('CON')).toBe('_CON')
    expect(connectionFolderSegment('A'.repeat(400))).toHaveLength(80)
  })
})

describe('defaultScreenshotFileName', () => {
  it('names the capture by kind', () => {
    expect(defaultScreenshotFileName('viewport', TS)).toBe(`screenshot-${TS}.png`)
    expect(defaultScreenshotFileName('full', TS)).toBe(`screenshot-full-${TS}.png`)
    expect(defaultScreenshotFileName('zoom', TS)).toBe(`screenshot-zoom-${TS}.png`)
    expect(defaultScreenshotFileName('element', TS)).toBe(`screenshot-element-${TS}.png`)
  })
})

describe('buildScreenshotPath', () => {
  it('preserves the legacy default folder without a connection subfolder', () => {
    expect(buildScreenshotPath({ kind: 'viewport', timestamp: TS, connectionId: 'abc123def456' }).filename)
      .toBe(`tabz/screenshots/screenshot-${TS}.png`)
  })

  it('uses the connection label for the subfolder when it has one', () => {
    expect(buildScreenshotPath({
      kind: 'full',
      timestamp: TS,
      perConnection: true,
      connectionLabel: 'Leadership Ops',
      connectionId: 'abc123def456'
    }).filename).toBe(`tabz/screenshots/Leadership-Ops/screenshot-full-${TS}.png`)
  })

  it('drops the subfolder when the toggle is off', () => {
    expect(buildScreenshotPath({
      kind: 'viewport',
      timestamp: TS,
      perConnection: false,
      connectionLabel: 'Leadership Ops'
    }).filename).toBe(`tabz/screenshots/screenshot-${TS}.png`)
  })

  it('honours a configured folder', () => {
    expect(buildScreenshotPath({
      folder: 'work/shots',
      perConnection: false,
      kind: 'zoom',
      timestamp: TS
    }).filename).toBe(`work/shots/screenshot-zoom-${TS}.png`)
  })

  it('reports the invalid folder and still builds a path under the default', () => {
    const result = buildScreenshotPath({
      folder: '../escape',
      perConnection: false,
      kind: 'viewport',
      timestamp: TS
    })
    expect(result.filename).toBe(`tabz/screenshots/screenshot-${TS}.png`)
    expect(result.invalidReason).toContain('..')
  })

  it('preserves an explicit Downloads-relative outputPath', () => {
    expect(buildScreenshotPath({
      kind: 'viewport',
      timestamp: TS,
      perConnection: false,
      outputPath: 'captures/page.png'
    }).filename).toBe('captures/page.png')
  })

  it('does not rewrite an explicit outputPath when connection folders are enabled', () => {
    expect(buildScreenshotPath({
      kind: 'viewport',
      timestamp: TS,
      perConnection: true,
      connectionLabel: 'Leadership Ops',
      outputPath: 'captures/page.png'
    }).filename).toBe('captures/page.png')
  })

  it('leaves an outputPath that already names the configured folder alone', () => {
    expect(buildScreenshotPath({
      kind: 'viewport',
      timestamp: TS,
      connectionLabel: 'Leadership Ops',
      outputPath: 'tabz/screenshots/page.png'
    }).filename).toBe('tabz/screenshots/page.png')

    expect(buildScreenshotPath({
      folder: 'work/shots',
      kind: 'viewport',
      timestamp: TS,
      connectionLabel: 'QA',
      outputPath: 'work/shots/run-3/page.png'
    }).filename).toBe('work/shots/run-3/page.png')
  })

  it('refuses an outputPath that could escape the Downloads folder', () => {
    for (const bad of ['../page.png', 'captures/../../page.png', '/tmp/page.png', 'C:/page.png', 'a\\b.png']) {
      expect(() => buildScreenshotPath({ kind: 'viewport', timestamp: TS, outputPath: bad }))
        .toThrow(ScreenshotPathError)
    }
  })

  it('names the offender and the reason when it refuses', () => {
    expect(() => buildScreenshotPath({ kind: 'viewport', timestamp: TS, outputPath: '../page.png' }))
      .toThrow(/outputPath "\.\.\/page\.png".*"\.\." is not allowed/)
  })
})
