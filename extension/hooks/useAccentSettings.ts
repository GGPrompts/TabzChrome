import { useCallback, useEffect, useState } from 'react'
import {
  loadAccentSettings,
  saveAccentSettings,
  applyAccentToCssVars,
  ACCENT_SETTINGS_KEY,
  DEFAULT_ACCENT,
  DEFAULT_GLOW_ENABLED,
  type AccentGlobals,
} from '../styles/accent'

/**
 * Loads + persists the GLOBAL accent default, mirrors it into dashboard CSS vars,
 * and keeps in sync across contexts via chrome.storage.onChanged.
 */
export function useAccentSettings() {
  const [globals, setGlobals] = useState<AccentGlobals>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadAccentSettings().then(g => {
      if (cancelled) return
      setGlobals(g)
      if (g.accentColor) applyAccentToCssVars(g.accentColor)
      setLoaded(true)
    })

    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes[ACCENT_SETTINGS_KEY]) {
        const next = (changes[ACCENT_SETTINGS_KEY].newValue as AccentGlobals) ?? {}
        setGlobals(next)
        if (next.accentColor) applyAccentToCssVars(next.accentColor)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => {
      cancelled = true
      chrome.storage.local.onChanged.removeListener(listener)
    }
  }, [])

  const setAccent = useCallback((partial: AccentGlobals) => {
    setGlobals(prev => {
      const next = { ...prev, ...partial }
      applyAccentToCssVars(next.accentColor ?? DEFAULT_ACCENT)
      return next
    })
    void saveAccentSettings(partial)
  }, [])

  return {
    globals,
    accentColor: globals.accentColor ?? DEFAULT_ACCENT,
    glowEnabled: globals.glowEnabled ?? DEFAULT_GLOW_ENABLED,
    setAccent,
    loaded,
  }
}
