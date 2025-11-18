import React from 'react'
import './FontFamilyDropdown.css'
import { GenericDropdown } from './GenericDropdown'

interface FontOption {
  value: string
  label: string
  fontFamily: string
}

const FONT_OPTIONS: FontOption[] = [
  { value: 'monospace', label: 'Monospace (Default)', fontFamily: 'monospace' },
  { value: 'Consolas, monospace', label: 'Consolas', fontFamily: 'Consolas, monospace' },
  { value: 'Courier New, monospace', label: 'Courier New', fontFamily: 'Courier New, monospace' },
  { value: "'Cascadia Code', monospace", label: 'Cascadia Code', fontFamily: "'Cascadia Code', monospace" },
  { value: "'Cascadia Mono', monospace", label: 'Cascadia Mono', fontFamily: "'Cascadia Mono', monospace" },
  { value: "'JetBrainsMono Nerd Font', 'JetBrainsMono NF', monospace", label: 'JetBrains Mono NF', fontFamily: "'JetBrainsMono Nerd Font', 'JetBrainsMono NF', monospace" },
  { value: "'FiraCode Nerd Font', 'FiraCode NF', monospace", label: 'Fira Code NF', fontFamily: "'FiraCode Nerd Font', 'FiraCode NF', monospace" },
  { value: "'SauceCodePro Nerd Font', 'SauceCodePro NF', monospace", label: 'Source Code Pro NF', fontFamily: "'SauceCodePro Nerd Font', 'SauceCodePro NF', monospace" },
  { value: "'CaskaydiaCove Nerd Font Mono', 'CaskaydiaCove NFM', monospace", label: 'Caskaydia Cove NF', fontFamily: "'CaskaydiaCove Nerd Font Mono', 'CaskaydiaCove NFM', monospace" },
  { value: "'Hack Nerd Font', monospace", label: 'Hack NF', fontFamily: "'Hack Nerd Font', monospace" },
  { value: "'MesloLGS Nerd Font', monospace", label: 'MesloLGS NF', fontFamily: "'MesloLGS Nerd Font', monospace" },
]

interface FontFamilyDropdownProps {
  value: string
  onChange: (value: string) => void
  openUpward?: boolean
  disabled?: boolean
}

export function FontFamilyDropdown({ value, onChange, openUpward = false, disabled = false }: FontFamilyDropdownProps) {
  const selectedOption = FONT_OPTIONS.find(opt => opt.value === value) || FONT_OPTIONS[0]

  return (
    <GenericDropdown<FontOption>
      value={selectedOption}
      onChange={(option) => onChange(option.value)}
      options={FONT_OPTIONS}
      getOptionKey={(option) => option.value}
      isSelected={(option, selected) => option.value === selected.value}
      openUpward={openUpward}
      disabled={disabled}
      className="font-family-dropdown"
      renderTrigger={(option) => (
        <span style={{ fontFamily: option.fontFamily }}>
          {option.label}
        </span>
      )}
      renderOption={(option, isSelected) => (
        <span style={{ fontFamily: option.fontFamily }}>
          {isSelected && '✓ '}
          {option.label}
        </span>
      )}
    />
  )
}
