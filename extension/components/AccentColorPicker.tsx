import React from 'react'
import { ACCENT_PRESETS } from '../styles/accent'

export interface AccentColorPickerProps {
  color: string
  glowEnabled: boolean
  onColorChange: (hex: string) => void
  onGlowChange: (enabled: boolean) => void
  label?: string
}

export function AccentColorPicker({
  color,
  glowEnabled,
  onColorChange,
  onGlowChange,
  label = 'Accent / Glow',
}: AccentColorPickerProps) {
  const normalized = color.toLowerCase()
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-gray-400">{label}</div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {ACCENT_PRESETS.map(preset => {
          const selected = preset.value.toLowerCase() === normalized
          return (
            <button
              key={preset.value}
              type="button"
              title={preset.name}
              onClick={() => onColorChange(preset.value)}
              className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                selected ? 'border-white ring-2 ring-white/60' : 'border-white/20'
              }`}
              style={{ backgroundColor: preset.value }}
            />
          )
        })}
        {/* Native color wheel for any custom color */}
        <label className="relative w-5 h-5 rounded-full border border-white/20 overflow-hidden cursor-pointer flex items-center justify-center text-[10px] text-white/70"
               title="Custom color">
          +
          <input
            aria-label="Custom color"
            type="color"
            value={color}
            onInput={(e) => onColorChange((e.target as HTMLInputElement).value)}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer select-none">
        <button
          type="button"
          role="switch"
          aria-checked={glowEnabled}
          aria-label="Glow"
          onClick={() => onGlowChange(!glowEnabled)}
          className={`w-9 h-5 p-0 flex-shrink-0 rounded-full transition-colors relative ${glowEnabled ? 'bg-white/70' : 'bg-white/20'}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-black transition-transform ${
              glowEnabled ? 'translate-x-4' : ''
            }`}
          />
        </button>
        Glow
      </label>
    </div>
  )
}
