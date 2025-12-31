import React, { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
// Animated icons
import { ChevronDownIcon } from '../../../components/icons'

interface InlineFieldProps {
  fieldId: string
  hint?: string
  value: string
  onChange: (fieldId: string, value: string) => void
  onNavigate?: (direction: 'next' | 'prev') => void
  isActive?: boolean
}

export function InlineField({
  fieldId,
  hint,
  value,
  onChange,
  onNavigate,
  isActive,
}: InlineFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [showDropdown, setShowDropdown] = useState(false)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const triggerRef = useRef<HTMLSpanElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Parse hint for options (separated by |)
  const options = useMemo(() => {
    if (!hint || !hint.includes('|')) return null
    return hint.split('|').map(opt => opt.trim()).filter(Boolean)
  }, [hint])

  const isSelect = options && options.length > 0

  // Sync editValue when value prop changes
  useEffect(() => {
    setEditValue(value)
  }, [value])

  // Auto-focus when activated via tab navigation
  useEffect(() => {
    if (isActive && !isEditing) {
      setIsEditing(true)
    }
  }, [isActive])

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const isInsideTrigger = triggerRef.current?.contains(target)
      const isInsideDropdown = dropdownRef.current?.contains(target)
      if (!isInsideTrigger && !isInsideDropdown) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDropdown])

  const handleClick = () => {
    if (isSelect) {
      if (!showDropdown && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setDropdownPos({
          top: rect.bottom + 4,
          left: rect.left,
        })
      }
      setShowDropdown(!showDropdown)
    } else {
      setIsEditing(true)
    }
  }

  const handleSelectOption = (option: string) => {
    onChange(fieldId, option)
    setShowDropdown(false)
    onNavigate?.('next')
  }

  const handleSave = () => {
    onChange(fieldId, editValue)
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setEditValue(value) // Revert to original
      setIsEditing(false)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      handleSave()
      onNavigate?.(e.shiftKey ? 'prev' : 'next')
    }
  }

  // Calculate input width based on content
  const getWidth = () => {
    const content = editValue || hint || fieldId
    const charWidth = 8
    const padding = 24
    const minWidth = 60
    const maxWidth = 300
    return Math.min(maxWidth, Math.max(minWidth, content.length * charWidth + padding))
  }

  const isEmpty = !value?.trim()
  const displayText = isSelect
    ? (value?.trim() || fieldId)
    : (value?.trim() || hint || fieldId)

  // Select field with dropdown
  if (isSelect) {
    // Check if current value is a custom value (not in options)
    const isCustomValue = value && !options!.includes(value)

    return (
      <span
        className="relative inline-block align-baseline mx-0.5"
        style={{
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
        }}
      >
        {/* Custom text input mode */}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={fieldId}
            className="inline-block align-baseline px-2 py-0.5 text-sm bg-pink-500/20 border border-pink-400/50 rounded focus:outline-none focus:ring-2 focus:ring-pink-400/50"
            style={{
              width: `${getWidth()}px`,
              fontFamily: 'inherit',
              fontSize: 'inherit',
              lineHeight: 'inherit',
            }}
          />
        ) : (
          <span
            ref={triggerRef}
            onClick={handleClick}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-sm rounded cursor-pointer transition-all ${
              isEmpty
                ? 'bg-pink-500/10 text-pink-400/70 border border-dashed border-pink-400/40 hover:bg-pink-500/20 hover:border-pink-400/60'
                : 'bg-pink-500/20 text-foreground border border-pink-400/30 hover:bg-pink-500/30'
            }`}
            title={`Select: ${fieldId}`}
          >
            {displayText}
            <ChevronDownIcon size={12} className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`} />
          </span>
        )}
        {showDropdown && dropdownPos && createPortal(
          <div
            ref={dropdownRef}
            className="fixed min-w-[120px] bg-card border border-border rounded-lg shadow-xl py-1 max-h-48 overflow-auto"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              zIndex: 9999,
            }}
          >
            {options!.map((option, idx) => (
              <button
                key={idx}
                onClick={() => handleSelectOption(option)}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors ${
                  value === option ? 'bg-pink-500/20 text-pink-400' : ''
                }`}
              >
                {option}
              </button>
            ))}
            <div className="border-t border-border mt-1 pt-1">
              <button
                onClick={() => {
                  setShowDropdown(false)
                  setIsEditing(true)
                }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors text-muted-foreground italic ${
                  isCustomValue ? 'bg-pink-500/20 text-pink-400 not-italic' : ''
                }`}
              >
                {isCustomValue ? `Custom: ${value}` : 'Custom...'}
              </button>
            </div>
          </div>,
          document.body
        )}
      </span>
    )
  }

  // Text input field
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        placeholder={hint || fieldId}
        className="inline-block align-baseline px-2 py-0.5 mx-0.5 text-sm bg-pink-500/20 border border-pink-400/50 rounded focus:outline-none focus:ring-2 focus:ring-pink-400/50"
        style={{
          width: `${getWidth()}px`,
          fontFamily: 'inherit',
          fontSize: 'inherit',
          lineHeight: 'inherit',
        }}
      />
    )
  }

  return (
    <span
      onClick={handleClick}
      className={`inline-block align-baseline px-2 py-0.5 mx-0.5 text-sm rounded cursor-pointer transition-all ${
        isEmpty
          ? 'bg-pink-500/10 text-pink-400/70 border border-dashed border-pink-400/40 hover:bg-pink-500/20 hover:border-pink-400/60'
          : 'bg-pink-500/20 text-foreground border border-pink-400/30 hover:bg-pink-500/30'
      }`}
      title={`Click to edit: ${fieldId}`}
      style={{
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit',
      }}
    >
      {displayText}
    </span>
  )
}
