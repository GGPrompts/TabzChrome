import React, { useEffect, useState } from 'react'
import { Grid, List, Search, Play, RefreshCw, Terminal, Folder, X } from 'lucide-react'

interface Profile {
  id: string
  name: string
  command?: string
  workingDir: string
  category?: string
  fontSize?: number
  fontFamily?: string
  themeName?: string
}

type ViewMode = 'grid' | 'list'

export default function ProfilesSection() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const fetchProfiles = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/browser/profiles')
      if (res.ok) {
        const data = await res.json()
        setProfiles(data.profiles || [])
        setError(null)
      } else {
        setError('Failed to fetch profiles')
      }
    } catch (err) {
      setError('Backend not connected')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  // Get unique categories
  const categories = Array.from(new Set(profiles.map((p) => p.category).filter(Boolean))) as string[]

  // Filter profiles
  const filteredProfiles = profiles.filter((profile) => {
    const matchesSearch =
      !searchQuery ||
      profile.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      profile.command?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || profile.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Group by category for display
  const groupedProfiles = filteredProfiles.reduce(
    (acc, profile) => {
      const cat = profile.category || 'Uncategorized'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(profile)
      return acc
    },
    {} as Record<string, Profile[]>
  )

  const launchProfile = async (profile: Profile) => {
    try {
      const res = await fetch('/api/spawn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profile.name,
          command: profile.command || '',
          workingDir: profile.workingDir || '',
        }),
      })
      if (!res.ok) {
        console.error('Failed to launch profile')
      }
    } catch (err) {
      console.error('Launch error:', err)
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold terminal-glow">Profiles</h1>
          <p className="text-muted-foreground mt-1">
            {profiles.length} profiles in {categories.length} categories
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={fetchProfiles}
            disabled={loading}
            className="p-2 rounded-lg border border-border hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search profiles..."
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-card border border-border focus:border-primary focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !selectedCategory
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-card border border-border hover:bg-muted'
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-card border border-border hover:bg-muted'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive mb-6">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Profiles Display */}
      {!loading && !error && (
        <div className="space-y-8">
          {Object.entries(groupedProfiles).map(([category, categoryProfiles]) => (
            <div key={category}>
              {/* Category Header */}
              <div className="flex items-center gap-2 mb-4">
                <Folder className="w-5 h-5 text-primary" />
                <h2 className="text-lg font-semibold">{category}</h2>
                <span className="text-sm text-muted-foreground">({categoryProfiles.length})</span>
              </div>

              {/* Grid View */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {categoryProfiles.map((profile) => (
                    <ProfileCard key={profile.id} profile={profile} onClick={() => launchProfile(profile)} />
                  ))}
                </div>
              ) : (
                /* List View */
                <div className="space-y-2">
                  {categoryProfiles.map((profile) => (
                    <ProfileListItem key={profile.id} profile={profile} onClick={() => launchProfile(profile)} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredProfiles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Terminal className="w-12 h-12 mb-4" />
          <p>{searchQuery ? 'No profiles match your search' : 'No profiles found'}</p>
        </div>
      )}
    </div>
  )
}

function ProfileCard({ profile, onClick }: { profile: Profile; onClick: () => void }) {
  // Extract emoji from name if present
  const emojiMatch = profile.name.match(/^(\p{Emoji})\s*/u)
  const emoji = emojiMatch?.[1]
  const displayName = emoji ? profile.name.replace(emojiMatch[0], '') : profile.name

  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center p-4 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all"
    >
      <div className="w-12 h-12 flex items-center justify-center mb-2 rounded-lg bg-primary/10 text-2xl group-hover:scale-110 transition-transform">
        {emoji || <Terminal className="w-6 h-6 text-primary" />}
      </div>
      <span className="text-sm font-medium text-center line-clamp-2">{displayName}</span>
      {profile.command && (
        <span className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-full">
          {profile.command.length > 15 ? profile.command.slice(0, 15) + '...' : profile.command}
        </span>
      )}
      <Play className="w-4 h-4 text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
    </button>
  )
}

function ProfileListItem({ profile, onClick }: { profile: Profile; onClick: () => void }) {
  const emojiMatch = profile.name.match(/^(\p{Emoji})\s*/u)
  const emoji = emojiMatch?.[1]
  const displayName = emoji ? profile.name.replace(emojiMatch[0], '') : profile.name

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-lg bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
    >
      <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-primary/10 text-xl flex-shrink-0">
        {emoji || <Terminal className="w-5 h-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="font-medium truncate">{displayName}</div>
        {profile.command && (
          <div className="text-sm text-muted-foreground font-mono truncate">{profile.command}</div>
        )}
      </div>
      <Play className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  )
}
