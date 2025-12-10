import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
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
  const hasMultipleCategories = groupedProfiles.length > 1

  return (
    <div className={`bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl w-[240px] overflow-hidden max-h-[400px] overflow-y-auto ${className}`}>
      {groupedProfiles.map(({ category, profiles: categoryProfiles }) => {
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
  )
}
