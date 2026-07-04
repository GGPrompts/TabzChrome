import React from 'react'
import { SparklesIcon } from '../../components/icons'
import { AccentColorPicker } from '../../components/AccentColorPicker'
import { useAccentSettings } from '../../hooks/useAccentSettings'

/**
 * App-wide appearance settings (dashboard + sidebar chrome).
 * Terminal appearance (theme, font, background) stays per-profile on the
 * Profiles page — this section is for the app shell around the terminals.
 */
export default function SettingsAppearance() {
  const { accentColor, glowEnabled, setAccent } = useAccentSettings()

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
          <SparklesIcon size={32} />
          Appearance
        </h1>
        <p className="text-muted-foreground mt-1">
          Accent color and glow for the dashboard and sidebar. Terminal appearance
          (theme, font, background) is configured per-profile on the Profiles page.
        </p>
      </div>

      {/* Accent & Glow */}
      <section className="mb-8">
        <div className="rounded-xl bg-card border border-border p-6">
          <h2 className="text-sm font-semibold mb-1">Accent & Glow</h2>
          <p className="text-xs text-muted-foreground mb-3">
            The accent recolors dashboard highlights and the active terminal tab in the
            sidebar (tabs with a category color keep it). Glow adds a soft shadow to the
            active tab, tinted with its category color when it has one.
          </p>
          <AccentColorPicker
            color={accentColor}
            glowEnabled={glowEnabled}
            onColorChange={(hex) => setAccent({ accentColor: hex })}
            onGlowChange={(enabled) => setAccent({ glowEnabled: enabled })}
          />
        </div>
      </section>
    </div>
  )
}
