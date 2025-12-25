import React, { useEffect, useState } from 'react'
import { Grid, Grid3X3, List, Search, Play, RefreshCw, Terminal, Folder, X, Settings, GripVertical, Star, Copy, ClipboardType, Paperclip } from 'lucide-react'
import { spawnTerminal, getProfiles } from '../hooks/useDashboard'
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory'
import type { Profile } from '../../components/SettingsModal'
import type { CategorySettings } from '../../components/settings/types'
import { sendMessage } from '../../shared/messaging'
import { getEffectiveWorkingDir } from '../../shared/utils'
import { themes } from '../../styles/themes'

const DEFAULT_CATEGORY_COLOR = '#6b7280'

type ViewMode = 'grid' | 'list'

export default function ProfilesSection() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [categorySettings, setCategorySettings] = useState<CategorySettings>({})
  const [defaultProfile, setDefaultProfile] = useState<string>('')

  // Category drag-and-drop state
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [categoryDropPosition, setCategoryDropPosition] = useState<'above' | 'below' | null>(null)

  // Drag and drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)

  // Working directory (dropdown is now in sidebar)
  const { globalWorkingDir } = useWorkingDirectory()

  const fetchProfiles = async () => {
    try {
      setLoading(true)
      const profilesList = await getProfiles()
      setProfiles(profilesList)
      setError(null)
    } catch (err) {
      setError('Failed to load profiles')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
  }, [])

  // Load category settings and default profile from Chrome storage
  useEffect(() => {
    chrome.storage.local.get(['categorySettings', 'defaultProfile'], (result: { categorySettings?: CategorySettings; defaultProfile?: string }) => {
      if (result.categorySettings) {
        setCategorySettings(result.categorySettings)
      }
      if (result.defaultProfile) {
        setDefaultProfile(result.defaultProfile)
      }
    })
  }, [])

  // Listen for Chrome storage changes to auto-update when profiles/settings change
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return

      if (changes.profiles?.newValue) {
        setProfiles(changes.profiles.newValue as Profile[])
      }
      if (changes.categorySettings?.newValue) {
        setCategorySettings(changes.categorySettings.newValue as CategorySettings)
      }
      if (changes.defaultProfile?.newValue !== undefined) {
        setDefaultProfile(changes.defaultProfile.newValue as string)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Helper to get category color
  const getCategoryColor = (category: string) => {
    return categorySettings[category]?.color || DEFAULT_CATEGORY_COLOR
  }

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

  // Group by category for display (tracking original index for drag-drop)
  const groupedProfiles = profiles.reduce(
    (acc, profile, originalIndex) => {
      // Apply filters
      const matchesSearch =
        !searchQuery ||
        profile.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        profile.command?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory = !selectedCategory || profile.category === selectedCategory
      if (!matchesSearch || !matchesCategory) return acc

      const cat = profile.category || 'Uncategorized'
      if (!acc[cat]) acc[cat] = []
      acc[cat].push({ profile, originalIndex })
      return acc
    },
    {} as Record<string, { profile: Profile; originalIndex: number }[]>
  )

  const launchProfile = async (profile: Profile) => {
    try {
      const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, globalWorkingDir)
      await spawnTerminal({
        name: profile.name,
        command: profile.command,
        workingDir: effectiveWorkingDir,
        profile: { ...profile, workingDir: effectiveWorkingDir },
      })
    } catch (err) {
      console.error('Launch error:', err)
    }
  }

  // Launch profile but paste command without executing (for TUIs/CLIs with flags)
  const launchProfilePasteOnly = async (profile: Profile) => {
    try {
      const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, globalWorkingDir)
      await spawnTerminal({
        name: profile.name,
        command: profile.command,
        workingDir: effectiveWorkingDir,
        profile: { ...profile, workingDir: effectiveWorkingDir },
        pasteOnly: true,
      })
    } catch (err) {
      console.error('Paste-only launch error:', err)
    }
  }

  // Open sidebar settings modal to edit a profile
  const editProfile = (profileId: string) => {
    sendMessage({ type: 'OPEN_SETTINGS_EDIT_PROFILE', profileId })
  }

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number, horizontal = false) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    const rect = e.currentTarget.getBoundingClientRect()
    let position: 'above' | 'below'

    if (horizontal) {
      // For grid layout: detect left/right based on X position
      const midpoint = rect.left + rect.width / 2
      position = e.clientX < midpoint ? 'above' : 'below'
    } else {
      // For list layout: detect top/bottom based on Y position
      const midpoint = rect.top + rect.height / 2
      position = e.clientY < midpoint ? 'above' : 'below'
    }

    setDragOverIndex(index)
    setDropPosition(position)
  }

  const handleDragLeave = () => {
    setDragOverIndex(null)
    setDropPosition(null)
  }

  const handleDrop = (index: number, targetCategory: string) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDropPosition(null)
      return
    }

    const newProfiles = [...profiles]
    const [draggedProfile] = newProfiles.splice(draggedIndex, 1)

    // Update category if dropped into a different category
    const newCategory = targetCategory === 'Uncategorized' ? undefined : targetCategory
    if (draggedProfile.category !== newCategory) {
      draggedProfile.category = newCategory
    }

    // Calculate the actual insert index based on drop position
    let insertIndex = index
    if (dropPosition === 'below') {
      insertIndex = index + 1
    }
    // Adjust for the removed item if it was before the insert point
    if (draggedIndex < insertIndex) {
      insertIndex -= 1
    }

    newProfiles.splice(insertIndex, 0, draggedProfile)
    setProfiles(newProfiles)

    // Save to Chrome storage
    chrome.storage.local.set({ profiles: newProfiles })

    // Dispatch event so other components update
    window.dispatchEvent(new CustomEvent('categorySettingsChanged', { detail: categorySettings }))

    setDraggedIndex(null)
    setDragOverIndex(null)
    setDropPosition(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDropPosition(null)
  }

  // Get sorted categories (by order, then alphabetically)
  const getSortedCategories = (): string[] => {
    const cats = Object.keys(groupedProfiles)
    return cats.sort((a, b) => {
      // Uncategorized always goes last
      if (a === 'Uncategorized' && b !== 'Uncategorized') return 1
      if (b === 'Uncategorized' && a !== 'Uncategorized') return -1
      // Use order from settings if available
      const orderA = categorySettings[a]?.order ?? Infinity
      const orderB = categorySettings[b]?.order ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
  }

  // Category drag-and-drop handlers
  const handleCategoryDragStart = (category: string) => {
    setDraggedCategory(category)
  }

  const handleCategoryDragOver = (e: React.DragEvent, category: string) => {
    e.preventDefault()
    if (draggedCategory === null || draggedCategory === category) return

    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const position = e.clientY < midpoint ? 'above' : 'below'

    setDragOverCategory(category)
    setCategoryDropPosition(position)
  }

  const handleCategoryDragLeave = () => {
    setDragOverCategory(null)
    setCategoryDropPosition(null)
  }

  const handleCategoryDrop = (targetCategory: string) => {
    if (draggedCategory === null || draggedCategory === targetCategory) {
      setDraggedCategory(null)
      setDragOverCategory(null)
      setCategoryDropPosition(null)
      return
    }

    const sortedCategories = getSortedCategories()
    const draggedIdx = sortedCategories.indexOf(draggedCategory)
    let targetIdx = sortedCategories.indexOf(targetCategory)

    if (draggedIdx === -1 || targetIdx === -1) {
      setDraggedCategory(null)
      setDragOverCategory(null)
      setCategoryDropPosition(null)
      return
    }

    // Adjust for drop position
    if (categoryDropPosition === 'below') {
      targetIdx += 1
    }
    if (draggedIdx < targetIdx) {
      targetIdx -= 1
    }

    // Build new order
    const newOrder = sortedCategories.filter(c => c !== draggedCategory)
    newOrder.splice(targetIdx, 0, draggedCategory)

    // Update categorySettings with new orders
    const newSettings = { ...categorySettings }
    newOrder.forEach((category, index) => {
      if (category !== 'Uncategorized') {
        newSettings[category] = {
          ...newSettings[category],
          color: newSettings[category]?.color || DEFAULT_CATEGORY_COLOR,
          order: index,
        }
      }
    })

    setCategorySettings(newSettings)
    chrome.storage.local.set({ categorySettings: newSettings })
    window.dispatchEvent(new CustomEvent('categorySettingsChanged', { detail: newSettings }))

    setDraggedCategory(null)
    setDragOverCategory(null)
    setCategoryDropPosition(null)
  }

  const handleCategoryDragEnd = () => {
    setDraggedCategory(null)
    setDragOverCategory(null)
    setCategoryDropPosition(null)
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-primary terminal-glow truncate flex items-center gap-3">
            <Grid3X3 className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0" />
            Profiles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profiles.length} profile{profiles.length !== 1 ? 's' : ''} · {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* View Toggle */}
          <div className="flex bg-muted/50 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-background shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={fetchProfiles}
            disabled={loading}
            className="p-2 rounded-lg bg-muted/50 hover:bg-muted disabled:opacity-50 transition-colors"
            title="Refresh profiles"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-4 mb-6">
        {/* Search - always full width */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search profiles by name or command..."
            className="w-full pl-12 pr-12 py-3 rounded-xl bg-card border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-base transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Pills - horizontal scroll on small screens */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex-shrink-0 ${
              !selectedCategory
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/25'
                : 'bg-card border border-border hover:bg-muted hover:border-muted-foreground/30'
            }`}
          >
            All Profiles
          </button>
          {categories.map((cat) => {
            const catColor = getCategoryColor(cat)
            const isSelected = selectedCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isSelected ? null : cat)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 flex-shrink-0 ${
                  isSelected
                    ? 'shadow-md'
                    : 'bg-card border border-border hover:bg-muted hover:border-muted-foreground/30'
                }`}
                style={isSelected ? {
                  backgroundColor: catColor + '20',
                  borderColor: catColor,
                  color: catColor,
                  boxShadow: `0 4px 12px ${catColor}25`
                } : undefined}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: catColor }}
                />
                {cat}
              </button>
            )
          })}
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
          {getSortedCategories().map((category) => {
            const categoryProfiles = groupedProfiles[category]
            if (!categoryProfiles) return null
            const catColor = getCategoryColor(category)
            const isUncategorized = category === 'Uncategorized'
            return (
            <div key={category}>
              {/* Category Header */}
              <div
                draggable={!isUncategorized}
                onDragStart={() => !isUncategorized && handleCategoryDragStart(category)}
                onDragOver={(e) => !isUncategorized && handleCategoryDragOver(e, category)}
                onDragLeave={handleCategoryDragLeave}
                onDrop={() => !isUncategorized && handleCategoryDrop(category)}
                onDragEnd={handleCategoryDragEnd}
                className={`
                  relative flex items-center gap-2 mb-4 py-1 px-1 -mx-1 rounded transition-all
                  ${!isUncategorized ? 'cursor-grab active:cursor-grabbing' : ''}
                  ${draggedCategory === category ? 'opacity-50' : ''}
                  ${draggedCategory && draggedCategory !== category && !isUncategorized ? 'hover:bg-muted/50' : ''}
                `}
              >
                {/* Drop indicator - above */}
                {dragOverCategory === category && categoryDropPosition === 'above' && (
                  <div className="absolute -top-[3px] left-0 right-0 h-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
                )}
                {/* Drop indicator - below */}
                {dragOverCategory === category && categoryDropPosition === 'below' && (
                  <div className="absolute -bottom-[3px] left-0 right-0 h-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
                )}
                {!isUncategorized && (
                  <GripVertical className="w-4 h-4 text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0" />
                )}
                <Folder className="w-5 h-5 flex-shrink-0" style={{ color: catColor }} />
                <h2 className="text-lg font-semibold">{category}</h2>
                <span className="text-sm text-muted-foreground">({categoryProfiles.length})</span>
              </div>

              {/* Grid View */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {categoryProfiles.map(({ profile, originalIndex }) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      originalIndex={originalIndex}
                      isDefault={profile.id === defaultProfile}
                      themeGradient={themes[profile.themeName]?.dark.backgroundGradient}
                      category={category}
                      onClick={() => launchProfile(profile)}
                      onPasteOnly={() => launchProfilePasteOnly(profile)}
                      onEdit={() => editProfile(profile.id)}
                      isDragging={draggedIndex === originalIndex}
                      isDragOver={dragOverIndex === originalIndex}
                      dropPosition={dragOverIndex === originalIndex ? dropPosition : null}
                      onDragStart={() => handleDragStart(originalIndex)}
                      onDragOver={(e) => handleDragOver(e, originalIndex, true)}
                      onDragLeave={handleDragLeave}
                      onDrop={(targetCategory) => handleDrop(originalIndex, targetCategory)}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              ) : (
                /* List View */
                <div className="space-y-2">
                  {categoryProfiles.map(({ profile, originalIndex }) => (
                    <ProfileListItem
                      key={profile.id}
                      profile={profile}
                      originalIndex={originalIndex}
                      isDefault={profile.id === defaultProfile}
                      themeGradient={themes[profile.themeName]?.dark.backgroundGradient}
                      category={category}
                      onClick={() => launchProfile(profile)}
                      onPasteOnly={() => launchProfilePasteOnly(profile)}
                      onEdit={() => editProfile(profile.id)}
                      isDragging={draggedIndex === originalIndex}
                      isDragOver={dragOverIndex === originalIndex}
                      dropPosition={dragOverIndex === originalIndex ? dropPosition : null}
                      onDragStart={() => handleDragStart(originalIndex)}
                      onDragOver={(e) => handleDragOver(e, originalIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={(targetCategory) => handleDrop(originalIndex, targetCategory)}
                      onDragEnd={handleDragEnd}
                    />
                  ))}
                </div>
              )}
            </div>
          )})}
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

interface ProfileCardProps {
  profile: Profile
  originalIndex: number
  isDefault: boolean
  themeGradient?: string
  category: string
  onClick: () => void
  onPasteOnly: () => void
  onEdit: () => void
  isDragging: boolean
  isDragOver: boolean
  dropPosition: 'above' | 'below' | null
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (targetCategory: string) => void
  onDragEnd: () => void
}

function ProfileCard({
  profile,
  isDefault,
  themeGradient,
  category,
  onClick,
  onPasteOnly,
  onEdit,
  isDragging,
  isDragOver,
  dropPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: ProfileCardProps) {
  // Extract emoji from name if present
  const emojiMatch = profile.name.match(/^(\p{Emoji})\s*/u)
  const emoji = emojiMatch?.[1]
  const displayName = emoji ? profile.name.replace(emojiMatch[0], '') : profile.name

  // Show truncated working dir if set (like sidebar: ./dirname)
  const truncatedDir = profile.workingDir && profile.workingDir !== '~'
    ? './' + profile.workingDir.split('/').filter(Boolean).pop()
    : null

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(category)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`
        group relative flex flex-col rounded-xl border transition-all overflow-hidden cursor-pointer
        ${isDragging ? 'opacity-50 border-primary scale-95' : 'border-border hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10'}
      `}
      style={themeGradient ? { background: themeGradient } : undefined}
    >
      {/* Drop indicator line - left (for grid layout) */}
      {isDragOver && dropPosition === 'above' && (
        <div className="absolute -left-[3px] top-0 bottom-0 w-[3px] bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] z-50" />
      )}
      {/* Drop indicator line - right (for grid layout) */}
      {isDragOver && dropPosition === 'below' && (
        <div className="absolute -right-[3px] top-0 bottom-0 w-[3px] bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] z-50" />
      )}

      {/* Main card content area */}
      <div className="flex flex-col items-center p-5 pt-6 pb-4">
        {/* Badges row - default and reference */}
        {(isDefault || profile.reference) && (
          <div className="flex items-center gap-2 mb-2">
            {isDefault && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-medium">
                <Star className="w-2.5 h-2.5 fill-current" />
                Default
              </div>
            )}
            {profile.reference && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-medium" title={profile.reference}>
                <Paperclip className="w-2.5 h-2.5" />
                Ref
              </div>
            )}
          </div>
        )}

        {/* Icon */}
        <div className="w-14 h-14 flex items-center justify-center mb-3 rounded-xl bg-white/10 text-3xl group-hover:scale-105 transition-transform">
          {emoji || <Terminal className="w-7 h-7 text-white/80" />}
        </div>

        {/* Name */}
        <span className="text-sm font-semibold text-center line-clamp-2 text-white leading-tight">
          {displayName}
        </span>

        {/* Working directory */}
        {truncatedDir && (
          <span className="text-[11px] text-white/50 mt-1 font-mono">{truncatedDir}</span>
        )}

        {/* Command preview */}
        {profile.command && (
          <span className="text-xs text-white/40 mt-1.5 font-mono truncate max-w-full px-2">
            {profile.command.length > 20 ? profile.command.slice(0, 20) + '…' : profile.command}
          </span>
        )}
      </div>

      {/* Action bar - appears on hover at bottom */}
      <div className="flex items-center justify-center gap-1 px-2 py-2 bg-black/20 backdrop-blur-sm border-t border-white/10 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={onDragStart}
          className="p-1.5 rounded-md hover:bg-white/10 cursor-grab active:cursor-grabbing transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-white/50" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            navigator.clipboard.writeText(profile.command || 'bash')
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
          title="Copy command"
        >
          <Copy className="w-4 h-4 text-white/50" />
        </button>
        {profile.command && (
          <button
            onClick={(e) => { e.stopPropagation(); onPasteOnly() }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="Paste command without running (edit flags first)"
          >
            <ClipboardType className="w-4 h-4 text-white/50" />
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
          title="Edit profile"
        >
          <Settings className="w-4 h-4 text-white/50" />
        </button>
        <button
          onClick={onClick}
          className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
          title="Launch"
        >
          <Play className="w-4 h-4 text-white/70" />
        </button>
      </div>
    </div>
  )
}

interface ProfileListItemProps {
  profile: Profile
  originalIndex: number
  isDefault: boolean
  themeGradient?: string
  category: string
  onClick: () => void
  onPasteOnly: () => void
  onEdit: () => void
  isDragging: boolean
  isDragOver: boolean
  dropPosition: 'above' | 'below' | null
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (targetCategory: string) => void
  onDragEnd: () => void
}

function ProfileListItem({
  profile,
  isDefault,
  themeGradient,
  category,
  onClick,
  onPasteOnly,
  onEdit,
  isDragging,
  isDragOver,
  dropPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: ProfileListItemProps) {
  const emojiMatch = profile.name.match(/^(\p{Emoji})\s*/u)
  const emoji = emojiMatch?.[1]
  const displayName = emoji ? profile.name.replace(emojiMatch[0], '') : profile.name

  // Show truncated working dir if set (like sidebar: ./dirname)
  const truncatedDir = profile.workingDir && profile.workingDir !== '~'
    ? './' + profile.workingDir.split('/').filter(Boolean).pop()
    : null

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={() => onDrop(category)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`
        relative w-full flex items-center gap-4 p-3 rounded-lg border transition-all group overflow-hidden cursor-pointer
        ${isDragging ? 'opacity-50 border-primary' : 'border-border hover:border-primary/50'}
      `}
      style={themeGradient ? { background: themeGradient } : undefined}
    >
      {/* Drop indicator line - above */}
      {isDragOver && dropPosition === 'above' && (
        <div className="absolute -top-[3px] left-0 right-0 h-[3px] bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] z-50" />
      )}
      {/* Drop indicator line - below */}
      {isDragOver && dropPosition === 'below' && (
        <div className="absolute -bottom-[3px] left-0 right-0 h-[3px] bg-green-500 rounded-full shadow-[0_0_8px_#22c55e] z-50" />
      )}

      {/* Drag handle - pointer-events-none so drag passes to parent */}
      <div
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 transition-colors pointer-events-none"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Content - pointer-events-none to allow drag through */}
      <div className="flex items-center gap-4 flex-1 min-w-0 pointer-events-none">
        <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/10 text-xl flex-shrink-0">
          {emoji || <Terminal className="w-5 h-5 text-white/80" />}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="font-medium truncate flex items-center gap-2 text-white">
            {displayName}
            {isDefault && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium">
                <Star className="w-2.5 h-2.5 fill-current" />
                Default
              </span>
            )}
            {profile.reference && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium" title={profile.reference}>
                <Paperclip className="w-2.5 h-2.5" />
                Ref
              </span>
            )}
            {truncatedDir && (
              <span className="text-[10px] text-white/50 font-mono">{truncatedDir}</span>
            )}
          </div>
          {profile.command && (
            <div className="text-sm text-white/50 font-mono truncate">{profile.command}</div>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          navigator.clipboard.writeText(profile.command || 'bash')
        }}
        onMouseDown={(e) => e.stopPropagation()}
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all flex-shrink-0 z-10"
        title="Copy command"
      >
        <Copy className="w-4 h-4 text-white/50 hover:text-white/80" />
      </button>
      {profile.command && (
        <button
          onClick={(e) => { e.stopPropagation(); onPasteOnly() }}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all flex-shrink-0 z-10"
          title="Paste command without running (edit flags first)"
        >
          <ClipboardType className="w-4 h-4 text-white/50 hover:text-white/80" />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit() }}
        onMouseDown={(e) => e.stopPropagation()}
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all flex-shrink-0 z-10"
        title="Edit profile"
      >
        <Settings className="w-4 h-4 text-white/50 hover:text-white/80" />
      </button>
      <div className="flex-shrink-0 pointer-events-none">
        <Play className="w-5 h-5 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </div>
  )
}
