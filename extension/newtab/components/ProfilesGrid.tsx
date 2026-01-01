import React from 'react'
import { Terminal } from 'lucide-react'

interface Profile {
  id: string
  name: string
  icon?: string
  color?: string
  category?: string
  favorite?: boolean
}

interface ProfilesGridProps {
  profiles: Profile[]
  defaultProfileId: string
  loading: boolean
  onProfileClick: (profileId: string) => void
}

export function ProfilesGrid({ profiles, defaultProfileId, loading, onProfileClick }: ProfilesGridProps) {
  if (loading) {
    return (
      <div className="profiles-section">
        <div className="profiles-header">
          <div className="profiles-title">Terminal Profiles</div>
        </div>
        <div className="profiles-grid">
          {[1, 2, 3, 4].map((i) => (
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

  // Sort: favorites first, then default, then alphabetically
  const sortedProfiles = [...profiles].sort((a, b) => {
    if (a.favorite && !b.favorite) return -1
    if (!a.favorite && b.favorite) return 1
    if (a.id === defaultProfileId) return -1
    if (b.id === defaultProfileId) return 1
    return a.name.localeCompare(b.name)
  })

  // Take top 8 for display
  const displayProfiles = sortedProfiles.slice(0, 8)

  return (
    <div className="profiles-section animate-slide-up stagger-3">
      <div className="profiles-header">
        <div className="profiles-title">Terminal Profiles</div>
        {profiles.length > 8 && (
          <div className="text-[0.7rem] text-[var(--text-muted)]">
            Showing {displayProfiles.length} of {profiles.length}
          </div>
        )}
      </div>

      <div className="profiles-grid">
        {displayProfiles.map((profile, index) => (
          <button
            key={profile.id}
            className={`profile-card ${profile.favorite ? 'favorite' : ''}`}
            style={{
              '--card-accent': profile.color || 'var(--accent)',
            } as React.CSSProperties}
            onClick={() => onProfileClick(profile.id)}
          >
            <div
              className="profile-icon-wrapper"
              style={{
                backgroundColor: profile.color
                  ? `${profile.color}15`
                  : 'var(--elevated)',
                color: profile.color || 'var(--accent)',
              }}
            >
              {profile.icon ? (
                <span>{profile.icon}</span>
              ) : (
                <Terminal className="w-5 h-5" />
              )}
            </div>
            <div className="profile-name">{profile.name}</div>
            {profile.category && (
              <div className="profile-category">{profile.category}</div>
            )}
            {index < 9 && (
              <div className="profile-shortcut">{index + 1}</div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
