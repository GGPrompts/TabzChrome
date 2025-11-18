import React from 'react'
import './BackgroundGradientDropdown.css'
import { backgroundGradients, BackgroundGradient } from '../styles/terminal-backgrounds'
import { GenericDropdown } from './GenericDropdown'

interface BackgroundGradientDropdownProps {
  value: string
  onChange: (value: string) => void
  openUpward?: boolean
  disabled?: boolean
}

type GradientEntry = [string, BackgroundGradient]

export function BackgroundGradientDropdown({ value, onChange, openUpward = false, disabled = false }: BackgroundGradientDropdownProps) {
  const selectedKey = value || 'dark-neutral'
  const selectedBg = backgroundGradients[selectedKey] || backgroundGradients['dark-neutral']

  const gradientEntries: GradientEntry[] = Object.entries(backgroundGradients)

  const renderGradientPreview = (bg: BackgroundGradient) => {
    return (
      <div className="gradient-preview-swatch" style={{ background: bg.gradient }}>
        {/* Dots showing key colors */}
        <div className="gradient-preview-dots">
          {bg.preview.map((color, idx) => (
            <div
              key={idx}
              className="gradient-preview-dot"
              style={{ background: color }}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <GenericDropdown<GradientEntry>
      value={[selectedKey, selectedBg]}
      onChange={([key]) => onChange(key)}
      options={gradientEntries}
      getOptionKey={([key]) => key}
      isSelected={([key], [valueKey]) => key === valueKey}
      openUpward={openUpward}
      disabled={disabled}
      className="background-gradient-dropdown"
      renderTrigger={([, bg], isOpen) => (
        <div className="gradient-trigger-content">
          {renderGradientPreview(bg)}
          <span className="gradient-name">{bg.name}</span>
        </div>
      )}
      renderOption={([key, bg], isSelected) => (
        <>
          {renderGradientPreview(bg)}
          <div className="gradient-option-info">
            <div className="gradient-option-name">
              {isSelected && '✓ '}
              {bg.name}
            </div>
            {bg.description && (
              <div className="gradient-option-description">{bg.description}</div>
            )}
          </div>
        </>
      )}
    />
  )
}
