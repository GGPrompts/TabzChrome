import React from 'react'

interface GhostBadgeDropdownProps {
  orphanedSessions: string[]
  orphanedCount: number
  isLoading: boolean
  selectedOrphans: Set<string>
  setSelectedOrphans: React.Dispatch<React.SetStateAction<Set<string>>>
  showDropdown: boolean
  setShowDropdown: (show: boolean) => void
  onRefresh: () => Promise<void>
  onReattach: (sessions: string[]) => Promise<{ success: boolean; message: string }>
  onKill: (sessions: string[]) => Promise<{ success: boolean; message: string }>
}

export function GhostBadgeDropdown({
  orphanedSessions,
  orphanedCount,
  isLoading,
  selectedOrphans,
  setSelectedOrphans,
  showDropdown,
  setShowDropdown,
  onRefresh,
  onReattach,
  onKill,
}: GhostBadgeDropdownProps) {
  if (orphanedCount === 0) return null

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown)
          if (!showDropdown) {
            onRefresh()
            setSelectedOrphans(new Set())
          }
        }}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
        title={`${orphanedCount} orphaned tmux session(s) - click to manage`}
        aria-label={`${orphanedCount} orphaned tmux sessions. Click to manage.`}
        aria-expanded={showDropdown}
        aria-haspopup="menu"
      >
        <span aria-hidden="true">👻</span>
        <span>{orphanedCount}</span>
      </button>

      {showDropdown && (
        <div
          className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[280px] z-50 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm font-medium text-white">
              Detached Sessions ({orphanedCount})
            </span>
            <button
              onClick={() => onRefresh()}
              className="text-xs text-gray-400 hover:text-white transition-colors"
              title="Refresh"
              aria-label="Refresh orphaned sessions list"
            >
              {isLoading ? '...' : '↻'}
            </button>
          </div>

          {/* Select All */}
          <button
            onClick={() => {
              if (selectedOrphans.size === orphanedSessions.length) {
                setSelectedOrphans(new Set())
              } else {
                setSelectedOrphans(new Set(orphanedSessions))
              }
            }}
            className="w-full px-3 py-2 text-left text-xs border-b border-gray-800 text-gray-300 hover:bg-white/5 transition-colors flex items-center gap-2"
            aria-label={selectedOrphans.size === orphanedSessions.length ? 'Deselect all sessions' : 'Select all sessions'}
            aria-pressed={selectedOrphans.size === orphanedSessions.length && orphanedSessions.length > 0}
          >
            <span className="w-4" aria-hidden="true">
              {selectedOrphans.size === orphanedSessions.length && orphanedSessions.length > 0 ? '☑' : '☐'}
            </span>
            <span>Select All</span>
          </button>

          {/* Session List */}
          <div className="max-h-[200px] overflow-y-auto">
            {orphanedSessions.map((session) => {
              // Extract display name from session ID (ctt-ProfileName-shortId)
              const parts = session.split('-')
              const profileName = parts.length >= 2 ? parts[1] : session
              const shortId = parts.length >= 3 ? parts.slice(2).join('-') : ''

              return (
                <button
                  key={session}
                  onClick={() => {
                    setSelectedOrphans((prev) => {
                      const next = new Set(prev)
                      if (next.has(session)) {
                        next.delete(session)
                      } else {
                        next.add(session)
                      }
                      return next
                    })
                  }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center gap-2 ${
                    selectedOrphans.has(session)
                      ? 'text-purple-400 bg-purple-500/10'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                  title={session}
                  aria-label={`${selectedOrphans.has(session) ? 'Deselect' : 'Select'} session ${profileName}`}
                  aria-pressed={selectedOrphans.has(session)}
                  role="checkbox"
                  aria-checked={selectedOrphans.has(session)}
                >
                  <span className="w-4 flex-shrink-0" aria-hidden="true">
                    {selectedOrphans.has(session) ? '☑' : '☐'}
                  </span>
                  <span className="truncate flex-1 font-mono">
                    {profileName}
                    {shortId && <span className="text-gray-500 ml-1">({shortId.slice(0, 6)})</span>}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Action Buttons */}
          <div className="px-3 py-2 border-t border-gray-800 flex gap-2">
            <button
              onClick={async () => {
                if (selectedOrphans.size === 0) return
                const result = await onReattach(Array.from(selectedOrphans))
                if (result.success) {
                  setSelectedOrphans(new Set())
                  // Keep dropdown open to show updated list
                }
              }}
              disabled={selectedOrphans.size === 0}
              className="flex-1 px-3 py-1.5 text-xs rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 hover:bg-[#00ff88]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label={`Reattach ${selectedOrphans.size} selected session${selectedOrphans.size !== 1 ? 's' : ''}`}
            >
              Reattach
            </button>
            <button
              onClick={async () => {
                if (selectedOrphans.size === 0) return
                const confirmed = window.confirm(
                  `Kill ${selectedOrphans.size} session(s)? This cannot be undone.`
                )
                if (confirmed) {
                  const result = await onKill(Array.from(selectedOrphans))
                  if (result.success) {
                    setSelectedOrphans(new Set())
                  }
                }
              }}
              disabled={selectedOrphans.size === 0}
              className="flex-1 px-3 py-1.5 text-xs rounded bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label={`Kill ${selectedOrphans.size} selected session${selectedOrphans.size !== 1 ? 's' : ''}`}
            >
              Kill
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
