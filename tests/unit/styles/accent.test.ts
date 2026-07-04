import { describe, it, expect, beforeEach } from 'vitest'
import { resetChromeStorage, setChromeStorageData, getChromeStorageData } from '../../setup'
import {
  resolveAccent,
  hexWithAlpha,
  glowShadow,
  loadAccentSettings,
  saveAccentSettings,
  applyAccentToCssVars,
  DEFAULT_ACCENT,
  DEFAULT_GLOW_ENABLED,
  ACCENT_SETTINGS_KEY,
  ACCENT_PRESETS,
} from '../../../extension/styles/accent'

describe('resolveAccent', () => {
  it('falls back to default green when nothing set', () => {
    expect(resolveAccent(undefined, {})).toEqual({ color: DEFAULT_ACCENT, glow: DEFAULT_GLOW_ENABLED })
  })
  it('uses global when no per-terminal override', () => {
    expect(resolveAccent(undefined, { accentColor: '#3b82f6', glowEnabled: false }))
      .toEqual({ color: '#3b82f6', glow: false })
  })
  it('per-terminal override wins over global', () => {
    expect(resolveAccent({ accentColor: '#ffffff' }, { accentColor: '#3b82f6' }))
      .toEqual({ color: '#ffffff', glow: DEFAULT_GLOW_ENABLED })
  })
  it('resolves glow independently of color', () => {
    expect(resolveAccent({ glowEnabled: false }, { accentColor: '#3b82f6', glowEnabled: true }))
      .toEqual({ color: '#3b82f6', glow: false })
  })
})

describe('hexWithAlpha', () => {
  it('appends a 2-digit alpha for full opacity', () => {
    expect(hexWithAlpha('#00ff88', 1)).toBe('#00ff88ff')
  })
  it('computes ~12% alpha', () => {
    expect(hexWithAlpha('#00ff88', 0.12)).toBe('#00ff881f')
  })
  it('clamps out-of-range alpha', () => {
    expect(hexWithAlpha('#00ff88', 2)).toBe('#00ff88ff')
    expect(hexWithAlpha('#00ff88', -1)).toBe('#00ff8800')
  })
})

describe('glowShadow', () => {
  it('includes the color and a blur radius', () => {
    const s = glowShadow('#3b82f6')
    expect(s).toContain('#3b82f6')
    expect(s).toMatch(/px/)
  })
})

describe('storage', () => {
  beforeEach(() => resetChromeStorage())
  it('returns empty object when unset', async () => {
    expect(await loadAccentSettings()).toEqual({})
  })
  it('round-trips saved settings and merges partials', async () => {
    await saveAccentSettings({ accentColor: '#3b82f6' })
    await saveAccentSettings({ glowEnabled: false })
    expect(await loadAccentSettings()).toEqual({ accentColor: '#3b82f6', glowEnabled: false })
    expect(getChromeStorageData()[ACCENT_SETTINGS_KEY]).toEqual({ accentColor: '#3b82f6', glowEnabled: false })
  })
})

describe('applyAccentToCssVars', () => {
  it('sets --color-primary/accent/ring on the given root', () => {
    const el = document.createElement('div')
    applyAccentToCssVars('#3b82f6', el)
    expect(el.style.getPropertyValue('--color-primary')).toBe('#3b82f6')
    expect(el.style.getPropertyValue('--color-accent')).toBe('#3b82f6')
    expect(el.style.getPropertyValue('--color-ring')).toBe('#3b82f6')
  })
})

describe('presets', () => {
  it('includes green, blue and white', () => {
    const values = ACCENT_PRESETS.map(p => p.value.toLowerCase())
    expect(values).toContain('#00ff88')
    expect(values).toContain('#3b82f6')
    expect(values).toContain('#ffffff')
  })
})
