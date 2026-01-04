import React from 'react'
import { Terminal, Pin } from 'lucide-react'
import type { Profile } from './settings/types'

interface SidebarProfileCardsProps {
  /** All profiles from storage */
  profiles: Profile[]
  /** ID of the default profile */
  defaultProfileId: string
  /** Callback when a profile card is clicked */
  onSpawnProfile: (profile: Profile) => void
  /** Category settings for colors */
  getCategoryColor?: (category: string) => string
}

/**
 * SidebarProfileCards - Displays pinned profiles as clickable cards in sidebar empty state
 *
 * Shows profiles that have `pinnedToNewTab: true` as quick-access cards.
 * If no profiles are pinned, shows the default profile instead.
 *
 * Features:
 * - Compact card layout optimized for sidebar width
 * - Shows profile name with optional emoji icon
 * - Category color accent on cards
 * - Click to spawn terminal
 */
export function SidebarProfileCards({
  profiles,
  defaultProfileId,
  onSpawnProfile,
  getCategoryColor,
}: SidebarProfileCardsProps) {
  // Get pinned profiles, sorted with default first
  const pinnedProfiles = profiles
    .filter(p => p.pinnedToNewTab)
    .sort((a, b) => {
      if (a.id === defaultProfileId) return -1
      if (b.id === defaultProfileId) return 1
      return a.name.localeCompare(b.name)
    })

  // If no profiles are pinned, show the default profile (or first profile as fallback)
  const displayProfiles = pinnedProfiles.length > 0
    ? pinnedProfiles.slice(0, 6) // Limit to 6 for 2x3 grid
    : profiles.filter(p => p.id === defaultProfileId || profiles.indexOf(p) === 0).slice(0, 1)

  if (displayProfiles.length === 0) {
    return null
  }

  // Extract emoji from profile name if present
  const getProfileIcon = (name: string): { emoji: string | null; cleanName: string } => {
    // Match emoji at start of name (including emoji with variation selectors)
    const emojiMatch = name.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u)
    if (emojiMatch) {
      return {
        emoji: emojiMatch[1],
        cleanName: name.slice(emojiMatch[0].length)
      }
    }
    return { emoji: null, cleanName: name }
  }

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="flex items-center justify-center gap-2 mb-3 text-gray-400">
        <Pin className="w-3 h-3" />
        <span className="text-xs font-medium uppercase tracking-wider">
          {pinnedProfiles.length > 0 ? 'Pinned Profiles' : 'Quick Start'}
        </span>
      </div>

      {/* Profile Cards Grid */}
      <div className="grid grid-cols-2 gap-2">
        {displayProfiles.map((profile) => {
          const { emoji, cleanName } = getProfileIcon(profile.name)
          const categoryColor = getCategoryColor?.(profile.category || '') || '#6b7280'
          const isDefault = profile.id === defaultProfileId

          return (
            <button
              key={profile.id}
              onClick={() => onSpawnProfile(profile)}
              className="group relative flex flex-col items-center gap-2 p-3 rounded-lg bg-white/5 hover:bg-[#00ff88]/10 border border-gray-700/50 hover:border-[#00ff88]/50 transition-all duration-200"
              title={`Spawn ${profile.name}${profile.command ? ` (${profile.command})` : ''}`}
            >
              {/* Category color accent */}
              <div
                className="absolute top-0 left-0 right-0 h-0.5 rounded-t-lg opacity-60 group-hover:opacity-100 transition-opacity"
                style={{ backgroundColor: categoryColor }}
              />

              {/* Icon */}
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#1a1a1a] border border-gray-700 group-hover:border-[#00ff88]/30 transition-colors">
                {emoji ? (
                  <span className="text-xl">{emoji}</span>
                ) : (
                  <Terminal className="w-5 h-5 text-gray-400 group-hover:text-[#00ff88] transition-colors" />
                )}
              </div>

              {/* Name */}
              <div className="text-xs font-medium text-gray-300 group-hover:text-[#00ff88] transition-colors text-center truncate w-full">
                {cleanName || profile.name}
              </div>

              {/* Default badge */}
              {isDefault && (
                <div className="absolute top-1 right-1 text-[8px] bg-[#00ff88]/20 text-[#00ff88] px-1 py-0.5 rounded">
                  Default
                </div>
              )}

              {/* Command hint on hover */}
              {profile.command && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-[#00ff88]/70 font-mono truncate max-w-full px-1">
                  {profile.command.length > 20 ? profile.command.slice(0, 20) + '...' : profile.command}
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Hint to pin more profiles */}
      {pinnedProfiles.length === 0 && (
        <p className="text-[10px] text-gray-500 text-center mt-3">
          Pin profiles in Settings to show them here
        </p>
      )}
    </div>
  )
}
