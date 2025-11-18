import React, { useState, useRef, useEffect } from 'react'
import './GenericDropdown.css'

export interface GenericDropdownProps<T> {
  value: T
  onChange: (value: T) => void
  options: T[]
  getOptionKey: (option: T) => string
  isSelected: (option: T, value: T) => boolean
  renderTrigger: (selected: T, isOpen: boolean) => React.ReactNode
  renderOption: (option: T, isSelected: boolean) => React.ReactNode
  openUpward?: boolean
  className?: string
  triggerClassName?: string
  menuClassName?: string
  optionClassName?: string
  disabled?: boolean
}

export function GenericDropdown<T>({
  value,
  onChange,
  options,
  getOptionKey,
  isSelected,
  renderTrigger,
  renderOption,
  openUpward = false,
  className = '',
  triggerClassName = '',
  menuClassName = '',
  optionClassName = '',
  disabled = false,
}: GenericDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Click-outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (option: T) => {
    if (disabled) return
    onChange(option)
    setIsOpen(false)
  }

  return (
    <div className={`generic-dropdown ${className} ${disabled ? 'disabled' : ''}`} ref={dropdownRef}>
      <button
        type="button"
        className={`generic-dropdown-trigger ${triggerClassName}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {renderTrigger(value, isOpen)}
        <span className="generic-dropdown-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className={`generic-dropdown-menu ${openUpward ? 'open-upward' : ''} ${menuClassName}`}>
          {options.map((option) => {
            const key = getOptionKey(option)
            const selected = isSelected(option, value)

            return (
              <button
                key={key}
                type="button"
                className={`generic-dropdown-option ${selected ? 'selected' : ''} ${optionClassName}`}
                onClick={() => handleSelect(option)}
              >
                {renderOption(option, selected)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
