import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { ChevronDown, ChevronRight, Search, X, Paperclip } from 'lucide-react'
import { type Profile, DEFAULT_CATEGORY_COLOR } from './SettingsModal'

/**
 * Props for the ProfileDropdown component
 */
interface ProfileDropdownProps {
  /** Profiles grouped by category for display */
  groupedProfiles: { category: string; profiles: Profile[] }[]
  /** Set of category names that are currently collapsed */
  collapsedCategories: Set<string>
  /** Callback to toggle a category's collapsed state */
  onToggleCategory: (category: string) => void
  /** Callback when a profile is selected to spawn a terminal */
  onSpawnProfile: (profile: Profile) => void
  /** Function to get the color for a category */
  getCategoryColor: (category: string) => string
  /** ID of the default profile (shown with badge) */
  defaultProfileId?: string
  /** Additional CSS classes for positioning */
  className?: string
  /** Callback to close the dropdown (for Escape key) */
  onClose?: () => void
  /** Callback to open a profile's reference (URL or file path) */
  onOpenReference?: (reference: string) => void
}

/**
 * Type for focusable items in the dropdown (categories or profiles)
 */
type FocusableItem =
  | { type: 'category'; category: string }
  | { type: 'profile'; profile: Profile }

/**
 * ProfileDropdown - Profile selection dropdown menu
 *
 * Displays a searchable, categorized dropdown for selecting terminal profiles.
 * Used in both the tab bar (+) button and the empty state.
 *
 * Features:
 * - Full-text search across profile names, commands, categories, and directories
 * - Collapsible categories with color-coded indicators
 * - Full keyboard navigation (Arrow keys, Enter, Escape, Home/End)
 * - Default profile badge indicator
 * - Auto-focus on search input when opened
 *
 * @param props - Dropdown configuration and callbacks
 * @returns Dropdown menu component
 */
export function ProfileDropdown({
  groupedProfiles,
  collapsedCategories,
  onToggleCategory,
  onSpawnProfile,
  getCategoryColor,
  defaultProfileId,
  className = '',
  onClose,
  onOpenReference,
}: ProfileDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLButtonElement>>(new Map())

  // Auto-focus search on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Filter profiles by search query
  const filteredGroupedProfiles = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return groupedProfiles

    return groupedProfiles
      .map(({ category, profiles }) => ({
        category,
        profiles: profiles.filter(profile =>
          profile.name.toLowerCase().includes(query) ||
          profile.command?.toLowerCase().includes(query) ||
          profile.category?.toLowerCase().includes(query) ||
          profile.workingDir?.toLowerCase().includes(query)
        )
      }))
      .filter(({ profiles }) => profiles.length > 0)
  }, [groupedProfiles, searchQuery])

  const hasMultipleCategories = filteredGroupedProfiles.length > 1
  const totalProfiles = groupedProfiles.reduce((sum, g) => sum + g.profiles.length, 0)

  // Build flat list of focusable items (categories + visible profiles)
  const focusableItems = useMemo<FocusableItem[]>(() => {
    const items: FocusableItem[] = []
    for (const { category, profiles: categoryProfiles } of filteredGroupedProfiles) {
      const categoryKey = category || '__uncategorized__'
      const showCategoryHeader = hasMultipleCategories || category

      if (showCategoryHeader) {
        items.push({ type: 'category', category: categoryKey })
      }

      const isCollapsed = collapsedCategories.has(categoryKey)
      if (!isCollapsed) {
        for (const profile of categoryProfiles) {
          items.push({ type: 'profile', profile })
        }
      }
    }
    return items
  }, [filteredGroupedProfiles, collapsedCategories, hasMultipleCategories])

  // Reset focus when search changes or items change
  useEffect(() => {
    setFocusedIndex(-1)
  }, [searchQuery])

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0) {
      const element = itemRefs.current.get(focusedIndex)
      element?.scrollIntoView({ block: 'nearest' })
    }
  }, [focusedIndex])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const itemCount = focusableItems.length
    if (itemCount === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setFocusedIndex(prev => (prev < itemCount - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev))
        break
      case 'Home':
        e.preventDefault()
        setFocusedIndex(0)
        break
      case 'End':
        e.preventDefault()
        setFocusedIndex(itemCount - 1)
        break
      case 'Enter':
        if (focusedIndex >= 0 && focusedIndex < itemCount) {
          e.preventDefault()
          const item = focusableItems[focusedIndex]
          if (item.type === 'category') {
            onToggleCategory(item.category)
          } else {
            onSpawnProfile(item.profile)
          }
        } else if (filteredGroupedProfiles.length > 0) {
          // Fallback: spawn first visible profile
          const firstProfile = filteredGroupedProfiles[0]?.profiles[0]
          if (firstProfile) {
            e.preventDefault()
            onSpawnProfile(firstProfile)
          }
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose?.()
        break
    }
  }, [focusableItems, focusedIndex, filteredGroupedProfiles, onToggleCategory, onSpawnProfile, onClose])

  // Get the index in focusableItems for a given category or profile
  const getItemIndex = useCallback((type: 'category' | 'profile', id: string): number => {
    return focusableItems.findIndex(item => {
      if (type === 'category' && item.type === 'category') {
        return item.category === id
      }
      if (type === 'profile' && item.type === 'profile') {
        return item.profile.id === id
      }
      return false
    })
  }, [focusableItems])

  return (
    <div
      className={`bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl w-[300px] overflow-hidden flex flex-col max-h-[70vh] ${className}`}
      role="menu"
      aria-label="Terminal profiles"
      onKeyDown={handleKeyDown}
    >
      {/* Search input - always visible if more than 5 profiles */}
      {totalProfiles > 5 && (
        <div className="p-2 border-b border-gray-800 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search profiles..."
              className="w-full pl-8 pr-7 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-xs focus:border-[#00ff88] focus:outline-none"
              onClick={(e) => e.stopPropagation()}
              aria-label="Search profiles"
              aria-activedescendant={focusedIndex >= 0 ? `profile-item-${focusedIndex}` : undefined}
            />
            {searchQuery && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSearchQuery('')
                  searchInputRef.current?.focus()
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Profile list - scrollable */}
      <div className="overflow-y-auto flex-1">
      {filteredGroupedProfiles.length === 0 ? (
        <div className="px-3 py-4 text-center text-gray-500 text-xs">
          No profiles match "{searchQuery}"
        </div>
      ) : filteredGroupedProfiles.map(({ category, profiles: categoryProfiles }) => {
        const isCollapsed = collapsedCategories.has(category || '__uncategorized__')
        const categoryColor = category ? getCategoryColor(category) : DEFAULT_CATEGORY_COLOR

        return (
          <div key={category || '__uncategorized__'}>
            {/* Category Header (only show if there are multiple categories or category exists) */}
            {(hasMultipleCategories || category) && (() => {
              const categoryKey = category || '__uncategorized__'
              const itemIndex = getItemIndex('category', categoryKey)
              const isFocused = focusedIndex === itemIndex
              return (
              <button
                ref={(el) => {
                  if (el && itemIndex >= 0) itemRefs.current.set(itemIndex, el)
                }}
                id={`profile-item-${itemIndex}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCategory(categoryKey)
                }}
                className={`w-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-gray-300 hover:bg-white/5 transition-colors border-b border-gray-800 ${
                  isFocused ? 'bg-white/10 outline outline-2 outline-[#00ff88]/50' : ''
                }`}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${category || 'Uncategorized'} category with ${categoryProfiles.length} profiles`}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
                )}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: categoryColor }}
                  aria-hidden="true"
                />
                <span className="truncate">{category || 'Uncategorized'}</span>
                <span className="text-gray-500 font-normal ml-auto">({categoryProfiles.length})</span>
              </button>
              )
            })()}

            {/* Profile items (hidden if category is collapsed) */}
            {!isCollapsed && categoryProfiles.map((profile) => {
              const truncatedDir = profile.workingDir
                ? './' + profile.workingDir.split('/').filter(Boolean).pop()
                : null
              const itemIndex = getItemIndex('profile', profile.id)
              const isFocused = focusedIndex === itemIndex
              return (
                <button
                  key={profile.id}
                  ref={(el) => {
                    if (el && itemIndex >= 0) itemRefs.current.set(itemIndex, el)
                  }}
                  id={`profile-item-${itemIndex}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSpawnProfile(profile)
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-[#00ff88]/10 transition-colors text-white hover:text-[#00ff88] text-xs border-b border-gray-800 last:border-b-0 ${
                    isFocused ? 'bg-[#00ff88]/20 outline outline-2 outline-[#00ff88]/50' : ''
                  }`}
                  style={category ? { paddingLeft: '1.75rem', borderLeftColor: categoryColor, borderLeftWidth: '2px' } : undefined}
                  role="menuitem"
                  aria-label={`Spawn ${profile.name} terminal${profile.command ? ` with command: ${profile.command}` : ''}`}
                >
                  <div className="font-medium flex items-center gap-2">
                    <span>{profile.name}</span>
                    {defaultProfileId && profile.id === defaultProfileId && (
                      <span className="text-[9px] bg-[#00ff88]/20 text-[#00ff88] px-1.5 py-0.5 rounded">Default</span>
                    )}
                    {profile.reference && onOpenReference && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          onOpenReference(profile.reference!)
                        }}
                        className="p-0.5 hover:bg-blue-500/20 rounded cursor-pointer"
                        title={`Open reference: ${profile.reference}`}
                      >
                        <Paperclip className="h-3 w-3 text-blue-400 hover:text-blue-300" />
                      </span>
                    )}
                    {truncatedDir && (
                      <span className="text-gray-400 font-normal text-[10px]">{truncatedDir}</span>
                    )}
                  </div>
                  {profile.command && (
                    <div className="text-[#00ff88]/70 mt-0.5 truncate font-mono" aria-hidden="true">▶ {profile.command}</div>
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
      </div>
    </div>
  )
}
