import React, { useState, useEffect, useRef } from 'react'
import { X, Terminal as TerminalIcon, Wrench, Volume2, Key, Copy, Check } from 'lucide-react'
import {
  Profile,
  CategorySettings,
  AudioSettings,
  AudioEventSettings,
  AudioMode,
  TabType,
  PRESETS,
  DEFAULT_AUDIO_SETTINGS,
} from './settings/types'
import { ProfilesTab } from './settings/ProfilesTab'
import { McpToolsTab } from './settings/McpToolsTab'
import { AudioTab } from './settings/AudioTab'
import { ImportExportDialog } from './settings/ImportExportDialog'

// Re-export types for backward compatibility
export type {
  Profile,
  CategorySettings,
  AudioSettings,
  AudioEventSettings,
  AudioMode,
  ProfileAudioOverrides,
} from './settings/types'

export {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
} from './settings/types'

/**
 * Props for the SettingsModal component
 */
interface SettingsModalProps {
  /** Whether the modal is currently open */
  isOpen: boolean
  /** Callback to close the modal */
  onClose: () => void
  /** Optional profile ID to edit on open (switches to profiles tab and opens editor) */
  editProfileId?: string | null
}

/**
 * SettingsModal - Main settings interface for Tabz
 *
 * A tabbed modal dialog that provides configuration for:
 * - **Profiles Tab**: Create, edit, delete terminal profiles with customization
 *   options for theme, font, working directory, and startup commands
 * - **MCP Tools Tab**: Enable/disable MCP tools, configure URL permissions
 * - **Audio Tab**: Configure Claude Code status audio notifications
 *
 * Features:
 * - Import/export profiles as JSON for backup and sharing
 * - Drag-and-drop profile reordering
 * - Category-based profile organization with color coding
 * - Per-profile audio notification overrides
 * - Real-time sync with Chrome storage and backend API
 *
 * @param props - Modal configuration
 * @param props.isOpen - Controls modal visibility
 * @param props.onClose - Called when user closes the modal
 * @returns Modal dialog or null if not open
 */
export function SettingsModal({ isOpen, onClose, editProfileId }: SettingsModalProps) {
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('profiles')

  // Switch to profiles tab when editProfileId changes
  useEffect(() => {
    if (editProfileId && isOpen) {
      setActiveTab('profiles')
    }
  }, [editProfileId, isOpen])

  // Profile state
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [defaultProfile, setDefaultProfile] = useState<string>('default')

  // Category settings state
  const [categorySettings, setCategorySettings] = useState<CategorySettings>({})

  // MCP state
  const [mcpEnabledTools, setMcpEnabledTools] = useState<string[]>(PRESETS.standard)
  const [mcpConfigChanged, setMcpConfigChanged] = useState(false)
  const [mcpConfigSaved, setMcpConfigSaved] = useState(false)
  const [mcpLoading, setMcpLoading] = useState(false)

  // URL settings for tabz_open_url
  const [allowAllUrls, setAllowAllUrls] = useState(false)
  const [customDomains, setCustomDomains] = useState('')

  // Import/Export state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [pendingImportProfiles, setPendingImportProfiles] = useState<Profile[]>([])
  const [pendingImportCategorySettings, setPendingImportCategorySettings] = useState<CategorySettings | undefined>(undefined)
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  // Audio settings state
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS)

  // Security token state
  const [showTokenHelp, setShowTokenHelp] = useState(false)
  const [tokenCopied, setTokenCopied] = useState(false)

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setMcpConfigChanged(false)
      setMcpConfigSaved(false)
      setShowImportDialog(false)
      setPendingImportProfiles([])
      setPendingImportCategorySettings(undefined)
      setImportWarnings([])
    }
  }, [isOpen])

  // Load MCP config from backend (with Chrome storage fallback)
  useEffect(() => {
    if (isOpen) {
      setMcpLoading(true)

      fetch('http://localhost:8129/api/mcp-config')
        .then(res => res.json())
        .then(data => {
          if (data.enabledTools) {
            setMcpEnabledTools(data.enabledTools)
            chrome.storage.local.set({ mcpEnabledTools: data.enabledTools })
          } else if (data.enabledGroups) {
            console.log('[Settings] Migrating from groups to individual tools')
            setMcpEnabledTools(PRESETS.standard)
          }
          if (data.allowAllUrls !== undefined) {
            setAllowAllUrls(data.allowAllUrls)
          }
          if (data.customDomains) {
            setCustomDomains(data.customDomains)
          }
        })
        .catch(err => {
          console.warn('[Settings] Backend unavailable, using Chrome storage:', err.message)
          chrome.storage.local.get(['mcpEnabledTools', 'mcpEnabledGroups', 'allowAllUrls', 'customDomains'], (result) => {
            if (result.mcpEnabledTools && Array.isArray(result.mcpEnabledTools)) {
              setMcpEnabledTools(result.mcpEnabledTools as string[])
              console.log('[Settings] Loaded MCP config from Chrome storage')
            } else if (result.mcpEnabledGroups) {
              console.log('[Settings] Migrating from groups to individual tools')
              setMcpEnabledTools(PRESETS.standard)
            }
            if (result.allowAllUrls !== undefined) {
              setAllowAllUrls(result.allowAllUrls as boolean)
            }
            if (result.customDomains) {
              setCustomDomains(result.customDomains as string)
            }
          })
        })
        .finally(() => {
          setMcpLoading(false)
        })

      // Load audio settings from Chrome storage
      chrome.storage.local.get(['audioSettings'], (result) => {
        if (result.audioSettings) {
          setAudioSettings({ ...DEFAULT_AUDIO_SETTINGS, ...result.audioSettings })
        }
      })

      // Load category settings from Chrome storage
      chrome.storage.local.get(['categorySettings'], (result) => {
        if (result.categorySettings) {
          setCategorySettings(result.categorySettings as CategorySettings)
        }
      })
    }
  }, [isOpen])

  // Load profiles
  useEffect(() => {
    chrome.storage.local.get(['profiles', 'defaultProfile'], async (result) => {
      if (!result.profiles || !Array.isArray(result.profiles) || result.profiles.length === 0) {
        try {
          const url = chrome.runtime.getURL('profiles.json')
          const response = await fetch(url)
          const data = await response.json()

          setProfiles(data.profiles as Profile[])
          setDefaultProfile(data.defaultProfile || 'default')

          chrome.storage.local.set({
            profiles: data.profiles,
            defaultProfile: data.defaultProfile || 'default'
          })
        } catch (error) {
          console.error('[Settings] Failed to load default profiles:', error)
        }
      } else {
        // Migrate old profiles
        const migratedProfiles = (result.profiles as any[]).map(p => {
          let themeName = p.themeName
          if (!themeName && p.theme) {
            themeName = p.theme === 'light' ? 'high-contrast' : 'high-contrast'
          }

          let audioOverrides = p.audioOverrides
          if (audioOverrides) {
            const { enabled, events, ...rest } = audioOverrides
            if (enabled === false) {
              audioOverrides = { ...rest, mode: 'disabled' as AudioMode }
            } else if (events !== undefined || enabled !== undefined) {
              audioOverrides = Object.keys(rest).length > 0 ? rest : undefined
            }
          }

          return {
            ...p,
            fontSize: p.fontSize ?? 16,
            fontFamily: p.fontFamily ?? 'monospace',
            themeName: themeName ?? 'high-contrast',
            theme: undefined,
            audioOverrides,
          }
        })
        setProfiles(migratedProfiles)

        const savedDefault = result.defaultProfile as string
        const profileIds = migratedProfiles.map((p: Profile) => p.id)
        const validDefault = savedDefault && profileIds.includes(savedDefault)
          ? savedDefault
          : migratedProfiles[0]?.id || 'default'

        if (!validDefault || validDefault !== savedDefault) {
          console.log(`[Settings] defaultProfile '${savedDefault}' not found in profiles, using '${validDefault}'`)
          chrome.storage.local.set({ defaultProfile: validDefault })
        }
        setDefaultProfile(validDefault)

        const needsMigration = (result.profiles as any[]).some(
          p => p.fontSize === undefined || p.fontFamily === undefined || p.themeName === undefined || p.theme !== undefined ||
               (p.audioOverrides && (p.audioOverrides.enabled !== undefined || p.audioOverrides.events !== undefined))
        )
        if (needsMigration) {
          console.log('[Settings] Migrating old profiles with missing fields or old theme/audio format')
          chrome.storage.local.set({ profiles: migratedProfiles })
        }
      }
    })
  }, [isOpen])

  // Save handler for profiles
  const handleSave = () => {
    chrome.storage.local.set({
      profiles: profiles,
      defaultProfile: defaultProfile,
    }, () => {
      console.log('[Settings] Saved:', { profiles: profiles.length, defaultProfile })
      onClose()
    })
  }

  // MCP save handler
  const handleMcpSave = async () => {
    chrome.storage.local.set({ mcpEnabledTools, allowAllUrls, customDomains }, () => {
      console.log('[Settings] MCP config saved to Chrome storage:', { mcpEnabledTools, allowAllUrls, customDomains })
    })

    try {
      const response = await fetch('http://localhost:8129/api/mcp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledTools: mcpEnabledTools, allowAllUrls, customDomains })
      })
      const data = await response.json()
      if (data.success) {
        console.log('[Settings] MCP config synced to backend:', { mcpEnabledTools, allowAllUrls, customDomains })
      }
    } catch (err) {
      console.error('[Settings] Failed to sync MCP config to backend (Chrome storage saved):', err)
    }

    setMcpConfigSaved(true)
    setMcpConfigChanged(false)
  }

  // Audio handlers
  const updateAudioSettings = (updates: Partial<AudioSettings>) => {
    const newSettings = { ...audioSettings, ...updates }
    setAudioSettings(newSettings)
    chrome.storage.local.set({ audioSettings: newSettings })
  }

  const updateAudioEvents = (eventUpdates: Partial<AudioEventSettings>) => {
    updateAudioSettings({ events: { ...audioSettings.events, ...eventUpdates } })
  }

  // Export/Import handlers
  const handleExportProfiles = () => {
    const exportData = {
      version: 2,
      exported: new Date().toISOString(),
      profiles: profiles,
      categorySettings: categorySettings,
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const date = new Date().toISOString().split('T')[0]
    const a = document.createElement('a')
    a.href = url
    a.download = `tabz-profiles-${date}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
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
        const json = JSON.parse(event.target?.result as string)
        const warnings: string[] = []

        if (!json.profiles || !Array.isArray(json.profiles)) {
          alert('Invalid file: missing profiles array')
          return
        }

        const validProfiles: Profile[] = []
        json.profiles.forEach((p: any, i: number) => {
          if (!p.id || !p.name) {
            warnings.push(`Profile ${i + 1}: Missing required fields (id, name) - skipped`)
            return
          }
          validProfiles.push({
            id: p.id,
            name: p.name,
            workingDir: p.workingDir || '',
            command: p.command || '',
            fontSize: p.fontSize ?? 16,
            fontFamily: p.fontFamily ?? 'monospace',
            themeName: p.themeName ?? 'high-contrast',
            category: p.category,
            audioOverrides: p.audioOverrides,
          })
        })

        const importedCategorySettings = json.categorySettings as CategorySettings | undefined

        if (validProfiles.length === 0) {
          alert('No valid profiles found in file')
          return
        }

        setPendingImportProfiles(validProfiles)
        setPendingImportCategorySettings(importedCategorySettings)
        setImportWarnings(warnings)
        setShowImportDialog(true)
      } catch (err) {
        alert('Invalid JSON file: ' + (err as Error).message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleImportConfirm = (mode: 'merge' | 'replace') => {
    let newProfiles: Profile[]
    let newCategorySettings: CategorySettings = categorySettings
    const skipped: string[] = []

    if (mode === 'replace') {
      newProfiles = pendingImportProfiles
      if (pendingImportCategorySettings) {
        newCategorySettings = pendingImportCategorySettings
      }
    } else {
      const existingIds = new Set(profiles.map(p => p.id))
      const toAdd = pendingImportProfiles.filter(p => {
        if (existingIds.has(p.id)) {
          skipped.push(p.name)
          return false
        }
        return true
      })
      newProfiles = [...profiles, ...toAdd]
      if (pendingImportCategorySettings) {
        newCategorySettings = { ...categorySettings, ...pendingImportCategorySettings }
      }
    }

    setProfiles(newProfiles)
    setCategorySettings(newCategorySettings)

    const newIds = new Set(newProfiles.map(p => p.id))
    if (!newIds.has(defaultProfile) && newProfiles.length > 0) {
      setDefaultProfile(newProfiles[0].id)
    }

    if (skipped.length > 0) {
      console.log(`[Settings] Import: Skipped ${skipped.length} duplicate profiles: ${skipped.join(', ')}`)
    }

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

  // Toggle security token help panel
  const handleShowTokenHelp = () => {
    setShowTokenHelp(!showTokenHelp)
  }

  // Copy token to clipboard
  const handleCopyToken = async () => {
    try {
      const res = await fetch('http://localhost:8129/api/auth/token')
      const data = await res.json()
      if (data.token) {
        await navigator.clipboard.writeText(data.token)
        setTokenCopied(true)
        setTimeout(() => setTokenCopied(false), 2000)
      }
    } catch (err) {
      console.error('[Settings] Failed to copy token:', err)
    }
  }

  // Copy command to clipboard
  const handleCopyCommand = async (command: string) => {
    await navigator.clipboard.writeText(command)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
        aria-label="Import profiles from JSON file"
      />

      {/* Import Confirmation Dialog */}
      {showImportDialog && (
        <ImportExportDialog
          pendingImportProfiles={pendingImportProfiles}
          pendingImportCategorySettings={pendingImportCategorySettings}
          importWarnings={importWarnings}
          onConfirm={handleImportConfirm}
          onCancel={handleImportCancel}
        />
      )}

      <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <h2 id="settings-modal-title" className="text-xl font-semibold text-white">Settings</h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Security Token Help Button */}
            <button
              onClick={handleShowTokenHelp}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all
                ${showTokenHelp
                  ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 hover:border-gray-600'
                }
              `}
              title="Get security token for external launchers"
            >
              <Key className="h-3.5 w-3.5" />
              API Token
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
              aria-label="Close settings"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Security Token Help Panel */}
        {showTokenHelp && (
          <div className="px-6 py-4 bg-[#0a0a0a] border-b border-gray-800">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#00ff88]/10 text-[#00ff88]">
                <Key className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-white mb-1">Security Token</h3>
                <p className="text-xs text-gray-400 mb-3">
                  Copy this token to authorize external launchers (like GitHub Pages) to spawn terminals.
                </p>
                <button
                  onClick={handleCopyToken}
                  className={`
                    flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all
                    ${tokenCopied
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                      : 'bg-[#00ff88] hover:bg-[#00c8ff] text-black'
                    }
                  `}
                >
                  {tokenCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied to clipboard!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy Token
                    </>
                  )}
                </button>
              </div>
              <button
                onClick={() => setShowTokenHelp(false)}
                className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 px-6" role="tablist" aria-label="Settings sections">
          <button
            onClick={() => setActiveTab('profiles')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px]
              ${activeTab === 'profiles'
                ? 'text-[#00ff88] border-[#00ff88]'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
              }
            `}
            role="tab"
            aria-selected={activeTab === 'profiles'}
            aria-controls="profiles-panel"
            id="profiles-tab"
          >
            <TerminalIcon className="h-4 w-4" aria-hidden="true" />
            Profiles
            {profiles.length > 0 && (
              <span className="px-1.5 py-0.5 text-xs rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
                {profiles.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px]
              ${activeTab === 'mcp'
                ? 'text-[#00ff88] border-[#00ff88]'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
              }
            `}
            role="tab"
            aria-selected={activeTab === 'mcp'}
            aria-controls="mcp-panel"
            id="mcp-tab"
          >
            <Wrench className="h-4 w-4" aria-hidden="true" />
            MCP Tools
          </button>
          <button
            onClick={() => setActiveTab('audio')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px]
              ${activeTab === 'audio'
                ? 'text-[#00ff88] border-[#00ff88]'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
              }
            `}
            role="tab"
            aria-selected={activeTab === 'audio'}
            aria-controls="audio-panel"
            id="audio-tab"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            Claude Audio
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Profiles Tab */}
          {activeTab === 'profiles' && (
            <div role="tabpanel" id="profiles-panel" aria-labelledby="profiles-tab">
            <ProfilesTab
              profiles={profiles}
              setProfiles={setProfiles}
              defaultProfile={defaultProfile}
              setDefaultProfile={setDefaultProfile}
              categorySettings={categorySettings}
              setCategorySettings={setCategorySettings}
              audioSettings={audioSettings}
              onExportProfiles={handleExportProfiles}
              onImportClick={handleImportClick}
              editProfileId={editProfileId}
            />
            </div>
          )}

          {/* MCP Tools Tab */}
          {activeTab === 'mcp' && (
            <div role="tabpanel" id="mcp-panel" aria-labelledby="mcp-tab">
            <McpToolsTab
              mcpEnabledTools={mcpEnabledTools}
              setMcpEnabledTools={setMcpEnabledTools}
              mcpConfigChanged={mcpConfigChanged}
              setMcpConfigChanged={setMcpConfigChanged}
              mcpConfigSaved={mcpConfigSaved}
              setMcpConfigSaved={setMcpConfigSaved}
              mcpLoading={mcpLoading}
              allowAllUrls={allowAllUrls}
              setAllowAllUrls={setAllowAllUrls}
              customDomains={customDomains}
              setCustomDomains={setCustomDomains}
              onSave={handleMcpSave}
            />
            </div>
          )}

          {/* Audio Tab */}
          {activeTab === 'audio' && (
            <div role="tabpanel" id="audio-panel" aria-labelledby="audio-tab">
            <AudioTab
              audioSettings={audioSettings}
              updateAudioSettings={updateAudioSettings}
              updateAudioEvents={updateAudioEvents}
            />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
          >
            {activeTab === 'audio' ? 'Done' : activeTab === 'mcp' && mcpConfigSaved ? 'Done' : activeTab === 'mcp' ? 'Close' : 'Cancel'}
          </button>
          {activeTab === 'audio' ? (
            <span className="px-4 py-2 text-gray-500 text-sm">
              Settings save automatically
            </span>
          ) : activeTab === 'mcp' && mcpConfigSaved ? (
            <span className="px-4 py-2 bg-green-600/20 text-green-400 rounded text-sm font-medium">
              ✓ Saved
            </span>
          ) : (
            <button
              onClick={activeTab === 'mcp' ? handleMcpSave : handleSave}
              disabled={activeTab === 'mcp' && !mcpConfigChanged}
              className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                activeTab === 'mcp' && !mcpConfigChanged
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-[#00ff88] hover:bg-[#00c8ff] text-black'
              }`}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
