import React, { useRef, useEffect } from 'react'
import { RotateCcw, X } from 'lucide-react'
import { themes, themeNames } from '../styles/themes'
import { backgroundGradients, gradientNames, PANEL_COLORS } from '../styles/terminal-backgrounds'
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
  fontSizeOffset = 0,
  onUpdate,
  onReset,
  onIncreaseFontSize,
  onDecreaseFontSize,
  onResetFontSize,
  onClose,
}: TerminalCustomizePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }

    // Small delay to prevent immediate close from the context menu click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

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
  const effectivePanelColor = currentOverrides?.panelColor ?? profileDefaults.panelColor ?? '#000000'
  const effectiveTransparency = currentOverrides?.transparency ?? profileDefaults.transparency ?? 100
  const effectiveFontFamily = currentOverrides?.fontFamily ?? profileDefaults.fontFamily ?? 'monospace'

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
      ref={popoverRef}
      className="fixed w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[10001]"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-sm font-medium text-white">🎨 Customize</span>
        <div className="flex items-center gap-1">
          {hasOverrides && (
            <button
              onClick={() => {
                onReset(sessionId)
                onResetFontSize()
              }}
              className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
              title="Reset all to profile defaults"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4 max-h-80 overflow-y-auto">
        {/* Font Size */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Font Size</label>
          <div className="flex items-center gap-2">
            <button
              className={`px-2 py-1 rounded border text-sm ${
                canDecrease
                  ? 'border-gray-600 hover:border-gray-500 text-white'
                  : 'border-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              onClick={canDecrease ? onDecreaseFontSize : undefined}
              disabled={!canDecrease}
            >
              −
            </button>
            <span className="text-sm text-white min-w-[3rem] text-center">
              {profileDefaults.fontSize || 16}{fontSizeOffset !== 0 ? ` ${fontSizeOffset > 0 ? '+' : ''}${fontSizeOffset}` : ''}
            </span>
            <button
              className={`px-2 py-1 rounded border text-sm ${
                canIncrease
                  ? 'border-gray-600 hover:border-gray-500 text-white'
                  : 'border-gray-800 text-gray-600 cursor-not-allowed'
              }`}
              onClick={canIncrease ? onIncreaseFontSize : undefined}
              disabled={!canIncrease}
            >
              +
            </button>
            {fontSizeOffset !== 0 && (
              <button
                className="px-2 py-1 rounded border border-gray-600 hover:border-gray-500 text-gray-400 hover:text-white text-xs"
                onClick={onResetFontSize}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Font Family */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Font Family</label>
          <select
            value={effectiveFontFamily}
            onChange={(e) => onUpdate(sessionId, { fontFamily: e.target.value })}
            className="w-full px-2 py-1.5 bg-black/50 border border-gray-600 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
          >
            {availableFonts.map((font) => (
              <option key={font.value} value={font.value}>
                {font.label}
              </option>
            ))}
          </select>
        </div>

        {/* Text Colors */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Text Colors</label>
          <select
            value={effectiveTheme}
            onChange={(e) => onUpdate(sessionId, { themeName: e.target.value })}
            className="w-full px-2 py-1.5 bg-black/50 border border-gray-600 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
          >
            {themeNames.map((name) => (
              <option key={name} value={name}>
                {themes[name].name}
              </option>
            ))}
          </select>
        </div>

        {/* Background Gradient */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Background</label>
          <select
            value={effectiveGradient || ''}
            onChange={(e) => onUpdate(sessionId, { backgroundGradient: e.target.value || undefined })}
            className="w-full px-2 py-1.5 bg-black/50 border border-gray-600 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
          >
            <option value="">Theme Default</option>
            {gradientNames.map((name) => (
              <option key={name} value={name}>
                {backgroundGradients[name].name}
              </option>
            ))}
          </select>
        </div>

        {/* Panel Color */}
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Panel Color</label>
          <div className="flex flex-wrap gap-1.5">
            {PANEL_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => onUpdate(sessionId, { panelColor: color.value })}
                className={`
                  w-6 h-6 rounded border transition-all
                  ${effectivePanelColor === color.value
                    ? 'border-[#00ff88] scale-110'
                    : 'border-gray-600 hover:border-gray-500'
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
          <label className="block text-xs text-gray-400 mb-1.5">
            Gradient Opacity: {effectiveTransparency}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={effectiveTransparency}
            onChange={(e) => onUpdate(sessionId, { transparency: parseInt(e.target.value) })}
            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-0.5">
            <span>Solid</span>
            <span>Gradient</span>
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-gray-700 text-xs text-gray-500">
        Changes don't save to profile
      </div>
    </div>
  )
}
