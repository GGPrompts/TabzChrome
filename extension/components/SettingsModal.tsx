import React, { useState, useEffect } from 'react'
import { X, Type, Moon, Sun, Terminal as TerminalIcon, Settings as SettingsIcon, Plus, Edit, Trash2, GripVertical } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export interface TerminalSettings {
  fontSize: number
  theme: 'dark' | 'light'
  fontFamily: string
}

export interface Profile {
  id: string
  name: string
  workingDir: string
  fontSize: number
  fontFamily: string
  theme: 'dark' | 'light'
}

const DEFAULT_SETTINGS: TerminalSettings = {
  fontSize: 14,
  theme: 'dark',
  fontFamily: 'monospace',
}

const DEFAULT_PROFILE: Profile = {
  id: '',
  name: '',
  workingDir: '~',
  fontSize: 14,
  fontFamily: 'monospace',
  theme: 'dark',
}

const FONT_FAMILIES = [
  { label: 'Monospace (default)', value: 'monospace' },
  { label: 'JetBrains Mono', value: "'JetBrains Mono', monospace" },
  { label: 'Fira Code', value: "'Fira Code', monospace" },
  { label: 'Consolas', value: "'Consolas', monospace" },
  { label: 'Courier New', value: "'Courier New', monospace" },
  { label: 'Source Code Pro', value: "'Source Code Pro', monospace" },
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'profiles'>('general')
  const [settings, setSettings] = useState<TerminalSettings>(DEFAULT_SETTINGS)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [defaultProfile, setDefaultProfile] = useState<string>('default')
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<Profile>(DEFAULT_PROFILE)

  useEffect(() => {
    // Load settings and profiles from Chrome storage
    chrome.storage.local.get(['terminalSettings', 'profiles', 'defaultProfile'], async (result) => {
      if (result.terminalSettings) {
        setSettings(result.terminalSettings as TerminalSettings)
      }

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
        setProfiles(result.profiles as Profile[])
        setDefaultProfile((result.defaultProfile as string) || 'default')
      }
    })
  }, [isOpen])

  const handleSave = () => {
    chrome.storage.local.set({
      terminalSettings: settings,
      profiles: profiles,
      defaultProfile: defaultProfile,
    }, () => {
      console.log('[Settings] Saved:', { settings, profiles: profiles.length, defaultProfile })
      // Trigger storage change event (which useTerminalSettings listens to)
      // Force immediate update by dispatching custom event
      window.dispatchEvent(new CustomEvent('terminal-settings-changed', {
        detail: settings
      }))
      onClose()
    })
  }

  const handleFontSizeChange = (value: number) => {
    setSettings({ ...settings, fontSize: value })
  }

  const handleThemeToggle = () => {
    setSettings({
      ...settings,
      theme: settings.theme === 'dark' ? 'light' : 'dark',
    })
  }

  const handleFontFamilyChange = (fontFamily: string) => {
    setSettings({ ...settings, fontFamily })
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          <button
            onClick={() => setActiveTab('general')}
            className={`
              flex items-center gap-2 px-6 py-3 font-medium transition-all relative
              ${activeTab === 'general'
                ? 'text-[#00ff88] bg-[#00ff88]/5'
                : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
              }
            `}
          >
            <SettingsIcon className="h-4 w-4" />
            <span>General</span>
            {activeTab === 'general' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#00ff88] to-[#00c8ff]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('profiles')}
            className={`
              flex items-center gap-2 px-6 py-3 font-medium transition-all relative
              ${activeTab === 'profiles'
                ? 'text-[#00ff88] bg-[#00ff88]/5'
                : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
              }
            `}
          >
            <TerminalIcon className="h-4 w-4" />
            <span>Profiles</span>
            {profiles.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
                {profiles.length}
              </span>
            )}
            {activeTab === 'profiles' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#00ff88] to-[#00c8ff]" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'general' ? (
            <>
          {/* Font Size */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white mb-3">
              <Type className="h-4 w-4 text-[#00ff88]" />
              Font Size: {settings.fontSize}px
            </label>
            <input
              type="range"
              min="12"
              max="24"
              step="1"
              value={settings.fontSize}
              onChange={(e) => handleFontSizeChange(parseInt(e.target.value))}
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
            <label className="flex items-center gap-2 text-sm font-medium text-white mb-3">
              <Type className="h-4 w-4 text-[#00ff88]" />
              Font Family
            </label>
            <select
              value={settings.fontFamily}
              onChange={(e) => handleFontFamilyChange(e.target.value)}
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
            >
              {FONT_FAMILIES.map((font) => (
                <option key={font.value} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme Toggle */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white mb-3">
              {settings.theme === 'dark' ? (
                <Moon className="h-4 w-4 text-[#00ff88]" />
              ) : (
                <Sun className="h-4 w-4 text-[#00ff88]" />
              )}
              Theme
            </label>
            <button
              onClick={handleThemeToggle}
              className={`
                w-full px-4 py-3 rounded-lg border transition-all flex items-center justify-between
                ${
                  settings.theme === 'dark'
                    ? 'bg-gray-900 border-gray-700 hover:border-gray-600'
                    : 'bg-gray-100 border-gray-300 hover:border-gray-400'
                }
              `}
            >
              <span
                className={
                  settings.theme === 'dark' ? 'text-white' : 'text-gray-900'
                }
              >
                {settings.theme === 'dark' ? 'Dark Theme' : 'Light Theme'}
              </span>
              {settings.theme === 'dark' ? (
                <Moon className="h-5 w-5 text-[#00ff88]" />
              ) : (
                <Sun className="h-5 w-5 text-orange-500" />
              )}
            </button>
            <p className="text-xs text-gray-500 mt-2">
              {settings.theme === 'dark'
                ? 'Black background with green text'
                : 'White background with dark text'}
            </p>
          </div>

          {/* Preview */}
          <div>
            <label className="text-sm font-medium text-white mb-2 block">
              Preview
            </label>
            <div
              className={`
                p-4 rounded-lg border
                ${
                  settings.theme === 'dark'
                    ? 'bg-black border-gray-800 text-[#00ff88]'
                    : 'bg-white border-gray-300 text-gray-900'
                }
              `}
              style={{
                fontSize: `${settings.fontSize}px`,
                fontFamily: settings.fontFamily,
              }}
            >
              $ echo "Hello, Terminal!"
              <br />
              Hello, Terminal!
            </div>
          </div>
            </>
          ) : (
            // Profiles Tab
            <>
              {!isAdding ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      Profiles ({profiles.length})
                    </h3>
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
                          className="bg-black/30 border border-gray-800 rounded-lg p-3 hover:bg-black/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-white text-sm">{profile.name}</span>
                                {profile.id === defaultProfile && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">📁 {profile.workingDir}</div>
                              <div className="flex gap-3 mt-2 text-xs text-gray-400">
                                <span>Font: {profile.fontSize}px {profile.fontFamily.split(',')[0].replace(/'/g, '')}</span>
                                <span>Theme: {profile.theme}</span>
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
                      <label className="block text-xs text-gray-400 mb-1">Working Directory</label>
                      <input
                        type="text"
                        value={formData.workingDir}
                        onChange={(e) => setFormData({ ...formData, workingDir: e.target.value })}
                        placeholder="e.g., ~, ~/projects, ~/work"
                        className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                      />
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
                      >
                        {FONT_FAMILIES.map((font) => (
                          <option key={font.value} value={font.value}>
                            {font.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Theme */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-2">Theme</label>
                      <button
                        onClick={() => setFormData({ ...formData, theme: formData.theme === 'dark' ? 'light' : 'dark' })}
                        className={`
                          w-full px-4 py-3 rounded-lg border transition-all flex items-center justify-between
                          ${
                            formData.theme === 'dark'
                              ? 'bg-gray-900 border-gray-700 hover:border-gray-600'
                              : 'bg-gray-100 border-gray-300 hover:border-gray-400'
                          }
                        `}
                      >
                        <span
                          className={
                            formData.theme === 'dark' ? 'text-white' : 'text-gray-900'
                          }
                        >
                          {formData.theme === 'dark' ? 'Dark Theme' : 'Light Theme'}
                        </span>
                        {formData.theme === 'dark' ? (
                          <Moon className="h-5 w-5 text-[#00ff88]" />
                        ) : (
                          <Sun className="h-5 w-5 text-orange-500" />
                        )}
                      </button>
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
            </>
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
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// Hook for loading terminal settings
export function useTerminalSettings() {
  const [settings, setSettings] = useState<TerminalSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    // Load initial settings
    chrome.storage.local.get(['terminalSettings'], (result) => {
      if (result.terminalSettings) {
        setSettings(result.terminalSettings as TerminalSettings)
      }
    })

    // Listen for settings updates via custom event
    const handleSettingsChange = (event: Event) => {
      const customEvent = event as CustomEvent
      setSettings(customEvent.detail as TerminalSettings)
      console.log('[useTerminalSettings] Settings updated:', customEvent.detail)
    }

    window.addEventListener('terminal-settings-changed', handleSettingsChange)
    return () => window.removeEventListener('terminal-settings-changed', handleSettingsChange)
  }, [])

  return settings
}
