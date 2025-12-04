import React, { useState, useEffect } from 'react'
import { X, Terminal as TerminalIcon, Plus, Edit, Trash2, GripVertical, Palette } from 'lucide-react'
import { themes, themeNames } from '../styles/themes'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export interface Profile {
  id: string
  name: string
  workingDir: string
  command?: string  // Optional starting command
  fontSize: number
  fontFamily: string
  themeName: string  // Theme family name (high-contrast, dracula, ocean, etc.)
}

const DEFAULT_PROFILE: Profile = {
  id: '',
  name: '',
  workingDir: '',  // Empty = inherit from header
  command: '',
  fontSize: 14,
  fontFamily: 'monospace',
  themeName: 'high-contrast',
}

const FONT_FAMILIES = [
  { label: 'Monospace (Default)', value: 'monospace' },
  { label: 'Consolas', value: 'Consolas, monospace' },
  { label: 'Courier New', value: 'Courier New, monospace' },
  { label: 'Cascadia Code', value: "'Cascadia Code', monospace" },
  { label: 'Cascadia Mono', value: "'Cascadia Mono', monospace" },
  { label: 'JetBrains Mono NF', value: "'JetBrainsMono Nerd Font', 'JetBrainsMono NF', monospace" },
  { label: 'Fira Code NF', value: "'FiraCode Nerd Font', 'FiraCode NF', monospace" },
  { label: 'Source Code Pro NF', value: "'SauceCodePro Nerd Font', 'SauceCodePro NF', monospace" },
  { label: 'Caskaydia Cove NF', value: "'CaskaydiaCove Nerd Font Mono', 'CaskaydiaCove NFM', monospace" },
  { label: 'Hack NF', value: "'Hack Nerd Font', monospace" },
  { label: 'MesloLGS NF', value: "'MesloLGS Nerd Font', monospace" },
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [defaultProfile, setDefaultProfile] = useState<string>('default')
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<Profile>(DEFAULT_PROFILE)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsAdding(false)
      setEditingIndex(null)
      setFormData(DEFAULT_PROFILE)
    }
  }, [isOpen])

  useEffect(() => {
    // Load profiles from Chrome storage
    chrome.storage.local.get(['profiles', 'defaultProfile'], async (result) => {
      // If no profiles exist, load defaults from profiles.json
      if (!result.profiles || !Array.isArray(result.profiles) || result.profiles.length === 0) {
        try {
          const url = chrome.runtime.getURL('profiles.json')
          const response = await fetch(url)
          const data = await response.json()

          setProfiles(data.profiles as Profile[])
          setDefaultProfile(data.defaultProfile || 'default')

          // Save default profiles to storage
          chrome.storage.local.set({
            profiles: data.profiles,
            defaultProfile: data.defaultProfile || 'default'
          })
        } catch (error) {
          console.error('[Settings] Failed to load default profiles:', error)
        }
      } else {
        // Migrate old profiles: ensure all required fields have defaults
        // Also migrate old 'theme' field to new 'themeName' field
        const migratedProfiles = (result.profiles as any[]).map(p => {
          // Convert old theme field to themeName
          let themeName = p.themeName
          if (!themeName && p.theme) {
            // Map old 'dark'/'light' to new theme names
            themeName = p.theme === 'light' ? 'high-contrast' : 'high-contrast'
          }

          return {
            ...p,
            fontSize: p.fontSize ?? 14,
            fontFamily: p.fontFamily ?? 'monospace',
            themeName: themeName ?? 'high-contrast',
            // Remove old theme field
            theme: undefined,
          }
        })
        setProfiles(migratedProfiles)
        setDefaultProfile((result.defaultProfile as string) || 'default')

        // Save migrated profiles back to storage if any were updated
        const needsMigration = (result.profiles as any[]).some(
          p => p.fontSize === undefined || p.fontFamily === undefined || p.themeName === undefined || p.theme !== undefined
        )
        if (needsMigration) {
          console.log('[Settings] Migrating old profiles with missing fields or old theme format')
          chrome.storage.local.set({ profiles: migratedProfiles })
        }
      }
    })
  }, [isOpen])

  const handleSave = () => {
    chrome.storage.local.set({
      profiles: profiles,
      defaultProfile: defaultProfile,
    }, () => {
      console.log('[Settings] Saved:', { profiles: profiles.length, defaultProfile })
      onClose()
    })
  }

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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <TerminalIcon className="h-5 w-5 text-[#00ff88]" />
            <h2 className="text-xl font-semibold text-white">Profiles</h2>
            {profiles.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
                {profiles.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isAdding ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">
                  Configure terminal profiles with custom settings
                </p>
                <button
                  onClick={() => setIsAdding(true)}
                  className="px-3 py-1.5 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Profile
                </button>
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
                <p className="text-xs text-gray-500 mt-2">
                  Used when clicking the "+" button in tab bar
                </p>
              </div>

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
                <div className="space-y-2">
                  {profiles.map((profile, index) => (
                    <div
                      key={profile.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={() => handleDrop(index)}
                      onDragEnd={handleDragEnd}
                      className={`
                        relative bg-black/30 border rounded-lg p-3 transition-all
                        ${draggedIndex === index ? 'opacity-50 border-[#00ff88]' : 'border-gray-800'}
                        ${draggedIndex === null ? 'hover:bg-black/40' : ''}
                      `}
                    >
                      {/* Drop indicator line - above */}
                      {dragOverIndex === index && dropPosition === 'above' && (
                        <div className="absolute -top-[5px] left-0 right-0 h-[2px] bg-[#00ff88] rounded-full shadow-[0_0_6px_#00ff88]" />
                      )}
                      {/* Drop indicator line - below */}
                      {dragOverIndex === index && dropPosition === 'below' && (
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
                          <div className="text-xs text-gray-500 mt-1">📁 {profile.workingDir || '(inherit from header)'}</div>
                          {profile.command && (
                            <div className="text-xs text-gray-500 mt-1 font-mono">▶ {profile.command}</div>
                          )}
                          <div className="flex gap-3 mt-2 text-xs text-gray-400">
                            <span>Font: {profile.fontSize}px {profile.fontFamily.split(',')[0].replace(/'/g, '')}</span>
                            <span>Theme: {themes[profile.themeName]?.name || profile.themeName}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleEditProfile(index)}
                            className="p-1.5 hover:bg-[#00ff88]/10 rounded text-gray-400 hover:text-[#00ff88] transition-colors"
                            title="Edit"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProfile(index)}
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
              )}
            </>
          ) : (
            // Add/Edit Profile Form
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
                    <p className="text-xs text-gray-500 mt-1">ID: {formData.id}</p>
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
                  <p className="text-xs text-gray-500 mt-1">
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
                  <p className="text-xs text-gray-500 mt-1">
                    Command to run when terminal spawns
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
                    {FONT_FAMILIES.map((font) => (
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
                          <p className="text-xs text-gray-500 mt-1 truncate">
                            {theme.description}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Use the header toggle to switch between dark/light mode
                  </p>
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
