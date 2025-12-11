import React, { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { type Profile, DEFAULT_CATEGORY_COLOR } from './SettingsModal'

interface ProfileDropdownProps {
  groupedProfiles: { category: string; profiles: Profile[] }[]
  collapsedCategories: Set<string>
  onToggleCategory: (category: string) => void
  onSpawnProfile: (profile: Profile) => void
  getCategoryColor: (category: string) => string
  defaultProfileId?: string
  className?: string
}

export function ProfileDropdown({
  groupedProfiles,
  collapsedCategories,
  onToggleCategory,
  onSpawnProfile,
  getCategoryColor,
  defaultProfileId,
  className = '',
}: ProfileDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  return (
    <div className={`bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl w-[300px] overflow-hidden flex flex-col max-h-[70vh] ${className}`}>
      {/* Search input - always visible if more than 5 profiles */}
      {totalProfiles > 5 && (
        <div className="p-2 border-b border-gray-800 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search profiles..."
              className="w-full pl-8 pr-7 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-xs focus:border-[#00ff88] focus:outline-none"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                // Prevent closing dropdown on Enter if searching
                if (e.key === 'Enter' && filteredGroupedProfiles.length > 0) {
                  // Spawn first matching profile
                  const firstProfile = filteredGroupedProfiles[0]?.profiles[0]
                  if (firstProfile) {
                    onSpawnProfile(firstProfile)
                  }
                }
                e.stopPropagation()
              }}
            />
            {searchQuery && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSearchQuery('')
                  searchInputRef.current?.focus()
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                <X className="h-3.5 w-3.5" />
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
            {(hasMultipleCategories || category) && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleCategory(category || '__uncategorized__')
                }}
                className="w-full px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-gray-300 hover:bg-white/5 transition-colors border-b border-gray-800"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3 flex-shrink-0" />
                ) : (
                  <ChevronDown className="h-3 w-3 flex-shrink-0" />
                )}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: categoryColor }}
                />
                <span className="truncate">{category || 'Uncategorized'}</span>
                <span className="text-gray-500 font-normal ml-auto">({categoryProfiles.length})</span>
              </button>
            )}

            {/* Profile items (hidden if category is collapsed) */}
            {!isCollapsed && categoryProfiles.map((profile) => {
              const truncatedDir = profile.workingDir
                ? './' + profile.workingDir.split('/').filter(Boolean).pop()
                : null
              return (
                <button
                  key={profile.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSpawnProfile(profile)
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-[#00ff88]/10 transition-colors text-white hover:text-[#00ff88] text-xs border-b border-gray-800 last:border-b-0"
                  style={category ? { paddingLeft: '1.75rem', borderLeftColor: categoryColor, borderLeftWidth: '2px' } : undefined}
                >
                  <div className="font-medium flex items-center gap-2">
                    <span>{profile.name}</span>
                    {defaultProfileId && profile.id === defaultProfileId && (
                      <span className="text-[9px] bg-[#00ff88]/20 text-[#00ff88] px-1.5 py-0.5 rounded">Default</span>
                    )}
                    {truncatedDir && (
                      <span className="text-gray-500 font-normal text-[10px]">{truncatedDir}</span>
                    )}
                  </div>
                  {profile.command && (
                    <div className="text-gray-500 mt-0.5 truncate font-mono">▶ {profile.command}</div>
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
