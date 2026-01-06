import React, { useState, useRef, useEffect } from 'react'
import { Terminal, FolderOpen, ChevronDown } from 'lucide-react'

interface Profile {
  id: string
  name: string
  icon?: string
  color?: string
  category?: string
  pinnedToNewTab?: boolean
}

interface ProfilesGridProps {
  profiles: Profile[]
  defaultProfileId: string
  recentDirs: string[]
  globalWorkingDir: string
  onWorkingDirChange: (dir: string) => void
  loading: boolean
  onProfileClick: (profileId: string) => void
}

// Shorten path for display
function shortenPath(path: string): string {
  const homePath = path.replace(/^\/home\/[^/]+/, '~').replace(/^\/Users\/[^/]+/, '~')
  const parts = homePath.split('/')
  if (parts.length > 3) {
    return '…/' + parts.slice(-2).join('/')
  }
  return homePath
}

export function ProfilesGrid({
  profiles,
  defaultProfileId,
  recentDirs,
  globalWorkingDir,
  onWorkingDirChange,
  loading,
  onProfileClick
}: ProfilesGridProps) {
  const [showDirDropdown, setShowDirDropdown] = useState(false)
  const [customDirInput, setCustomDirInput] = useState('')
  const dirDropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dirDropdownRef.current && !dirDropdownRef.current.contains(e.target as Node)) {
        setShowDirDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (loading) {
    return (
      <div className="profiles-section">
        <div className="profiles-header">
          <div className="profiles-title">Terminals</div>
        </div>
        <div className="profiles-grid">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <div
              key={i}
              className="profile-card animate-pulse"
              style={{ opacity: 0.5 }}
            >
              <div className="profile-icon-wrapper bg-[var(--elevated)]">
                <div className="w-6 h-6 rounded bg-[var(--border)]" />
              </div>
              <div className="h-4 w-20 rounded bg-[var(--border)] mb-2" />
              <div className="h-3 w-12 rounded bg-[var(--border)]" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Sort: pinned first, then default, then alphabetically
  const sortedProfiles = [...profiles].sort((a, b) => {
    if (a.pinnedToNewTab && !b.pinnedToNewTab) return -1
    if (!a.pinnedToNewTab && b.pinnedToNewTab) return 1
    if (a.id === defaultProfileId) return -1
    if (b.id === defaultProfileId) return 1
    return a.name.localeCompare(b.name)
  })

  // Take top 9 for display (3x3 grid)
  const displayProfiles = sortedProfiles.slice(0, 9)

  return (
    <div className="profiles-section animate-slide-up stagger-3">
      <div className="profiles-header">
        <div className="profiles-title">
          <Terminal className="w-4 h-4" />
          Terminals
        </div>

        {/* Working Directory Dropdown */}
        <div className="profiles-workdir" ref={dirDropdownRef}>
          <button
            onClick={() => {
              setShowDirDropdown(!showDirDropdown)
              setCustomDirInput('')
            }}
            className="workdir-button"
            title={`Working Directory: ${globalWorkingDir}`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span className="workdir-path">{shortenPath(globalWorkingDir)}</span>
            <ChevronDown className="w-3 h-3" />
          </button>

          {showDirDropdown && (
            <div className="workdir-dropdown">
              <div className="workdir-input-wrapper">
                <input
                  type="text"
                  value={customDirInput}
                  onChange={(e) => setCustomDirInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customDirInput.trim()) {
                      onWorkingDirChange(customDirInput.trim())
                      setShowDirDropdown(false)
                      setCustomDirInput('')
                    } else if (e.key === 'Escape') {
                      setShowDirDropdown(false)
                    }
                    e.stopPropagation()
                  }}
                  placeholder="Enter path..."
                  className="workdir-input"
                  autoFocus
                />
              </div>
              <div className="workdir-list">
                {recentDirs.map((dir) => (
                  <button
                    key={dir}
                    onClick={() => {
                      onWorkingDirChange(dir)
                      setShowDirDropdown(false)
                    }}
                    className={`workdir-item ${dir === globalWorkingDir ? 'active' : ''}`}
                  >
                    <span>{shortenPath(dir)}</span>
                    {dir === globalWorkingDir && (
                      <span className="workdir-current">current</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="profiles-grid">
        {displayProfiles.map((profile, index) => (
          <button
            key={profile.id}
            className="profile-card"
            style={{
              '--card-accent': profile.color || 'var(--accent)',
            } as React.CSSProperties}
            onClick={() => onProfileClick(profile.id)}
            title={profile.name}
          >
            <div className="profile-icon-wrapper">
              {profile.icon || <Terminal className="w-4 h-4" />}
            </div>
            <div className="profile-name">{profile.name}</div>
            {index < 9 && (
              <div className="profile-shortcut">{index + 1}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
