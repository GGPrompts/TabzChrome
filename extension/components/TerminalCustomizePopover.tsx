import React, { useEffect, useCallback } from 'react'
import { useOutsideClick } from '../hooks/useOutsideClick'
import { RotateCcw, X } from 'lucide-react'
import { themes, themeNames, getBackgroundGradient as getThemeBackgroundGradient } from '../styles/themes'
import { backgroundGradients, gradientNames, PANEL_COLORS, getGradientCSS, getPanelColor } from '../styles/terminal-backgrounds'
import { FONT_FAMILIES, getAvailableFonts } from './settings/types'
import type { TerminalAppearanceOverrides } from '../hooks/useTerminalSessions'

interface TerminalCustomizePopoverProps {
  sessionId: string
  isOpen: boolean
  position: { x: number; y: number }
  currentOverrides?: TerminalAppearanceOverrides
  profileDefaults: {
    themeName?: string
    backgroundGradient?: string
    panelColor?: string
    transparency?: number
    fontSize?: number
    fontFamily?: string
  }
  isDark?: boolean  // Global dark/light mode
  // Font size offset (separate from appearance overrides)
  fontSizeOffset?: number
  onUpdate: (sessionId: string, overrides: Partial<TerminalAppearanceOverrides>) => void
  onReset: (sessionId: string) => void
  onIncreaseFontSize: () => void
  onDecreaseFontSize: () => void
  onResetFontSize: () => void
  onClose: () => void
}

const MIN_FONT_OFFSET = -4
const MAX_FONT_OFFSET = 8

export function TerminalCustomizePopover({
  sessionId,
  isOpen,
  position,
  currentOverrides,
  profileDefaults,
  isDark = true,
  fontSizeOffset = 0,
  onUpdate,
  onReset,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onResetFontSize,
  onClose,
}: TerminalCustomizePopoverProps) {
  // Close on click outside (using shared hook)
  useOutsideClick(isOpen, useCallback(() => onClose(), [onClose]))

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Get effective values (override > profile default)
  const effectiveTheme = currentOverrides?.themeName ?? profileDefaults.themeName ?? 'high-contrast'
  const effectiveGradient = currentOverrides?.backgroundGradient ?? profileDefaults.backgroundGradient
  const rawPanelColor = currentOverrides?.panelColor ?? profileDefaults.panelColor ?? '#000000'
  const effectiveTransparency = currentOverrides?.transparency ?? profileDefaults.transparency ?? 100
  const effectiveFontFamily = currentOverrides?.fontFamily ?? profileDefaults.fontFamily ?? 'monospace'
  const effectiveFontSize = profileDefaults.fontSize || 16

  // Compute gradient CSS same as Terminal.tsx
  const effectiveGradientCSS = effectiveGradient
    ? getGradientCSS(effectiveGradient, isDark)
    : getThemeBackgroundGradient(effectiveTheme, isDark)
  const gradientOpacity = effectiveTransparency / 100

  // Get appropriate panel color for current mode (dark -> light equivalents)
  const effectivePanelColor = getPanelColor(rawPanelColor, isDark)

  // Get theme colors for text preview
  const themeColors = themes[effectiveTheme]?.[isDark ? 'dark' : 'light']?.colors

  const hasOverrides = !!(
    currentOverrides?.themeName ||
    currentOverrides?.backgroundGradient ||
    currentOverrides?.panelColor !== undefined ||
    currentOverrides?.transparency !== undefined ||
    currentOverrides?.fontFamily ||
    fontSizeOffset !== 0
  )

  const canIncrease = fontSizeOffset < MAX_FONT_OFFSET
  const canDecrease = fontSizeOffset > MIN_FONT_OFFSET

  // Calculate position - try to keep within viewport
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const popoverWidth = 288 // w-72 = 18rem = 288px
  const popoverHeight = 450 // approximate

  let left = position.x
  let top = position.y

  // Adjust horizontal position if would overflow right
  if (left + popoverWidth > viewportWidth - 10) {
    left = viewportWidth - popoverWidth - 10
  }

  // Adjust vertical position if would overflow bottom
  if (top + popoverHeight > viewportHeight - 10) {
    top = viewportHeight - popoverHeight - 10
  }

  // Get available fonts for current platform
  const availableFonts = getAvailableFonts()

  return (
    <div
      className="fixed w-72 rounded-lg shadow-xl z-[10001] overflow-hidden border border-gray-600/50"
      style={{ left: `${left}px`, top: `${top}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Background layers - same as Terminal.tsx */}
      <div
        className="absolute inset-0 z-0"
        style={{ backgroundColor: effectivePanelColor }}
      />
      <div
        className="absolute inset-0 z-0"
        style={{ background: effectiveGradientCSS, opacity: gradientOpacity }}
      />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-sm font-medium" style={{ color: themeColors?.foreground || '#e0e0e0' }}>🎨 Customize</span>
        <div className="flex items-center gap-1">
          {hasOverrides && (
            <button
              onClick={() => {
                onReset(sessionId)
                onResetFontSize()
              }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              style={{ color: themeColors?.brightBlack || '#888' }}
              title="Reset all to profile defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            style={{ color: themeColors?.brightBlack || '#888' }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Font Preview - fixed at top, shows actual terminal styling */}
      <div className="relative z-10 px-3 pt-3 pb-2">
        <div
          className="p-2 rounded border border-white/10 font-mono"
          style={{
            fontFamily: effectiveFontFamily,
            fontSize: `${effectiveFontSize + fontSizeOffset}px`,
            lineHeight: 1.2,
          }}
        >
          <span style={{ color: themeColors?.foreground || '#e0e0e0' }}>$ </span>
          <span style={{ color: themeColors?.green || '#5af78e' }}>npm </span>
          <span style={{ color: themeColors?.cyan || '#00d4ff' }}>test</span>
          <span style={{ color: themeColors?.brightBlack || '#888' }}> # preview</span>
        </div>
      </div>

      <div className="relative z-10 px-3 pb-3 space-y-4 max-h-64 overflow-y-auto">
        {/* Font Size */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: themeColors?.brightBlack || '#888' }}>Font Size</label>
          <div className="flex items-center gap-2">
            <button
              className={`px-2 py-1 rounded border text-sm transition-colors ${
                canDecrease
                  ? 'border-white/20 hover:border-white/40'
                  : 'border-white/10 cursor-not-allowed opacity-50'
              }`}
              style={{ color: themeColors?.foreground || '#e0e0e0' }}
              onClick={canDecrease ? onDecreaseFontSize : undefined}
              disabled={!canDecrease}
            >
              −
            </button>
            <span className="text-sm min-w-[3rem] text-center" style={{ color: themeColors?.foreground || '#e0e0e0' }}>
              {effectiveFontSize}{fontSizeOffset !== 0 ? ` ${fontSizeOffset > 0 ? '+' : ''}${fontSizeOffset}` : ''}
            </span>
            <button
              className={`px-2 py-1 rounded border text-sm transition-colors ${
                canIncrease
                  ? 'border-white/20 hover:border-white/40'
                  : 'border-white/10 cursor-not-allowed opacity-50'
              }`}
              style={{ color: themeColors?.foreground || '#e0e0e0' }}
              onClick={canIncrease ? onIncreaseFontSize : undefined}
              disabled={!canIncrease}
            >
              +
            </button>
            {fontSizeOffset !== 0 && (
              <button
                className="px-2 py-1 rounded border border-white/20 hover:border-white/40 text-xs transition-colors"
                style={{ color: themeColors?.brightBlack || '#888' }}
                onClick={onResetFontSize}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Font Family */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: themeColors?.brightBlack || '#888' }}>Font Family</label>
          <select
            value={effectiveFontFamily}
            onChange={(e) => onUpdate(sessionId, { fontFamily: e.target.value })}
            className={`w-full px-2 py-1.5 border rounded text-sm focus:border-[#00ff88] focus:outline-none ${
              isDark ? 'bg-[#1a1a1a] border-white/20' : 'bg-white border-gray-300'
            }`}
            style={{ color: themeColors?.foreground || '#e0e0e0', fontFamily: effectiveFontFamily }}
          >
            {availableFonts.map((font) => (
              <option
                key={font.value}
                value={font.value}
                className={isDark ? 'bg-[#1a1a1a]' : 'bg-white'}
                style={{ fontFamily: font.value, color: isDark ? '#e0e0e0' : '#1a1a1a' }}
              >
                {font.label}
              </option>
            ))}
          </select>
        </div>

        {/* Text Colors */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: themeColors?.brightBlack || '#888' }}>Text Colors</label>
          <select
            value={effectiveTheme}
            onChange={(e) => {
              // When changing font color theme, lock in the current gradient to prevent
              // the theme's default gradient from overriding it (decouples font color from gradient)
              const currentGradient = currentOverrides?.backgroundGradient ?? profileDefaults.backgroundGradient
              if (currentGradient) {
                // Already has an explicit gradient, just change the theme
                onUpdate(sessionId, { themeName: e.target.value })
              } else {
                // No explicit gradient - set a neutral default to prevent theme's gradient from changing
                onUpdate(sessionId, {
                  themeName: e.target.value,
                  backgroundGradient: 'dark-neutral'
                })
              }
            }}
            className={`w-full px-2 py-1.5 border rounded text-sm focus:border-[#00ff88] focus:outline-none ${
              isDark ? 'bg-[#1a1a1a] border-white/20' : 'bg-white border-gray-300'
            }`}
            style={{ color: themeColors?.foreground || '#e0e0e0' }}
          >
            {themeNames.map((name) => {
              const optionColors = themes[name]?.[isDark ? 'dark' : 'light']?.colors
              return (
                <option
                  key={name}
                  value={name}
                  className={isDark ? 'bg-[#1a1a1a]' : 'bg-white'}
                  style={{ color: optionColors?.foreground || (isDark ? '#e0e0e0' : '#1a1a1a') }}
                >
                  {themes[name].name}
                </option>
              )
            })}
          </select>
        </div>

        {/* Background Gradient */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: themeColors?.brightBlack || '#888' }}>Background</label>
          <select
            value={effectiveGradient || ''}
            onChange={(e) => onUpdate(sessionId, { backgroundGradient: e.target.value || undefined })}
            className={`w-full px-2 py-1.5 border rounded text-sm focus:border-[#00ff88] focus:outline-none ${
              isDark ? 'bg-[#1a1a1a] border-white/20' : 'bg-white border-gray-300'
            }`}
            style={{ color: themeColors?.foreground || '#e0e0e0' }}
          >
            <option value="" className={isDark ? 'bg-[#1a1a1a]' : 'bg-white'} style={{ color: isDark ? '#e0e0e0' : '#1a1a1a' }}>Theme Default</option>
            {gradientNames.map((name) => (
              <option key={name} value={name} className={isDark ? 'bg-[#1a1a1a]' : 'bg-white'} style={{ color: isDark ? '#e0e0e0' : '#1a1a1a' }}>
                {backgroundGradients[name].name}
              </option>
            ))}
          </select>
        </div>

        {/* Panel Color */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: themeColors?.brightBlack || '#888' }}>Panel Color</label>
          <div className="flex flex-wrap gap-1.5">
            {PANEL_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => onUpdate(sessionId, { panelColor: color.value })}
                className={`
                  w-6 h-6 rounded border transition-all
                  ${effectivePanelColor === color.value
                    ? 'border-[#00ff88] scale-110'
                    : 'border-white/30 hover:border-white/50'
                  }
                `}
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        </div>

        {/* Transparency */}
        <div>
          <label className="block text-xs mb-1.5" style={{ color: themeColors?.brightBlack || '#888' }}>
            Gradient Opacity: {effectiveTransparency}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={effectiveTransparency}
            onChange={(e) => onUpdate(sessionId, { transparency: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
          />
          <div className="flex justify-between text-xs mt-0.5" style={{ color: themeColors?.brightBlack || '#888' }}>
            <span>Solid</span>
            <span>Gradient</span>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="relative z-10 px-3 py-2 border-t border-white/10 text-xs" style={{ color: themeColors?.brightBlack || '#888' }}>
        Changes don't save to profile
      </div>
    </div>
  )
}
