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

export interface SpawnOption {
  label: string
  command: string
  terminalType: string
  icon?: string
  description?: string
  workingDir?: string
  url?: string
}

const DEFAULT_SETTINGS: TerminalSettings = {
  fontSize: 14,
  theme: 'dark',
  fontFamily: 'monospace',
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
  const [activeTab, setActiveTab] = useState<'general' | 'spawn-options'>('general')
  const [settings, setSettings] = useState<TerminalSettings>(DEFAULT_SETTINGS)
  const [spawnOptions, setSpawnOptions] = useState<SpawnOption[]>([])
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<SpawnOption>({
    label: '',
    command: '',
    terminalType: 'bash',
    icon: '💻',
    description: '',
    workingDir: '',
    url: '',
  })

  useEffect(() => {
    // Load settings and spawn options from Chrome storage
    chrome.storage.local.get(['terminalSettings', 'spawnOptions'], (result) => {
      if (result.terminalSettings) {
        setSettings(result.terminalSettings as TerminalSettings)
      }
      if (result.spawnOptions && Array.isArray(result.spawnOptions)) {
        setSpawnOptions(result.spawnOptions as SpawnOption[])
      }
    })
  }, [isOpen])

  const handleSave = () => {
    chrome.storage.local.set({
      terminalSettings: settings,
      spawnOptions: spawnOptions,
    }, () => {
      console.log('[Settings] Saved:', { settings, spawnOptions: spawnOptions.length })
      // Broadcast settings change to trigger terminal updates
      chrome.runtime.sendMessage({
        type: 'SETTINGS_UPDATED',
        settings,
      })
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

  // Spawn option handlers
  const handleAddSpawnOption = () => {
    if (!formData.label || !formData.terminalType) return

    if (editingIndex !== null) {
      // Update existing
      const updated = [...spawnOptions]
      updated[editingIndex] = formData
      setSpawnOptions(updated)
      setEditingIndex(null)
    } else {
      // Add new
      setSpawnOptions([...spawnOptions, formData])
    }

    // Reset form
    setFormData({
      label: '',
      command: '',
      terminalType: 'bash',
      icon: '💻',
      description: '',
      workingDir: '',
      url: '',
    })
    setIsAdding(false)
  }

  const handleEditSpawnOption = (index: number) => {
    setFormData(spawnOptions[index])
    setEditingIndex(index)
    setIsAdding(true)
  }

  const handleDeleteSpawnOption = (index: number) => {
    setSpawnOptions(spawnOptions.filter((_, i) => i !== index))
  }

  const handleCancelEdit = () => {
    setIsAdding(false)
    setEditingIndex(null)
    setFormData({
      label: '',
      command: '',
      terminalType: 'bash',
      icon: '💻',
      description: '',
      workingDir: '',
      url: '',
    })
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
            onClick={() => setActiveTab('spawn-options')}
            className={`
              flex items-center gap-2 px-6 py-3 font-medium transition-all relative
              ${activeTab === 'spawn-options'
                ? 'text-[#00ff88] bg-[#00ff88]/5'
                : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
              }
            `}
          >
            <TerminalIcon className="h-4 w-4" />
            <span>Spawn Options</span>
            {spawnOptions.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-xs rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
                {spawnOptions.length}
              </span>
            )}
            {activeTab === 'spawn-options' && (
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
            // Spawn Options Tab
            <>
              {!isAdding ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-white">
                      Spawn Options ({spawnOptions.length})
                    </h3>
                    <button
                      onClick={() => setIsAdding(true)}
                      className="px-3 py-1.5 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors flex items-center gap-1"
                    >
                      <Plus className="h-4 w-4" />
                      Add Option
                    </button>
                  </div>

                  {spawnOptions.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      <TerminalIcon className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="mb-4">No spawn options yet</p>
                      <button
                        onClick={() => setIsAdding(true)}
                        className="px-4 py-2 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors"
                      >
                        Add Your First Option
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {spawnOptions.map((option, index) => (
                        <div
                          key={index}
                          className="bg-black/30 border border-gray-800 rounded-lg p-3 hover:bg-black/40 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg">{option.icon || '💻'}</span>
                                <span className="font-medium text-white text-sm">{option.label}</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                                  {option.terminalType}
                                </span>
                              </div>
                              {option.description && (
                                <div className="text-xs text-gray-400 mb-1">{option.description}</div>
                              )}
                              <div className="text-xs font-mono text-gray-300 bg-black/40 px-2 py-1 rounded border border-gray-800 truncate">
                                {option.command || `<${option.terminalType}>`}
                              </div>
                              {option.workingDir && (
                                <div className="text-xs text-gray-500 mt-1">📁 {option.workingDir}</div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleEditSpawnOption(index)}
                                className="p-1.5 hover:bg-[#00ff88]/10 rounded text-gray-400 hover:text-[#00ff88] transition-colors"
                                title="Edit"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteSpawnOption(index)}
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
                // Add/Edit Form
                <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-white mb-3">
                    {editingIndex !== null ? 'Edit Spawn Option' : 'New Spawn Option'}
                  </h4>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Label *</label>
                        <input
                          type="text"
                          value={formData.label}
                          onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                          placeholder="e.g., Claude Code"
                          className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Icon</label>
                        <input
                          type="text"
                          value={formData.icon}
                          onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                          placeholder="e.g., 🤖"
                          className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Terminal Type *</label>
                        <input
                          type="text"
                          value={formData.terminalType}
                          onChange={(e) => setFormData({ ...formData, terminalType: e.target.value })}
                          placeholder="e.g., bash, claude-code"
                          className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Command</label>
                        <input
                          type="text"
                          value={formData.command}
                          onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                          placeholder="e.g., claude --skip-permissions"
                          className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Description</label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="e.g., Claude Code interactive session"
                        className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Working Directory</label>
                      <input
                        type="text"
                        value={formData.workingDir}
                        onChange={(e) => setFormData({ ...formData, workingDir: e.target.value })}
                        placeholder="e.g., ~/projects/my-app"
                        className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">URL</label>
                      <input
                        type="text"
                        value={formData.url}
                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                        placeholder="e.g., https://github.com/user/repo"
                        className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleCancelEdit}
                        className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddSpawnOption}
                        disabled={!formData.label || !formData.terminalType}
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

    // Listen for settings updates
    const handleMessage = (message: any) => {
      if (message.type === 'SETTINGS_UPDATED') {
        setSettings(message.settings as TerminalSettings)
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  return settings
}
