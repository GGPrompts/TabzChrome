import React, { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Grid3X3,
  GripVertical,
  Download,
  Upload,
  Search,
  ChevronUp,
  ChevronRight,
  Folder,
  Star,
  Play,
  Filter,
  Tags,
  Check,
  SquareTerminal,
  PanelLeft,
  Pin,
  PinOff,
  Link2,
} from 'lucide-react'
import { Terminal as LucideTerminal } from 'lucide-react'
// Animated icons
import {
  PlusIcon,
  SquarePenIcon,
  DeleteIcon,
  SparklesIcon,
  XIcon,
  ChevronDownIcon,
  CopyIcon,
  VolumeIcon,
  AttachFileIcon,
  MaximizeIcon,
  FolderOpenIcon,
  TerminalIcon,
  GridIcon,
  type AnimatedIconHandle,
} from '../../components/icons'
import { TerminalPreview } from '../components/TerminalPreview'
import { themes, themeNames } from '../../styles/themes'
import { backgroundGradients, gradientNames, PANEL_COLORS, getGradientCSS, DEFAULT_PANEL_COLOR, DEFAULT_TRANSPARENCY } from '../../styles/terminal-backgrounds'
import {
  type Profile,
  type CategorySettings,
  type AudioSettings,
  type AudioMode,
  type FilePickerDefaults,
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_PROFILE,
  DEFAULT_AUDIO_SETTINGS,
  DEFAULT_FILE_PICKER_DEFAULTS,
  getAvailableFonts,
  TTS_VOICES,
} from '../../components/settings/types'
import FilePickerModal from '../components/files/FilePickerModal'
import { useDragDrop } from '../../hooks/useDragDrop'
import { spawnTerminal, spawnTerminalPopout } from '../hooks/useDashboard'
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory'
import { getEffectiveWorkingDir } from '../../shared/utils'
import { getEffectiveProfile } from '../../shared/profiles'

// Helper to get media URL (matches Terminal.tsx pattern)
const getMediaUrl = (path: string | undefined): string | null => {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://')) {
    return path
  }
  return `http://localhost:8129/api/media?path=${encodeURIComponent(path)}`
}

/**
 * SettingsProfiles - Unified profile management section
 *
 * Combines functionality from:
 * - Dashboard Profiles.tsx (profile cards with themes)
 * - Settings ProfilesTab.tsx (edit form)
 *
 * Features:
 * - Profile cards showing visual themes
 * - Click card to edit (inline form with TerminalPreview)
 * - Category management with drag-drop
 * - Import/export profiles
 */
export default function SettingsProfiles() {
  // Profile state
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [defaultProfile, setDefaultProfileState] = useState<string>('')
  const [categorySettings, setCategorySettings] = useState<CategorySettings>({})
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS)

  // Edit state
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)

  // Category edit mode
  const [editingCategories, setEditingCategories] = useState(false)
  const [categoryRenames, setCategoryRenames] = useState<Record<string, string>>({})

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set()) // Empty = show all
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement>(null)

  // Dark mode (for preview)
  // Always use dark mode for dashboard - light mode only affects sidebar terminals
  const isDark = true

  // Import dialog state
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [pendingImportProfiles, setPendingImportProfiles] = useState<Profile[]>([])
  const [pendingImportCategorySettings, setPendingImportCategorySettings] = useState<CategorySettings | undefined>()
  const [importWarnings, setImportWarnings] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Animated icon ref - play animation on mount
  const iconRef = useRef<AnimatedIconHandle>(null)
  useEffect(() => {
    const timer = setTimeout(() => iconRef.current?.startAnimation(), 100)
    return () => clearTimeout(timer)
  }, [])

  // Audio section in profile edit form
  const [profileAudioTestPlaying, setProfileAudioTestPlaying] = useState(false)

  // Working directory (for launching profiles)
  const { globalWorkingDir } = useWorkingDirectory()

  // Category drag-and-drop state
  const {
    draggedItem: draggedCategory,
    dragOverItem: dragOverCategory,
    dropPosition: categoryDropPosition,
    setDraggedItem: setDraggedCategory,
    setDragOverItem: setDragOverCategory,
    setDropPosition: setCategoryDropPosition,
    resetDragState: resetCategoryDragState,
  } = useDragDrop<string>()

  // Profile drag-and-drop state
  const {
    draggedItem: draggedIndex,
    dragOverItem: dragOverIndex,
    dropPosition: profileDropPosition,
    setDraggedItem: setDraggedIndex,
    setDragOverItem: setDragOverIndex,
    setDropPosition: setProfileDropPosition,
    resetDragState: resetProfileDragState,
  } = useDragDrop<number>()

  // Load data from Chrome storage
  useEffect(() => {
    setLoading(true)
    chrome.storage.local.get(['profiles', 'defaultProfile', 'categorySettings', 'audioSettings'], (result) => {
      const loadedProfiles = result.profiles as Profile[] || []
      if (result.profiles) {
        setProfiles(loadedProfiles)
      }
      if (result.defaultProfile) {
        setDefaultProfileState(result.defaultProfile as string)
      }
      if (result.categorySettings) {
        setCategorySettings(result.categorySettings as CategorySettings)
      }
      if (result.audioSettings) {
        setAudioSettings(result.audioSettings as AudioSettings)
      }
      setLoading(false)

      // Check for edit parameter in URL hash (e.g., #/profiles?edit=profile-id)
      const hash = window.location.hash
      if (hash.includes('?')) {
        const queryString = hash.split('?')[1]
        const params = new URLSearchParams(queryString)
        const editProfileId = params.get('edit')
        if (editProfileId && loadedProfiles.length > 0) {
          const profileToEdit = loadedProfiles.find(p => p.id === editProfileId)
          if (profileToEdit) {
            setEditingProfile({ ...profileToEdit })
            setIsAddingNew(false)
            // Clear the edit param from URL to prevent re-opening on refresh
            window.history.replaceState(null, '', window.location.pathname + '#/profiles')
          }
        }
      }
    })
  }, [])

  // Listen for hash changes to handle edit parameter (e.g., from Terminals page)
  useEffect(() => {
    const checkEditParam = () => {
      const hash = window.location.hash
      if (hash.includes('#/profiles') && hash.includes('?')) {
        const queryString = hash.split('?')[1]
        const params = new URLSearchParams(queryString)
        const editProfileId = params.get('edit')
        if (editProfileId && profiles.length > 0) {
          const profileToEdit = profiles.find(p => p.id === editProfileId)
          if (profileToEdit) {
            setEditingProfile({ ...profileToEdit })
            setIsAddingNew(false)
            // Clear the edit param from URL to prevent re-opening on refresh
            window.history.replaceState(null, '', window.location.pathname + '#/profiles')
          }
        }
      }
    }

    // Check on mount and on hash change
    checkEditParam()
    window.addEventListener('hashchange', checkEditParam)
    return () => window.removeEventListener('hashchange', checkEditParam)
  }, [profiles])

  // Listen for Chrome storage changes
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return
      if (changes.profiles?.newValue) {
        setProfiles(changes.profiles.newValue as Profile[])
      }
      if (changes.defaultProfile?.newValue !== undefined) {
        setDefaultProfileState(changes.defaultProfile.newValue as string)
      }
      if (changes.categorySettings?.newValue) {
        setCategorySettings(changes.categorySettings.newValue as CategorySettings)
      }
      if (changes.audioSettings?.newValue) {
        setAudioSettings(changes.audioSettings.newValue as AudioSettings)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false)
      }
    }
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showFilterDropdown])

  // Get unique categories
  const getUniqueCategories = (): string[] => {
    const categories = new Set<string>()
    profiles.forEach(p => {
      if (p.category) categories.add(p.category)
    })
    return Array.from(categories).sort((a, b) => {
      const orderA = categorySettings[a]?.order ?? Infinity
      const orderB = categorySettings[b]?.order ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
  }

  // Get category color
  const getCategoryColor = (category: string): string => {
    return categorySettings[category]?.color || DEFAULT_CATEGORY_COLOR
  }

  // Filter profiles by search and category
  const filteredProfiles = profiles.filter(profile => {
    // Category filter (empty set = show all)
    if (selectedCategories.size > 0) {
      const profileCategory = profile.category || '__uncategorized__'
      if (!selectedCategories.has(profileCategory)) return false
    }

    // Search filter
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      profile.name.toLowerCase().includes(query) ||
      profile.command?.toLowerCase().includes(query) ||
      profile.category?.toLowerCase().includes(query)
    )
  })

  // Group profiles by category
  const groupedProfiles = filteredProfiles.reduce((acc, profile, index) => {
    const cat = profile.category || ''
    if (!acc[cat]) acc[cat] = []
    // Track original index for drag-drop
    const originalIndex = profiles.findIndex(p => p.id === profile.id)
    acc[cat].push({ profile, originalIndex })
    return acc
  }, {} as Record<string, { profile: Profile; originalIndex: number }[]>)

  // Get sorted categories
  const getSortedCategories = (): string[] => {
    const cats = Object.keys(groupedProfiles)
    return cats.sort((a, b) => {
      if (!a && b) return 1
      if (a && !b) return -1
      const orderA = categorySettings[a]?.order ?? Infinity
      const orderB = categorySettings[b]?.order ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
  }

  // Profile actions
  const handleAddProfile = () => {
    setEditingProfile({ ...DEFAULT_PROFILE, id: `profile-${Date.now()}` })
    setIsAddingNew(true)
  }

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile({ ...profile })
    setIsAddingNew(false)
  }

  const handleSaveProfile = () => {
    if (!editingProfile?.name || !editingProfile?.id) return

    let updatedProfiles: Profile[]
    if (isAddingNew) {
      updatedProfiles = [...profiles, editingProfile]
    } else {
      updatedProfiles = profiles.map(p =>
        p.id === editingProfile.id ? editingProfile : p
      )
    }

    setProfiles(updatedProfiles)
    chrome.storage.local.set({ profiles: updatedProfiles })

    setEditingProfile(null)
    setIsAddingNew(false)
  }

  const handleCancelEdit = () => {
    setEditingProfile(null)
    setIsAddingNew(false)
  }

  const handleDeleteProfile = (profileId: string) => {
    const profileToDelete = profiles.find(p => p.id === profileId)
    if (!profileToDelete) return

    // Show confirmation dialog
    const confirmed = window.confirm(
      `Delete "${profileToDelete.name}"?\n\nThis action cannot be undone.`
    )
    if (!confirmed) return

    const updatedProfiles = profiles.filter(p => p.id !== profileId)
    setProfiles(updatedProfiles)
    chrome.storage.local.set({ profiles: updatedProfiles })

    // If deleting default profile, set new default
    if (profileId === defaultProfile && updatedProfiles.length > 0) {
      setDefaultProfileState(updatedProfiles[0].id)
      chrome.storage.local.set({ defaultProfile: updatedProfiles[0].id })
    }
  }

  const handleSetDefault = (profileId: string) => {
    setDefaultProfileState(profileId)
    chrome.storage.local.set({ defaultProfile: profileId })
  }

  const handleTogglePin = (profileId: string) => {
    const updatedProfiles = profiles.map(p =>
      p.id === profileId ? { ...p, pinnedToNewTab: !p.pinnedToNewTab } : p
    )
    setProfiles(updatedProfiles)
    chrome.storage.local.set({ profiles: updatedProfiles })
  }

  const handleLaunchProfile = async (profile: Profile) => {
    const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, globalWorkingDir)
    await spawnTerminal({
      name: profile.name,
      command: profile.command,
      workingDir: effectiveWorkingDir,
      profile: { ...profile, workingDir: effectiveWorkingDir },
    })
  }

  const handleLaunchPasteOnly = async (profile: Profile) => {
    const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, globalWorkingDir)
    await spawnTerminal({
      name: profile.name,
      command: profile.command,
      workingDir: effectiveWorkingDir,
      profile: { ...profile, workingDir: effectiveWorkingDir },
      pasteOnly: true, // Paste command without executing
    })
  }

  const handleLaunchPopout = async (profile: Profile) => {
    const effectiveWorkingDir = getEffectiveWorkingDir(profile.workingDir, globalWorkingDir)
    await spawnTerminalPopout({
      name: profile.name,
      command: profile.command,
      workingDir: effectiveWorkingDir,
      profile: { ...profile, workingDir: effectiveWorkingDir },
    })
  }

  const handleOpenReference = (profile: Profile) => {
    if (!profile.reference) return
    if (profile.reference.startsWith('http://') || profile.reference.startsWith('https://')) {
      window.open(profile.reference, '_blank')
    } else {
      window.location.hash = `/files?path=${encodeURIComponent(profile.reference)}`
    }
  }

  // Category color management
  const setCategoryColor = (categoryName: string, color: string) => {
    const newSettings = {
      ...categorySettings,
      [categoryName]: {
        ...categorySettings[categoryName],
        color,
      }
    }
    setCategorySettings(newSettings)
    chrome.storage.local.set({ categorySettings: newSettings })
    window.dispatchEvent(new CustomEvent('categorySettingsChanged', { detail: newSettings }))
  }

  // Category edit mode handlers
  const handleStartEditCategories = () => {
    // Initialize renames with current names
    const renames: Record<string, string> = {}
    getUniqueCategories().forEach(cat => {
      renames[cat] = cat
    })
    setCategoryRenames(renames)
    setEditingCategories(true)
  }

  const handleSaveCategories = () => {
    // Apply renames to profiles and category settings
    const updatedProfiles = profiles.map(profile => {
      if (profile.category && categoryRenames[profile.category] !== profile.category) {
        return { ...profile, category: categoryRenames[profile.category] || profile.category }
      }
      return profile
    })

    // Update category settings with new names
    const newCategorySettings: CategorySettings = {}
    Object.entries(categorySettings).forEach(([oldName, settings]) => {
      const newName = categoryRenames[oldName] || oldName
      if (newName) { // Don't keep empty names
        newCategorySettings[newName] = settings
      }
    })

    setProfiles(updatedProfiles)
    setCategorySettings(newCategorySettings)
    chrome.storage.local.set({
      profiles: updatedProfiles,
      categorySettings: newCategorySettings,
    })
    window.dispatchEvent(new CustomEvent('categorySettingsChanged', { detail: newCategorySettings }))

    setEditingCategories(false)
    setCategoryRenames({})
  }

  const handleCancelEditCategories = () => {
    setEditingCategories(false)
    setCategoryRenames({})
  }

  const handleDeleteCategory = (categoryName: string) => {
    // Remove category from all profiles (move to uncategorized)
    const updatedProfiles = profiles.map(profile => {
      if (profile.category === categoryName) {
        const { category, ...rest } = profile
        return rest as Profile
      }
      return profile
    })

    // Remove from category settings
    const newCategorySettings = { ...categorySettings }
    delete newCategorySettings[categoryName]

    setProfiles(updatedProfiles)
    setCategorySettings(newCategorySettings)
    chrome.storage.local.set({
      profiles: updatedProfiles,
      categorySettings: newCategorySettings,
    })
    window.dispatchEvent(new CustomEvent('categorySettingsChanged', { detail: newCategorySettings }))

    // Remove from renames
    const newRenames = { ...categoryRenames }
    delete newRenames[categoryName]
    setCategoryRenames(newRenames)
  }

  // Category drag-drop handlers
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
      resetCategoryDragState()
      return
    }

    const sortedCategories = getSortedCategories()
    const draggedIdx = sortedCategories.indexOf(draggedCategory)
    let targetIdx = sortedCategories.indexOf(targetCategory)

    if (draggedIdx === -1 || targetIdx === -1) {
      resetCategoryDragState()
      return
    }

    if (categoryDropPosition === 'below') targetIdx += 1
    if (draggedIdx < targetIdx) targetIdx -= 1

    const newOrder = sortedCategories.filter(c => c !== draggedCategory)
    newOrder.splice(targetIdx, 0, draggedCategory)

    const newSettings = { ...categorySettings }
    newOrder.forEach((category, index) => {
      if (category) {
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

    resetCategoryDragState()
  }

  const handleCategoryDragEnd = () => {
    resetCategoryDragState()
  }

  // Profile drag-drop handlers
  const handleProfileDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleProfileDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const position = e.clientY < midpoint ? 'above' : 'below'
    setDragOverIndex(index)
    setProfileDropPosition(position)
  }

  const handleProfileDragLeave = () => {
    setDragOverIndex(null)
    setProfileDropPosition(null)
  }

  const handleProfileDrop = (index: number, targetCategory: string) => {
    if (draggedIndex === null || draggedIndex === index) {
      resetProfileDragState()
      return
    }

    const newProfiles = [...profiles]
    const [draggedProfile] = newProfiles.splice(draggedIndex, 1)

    // Update category if different
    const newCategory = targetCategory || undefined
    if (draggedProfile.category !== newCategory) {
      draggedProfile.category = newCategory
    }

    let insertIndex = index
    if (profileDropPosition === 'below') insertIndex += 1
    if (draggedIndex < insertIndex) insertIndex -= 1

    newProfiles.splice(insertIndex, 0, draggedProfile)
    setProfiles(newProfiles)
    chrome.storage.local.set({ profiles: newProfiles })

    resetProfileDragState()
  }

  const handleProfileDragEnd = () => {
    resetProfileDragState()
  }

  // Import/Export
  const handleExport = () => {
    const exportData = {
      profiles,
      categorySettings,
      exportedAt: new Date().toISOString(),
      version: '1.0',
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tabz-profiles-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        const warnings: string[] = []

        if (!data.profiles || !Array.isArray(data.profiles)) {
          throw new Error('Invalid file format')
        }

        // Validate profiles
        const validProfiles = data.profiles.filter((p: any) => p.id && p.name)
        if (validProfiles.length < data.profiles.length) {
          warnings.push(`${data.profiles.length - validProfiles.length} invalid profile(s) will be skipped`)
        }

        setPendingImportProfiles(validProfiles)
        setPendingImportCategorySettings(data.categorySettings)
        setImportWarnings(warnings)
        setShowImportDialog(true)
      } catch (err) {
        alert('Failed to parse import file')
      }
    }
    reader.readAsText(file)

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleImportConfirm = (mode: 'merge' | 'replace') => {
    let newProfiles: Profile[]
    let newCategorySettings: CategorySettings

    if (mode === 'replace') {
      newProfiles = pendingImportProfiles
      newCategorySettings = pendingImportCategorySettings || {}
    } else {
      // Merge - add new profiles, keep existing with same ID
      const existingIds = new Set(profiles.map(p => p.id))
      const newUniqueProfiles = pendingImportProfiles.filter(p => !existingIds.has(p.id))
      newProfiles = [...profiles, ...newUniqueProfiles]
      newCategorySettings = { ...categorySettings, ...pendingImportCategorySettings }
    }

    setProfiles(newProfiles)
    setCategorySettings(newCategorySettings)
    chrome.storage.local.set({
      profiles: newProfiles,
      categorySettings: newCategorySettings,
    })

    setShowImportDialog(false)
    setPendingImportProfiles([])
    setPendingImportCategorySettings(undefined)
    setImportWarnings([])
  }

  const handleImportCancel = () => {
    setShowImportDialog(false)
    setPendingImportProfiles([])
    setPendingImportCategorySettings(undefined)
    setImportWarnings([])
  }

  // Audio test
  const handleProfileAudioTest = async () => {
    if (!editingProfile || profileAudioTestPlaying) return
    setProfileAudioTestPlaying(true)

    try {
      let testVoice = editingProfile.audioOverrides?.voice || audioSettings.voice
      if (testVoice === 'random') {
        testVoice = TTS_VOICES[Math.floor(Math.random() * TTS_VOICES.length)].value
      }

      const response = await fetch('http://localhost:8129/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Claude ready',
          voice: testVoice,
          rate: editingProfile.audioOverrides?.rate || audioSettings.rate
        })
      })
      const data = await response.json()

      if (data.success && data.url) {
        const audio = new Audio(data.url)
        audio.volume = audioSettings.volume
        audio.onended = () => setProfileAudioTestPlaying(false)
        audio.onerror = () => setProfileAudioTestPlaying(false)
        await audio.play()
      } else {
        setProfileAudioTestPlaying(false)
      }
    } catch (err) {
      console.error('[SettingsProfiles] Audio test failed:', err)
      setProfileAudioTestPlaying(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  // Compute default profile object for theme inheritance
  const defaultProfileObj = profiles.find(p => p.id === defaultProfile)

  // Show edit form if editing
  if (editingProfile) {
    const currentDefaultProfile = defaultProfileObj
    const isEditingDefault = editingProfile.id === defaultProfile

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <ProfileEditForm
          profile={editingProfile}
          setProfile={setEditingProfile}
          isNew={isAddingNew}
          isDefault={isEditingDefault}
          defaultProfile={currentDefaultProfile}
          categories={getUniqueCategories()}
          audioSettings={audioSettings}
          profileAudioTestPlaying={profileAudioTestPlaying}
          onAudioTest={handleProfileAudioTest}
          onSave={handleSaveProfile}
          onCancel={handleCancelEdit}
          isDark={isDark}
        />
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Import Dialog */}
      {showImportDialog && (
        <ImportDialog
          profileCount={pendingImportProfiles.length}
          categoryCount={pendingImportCategorySettings ? Object.keys(pendingImportCategorySettings).length : 0}
          warnings={importWarnings}
          onConfirm={handleImportConfirm}
          onCancel={handleImportCancel}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="min-w-0 flex-shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold font-mono text-primary terminal-glow truncate flex items-center gap-3">
            <GridIcon ref={iconRef} size={32} className="flex-shrink-0" />
            Profiles
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {profiles.length} profile{profiles.length !== 1 ? 's' : ''} · {getUniqueCategories().length} categor{getUniqueCategories().length !== 1 ? 'ies' : 'y'}
          </p>
        </div>

        {/* Search and Filter */}
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search profiles..."
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-card border border-border focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <XIcon size={14} />
              </button>
            )}
          </div>

          {/* Category Filter Dropdown */}
          <div className="relative" ref={filterDropdownRef}>
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className={`p-2 rounded-lg border transition-colors flex items-center gap-1.5 ${
                selectedCategories.size > 0
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-card border-border hover:border-primary/50'
              }`}
              title="Filter by category"
            >
              <Filter className="w-4 h-4" />
              {selectedCategories.size > 0 && (
                <span className="text-xs font-medium">{selectedCategories.size}</span>
              )}
            </button>

            {showFilterDropdown && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                <div className="p-2 border-b border-border flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Filter by Category</span>
                  {selectedCategories.size > 0 && (
                    <button
                      onClick={() => setSelectedCategories(new Set())}
                      className="text-xs text-primary hover:underline"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-64 overflow-y-auto p-1">
                  {/* Uncategorized option */}
                  {profiles.some(p => !p.category) && (
                    <label className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCategories.has('__uncategorized__')}
                        onChange={(e) => {
                          const newSet = new Set(selectedCategories)
                          if (e.target.checked) {
                            newSet.add('__uncategorized__')
                          } else {
                            newSet.delete('__uncategorized__')
                          }
                          setSelectedCategories(newSet)
                        }}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-muted-foreground italic">Uncategorized</span>
                    </label>
                  )}
                  {/* Category options */}
                  {getUniqueCategories().map(category => (
                    <label key={category} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCategories.has(category)}
                        onChange={(e) => {
                          const newSet = new Set(selectedCategories)
                          if (e.target.checked) {
                            newSet.add(category)
                          } else {
                            newSet.delete(category)
                          }
                          setSelectedCategories(newSet)
                        }}
                        className="rounded border-border text-primary focus:ring-primary"
                      />
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getCategoryColor(category) }}
                      />
                      <span className="text-sm truncate">{category}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleStartEditCategories}
            disabled={getUniqueCategories().length === 0}
            className="p-2 rounded-lg bg-muted/50 hover:bg-muted disabled:opacity-50 transition-colors"
            title="Edit categories"
          >
            <Tags className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            disabled={profiles.length === 0}
            className="p-2 rounded-lg bg-muted/50 hover:bg-muted disabled:opacity-50 transition-colors"
            title="Export profiles"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleImportClick}
            className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            title="Import profiles"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={handleAddProfile}
            className="px-3 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <PlusIcon size={16} />
            Add Profile
          </button>
        </div>
      </div>

      {/* Category Editor Mode */}
      {editingCategories && (
        <div className="mb-6 p-6 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Tags className="w-5 h-5" />
              Edit Categories
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelEditCategories}
                className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCategories}
                className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {getUniqueCategories().map(category => {
              const profileCount = profiles.filter(p => p.category === category).length
              const catColor = getCategoryColor(category)

              return (
                <div
                  key={category}
                  draggable
                  onDragStart={() => handleCategoryDragStart(category)}
                  onDragOver={(e) => handleCategoryDragOver(e, category)}
                  onDragLeave={handleCategoryDragLeave}
                  onDrop={() => handleCategoryDrop(category)}
                  onDragEnd={handleCategoryDragEnd}
                  className={`
                    relative flex items-center gap-3 p-3 rounded-lg bg-muted/50 border transition-all
                    ${draggedCategory === category ? 'opacity-50 border-primary' : 'border-border'}
                    ${draggedCategory && draggedCategory !== category ? 'hover:bg-muted' : ''}
                  `}
                >
                  {/* Drop indicators */}
                  {dragOverCategory === category && categoryDropPosition === 'above' && (
                    <div className="absolute -top-[5px] left-0 right-0 h-[3px] bg-primary rounded-full shadow-[0_0_8px_var(--primary)]" />
                  )}
                  {dragOverCategory === category && categoryDropPosition === 'below' && (
                    <div className="absolute -bottom-[5px] left-0 right-0 h-[3px] bg-primary rounded-full shadow-[0_0_8px_var(--primary)]" />
                  )}

                  {/* Drag handle */}
                  <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />

                  {/* Color picker */}
                  <div className="flex items-center gap-1">
                    {CATEGORY_COLORS.map(color => (
                      <button
                        key={color.value}
                        onClick={() => setCategoryColor(category, color.value)}
                        className={`w-5 h-5 rounded-full transition-transform hover:scale-110 ${
                          catColor === color.value ? 'ring-2 ring-foreground ring-offset-1 ring-offset-background' : ''
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>

                  {/* Name input */}
                  <input
                    type="text"
                    value={categoryRenames[category] ?? category}
                    onChange={(e) => setCategoryRenames(prev => ({ ...prev, [category]: e.target.value }))}
                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:border-primary focus:outline-none"
                    placeholder="Category name"
                  />

                  {/* Profile count */}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {profileCount} profile{profileCount !== 1 ? 's' : ''}
                  </span>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDeleteCategory(category)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="Delete category (profiles will become uncategorized)"
                  >
                    <DeleteIcon size={16} />
                  </button>
                </div>
              )
            })}

            {getUniqueCategories().length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                No categories to edit. Assign categories to profiles first.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            Tip: Rename categories or change their colors. Deleting a category moves its profiles to "Uncategorized".
          </p>
        </div>
      )}

      {/* Profiles List */}
      {!editingCategories && (profiles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LucideTerminal className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="mb-4">No profiles yet</p>
          <button
            onClick={handleAddProfile}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-sm font-medium transition-colors"
          >
            Add Your First Profile
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {getSortedCategories().map(category => {
            const categoryProfiles = groupedProfiles[category]
            if (!categoryProfiles) return null
            const catColor = getCategoryColor(category)
            const isUncategorized = !category

            return (
              <div key={category || '__uncategorized__'}>
                {/* Category Header */}
                <div
                  draggable={!isUncategorized}
                  onDragStart={() => !isUncategorized && handleCategoryDragStart(category)}
                  onDragOver={(e) => !isUncategorized && handleCategoryDragOver(e, category)}
                  onDragLeave={handleCategoryDragLeave}
                  onDrop={() => !isUncategorized && handleCategoryDrop(category)}
                  onDragEnd={handleCategoryDragEnd}
                  className={`
                    relative flex items-center gap-2 mb-3 py-1 px-1 -mx-1 rounded transition-all
                    ${!isUncategorized ? 'cursor-grab active:cursor-grabbing' : ''}
                    ${draggedCategory === category ? 'opacity-50' : ''}
                    ${draggedCategory && draggedCategory !== category && !isUncategorized ? 'hover:bg-muted/50' : ''}
                  `}
                >
                  {/* Drop indicators */}
                  {dragOverCategory === category && categoryDropPosition === 'above' && (
                    <div className="absolute -top-[3px] left-0 right-0 h-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
                  )}
                  {dragOverCategory === category && categoryDropPosition === 'below' && (
                    <div className="absolute -bottom-[3px] left-0 right-0 h-[2px] bg-primary rounded-full shadow-[0_0_6px_var(--primary)]" />
                  )}

                  {!isUncategorized && (
                    <GripVertical className="w-4 h-4 text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0" />
                  )}
                  <Folder className="w-5 h-5 flex-shrink-0" style={{ color: catColor }} />
                  <h2 className="text-lg font-semibold">{category || 'Uncategorized'}</h2>
                  <span className="text-sm text-muted-foreground">({categoryProfiles.length})</span>
                </div>

                {/* Profile Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {categoryProfiles.map(({ profile, originalIndex }) => (
                    <ProfileCard
                      key={profile.id}
                      profile={profile}
                      originalIndex={originalIndex}
                      isDefault={profile.id === defaultProfile}
                      defaultProfileObj={defaultProfileObj}
                      category={category}
                      isDark={isDark}
                      onEdit={() => handleEditProfile(profile)}
                      onDelete={() => handleDeleteProfile(profile.id)}
                      onLaunch={() => handleLaunchProfile(profile)}
                      onLaunchPopout={() => handleLaunchPopout(profile)}
                      onLaunchPasteOnly={() => handleLaunchPasteOnly(profile)}
                      onSetDefault={() => handleSetDefault(profile.id)}
                      onTogglePin={() => handleTogglePin(profile.id)}
                      onOpenReference={profile.reference ? () => handleOpenReference(profile) : undefined}
                      isDragging={draggedIndex === originalIndex}
                      isDragOver={dragOverIndex === originalIndex}
                      dropPosition={dragOverIndex === originalIndex ? profileDropPosition : null}
                      onDragStart={() => handleProfileDragStart(originalIndex)}
                      onDragOver={(e) => handleProfileDragOver(e, originalIndex)}
                      onDragLeave={handleProfileDragLeave}
                      onDrop={() => handleProfileDrop(originalIndex, category)}
                      onDragEnd={handleProfileDragEnd}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* No results */}
      {searchQuery && filteredProfiles.length === 0 && profiles.length > 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No profiles match "{searchQuery}"</p>
        </div>
      )}
    </div>
  )
}

// Profile Card Component
interface ProfileCardProps {
  profile: Profile
  originalIndex: number
  isDefault: boolean
  defaultProfileObj?: Profile
  category: string
  isDark: boolean
  onEdit: () => void
  onDelete: () => void
  onLaunch: () => void
  onLaunchPopout: () => void
  onLaunchPasteOnly: () => void
  onSetDefault: () => void
  onTogglePin: () => void
  onOpenReference?: () => void
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
  defaultProfileObj,
  category,
  isDark,
  onEdit,
  onDelete,
  onLaunch,
  onLaunchPopout,
  onLaunchPasteOnly,
  onSetDefault,
  onTogglePin,
  onOpenReference,
  isDragging,
  isDragOver,
  dropPosition,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: ProfileCardProps) {
  const [mediaError, setMediaError] = useState(false)

  // Extract emoji from name
  const emojiMatch = profile.name.match(/^(\p{Emoji})\s*/u)
  const emoji = emojiMatch?.[1]
  const displayName = emoji ? profile.name.replace(emojiMatch[0], '') : profile.name

  // Resolve effective profile for theme inheritance
  const effectiveProfile = profile.useDefaultTheme && defaultProfileObj
    ? getEffectiveProfile(profile, defaultProfileObj)
    : profile

  // Compute effective background using resolved profile
  const effectiveGradientCSS = getGradientCSS(effectiveProfile.backgroundGradient, isDark)
  const effectivePanelColor = effectiveProfile.panelColor ?? DEFAULT_PANEL_COLOR
  const gradientOpacity = (effectiveProfile.transparency ?? DEFAULT_TRANSPARENCY) / 100

  // Get theme foreground color
  const themeForeground = themes[effectiveProfile.themeName]?.dark.colors.foreground ?? '#e0e0e0'

  // Background media - use effective profile
  const mediaUrl = getMediaUrl(effectiveProfile.backgroundMedia)
  const mediaOpacity = (effectiveProfile.backgroundMediaOpacity ?? 50) / 100
  const showMedia = effectiveProfile.backgroundMediaType && effectiveProfile.backgroundMediaType !== 'none' && mediaUrl && !mediaError

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`
        group relative rounded-xl border transition-all
        ${isDragging ? 'opacity-50 border-primary scale-95' : 'border-border hover:border-primary/50 hover:shadow-lg'}
        ${isDragOver ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
      `}
    >
      {/* Drop position indicator */}
      {isDragOver && dropPosition === 'above' && (
        <div className="absolute -top-3 left-2 right-2 flex items-center gap-2 z-50">
          <div className="flex-1 h-0.5 bg-primary rounded-full shadow-[0_0_8px_var(--primary)]" />
          <ChevronDownIcon size={16} className="text-primary animate-bounce" />
          <div className="flex-1 h-0.5 bg-primary rounded-full shadow-[0_0_8px_var(--primary)]" />
        </div>
      )}
      {isDragOver && dropPosition === 'below' && (
        <div className="absolute -bottom-3 left-2 right-2 flex items-center gap-2 z-50">
          <div className="flex-1 h-0.5 bg-primary rounded-full shadow-[0_0_8px_var(--primary)]" />
          <ChevronUp className="w-4 h-4 text-primary animate-bounce" />
          <div className="flex-1 h-0.5 bg-primary rounded-full shadow-[0_0_8px_var(--primary)]" />
        </div>
      )}

      {/* Inner content wrapper with overflow hidden for media */}
      <div className="rounded-xl overflow-hidden">

      {/* Layer 1: Panel color */}
      <div
        className="absolute inset-0 rounded-xl"
        style={{ backgroundColor: effectivePanelColor }}
      />

      {/* Layer 2: Background media */}
      {showMedia && effectiveProfile.backgroundMediaType === 'video' && (
        <video
          key={mediaUrl}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none rounded-xl"
          style={{ opacity: mediaOpacity, zIndex: 0 }}
          src={mediaUrl!}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setMediaError(true)}
        />
      )}
      {showMedia && effectiveProfile.backgroundMediaType === 'image' && (
        <img
          key={mediaUrl}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none rounded-xl"
          style={{ opacity: mediaOpacity, zIndex: 0 }}
          src={mediaUrl!}
          alt=""
          onError={() => setMediaError(true)}
        />
      )}

      {/* Layer 3: Gradient overlay */}
      <div
        className="absolute inset-0 rounded-xl"
        style={{ background: effectiveGradientCSS, opacity: gradientOpacity, zIndex: 1 }}
      />

      {/* Content */}
      <div className="relative z-10 p-4 flex flex-col min-h-[160px]">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            {emoji ? (
              <span className="text-2xl">{emoji}</span>
            ) : (
              <TerminalIcon size={20} className="text-white/80" />
            )}
            <div className="flex items-center gap-2">
              <h3 className="font-semibold" style={{ color: themeForeground }}>
                {displayName}
              </h3>
              {isDefault && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium">
                  <Star className="w-2.5 h-2.5 fill-current" />
                  Default
                </span>
              )}
              {profile.pinnedToNewTab && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-medium">
                  <Pin className="w-2.5 h-2.5" />
                  Pinned
                </span>
              )}
              {profile.reference && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-medium">
                  <AttachFileIcon size={10} />
                  Ref
                </span>
              )}
            </div>
          </div>

          {/* Drag handle */}
          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4 text-white/50 cursor-grab active:cursor-grabbing" />
          </div>
        </div>

        {/* Middle content - flexible to push actions to bottom */}
        <div className="flex-1 min-h-[3.25rem]">
          {/* Working dir */}
          {profile.workingDir && profile.workingDir !== '~' && (
            <p className="text-xs text-white/50 font-mono truncate mb-1">
              {profile.workingDir}
            </p>
          )}

          {/* Command */}
          {profile.command && (
            <p className="text-xs text-white/70 font-mono truncate mb-3">
              $ {profile.command}
            </p>
          )}

          {/* Theme/font info */}
          <p className="text-[10px] text-white/40">
            {themes[effectiveProfile.themeName]?.name || effectiveProfile.themeName} · {profile.fontSize}px
            {profile.useDefaultTheme && (
              <span className="ml-1.5 px-1 py-0.5 rounded bg-blue-500/30 text-blue-300/80 text-[9px]">inherited</span>
            )}
          </p>
        </div>

        {/* Actions - always at bottom */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity mt-3">
          {/* Spawn actions */}
          <button
            onClick={onLaunch}
            className="p-1.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors"
            title="Launch in sidebar"
          >
            <PanelLeft className="w-4 h-4 text-white/70" />
          </button>
          <button
            onClick={onLaunchPopout}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="Launch as popout window"
          >
            <MaximizeIcon size={16} className="text-white/50" />
          </button>
          {profile.command && (
            <button
              onClick={onLaunchPasteOnly}
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              title="Launch with command pasted (edit before running)"
            >
              <SquareTerminal className="w-4 h-4 text-white/50" />
            </button>
          )}
          <button
            onClick={() => navigator.clipboard.writeText(profile.command || 'bash')}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="Copy command"
          >
            <CopyIcon size={16} className="text-white/50" />
          </button>
          {profile.reference && onOpenReference && (
            <button
              onClick={onOpenReference}
              className="p-1.5 rounded-md hover:bg-blue-500/20 transition-colors"
              title="Open reference"
            >
              <AttachFileIcon size={16} className="text-blue-400/70" />
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Management actions */}
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
            title="Edit profile"
          >
            <SquarePenIcon size={16} className="text-white/50" />
          </button>
          {!isDefault && (
            <button
              onClick={onSetDefault}
              className="p-1.5 rounded-md hover:bg-white/10 transition-colors"
              title="Set as default"
            >
              <Star className="w-4 h-4 text-white/50" />
            </button>
          )}
          <button
            onClick={onTogglePin}
            className={`p-1.5 rounded-md transition-colors ${
              profile.pinnedToNewTab
                ? 'bg-amber-500/20 hover:bg-amber-500/30'
                : 'hover:bg-white/10'
            }`}
            title={profile.pinnedToNewTab ? "Unpin from New Tab" : "Pin to New Tab"}
          >
            {profile.pinnedToNewTab ? (
              <PinOff className="w-4 h-4 text-amber-400" />
            ) : (
              <Pin className="w-4 h-4 text-white/50" />
            )}
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md hover:bg-red-500/20 transition-colors"
            title="Delete"
          >
            <DeleteIcon size={16} className="text-white/50 hover:text-red-400" />
          </button>
        </div>
      </div>
      </div>{/* Close inner overflow wrapper */}
    </div>
  )
}

// Section Card Component for visual grouping
interface SectionCardProps {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
  className?: string
  collapsible?: boolean
  defaultExpanded?: boolean
  badge?: React.ReactNode
}

function SectionCard({
  title,
  icon,
  children,
  className = '',
  collapsible = false,
  defaultExpanded = true,
  badge,
}: SectionCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  return (
    <div className={`relative rounded-xl border border-border/60 bg-card/30 backdrop-blur-sm ${className}`}>
      {/* Accent line at top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-primary/60 via-primary/20 to-transparent rounded-t-xl" />

      {/* Header */}
      {collapsible ? (
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            {icon && <span className="text-primary/80">{icon}</span>}
            <span className="text-sm font-semibold tracking-wide uppercase text-foreground/90">{title}</span>
            {badge}
          </div>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDownIcon size={16} className="text-muted-foreground" />
          )}
        </button>
      ) : (
        <div className="px-4 py-3 flex items-center gap-2.5 border-b border-border/40">
          {icon && <span className="text-primary/80">{icon}</span>}
          <span className="text-sm font-semibold tracking-wide uppercase text-foreground/90">{title}</span>
          {badge}
        </div>
      )}

      {/* Content */}
      {(!collapsible || isExpanded) && (
        <div className="p-4 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

// Form Field Component for consistent styling
interface FormFieldProps {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}

function FormField({ label, hint, required, children }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1 text-sm font-medium text-foreground/80">
        {label}
        {required && <span className="text-primary">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}

// Profile Edit Form Component
interface ProfileEditFormProps {
  profile: Profile
  setProfile: (profile: Profile | null) => void
  isNew: boolean
  isDefault: boolean
  defaultProfile: Profile | undefined
  categories: string[]
  audioSettings: AudioSettings
  profileAudioTestPlaying: boolean
  onAudioTest: () => void
  onSave: () => void
  onCancel: () => void
  isDark: boolean
}

function ProfileEditForm({
  profile,
  setProfile,
  isNew,
  isDefault,
  defaultProfile,
  categories,
  audioSettings,
  profileAudioTestPlaying,
  onAudioTest,
  onSave,
  onCancel,
  isDark,
}: ProfileEditFormProps) {
  const [showMediaPicker, setShowMediaPicker] = useState(false)
  const [showReferencePicker, setShowReferencePicker] = useState(false)
  const [filePickerDefaults, setFilePickerDefaults] = useState<FilePickerDefaults>(DEFAULT_FILE_PICKER_DEFAULTS)

  // Load file picker defaults
  useEffect(() => {
    chrome.storage.local.get(['filePickerDefaults'], (result) => {
      if (result.filePickerDefaults) {
        setFilePickerDefaults({ ...DEFAULT_FILE_PICKER_DEFAULTS, ...result.filePickerDefaults })
      }
    })
  }, [])

  const updateProfile = (updates: Partial<Profile>) => {
    setProfile({ ...profile, ...updates })
  }

  // Handle file selection from picker
  const handleMediaFileSelected = (filePath: string) => {
    updateProfile({ backgroundMedia: filePath })
    setShowMediaPicker(false)
  }

  // Determine filter type based on current media type
  const getMediaFilterType = () => {
    if (profile.backgroundMediaType === 'video') return 'videos'
    if (profile.backgroundMediaType === 'image') return 'images'
    return undefined  // No filter if not set
  }

  // Get default path based on media type
  const getMediaDefaultPath = () => {
    if (profile.backgroundMediaType === 'video') return filePickerDefaults.videos || '~/Videos'
    if (profile.backgroundMediaType === 'image') return filePickerDefaults.images || '~/Pictures'
    return filePickerDefaults.general || '~'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/40">
        <div>
          <h1 className="text-2xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <Grid3X3 className="w-7 h-7" />
            {isNew ? 'New Profile' : 'Edit Profile'}
          </h1>
          {profile.name && (
            <p className="text-sm text-muted-foreground mt-1 font-mono">ID: {profile.id}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg border border-border hover:bg-muted/50 transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={!profile.name || !profile.id}
            className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            {isNew ? 'Create Profile' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Configuration */}
        <div className="space-y-5">
          {/* Identity Section */}
          <SectionCard title="Identity" icon={<TerminalIcon size={16} />}>
            <FormField label="Profile Name" required>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => {
                  const name = e.target.value
                  const id = isNew ? name.toLowerCase().replace(/\s+/g, '-') : profile.id
                  updateProfile({ name, id })
                }}
                placeholder="e.g., Default, Claude Code, Dev Server"
                className="w-full px-3 py-2.5 bg-background/50 border border-border/60 rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </FormField>

            <FormField label="Category" hint="Organize profiles into groups">
              <CategoryCombobox
                value={profile.category || ''}
                onChange={(category) => updateProfile({ category: category || undefined })}
                categories={categories}
              />
            </FormField>
          </SectionCard>

          {/* Execution Section */}
          <SectionCard title="Execution" icon={<Play className="w-4 h-4" />}>
            <FormField label="Working Directory" hint="Leave empty to inherit from header">
              <input
                type="text"
                value={profile.workingDir}
                onChange={(e) => updateProfile({ workingDir: e.target.value })}
                placeholder="~/projects/my-app"
                className="w-full px-3 py-2.5 bg-background/50 border border-border/60 rounded-lg font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </FormField>

            <FormField label="Starting Command" hint="Runs automatically when terminal opens">
              <input
                type="text"
                value={profile.command || ''}
                onChange={(e) => updateProfile({ command: e.target.value })}
                placeholder="e.g., npm run dev, claude, htop"
                className="w-full px-3 py-2.5 bg-background/50 border border-border/60 rounded-lg font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
              />
            </FormField>

            <FormField label="Reference" hint="URL or file path for quick access">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <AttachFileIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                  <input
                    type="text"
                    value={profile.reference || ''}
                    onChange={(e) => updateProfile({ reference: e.target.value || undefined })}
                    placeholder="https://docs.example.com or ~/docs/flags.md"
                    className="w-full pl-9 pr-3 py-2.5 bg-background/50 border border-border/60 rounded-lg font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowReferencePicker(true)}
                  className="p-2.5 rounded-lg bg-background/50 border border-border/60 hover:bg-muted/50 transition-colors"
                  title="Browse files"
                >
                  <FolderOpenIcon size={16} className="text-muted-foreground" />
                </button>
              </div>
            </FormField>
          </SectionCard>

          {/* Typography Section */}
          <SectionCard title="Typography" icon={<span className="font-mono text-xs font-bold">Aa</span>}>
            <FormField label={`Font Size: ${profile.fontSize}px`}>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">12</span>
                <input
                  type="range"
                  min="12"
                  max="24"
                  value={profile.fontSize}
                  onChange={(e) => updateProfile({ fontSize: parseInt(e.target.value) })}
                  className="flex-1 accent-primary"
                />
                <span className="text-xs text-muted-foreground">24</span>
              </div>
            </FormField>

            <FormField label="Font Family">
              <select
                value={profile.fontFamily}
                onChange={(e) => updateProfile({ fontFamily: e.target.value })}
                className="w-full px-3 py-2.5 bg-background/50 border border-border/60 rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                style={{ fontFamily: profile.fontFamily }}
              >
                {getAvailableFonts().map((font) => (
                  <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                    {font.label}
                  </option>
                ))}
              </select>
            </FormField>
          </SectionCard>

          {/* Audio Section */}
          <SectionCard
            title="Audio"
            icon={<VolumeIcon size={16} />}
            badge={
              profile.audioOverrides?.mode && profile.audioOverrides.mode !== 'default' && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  profile.audioOverrides.mode === 'disabled'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-primary/20 text-primary'
                }`}>
                  {profile.audioOverrides.mode === 'disabled' ? 'OFF' : 'ON'}
                </span>
              )
            }
          >
            <FormField label="Audio Mode">
              <select
                value={profile.audioOverrides?.mode || 'default'}
                onChange={(e) => {
                  const mode = e.target.value as AudioMode
                  updateProfile({
                    audioOverrides: mode === 'default' && !profile.audioOverrides?.voice && !profile.audioOverrides?.rate
                      ? undefined
                      : { ...profile.audioOverrides, mode: mode === 'default' ? undefined : mode }
                  })
                }}
                className="w-full px-3 py-2.5 bg-background/50 border border-border/60 rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
              >
                <option value="default">Use default (follows header toggle)</option>
                <option value="enabled">Enabled (always on, respects mute)</option>
                <option value="disabled">Disabled (never plays audio)</option>
              </select>
            </FormField>

            {profile.audioOverrides?.mode !== 'disabled' && (
              <>
                <FormField label="Voice">
                  <select
                    value={profile.audioOverrides?.voice || ''}
                    onChange={(e) => {
                      const voice = e.target.value || undefined
                      const newOverrides = { ...profile.audioOverrides, voice }
                      if (!newOverrides.mode && !newOverrides.voice && !newOverrides.rate) {
                        updateProfile({ audioOverrides: undefined })
                      } else {
                        updateProfile({ audioOverrides: newOverrides })
                      }
                    }}
                    className="w-full px-3 py-2.5 bg-background/50 border border-border/60 rounded-lg focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                  >
                    <option value="">
                      Use default ({TTS_VOICES.find(v => v.value === audioSettings.voice)?.label || audioSettings.voice})
                    </option>
                    {TTS_VOICES.map((voice) => (
                      <option key={voice.value} value={voice.value}>
                        {voice.label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <button
                  type="button"
                  onClick={onAudioTest}
                  disabled={profileAudioTestPlaying}
                  className="w-full px-4 py-2.5 bg-muted/50 hover:bg-muted rounded-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-colors border border-border/40"
                >
                  <VolumeIcon size={16} />
                  {profileAudioTestPlaying ? 'Playing...' : 'Test Voice'}
                </button>
              </>
            )}
          </SectionCard>
        </div>

        {/* Right Column - Appearance */}
        <div className="space-y-5">
          {/* Live Preview - Prominent */}
          {/* Compute effective profile for preview when using default theme */}
          {(() => {
            const effectiveProfile = profile.useDefaultTheme && defaultProfile
              ? getEffectiveProfile(profile, defaultProfile)
              : profile

            return (
              <div className="rounded-xl border border-primary/30 bg-card/20 p-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-sm font-semibold tracking-wide uppercase text-primary/90">Live Preview</span>
                  {profile.useDefaultTheme && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 font-medium">
                      Inherited
                    </span>
                  )}
                </div>
                <TerminalPreview
                  themeName={effectiveProfile.themeName}
                  backgroundGradient={effectiveProfile.backgroundGradient}
                  panelColor={effectiveProfile.panelColor}
                  transparency={effectiveProfile.transparency}
                  backgroundMedia={effectiveProfile.backgroundMedia}
                  backgroundMediaType={effectiveProfile.backgroundMediaType}
                  backgroundMediaOpacity={effectiveProfile.backgroundMediaOpacity}
                  fontSize={profile.fontSize}
                  fontFamily={profile.fontFamily}
                  isDark={isDark}
                />
              </div>
            )
          })()}

          {/* Use Default Theme Toggle - only show for non-default profiles */}
          {!isDefault && (
            <div
              className={`
                p-4 rounded-xl border transition-all cursor-pointer
                ${profile.useDefaultTheme
                  ? 'bg-blue-500/10 border-blue-500/40 ring-1 ring-blue-500/20'
                  : 'bg-card/30 border-border/60 hover:border-primary/50'
                }
              `}
              onClick={() => updateProfile({ useDefaultTheme: !profile.useDefaultTheme })}
            >
              <div className="flex items-center gap-3">
                <div className={`
                  w-10 h-6 rounded-full relative transition-colors
                  ${profile.useDefaultTheme ? 'bg-blue-500' : 'bg-muted'}
                `}>
                  <div className={`
                    absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all
                    ${profile.useDefaultTheme ? 'left-5' : 'left-1'}
                  `} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-blue-400" />
                    <span className="font-medium">Use Default Theme</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {profile.useDefaultTheme
                      ? `Inheriting theme from "${defaultProfile?.name || 'Default'}"`
                      : 'Inherit colors, gradients, and background media from the default profile'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Theme sections - hidden when using default theme */}
          {!profile.useDefaultTheme && (
            <>
              {/* Color Scheme Section */}
              <SectionCard title="Color Scheme" icon={<SparklesIcon size={16} />}>
                <FormField label="Text Colors">
                  <div className="grid grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1 -mr-1">
                    {themeNames.map((themeName) => {
                      const theme = themes[themeName]
                      const isSelected = profile.themeName === themeName
                      const previewColors = theme.dark.colors

                      return (
                        <button
                          key={themeName}
                          onClick={() => updateProfile({ themeName })}
                          className={`
                            px-3 py-2 rounded-lg border transition-all text-left
                            ${isSelected
                              ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                              : 'border-border/60 hover:border-primary/50 bg-background/30'
                            }
                          `}
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex gap-0.5">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: previewColors.red }} />
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: previewColors.green }} />
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: previewColors.blue }} />
                              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: previewColors.magenta }} />
                            </div>
                            <span className="text-sm truncate" style={{ color: previewColors.foreground }}>{theme.name}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </FormField>
              </SectionCard>

              {/* Background Section */}
              <SectionCard title="Background" icon={<span className="text-xs">◐</span>}>
                {/* Panel Color */}
                <FormField label="Base Color">
                  <div className="flex flex-wrap gap-2">
                    {PANEL_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => updateProfile({ panelColor: color.value })}
                        className={`
                          w-9 h-9 rounded-lg border-2 transition-all relative group
                          ${(profile.panelColor || '#000000') === color.value
                            ? 'border-primary scale-110 ring-2 ring-primary/30'
                            : 'border-border/60 hover:border-primary/50 hover:scale-105'
                          }
                        `}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      >
                        {(profile.panelColor || '#000000') === color.value && (
                          <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow-md" />
                        )}
                      </button>
                    ))}
                  </div>
                </FormField>

                {/* Gradient */}
                <FormField label="Gradient Overlay">
                  <div className="grid grid-cols-2 gap-2 max-h-36 overflow-y-auto pr-1 -mr-1">
                    <button
                      onClick={() => updateProfile({ backgroundGradient: undefined })}
                      className={`
                        px-3 py-2 rounded-lg border transition-all text-left
                        ${profile.backgroundGradient === undefined
                          ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                          : 'border-border/60 hover:border-primary/50 bg-background/30'
                        }
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-4 rounded border border-border/60 bg-gradient-to-br from-muted to-muted-foreground/20" />
                        <span className="text-sm">Theme Default</span>
                      </div>
                    </button>
                    {gradientNames.map((gradientKey) => {
                      const gradient = backgroundGradients[gradientKey]
                      const isSelected = profile.backgroundGradient === gradientKey

                      return (
                        <button
                          key={gradientKey}
                          onClick={() => updateProfile({ backgroundGradient: gradientKey })}
                          className={`
                            px-3 py-2 rounded-lg border transition-all text-left
                            ${isSelected
                              ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                              : 'border-border/60 hover:border-primary/50 bg-background/30'
                            }
                          `}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="w-6 h-4 rounded border border-border/60 flex-shrink-0"
                              style={{ background: gradient.gradient }}
                            />
                            <span className="text-sm truncate">{gradient.name}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </FormField>

                {/* Transparency */}
                <FormField label={`Gradient Opacity: ${profile.transparency ?? 100}%`}>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">0%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={profile.transparency ?? 100}
                      onChange={(e) => updateProfile({ transparency: parseInt(e.target.value) })}
                      className="flex-1 accent-primary"
                    />
                    <span className="text-xs text-muted-foreground">100%</span>
                  </div>
                </FormField>
              </SectionCard>

              {/* Media Section */}
              <SectionCard title="Background Media" icon={<span className="text-xs">▶</span>}>
                <FormField label="Media Type">
                  <div className="flex gap-2">
                    {(['none', 'image', 'video'] as const).map((type) => (
                      <button
                        key={type}
                        onClick={() => updateProfile({ backgroundMediaType: type })}
                        className={`
                          flex-1 px-3 py-2.5 rounded-lg border text-sm capitalize transition-all
                          ${(profile.backgroundMediaType || 'none') === type
                            ? 'border-primary bg-primary/10 ring-1 ring-primary/30'
                            : 'border-border/60 hover:border-primary/50 bg-background/30'
                          }
                        `}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </FormField>

                {profile.backgroundMediaType && profile.backgroundMediaType !== 'none' && (
                  <>
                    <FormField label="Media Path" hint="Local file path or URL">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={profile.backgroundMedia || ''}
                          onChange={(e) => updateProfile({ backgroundMedia: e.target.value })}
                          placeholder={profile.backgroundMediaType === 'video'
                            ? 'e.g., ~/Videos/space.mp4 or https://...'
                            : 'e.g., ~/Pictures/bg.png or https://...'
                          }
                          className="flex-1 px-3 py-2.5 bg-background/50 border border-border/60 rounded-lg font-mono text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowMediaPicker(true)}
                          className="p-2.5 rounded-lg bg-muted/50 hover:bg-muted border border-border/60 transition-colors"
                          title="Browse files"
                        >
                          <FolderOpenIcon size={16} className="text-muted-foreground" />
                        </button>
                      </div>
                    </FormField>

                    <FormField label={`Media Opacity: ${profile.backgroundMediaOpacity ?? 50}%`}>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground">0%</span>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={profile.backgroundMediaOpacity ?? 50}
                          onChange={(e) => updateProfile({ backgroundMediaOpacity: parseInt(e.target.value) })}
                          className="flex-1 accent-primary"
                        />
                        <span className="text-xs text-muted-foreground">100%</span>
                      </div>
                    </FormField>
                  </>
                )}
              </SectionCard>
            </>
          )}
        </div>
      </div>

      {/* File picker modal for background media */}
      <FilePickerModal
        isOpen={showMediaPicker}
        title={`Select ${profile.backgroundMediaType === 'video' ? 'Video' : 'Image'} File`}
        basePath={getMediaDefaultPath()}
        filterType={getMediaFilterType()}
        onSelect={handleMediaFileSelected}
        onClose={() => setShowMediaPicker(false)}
      />

      {/* File picker modal for reference file */}
      <FilePickerModal
        isOpen={showReferencePicker}
        title="Select Reference File"
        basePath={filePickerDefaults.general || '~'}
        onSelect={(filePath) => {
          updateProfile({ reference: filePath })
          setShowReferencePicker(false)
        }}
        onClose={() => setShowReferencePicker(false)}
      />
    </div>
  )
}

// Category Combobox Component (simplified version for dashboard)
interface CategoryComboboxProps {
  value: string
  onChange: (value: string) => void
  categories: string[]
}

function CategoryCombobox({ value, onChange, categories }: CategoryComboboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 })

  // Calculate dropdown position when opening
  const updateDropdownPosition = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      })
    }
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Check if click is inside container or inside the portal dropdown
      const target = e.target as Node
      const dropdownEl = document.getElementById('category-dropdown-portal')
      if (containerRef.current && !containerRef.current.contains(target) && !dropdownEl?.contains(target)) {
        setIsOpen(false)
        setIsCreatingNew(false)
        setInputValue('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isCreatingNew && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isCreatingNew])

  // Update position on scroll/resize when open
  useEffect(() => {
    if (!isOpen) return
    const handleUpdate = () => updateDropdownPosition()
    window.addEventListener('scroll', handleUpdate, true)
    window.addEventListener('resize', handleUpdate)
    return () => {
      window.removeEventListener('scroll', handleUpdate, true)
      window.removeEventListener('resize', handleUpdate)
    }
  }, [isOpen])

  const handleSelect = (category: string) => {
    onChange(category)
    setIsOpen(false)
    setIsCreatingNew(false)
    setInputValue('')
  }

  const handleCreateNew = () => {
    if (inputValue.trim()) {
      onChange(inputValue.trim())
      setIsOpen(false)
      setIsCreatingNew(false)
      setInputValue('')
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setIsOpen(false)
  }

  const filteredCategories = isCreatingNew && inputValue
    ? categories.filter(cat => cat.toLowerCase().includes(inputValue.toLowerCase()))
    : categories

  const inputMatchesExisting = inputValue.trim() &&
    categories.some(cat => cat.toLowerCase() === inputValue.trim().toLowerCase())

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!isOpen) updateDropdownPosition()
          setIsOpen(!isOpen)
        }}
        className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm text-left flex items-center justify-between focus:border-primary focus:outline-none"
      >
        <span className={value ? '' : 'text-muted-foreground'}>
          {value || 'Select or create category...'}
        </span>
        <div className="flex items-center gap-1">
          {value && (
            <span role="button" onClick={handleClear} className="p-0.5 hover:bg-muted rounded">
              <XIcon size={14} />
            </span>
          )}
          <ChevronDownIcon size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {isOpen && createPortal(
        <div
          id="category-dropdown-portal"
          className="fixed bg-card border border-border rounded-lg shadow-xl overflow-hidden"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
          }}
        >
          {filteredCategories.length > 0 && (
            <div className="max-h-48 overflow-y-auto">
              {filteredCategories.map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => handleSelect(category)}
                  className={`w-full px-3 py-2 text-sm text-left hover:bg-primary/10 transition-colors ${
                    value === category ? 'bg-primary/20 text-primary' : ''
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          {filteredCategories.length > 0 && <div className="border-t border-border" />}

          {isCreatingNew ? (
            <div className="p-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputValue.trim() && !inputMatchesExisting) {
                    e.preventDefault()
                    handleCreateNew()
                  } else if (e.key === 'Escape') {
                    setIsCreatingNew(false)
                    setInputValue('')
                  }
                }}
                placeholder="Type new category name..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:border-primary focus:outline-none"
              />
              {inputValue.trim() && !inputMatchesExisting && (
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className="w-full mt-2 px-3 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <PlusIcon size={16} />
                  Create "{inputValue.trim()}"
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsCreatingNew(true)}
              className="w-full px-3 py-2 text-sm text-left text-primary hover:bg-primary/10 transition-colors flex items-center gap-2"
            >
              <PlusIcon size={16} />
              Create new category...
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// Import Dialog Component
interface ImportDialogProps {
  profileCount: number
  categoryCount: number
  warnings: string[]
  onConfirm: (mode: 'merge' | 'replace') => void
  onCancel: () => void
}

function ImportDialog({ profileCount, categoryCount, warnings, onConfirm, onCancel }: ImportDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg max-w-md w-full p-6 shadow-2xl">
        <h3 className="text-lg font-semibold mb-4">Import Profiles</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Found {profileCount} profile{profileCount !== 1 ? 's' : ''} to import
          {categoryCount > 0 ? ` with ${categoryCount} category setting${categoryCount !== 1 ? 's' : ''}` : ''}.
        </p>
        {warnings.length > 0 && (
          <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-xs text-yellow-400 font-medium mb-1">Warnings:</p>
            {warnings.map((warning, i) => (
              <p key={i} className="text-xs text-yellow-300">{warning}</p>
            ))}
          </div>
        )}
        <p className="text-sm text-muted-foreground mb-4">
          How would you like to handle existing profiles?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => onConfirm('merge')}
            className="w-full px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
          >
            Merge (add new, keep existing)
          </button>
          <button
            onClick={() => onConfirm('replace')}
            className="w-full px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg transition-colors"
          >
            Replace all
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 hover:bg-muted/50 rounded-lg transition-colors text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
