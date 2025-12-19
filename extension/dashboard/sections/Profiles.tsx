import React, { useEffect, useState, useRef } from 'react'
import { Grid, List, Search, Play, RefreshCw, Terminal, Folder, X, FolderOpen, ChevronDown, Settings, GripVertical, Star } from 'lucide-react'
import { spawnTerminal, getProfiles } from '../hooks/useDashboard'
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory'
import type { Profile } from '../../components/SettingsModal'
import type { CategorySettings } from '../../components/settings/types'
import { sendMessage } from '../../shared/messaging'
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

  // Working directory management
  const {
    globalWorkingDir,
    setGlobalWorkingDir,
    recentDirs,
    setRecentDirs,
    addToRecentDirs,
  } = useWorkingDirectory()
  const [showDirDropdown, setShowDirDropdown] = useState(false)
  const [customDirInput, setCustomDirInput] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDirDropdown(false)
      }
    }
    if (showDirDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showDirDropdown])

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
      // Use profile.workingDir only if it's set AND not just "~" (which means "inherit")
      const effectiveWorkingDir = (profile.workingDir && profile.workingDir !== '~')
        ? profile.workingDir
        : globalWorkingDir
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

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null)
      setDragOverIndex(null)
      setDropPosition(null)
      return
    }

    const newProfiles = [...profiles]
    const [draggedProfile] = newProfiles.splice(draggedIndex, 1)

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
      {/* Working Directory Bar */}
      <div className="mb-6 p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderOpen className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-muted-foreground">Working Directory</span>
          </div>
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDirDropdown(!showDirDropdown)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background border border-border hover:border-primary/50 transition-colors font-mono text-sm"
            >
              <span className="max-w-[300px] truncate">{globalWorkingDir}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showDirDropdown ? 'rotate-180' : ''}`} />
            </button>

            {showDirDropdown && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                {/* Custom input */}
                <div className="p-3 border-b border-border">
                  <input
                    type="text"
                    value={customDirInput}
                    onChange={(e) => setCustomDirInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customDirInput.trim()) {
                        setGlobalWorkingDir(customDirInput.trim())
                        addToRecentDirs(customDirInput.trim())
                        setShowDirDropdown(false)
                        setCustomDirInput('')
                      } else if (e.key === 'Escape') {
                        setShowDirDropdown(false)
                      }
                    }}
                    placeholder="Type path and press Enter"
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm font-mono focus:border-primary focus:outline-none"
                    autoFocus
                  />
                </div>

                {/* Recent directories */}
                <div className="max-h-[250px] overflow-y-auto">
                  {recentDirs.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                      No recent directories
                    </div>
                  ) : (
                    recentDirs.map((dir) => (
                      <div
                        key={dir}
                        className={`flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors group ${
                          dir === globalWorkingDir ? 'bg-primary/10 text-primary' : ''
                        }`}
                      >
                        <button
                          onClick={() => {
                            setGlobalWorkingDir(dir)
                            setShowDirDropdown(false)
                          }}
                          className="flex-1 text-left text-sm font-mono truncate"
                        >
                          {dir}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setRecentDirs((prev) => prev.filter((d) => d !== dir))
                            if (globalWorkingDir === dir) {
                              setGlobalWorkingDir('~')
                            }
                          }}
                          className="ml-2 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Remove from list"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Profiles without a specific directory will launch in this location
        </p>
      </div>

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
          {categories.map((cat) => {
            const catColor = getCategoryColor(cat)
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  selectedCategory === cat
                    ? 'bg-card border-2'
                    : 'bg-card border border-border hover:bg-muted'
                }`}
                style={selectedCategory === cat ? { borderColor: catColor, color: catColor } : undefined}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
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
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {categoryProfiles.map(({ profile, originalIndex }) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      originalIndex={originalIndex}
                      isDefault={profile.id === defaultProfile}
                      themeGradient={themes[profile.themeName]?.dark.backgroundGradient}
                      onClick={() => launchProfile(profile)}
                      onEdit={() => editProfile(profile.id)}
                      isDragging={draggedIndex === originalIndex}
                      isDragOver={dragOverIndex === originalIndex}
                      dropPosition={dragOverIndex === originalIndex ? dropPosition : null}
                      onDragStart={() => handleDragStart(originalIndex)}
                      onDragOver={(e) => handleDragOver(e, originalIndex, true)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => handleDrop(originalIndex)}
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
                      onClick={() => launchProfile(profile)}
                      onEdit={() => editProfile(profile.id)}
                      isDragging={draggedIndex === originalIndex}
                      isDragOver={dragOverIndex === originalIndex}
                      dropPosition={dragOverIndex === originalIndex ? dropPosition : null}
                      onDragStart={() => handleDragStart(originalIndex)}
                      onDragOver={(e) => handleDragOver(e, originalIndex)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => handleDrop(originalIndex)}
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
  onClick: () => void
  onEdit: () => void
  isDragging: boolean
  isDragOver: boolean
  dropPosition: 'above' | 'below' | null
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: () => void
  onDragEnd: () => void
}

function ProfileCard({
  profile,
  isDefault,
  themeGradient,
  onClick,
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
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`
        group relative flex flex-col items-center p-4 rounded-xl border transition-all overflow-hidden
        ${isDragging ? 'opacity-50 border-primary' : 'border-border hover:border-primary/50'}
      `}
      style={themeGradient ? { background: themeGradient } : undefined}
    >
      {/* Drop indicator line - left (for grid layout) */}
      {isDragOver && dropPosition === 'above' && (
        <div className="absolute -left-[3px] top-0 bottom-0 w-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
      )}
      {/* Drop indicator line - right (for grid layout) */}
      {isDragOver && dropPosition === 'below' && (
        <div className="absolute -right-[3px] top-0 bottom-0 w-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
      )}

      {/* Default badge - top left */}
      {isDefault && (
        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium">
          <Star className="w-2.5 h-2.5 fill-current" />
          Default
        </div>
      )}

      {/* Drag handle - top left (only show if not default) */}
      {!isDefault && (
        <div
          className="absolute top-2 left-2 p-1 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 opacity-0 group-hover:opacity-100 transition-all"
          title="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Edit button - top right corner */}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit() }}
        className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
        title="Edit profile"
      >
        <Settings className="w-3.5 h-3.5 text-white/50 hover:text-white/80" />
      </button>

      <button onClick={onClick} className="flex flex-col items-center w-full">
        <div className="w-12 h-12 flex items-center justify-center mb-2 rounded-lg bg-white/10 text-2xl group-hover:scale-110 transition-transform">
          {emoji || <Terminal className="w-6 h-6 text-white/80" />}
        </div>
        <span className="text-sm font-medium text-center line-clamp-2 text-white">{displayName}</span>
        {truncatedDir && (
          <span className="text-[10px] text-white/50 mt-0.5 font-mono">{truncatedDir}</span>
        )}
        {profile.command && (
          <span className="text-xs text-white/50 mt-1 font-mono truncate max-w-full">
            {profile.command.length > 15 ? profile.command.slice(0, 15) + '...' : profile.command}
          </span>
        )}
        <Play className="w-4 h-4 text-white/80 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  )
}

interface ProfileListItemProps {
  profile: Profile
  originalIndex: number
  isDefault: boolean
  themeGradient?: string
  onClick: () => void
  onEdit: () => void
  isDragging: boolean
  isDragOver: boolean
  dropPosition: 'above' | 'below' | null
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: () => void
  onDragEnd: () => void
}

function ProfileListItem({
  profile,
  isDefault,
  themeGradient,
  onClick,
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
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`
        relative w-full flex items-center gap-4 p-3 rounded-lg border transition-all group overflow-hidden
        ${isDragging ? 'opacity-50 border-primary' : 'border-border hover:border-primary/50'}
      `}
      style={themeGradient ? { background: themeGradient } : undefined}
    >
      {/* Drop indicator line - above */}
      {isDragOver && dropPosition === 'above' && (
        <div className="absolute -top-[3px] left-0 right-0 h-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
      )}
      {/* Drop indicator line - below */}
      {isDragOver && dropPosition === 'below' && (
        <div className="absolute -bottom-[3px] left-0 right-0 h-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
      )}

      {/* Drag handle */}
      <div
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 transition-colors"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>

      <button onClick={onClick} className="flex items-center gap-4 flex-1 min-w-0">
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
            {truncatedDir && (
              <span className="text-[10px] text-white/50 font-mono">{truncatedDir}</span>
            )}
          </div>
          {profile.command && (
            <div className="text-sm text-white/50 font-mono truncate">{profile.command}</div>
          )}
        </div>
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit() }}
        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all flex-shrink-0"
        title="Edit profile"
      >
        <Settings className="w-4 h-4 text-white/50 hover:text-white/80" />
      </button>
      <button onClick={onClick} className="flex-shrink-0">
        <Play className="w-5 h-5 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity" />
      </button>
    </div>
  )
}
