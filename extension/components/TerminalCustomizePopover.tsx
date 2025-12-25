import React, { useState, useRef, useEffect } from 'react'
import { Palette, RotateCcw, X } from 'lucide-react'
import { themes, themeNames } from '../styles/themes'
import { backgroundGradients, gradientNames, PANEL_COLORS } from '../styles/terminal-backgrounds'
import type { TerminalAppearanceOverrides } from '../hooks/useTerminalSessions'

interface TerminalCustomizePopoverProps {
  sessionId: string
  currentOverrides?: TerminalAppearanceOverrides
  profileDefaults: {
    themeName?: string
    backgroundGradient?: string
    panelColor?: string
    transparency?: number
  }
  onUpdate: (sessionId: string, overrides: Partial<TerminalAppearanceOverrides>) => void
  onReset: (sessionId: string) => void
}

export function TerminalCustomizePopover({
  sessionId,
  currentOverrides,
  profileDefaults,
  onUpdate,
  onReset,
}: TerminalCustomizePopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // Get effective values (override > profile default)
  const effectiveTheme = currentOverrides?.themeName ?? profileDefaults.themeName ?? 'high-contrast'
  const effectiveGradient = currentOverrides?.backgroundGradient ?? profileDefaults.backgroundGradient
  const effectivePanelColor = currentOverrides?.panelColor ?? profileDefaults.panelColor ?? '#000000'
  const effectiveTransparency = currentOverrides?.transparency ?? profileDefaults.transparency ?? 100

  const hasOverrides = !!(
    currentOverrides?.themeName ||
    currentOverrides?.backgroundGradient ||
    currentOverrides?.panelColor !== undefined ||
    currentOverrides?.transparency !== undefined
  )

  return (
    <div className="relative">
      {/* Floating customize button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={`
          p-1.5 rounded transition-all
          ${isOpen
            ? 'bg-[#00ff88]/20 text-[#00ff88]'
            : hasOverrides
              ? 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
              : 'bg-black/40 text-gray-400 hover:bg-black/60 hover:text-white'
          }
        `}
        title="Customize appearance (temporary)"
      >
        <Palette className="h-3.5 w-3.5" />
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 mb-2 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
            <span className="text-sm font-medium text-white">Customize</span>
            <div className="flex items-center gap-1">
              {hasOverrides && (
                <button
                  onClick={() => {
                    onReset(sessionId)
                    setIsOpen(false)
                  }}
                  className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
                  title="Reset to profile defaults"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="p-3 space-y-4 max-h-80 overflow-y-auto">
            {/* Theme */}
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
      )}
    </div>
  )
}
