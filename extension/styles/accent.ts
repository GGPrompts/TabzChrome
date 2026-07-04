// Accent / glow color resolution and persistence.
// Single source of truth for the extension's configurable accent color.
// Fallback is the historical green (#00ff88) so behavior is unchanged until edited.

export type AccentOverride = { accentColor?: string; glowEnabled?: boolean }
export type AccentGlobals = { accentColor?: string; glowEnabled?: boolean }
export type ResolvedAccent = { color: string; glow: boolean }

export const DEFAULT_ACCENT = '#00ff88'
export const DEFAULT_GLOW_ENABLED = true
export const ACCENT_SETTINGS_KEY = 'appearanceSettings'

export const ACCENT_PRESETS = [
  { name: 'Green', value: '#00ff88' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Cyan', value: '#22d3ee' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'White', value: '#ffffff' },
] as const

/** Per-terminal override wins, else global default, else green fallback. */
export function resolveAccent(override: AccentOverride | undefined, globals: AccentGlobals): ResolvedAccent {
  return {
    color: override?.accentColor ?? globals.accentColor ?? DEFAULT_ACCENT,
    glow: override?.glowEnabled ?? globals.glowEnabled ?? DEFAULT_GLOW_ENABLED,
  }
}

/** Convert a #rrggbb hex + alpha (0..1) into #rrggbbAA. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha))
  const a = Math.round(clamped * 255).toString(16).padStart(2, '0')
  return `${hex}${a}`
}

/** Soft two-layer glow used on the active terminal row. */
export function glowShadow(hex: string): string {
  return `0 0 12px ${hexWithAlpha(hex, 0.5)}, 0 0 4px ${hexWithAlpha(hex, 0.35)}`
}

/** Read the persisted global accent settings (empty object if unset). */
export async function loadAccentSettings(): Promise<AccentGlobals> {
  const result = await chrome.storage.local.get(ACCENT_SETTINGS_KEY)
  return (result?.[ACCENT_SETTINGS_KEY] as AccentGlobals) ?? {}
}

/** Merge-and-persist a partial update to the global accent settings. */
export async function saveAccentSettings(partial: AccentGlobals): Promise<void> {
  const current = await loadAccentSettings()
  await chrome.storage.local.set({ [ACCENT_SETTINGS_KEY]: { ...current, ...partial } })
}

/** Mirror the accent color into the dashboard CSS variables so .terminal-glow / .border-glow recolor. */
export function applyAccentToCssVars(color: string, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--color-primary', color)
  root.style.setProperty('--color-accent', color)
  root.style.setProperty('--color-ring', color)
}
