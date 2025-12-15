import React, { useState, useRef } from 'react'
import { Plus, Edit, Trash2, GripVertical, Palette, Download, Upload, Volume2, Search, X, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react'
import { Terminal as TerminalIcon } from 'lucide-react'
import { themes, themeNames } from '../../styles/themes'
import {
  Profile,
  CategorySettings,
  AudioSettings,
  AudioMode,
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_PROFILE,
  getAvailableFonts,
  TTS_VOICES,
} from './types'

interface ProfilesTabProps {
  profiles: Profile[]
  setProfiles: (profiles: Profile[]) => void
  defaultProfile: string
  setDefaultProfile: (id: string) => void
  categorySettings: CategorySettings
  setCategorySettings: (settings: CategorySettings) => void
  audioSettings: AudioSettings
  onExportProfiles: () => void
  onImportClick: () => void
}

export function ProfilesTab({
  profiles,
  setProfiles,
  defaultProfile,
  setDefaultProfile,
  categorySettings,
  setCategorySettings,
  audioSettings,
  onExportProfiles,
  onImportClick,
}: ProfilesTabProps) {
  // Profile state
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<Profile>(DEFAULT_PROFILE)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)

  // Category drag-and-drop state
  const [draggedCategory, setDraggedCategory] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [categoryDropPosition, setCategoryDropPosition] = useState<'above' | 'below' | null>(null)

  // Category rename state
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [editingCategoryName, setEditingCategoryName] = useState('')
  const categoryInputRef = useRef<HTMLInputElement>(null)

  // Search
  const [profileSearchQuery, setProfileSearchQuery] = useState('')

  // Audio section in profile edit form
  const [profileAudioExpanded, setProfileAudioExpanded] = useState(false)
  const [profileAudioTestPlaying, setProfileAudioTestPlaying] = useState(false)

  // Profile handlers
  const handleAddProfile = () => {
    if (!formData.name || !formData.id) return

    if (editingIndex !== null) {
      // Update existing
      const updated = [...profiles]
      updated[editingIndex] = formData
      setProfiles(updated)
      setEditingIndex(null)
    } else {
      // Add new
      setProfiles([...profiles, formData])
    }

    // Reset form
    setFormData(DEFAULT_PROFILE)
    setIsAdding(false)
  }

  const handleEditProfile = (index: number) => {
    setFormData(profiles[index])
    setEditingIndex(index)
    setIsAdding(true)
  }

  const handleDeleteProfile = (index: number) => {
    const deletedProfile = profiles[index]
    setProfiles(profiles.filter((_, i) => i !== index))

    // If deleting default profile, switch to first remaining profile
    if (deletedProfile.id === defaultProfile && profiles.length > 1) {
      const remainingProfiles = profiles.filter((_, i) => i !== index)
      setDefaultProfile(remainingProfiles[0].id)
    }
  }

  const handleCancelEdit = () => {
    setIsAdding(false)
    setEditingIndex(null)
    setFormData(DEFAULT_PROFILE)
  }

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return

    // Determine if cursor is in top or bottom half of the element
    const rect = e.currentTarget.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const position = e.clientY < midpoint ? 'above' : 'below'

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
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDropPosition(null)
  }

  const handleDragEnd = () => {
    setDraggedIndex(null)
    setDragOverIndex(null)
    setDropPosition(null)
  }

  // Category helpers
  const getUniqueCategories = (): string[] => {
    const categories = new Set<string>()
    profiles.forEach(p => {
      if (p.category) categories.add(p.category)
    })
    // Sort by order from settings, then alphabetically
    return Array.from(categories).sort((a, b) => {
      const orderA = categorySettings[a]?.order ?? Infinity
      const orderB = categorySettings[b]?.order ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })
  }

  const toggleCategoryCollapsed = (categoryName: string) => {
    const newSettings = {
      ...categorySettings,
      [categoryName]: {
        ...categorySettings[categoryName],
        collapsed: !categorySettings[categoryName]?.collapsed,
      }
    }
    setCategorySettings(newSettings)
    chrome.storage.local.set({ categorySettings: newSettings })
  }

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
    // Broadcast change so sidepanel updates tabs
    window.dispatchEvent(new CustomEvent('categorySettingsChanged', { detail: newSettings }))
  }

  const getCategoryColor = (categoryName: string): string => {
    return categorySettings[categoryName]?.color || DEFAULT_CATEGORY_COLOR
  }

  // Category drag-and-drop handlers
  const handleCategoryDragStart = (category: string) => {
    setDraggedCategory(category)
  }

  const handleCategoryDragOver = (e: React.DragEvent, category: string) => {
    e.preventDefault()
    if (draggedCategory === null || draggedCategory === category) return

    // Determine if cursor is in top or bottom half of the element
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

    // Get sorted categories list
    const sortedCategories = getUniqueCategories()

    // Calculate new orders based on drop position
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
    // Adjust if dragging from before the target
    if (draggedIdx < targetIdx) {
      targetIdx -= 1
    }

    // Build new order - remove dragged and insert at new position
    const newOrder = sortedCategories.filter(c => c !== draggedCategory)
    newOrder.splice(targetIdx, 0, draggedCategory)

    // Update categorySettings with new orders
    const newSettings = { ...categorySettings }
    newOrder.forEach((category, index) => {
      newSettings[category] = {
        ...newSettings[category],
        color: newSettings[category]?.color || DEFAULT_CATEGORY_COLOR,
        order: index,
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

  // Category rename handlers
  const startEditingCategory = (category: string) => {
    setEditingCategory(category)
    setEditingCategoryName(category)
    // Focus the input after render
    setTimeout(() => categoryInputRef.current?.focus(), 0)
  }

  const cancelEditingCategory = () => {
    setEditingCategory(null)
    setEditingCategoryName('')
  }

  const saveEditingCategory = () => {
    if (!editingCategory || !editingCategoryName.trim()) {
      cancelEditingCategory()
      return
    }

    const newName = editingCategoryName.trim()
    const oldName = editingCategory

    // If name didn't change, just cancel
    if (newName === oldName) {
      cancelEditingCategory()
      return
    }

    // Check if new name already exists
    const existingCategories = getUniqueCategories()
    if (existingCategories.includes(newName)) {
      alert(`Category "${newName}" already exists`)
      return
    }

    // Update all profiles with this category
    const updatedProfiles = profiles.map(p =>
      p.category === oldName ? { ...p, category: newName } : p
    )
    setProfiles(updatedProfiles)

    // Transfer category settings to new name
    const oldSettings = categorySettings[oldName]
    const newCategorySettings = { ...categorySettings }
    delete newCategorySettings[oldName]
    if (oldSettings) {
      newCategorySettings[newName] = oldSettings
    }
    setCategorySettings(newCategorySettings)
    chrome.storage.local.set({ categorySettings: newCategorySettings })
    window.dispatchEvent(new CustomEvent('categorySettingsChanged', { detail: newCategorySettings }))

    cancelEditingCategory()
  }

  // Group profiles by category, filtering by search query
  const getGroupedProfiles = (): { category: string; profiles: { profile: Profile; originalIndex: number }[] }[] => {
    const query = profileSearchQuery.toLowerCase().trim()

    // Filter profiles by search query (name, command, category)
    const filteredProfiles = profiles
      .map((profile, index) => ({ profile, originalIndex: index }))
      .filter(({ profile }) => {
        if (!query) return true
        return (
          profile.name.toLowerCase().includes(query) ||
          (profile.command?.toLowerCase().includes(query)) ||
          (profile.category?.toLowerCase().includes(query))
        )
      })

    // Group by category
    const groups: Map<string, { profile: Profile; originalIndex: number }[]> = new Map()

    filteredProfiles.forEach(item => {
      const category = item.profile.category || ''
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(item)
    })

    // Sort: categorized first (by order, then alphabetically), then uncategorized at the end
    const sortedCategories = Array.from(groups.keys()).sort((a, b) => {
      if (!a && b) return 1  // Uncategorized goes last
      if (a && !b) return -1
      // Use order from settings if available
      const orderA = categorySettings[a]?.order ?? Infinity
      const orderB = categorySettings[b]?.order ?? Infinity
      if (orderA !== orderB) return orderA - orderB
      return a.localeCompare(b)
    })

    return sortedCategories.map(category => ({
      category,
      profiles: groups.get(category)!
    }))
  }

  // Test profile-specific audio settings (uses profile overrides or falls back to global)
  const handleProfileAudioTest = async () => {
    if (profileAudioTestPlaying) return
    setProfileAudioTestPlaying(true)

    try {
      // Determine voice: profile override > global setting
      // If either is "random", pick a random voice from the pool
      let testVoice = formData.audioOverrides?.voice || audioSettings.voice
      if (testVoice === 'random') {
        testVoice = TTS_VOICES[Math.floor(Math.random() * TTS_VOICES.length)].value
      }

      const response = await fetch('http://localhost:8129/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Claude ready',
          voice: testVoice,
          rate: formData.audioOverrides?.rate || audioSettings.rate
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
      console.error('[Settings] Audio test failed:', err)
      setProfileAudioTestPlaying(false)
    }
  }

  if (isAdding) {
    // Add/Edit Profile Form
    return (
      <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-white mb-3">
          {editingIndex !== null ? 'Edit Profile' : 'New Profile'}
        </h4>
        <div className="space-y-4">
          {/* Profile Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Profile Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => {
                const name = e.target.value
                const id = name.toLowerCase().replace(/\s+/g, '-')
                setFormData({ ...formData, name, id })
              }}
              placeholder="e.g., Default, Projects, Large Text"
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
            />
            {formData.name && (
              <p className="text-xs text-gray-400 mt-1">ID: {formData.id}</p>
            )}
          </div>

          {/* Working Directory */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Working Directory (optional)</label>
            <input
              type="text"
              value={formData.workingDir}
              onChange={(e) => setFormData({ ...formData, workingDir: e.target.value })}
              placeholder="Leave empty to use header directory"
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Leave empty to inherit from the working directory in the header
            </p>
          </div>

          {/* Starting Command */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Starting Command (optional)</label>
            <input
              type="text"
              value={formData.command || ''}
              onChange={(e) => setFormData({ ...formData, command: e.target.value })}
              placeholder="e.g., npm run dev, htop, vim ."
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              Command to run when terminal spawns
            </p>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Category (optional)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.category || ''}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Claude Code, TUI Tools"
                list="category-suggestions"
                className="flex-1 px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
              />
              <datalist id="category-suggestions">
                {getUniqueCategories().map(cat => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
              {formData.category && (
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, category: '' })}
                  className="px-2 py-1 text-gray-400 hover:text-gray-200 transition-colors"
                  title="Clear category"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Group profiles together and color-code terminal tabs
            </p>
          </div>

          {/* Font Size */}
          <div>
            <label className="flex items-center gap-2 text-xs text-gray-400 mb-2">
              Font Size: {formData.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={formData.fontSize}
              onChange={(e) => setFormData({ ...formData, fontSize: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>12px</span>
              <span>18px</span>
              <span>24px</span>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Font Family</label>
            <select
              value={formData.fontFamily}
              onChange={(e) => setFormData({ ...formData, fontFamily: e.target.value })}
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
              style={{ fontFamily: formData.fontFamily }}
            >
              {getAvailableFonts().map((font) => (
                <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              <div className="flex items-center gap-1">
                <Palette className="h-3 w-3" />
                Color Theme
              </div>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {themeNames.map((themeName) => {
                const theme = themes[themeName]
                const isSelected = formData.themeName === themeName
                // Get preview colors from dark variant
                const previewColors = theme.dark.colors

                return (
                  <button
                    key={themeName}
                    onClick={() => setFormData({ ...formData, themeName })}
                    className={`
                      px-3 py-2 rounded-lg border transition-all text-left
                      ${isSelected
                        ? 'border-[#00ff88] bg-[#00ff88]/10'
                        : 'border-gray-700 hover:border-gray-600 bg-black/30'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      {/* Color preview dots */}
                      <div className="flex gap-0.5">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: previewColors.red }}
                        />
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: previewColors.green }}
                        />
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: previewColors.blue }}
                        />
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: previewColors.magenta }}
                        />
                      </div>
                      <span className={`text-sm ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                        {theme.name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 truncate">
                      {theme.description}
                    </p>
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Use the header toggle to switch between dark/light mode
            </p>
          </div>

          {/* Audio Settings - Collapsible */}
          <div className="border border-gray-800 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setProfileAudioExpanded(!profileAudioExpanded)}
              className="w-full px-3 py-2 flex items-center justify-between bg-black/30 hover:bg-black/40 transition-colors"
            >
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <Volume2 className="h-4 w-4" />
                Audio Settings
                {formData.audioOverrides?.mode && formData.audioOverrides.mode !== 'default' && (
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    formData.audioOverrides.mode === 'disabled'
                      ? 'bg-gray-600/50 text-gray-400'
                      : 'bg-[#00ff88]/20 text-[#00ff88]'
                  }`}>
                    {formData.audioOverrides.mode === 'disabled' ? 'Off' : 'On'}
                  </span>
                )}
              </div>
              {profileAudioExpanded ? (
                <ChevronUp className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              )}
            </button>

            {profileAudioExpanded && (
              <div className="px-3 py-3 space-y-4 border-t border-gray-800">
                {/* Audio Mode */}
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Audio Mode</label>
                  <select
                    value={formData.audioOverrides?.mode || 'default'}
                    onChange={(e) => {
                      const mode = e.target.value as AudioMode
                      setFormData({
                        ...formData,
                        audioOverrides: mode === 'default' && !formData.audioOverrides?.voice && !formData.audioOverrides?.rate
                          ? undefined
                          : { ...formData.audioOverrides, mode: mode === 'default' ? undefined : mode }
                      })
                    }}
                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                  >
                    <option value="default">Use default (follows header toggle)</option>
                    <option value="enabled">Enabled (always on, respects mute)</option>
                    <option value="disabled">Disabled (never plays audio)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {formData.audioOverrides?.mode === 'disabled'
                      ? 'Audio will never play for this profile'
                      : formData.audioOverrides?.mode === 'enabled'
                        ? 'Audio always plays unless header mute is on'
                        : 'Follows the global audio enable setting'}
                  </p>
                </div>

                {/* Voice Override - only show if not disabled */}
                {formData.audioOverrides?.mode !== 'disabled' && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Voice</label>
                    <select
                      value={formData.audioOverrides?.voice || ''}
                      onChange={(e) => {
                        const voice = e.target.value || undefined
                        const newOverrides = { ...formData.audioOverrides, voice }
                        // Clean up empty overrides
                        if (!newOverrides.mode && !newOverrides.voice && !newOverrides.rate) {
                          setFormData({ ...formData, audioOverrides: undefined })
                        } else {
                          setFormData({ ...formData, audioOverrides: newOverrides })
                        }
                      }}
                      className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
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
                  </div>
                )}

                {/* Rate Override - only show if not disabled */}
                {formData.audioOverrides?.mode !== 'disabled' && (
                  <div>
                    <label className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        checked={!!formData.audioOverrides?.rate}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData({
                              ...formData,
                              audioOverrides: { ...formData.audioOverrides, rate: audioSettings.rate }
                            })
                          } else {
                            const { rate, ...rest } = formData.audioOverrides || {}
                            setFormData({
                              ...formData,
                              audioOverrides: Object.keys(rest).length > 0 ? rest : undefined
                            })
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-600 bg-black/50 text-[#00ff88]"
                      />
                      <span className="text-xs text-gray-400">
                        Override speech rate: {formData.audioOverrides?.rate || audioSettings.rate}
                      </span>
                    </label>
                    {formData.audioOverrides?.rate && (
                      <input
                        type="range"
                        min="-50"
                        max="100"
                        step="10"
                        value={parseInt(formData.audioOverrides.rate)}
                        onChange={(e) => {
                          const val = parseInt(e.target.value)
                          setFormData({
                            ...formData,
                            audioOverrides: {
                              ...formData.audioOverrides,
                              rate: val >= 0 ? `+${val}%` : `${val}%`
                            }
                          })
                        }}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
                      />
                    )}
                  </div>
                )}

                {/* Test Button - only show if not disabled */}
                {formData.audioOverrides?.mode !== 'disabled' && (
                  <button
                    type="button"
                    onClick={handleProfileAudioTest}
                    disabled={profileAudioTestPlaying}
                    className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Volume2 className="h-4 w-4" />
                    {profileAudioTestPlaying ? 'Playing...' : 'Test Voice'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCancelEdit}
              className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddProfile}
              disabled={!formData.name || !formData.id}
              className="flex-1 px-4 py-2 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {editingIndex !== null ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Profile List View
  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-400">
          Configure terminal profiles with custom settings
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onExportProfiles}
            disabled={profiles.length === 0}
            className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Export profiles to JSON"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            onClick={onImportClick}
            className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors flex items-center gap-1"
            title="Import profiles from JSON"
          >
            <Upload className="h-4 w-4" />
          </button>
          <button
            onClick={() => setIsAdding(true)}
            className="px-3 py-1.5 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            Add Profile
          </button>
        </div>
      </div>

      {/* Default Profile Selector */}
      <div className="mb-6 bg-black/30 border border-gray-800 rounded-lg p-4">
        <label className="block text-sm font-medium text-white mb-3">
          Default Profile
        </label>
        <select
          value={defaultProfile}
          onChange={(e) => setDefaultProfile(e.target.value)}
          className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-2">
          Used when clicking the "+" button in tab bar
        </p>
      </div>

      {/* Search Bar */}
      {profiles.length > 0 && (
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            type="text"
            value={profileSearchQuery}
            onChange={(e) => setProfileSearchQuery(e.target.value)}
            placeholder="Search profiles..."
            className="w-full pl-10 pr-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
          />
          {profileSearchQuery && (
            <button
              onClick={() => setProfileSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Profile List */}
      {profiles.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <TerminalIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="mb-4">No profiles yet</p>
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors"
          >
            Add Your First Profile
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {getGroupedProfiles().map(({ category, profiles: categoryProfiles }) => {
            const isCollapsed = category && categorySettings[category]?.collapsed
            const categoryColor = category ? getCategoryColor(category) : DEFAULT_CATEGORY_COLOR

            return (
              <div key={category || '__uncategorized__'} className="space-y-2">
                {/* Category Header (only show if category exists) */}
                {category && (
                  <div
                    draggable
                    onDragStart={() => handleCategoryDragStart(category)}
                    onDragOver={(e) => handleCategoryDragOver(e, category)}
                    onDragLeave={handleCategoryDragLeave}
                    onDrop={() => handleCategoryDrop(category)}
                    onDragEnd={handleCategoryDragEnd}
                    className={`
                      relative flex items-center gap-2 py-1 px-1 -mx-1 rounded transition-all
                      ${draggedCategory === category ? 'opacity-50' : ''}
                      ${draggedCategory && draggedCategory !== category ? 'hover:bg-white/5' : ''}
                    `}
                  >
                    {/* Drop indicator line - above */}
                    {dragOverCategory === category && categoryDropPosition === 'above' && (
                      <div className="absolute -top-[3px] left-0 right-0 h-[2px] bg-[#00ff88] rounded-full shadow-[0_0_6px_#00ff88]" />
                    )}
                    {/* Drop indicator line - below */}
                    {dragOverCategory === category && categoryDropPosition === 'below' && (
                      <div className="absolute -bottom-[3px] left-0 right-0 h-[2px] bg-[#00ff88] rounded-full shadow-[0_0_6px_#00ff88]" />
                    )}
                    {/* Drag Handle */}
                    <div
                      className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition-colors"
                      title="Drag to reorder category"
                    >
                      <GripVertical className="h-4 w-4" />
                    </div>

                    {/* Category name - editable or display */}
                    {editingCategory === category ? (
                      <div className="flex items-center gap-2 flex-1">
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: categoryColor }}
                        />
                        <input
                          ref={categoryInputRef}
                          type="text"
                          value={editingCategoryName}
                          onChange={(e) => setEditingCategoryName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEditingCategory()
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              cancelEditingCategory()
                            }
                          }}
                          onBlur={saveEditingCategory}
                          className="flex-1 px-2 py-0.5 bg-black/50 border border-[#00ff88] rounded text-white text-sm focus:outline-none"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => toggleCategoryCollapsed(category)}
                        className="flex items-center gap-2 text-sm font-medium text-gray-300 hover:text-white transition-colors"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                        <span
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: categoryColor }}
                        />
                        <span>{category}</span>
                        <span className="text-gray-500 font-normal">({categoryProfiles.length})</span>
                      </button>
                    )}

                    {/* Edit button (only show when not editing) */}
                    {editingCategory !== category && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          startEditingCategory(category)
                        }}
                        className="p-1 hover:bg-[#00ff88]/10 rounded text-gray-500 hover:text-[#00ff88] transition-colors"
                        title="Rename category"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {/* Color picker */}
                    <div className="flex items-center gap-1 ml-auto">
                      {CATEGORY_COLORS.map(color => (
                        <button
                          key={color.value}
                          onClick={() => setCategoryColor(category, color.value)}
                          className={`w-4 h-4 rounded-full transition-transform hover:scale-125 ${
                            categoryColor === color.value ? 'ring-2 ring-white ring-offset-1 ring-offset-black' : ''
                          }`}
                          style={{ backgroundColor: color.value }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Uncategorized label */}
                {!category && categoryProfiles.length > 0 && getUniqueCategories().length > 0 && (
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-500">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: DEFAULT_CATEGORY_COLOR }}
                    />
                    <span>Uncategorized</span>
                    <span className="font-normal">({categoryProfiles.length})</span>
                  </div>
                )}

                {/* Profile items (hidden if category is collapsed) */}
                {!isCollapsed && categoryProfiles.map(({ profile, originalIndex }) => (
                  <div
                    key={profile.id}
                    draggable
                    onDragStart={() => handleDragStart(originalIndex)}
                    onDragOver={(e) => handleDragOver(e, originalIndex)}
                    onDragLeave={handleDragLeave}
                    onDrop={() => handleDrop(originalIndex)}
                    onDragEnd={handleDragEnd}
                    className={`
                      relative bg-black/30 border rounded-lg p-3 transition-all
                      ${category ? 'ml-5' : ''}
                      ${draggedIndex === originalIndex ? 'opacity-50 border-[#00ff88]' : 'border-gray-800'}
                      ${draggedIndex === null ? 'hover:bg-black/40' : ''}
                    `}
                    style={category ? { borderLeftColor: categoryColor, borderLeftWidth: '3px' } : undefined}
                  >
                    {/* Drop indicator line - above */}
                    {dragOverIndex === originalIndex && dropPosition === 'above' && (
                      <div className="absolute -top-[5px] left-0 right-0 h-[2px] bg-[#00ff88] rounded-full shadow-[0_0_6px_#00ff88]" />
                    )}
                    {/* Drop indicator line - below */}
                    {dragOverIndex === originalIndex && dropPosition === 'below' && (
                      <div className="absolute -bottom-[5px] left-0 right-0 h-[2px] bg-[#00ff88] rounded-full shadow-[0_0_6px_#00ff88]" />
                    )}
                    <div className="flex items-start gap-2">
                      {/* Drag Handle */}
                      <div
                        className="flex-shrink-0 pt-0.5 cursor-grab active:cursor-grabbing text-gray-600 hover:text-gray-400 transition-colors"
                        title="Drag to reorder"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white text-sm">{profile.name}</span>
                          {profile.id === defaultProfile && (
                            <span className="text-xs px-2 py-0.5 rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
                              Default
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">{profile.workingDir || '(inherit from header)'}</div>
                        {profile.command && (
                          <div className="text-xs text-[#00ff88]/70 mt-1 font-mono">{profile.command}</div>
                        )}
                        <div className="flex gap-3 mt-2 text-xs text-gray-400">
                          <span>Font: {profile.fontSize}px {profile.fontFamily.split(',')[0].replace(/'/g, '')}</span>
                          <span>Theme: {themes[profile.themeName]?.name || profile.themeName}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditProfile(originalIndex)}
                          className="p-1.5 hover:bg-[#00ff88]/10 rounded text-gray-400 hover:text-[#00ff88] transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteProfile(originalIndex)}
                          className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* No results message */}
          {profileSearchQuery && getGroupedProfiles().length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No profiles match "{profileSearchQuery}"</p>
            </div>
          )}
        </div>
      )}
    </>
  )
}
