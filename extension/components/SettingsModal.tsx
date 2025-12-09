import React, { useState, useEffect, useRef } from 'react'
import { X, Terminal as TerminalIcon, Plus, Edit, Trash2, GripVertical, Palette, Wrench, AlertTriangle, Settings, ChevronDown, ChevronUp, Download, Upload, Volume2 } from 'lucide-react'
import { themes, themeNames } from '../styles/themes'

// Individual MCP Tools configuration with accurate token counts from /context
interface McpTool {
  id: string
  name: string
  desc: string
  tokens: number
  locked?: boolean  // Core tools that are always enabled
}

const MCP_TOOLS: McpTool[] = [
  // Core tools (always enabled)
  { id: 'tabz_list_tabs', name: 'List Tabs', desc: 'List all open browser tabs', tokens: 974, locked: true },
  { id: 'tabz_switch_tab', name: 'Switch Tab', desc: 'Switch to a specific tab by ID', tokens: 940, locked: true },
  { id: 'tabz_rename_tab', name: 'Rename Tab', desc: 'Assign custom names to tabs', tokens: 1000, locked: true },
  { id: 'tabz_get_page_info', name: 'Page Info', desc: 'Get URL and title of current page', tokens: 885, locked: true },
  // Interaction tools
  { id: 'tabz_click', name: 'Click', desc: 'Click elements by CSS selector', tokens: 986 },
  { id: 'tabz_fill', name: 'Fill', desc: 'Fill form inputs with text', tokens: 1100 },
  { id: 'tabz_screenshot', name: 'Screenshot', desc: 'Capture viewport (visible area)', tokens: 995 },
  { id: 'tabz_screenshot_full', name: 'Screenshot Full', desc: 'Capture entire scrollable page', tokens: 1100 },
  { id: 'tabz_download_image', name: 'Download Image', desc: 'Download images from pages', tokens: 1000 },
  { id: 'tabz_get_element', name: 'Inspect Element', desc: 'Get HTML/CSS details of elements', tokens: 1300 },
  // Navigation
  { id: 'tabz_open_url', name: 'Open URL', desc: 'Open allowed URLs (GitHub, localhost, etc.)', tokens: 1600 },
  // Console/Script
  { id: 'tabz_get_console_logs', name: 'Console Logs', desc: 'View browser console output', tokens: 1100 },
  { id: 'tabz_execute_script', name: 'Execute Script', desc: 'Run JavaScript in browser tab', tokens: 1100 },
  // Network monitoring (CDP-based)
  { id: 'tabz_enable_network_capture', name: 'Enable Network', desc: 'Start capturing network requests', tokens: 950 },
  { id: 'tabz_get_network_requests', name: 'Network Requests', desc: 'List captured XHR/fetch requests', tokens: 1400 },
  { id: 'tabz_get_api_response', name: 'API Response', desc: 'Get response body for a request', tokens: 1100 },
  { id: 'tabz_clear_network_requests', name: 'Clear Network', desc: 'Clear captured requests', tokens: 400 },
]

// All tool IDs for reference
const ALL_TOOL_IDS = MCP_TOOLS.map(t => t.id)
const CORE_TOOL_IDS = MCP_TOOLS.filter(t => t.locked).map(t => t.id)

const PRESETS = {
  minimal: CORE_TOOL_IDS,
  standard: [...CORE_TOOL_IDS, 'tabz_click', 'tabz_fill', 'tabz_screenshot', 'tabz_screenshot_full', 'tabz_open_url', 'tabz_get_console_logs', 'tabz_enable_network_capture', 'tabz_get_network_requests'],
  full: ALL_TOOL_IDS,
}

type TabType = 'profiles' | 'mcp' | 'audio'

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
  // Tab state
  const [activeTab, setActiveTab] = useState<TabType>('profiles')

  // Profile state
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [defaultProfile, setDefaultProfile] = useState<string>('default')
  const [isAdding, setIsAdding] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [formData, setFormData] = useState<Profile>(DEFAULT_PROFILE)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dropPosition, setDropPosition] = useState<'above' | 'below' | null>(null)

  // MCP state - now tracks individual tools instead of groups
  const [mcpEnabledTools, setMcpEnabledTools] = useState<string[]>(PRESETS.standard)
  const [mcpConfigChanged, setMcpConfigChanged] = useState(false)  // Unsaved changes pending
  const [mcpConfigSaved, setMcpConfigSaved] = useState(false)      // Changes have been saved (show restart notice)
  const [mcpLoading, setMcpLoading] = useState(false)

  // URL settings for tabz_open_url
  const [urlSettingsExpanded, setUrlSettingsExpanded] = useState(false)
  const [allowAllUrls, setAllowAllUrls] = useState(false)
  const [customDomains, setCustomDomains] = useState('')

  // Import/Export state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [pendingImportProfiles, setPendingImportProfiles] = useState<Profile[]>([])
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  // Audio settings state
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [audioReadyEnabled, setAudioReadyEnabled] = useState(true)
  const [audioVolume, setAudioVolume] = useState(0.7)
  const [audioTestPlaying, setAudioTestPlaying] = useState(false)

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setIsAdding(false)
      setEditingIndex(null)
      setFormData(DEFAULT_PROFILE)
      setMcpConfigChanged(false)
      setMcpConfigSaved(false)
      setShowImportDialog(false)
      setPendingImportProfiles([])
      setImportWarnings([])
      // Don't reset activeTab - let user stay on their last tab
    }
  }, [isOpen])

  // Load MCP config from backend (with Chrome storage fallback)
  useEffect(() => {
    if (isOpen) {
      setMcpLoading(true)

      // Try backend first, then Chrome storage as fallback
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
          // Load URL settings
          if (data.allowAllUrls !== undefined) {
            setAllowAllUrls(data.allowAllUrls)
          }
          if (data.customDomains) {
            setCustomDomains(data.customDomains)
          }
        })
        .catch(err => {
          console.warn('[Settings] Backend unavailable, using Chrome storage:', err.message)
          // Fallback to Chrome storage
          chrome.storage.local.get(['mcpEnabledTools', 'mcpEnabledGroups', 'allowAllUrls', 'customDomains'], (result) => {
            if (result.mcpEnabledTools && Array.isArray(result.mcpEnabledTools)) {
              setMcpEnabledTools(result.mcpEnabledTools as string[])
              console.log('[Settings] Loaded MCP config from Chrome storage')
            } else if (result.mcpEnabledGroups) {
              console.log('[Settings] Migrating from groups to individual tools')
              setMcpEnabledTools(PRESETS.standard)
            }
            // Load URL settings from Chrome storage
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
      chrome.storage.local.get(['audioEnabled', 'audioReadyEnabled', 'audioVolume'], (result) => {
        if (typeof result.audioEnabled === 'boolean') {
          setAudioEnabled(result.audioEnabled)
        }
        if (typeof result.audioReadyEnabled === 'boolean') {
          setAudioReadyEnabled(result.audioReadyEnabled)
        }
        if (typeof result.audioVolume === 'number') {
          setAudioVolume(result.audioVolume)
        }
      })
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

        // Validate defaultProfile - ensure it matches an existing profile ID
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

  // Export/Import handlers
  const handleExportProfiles = () => {
    const exportData = {
      version: 1,
      exported: new Date().toISOString(),
      profiles: profiles,
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

        // Validate structure
        if (!json.profiles || !Array.isArray(json.profiles)) {
          alert('Invalid file: missing profiles array')
          return
        }

        // Validate and filter profiles
        const validProfiles: Profile[] = []
        json.profiles.forEach((p: any, i: number) => {
          if (!p.id || !p.name) {
            warnings.push(`Profile ${i + 1}: Missing required fields (id, name) - skipped`)
            return
          }
          // Ensure required fields have defaults
          validProfiles.push({
            id: p.id,
            name: p.name,
            workingDir: p.workingDir || '',
            command: p.command || '',
            fontSize: p.fontSize ?? 14,
            fontFamily: p.fontFamily ?? 'monospace',
            themeName: p.themeName ?? 'high-contrast',
          })
        })

        if (validProfiles.length === 0) {
          alert('No valid profiles found in file')
          return
        }

        setPendingImportProfiles(validProfiles)
        setImportWarnings(warnings)
        setShowImportDialog(true)
      } catch (err) {
        alert('Invalid JSON file: ' + (err as Error).message)
      }
    }
    reader.readAsText(file)

    // Reset file input so same file can be selected again
    e.target.value = ''
  }

  const handleImportConfirm = (mode: 'merge' | 'replace') => {
    let newProfiles: Profile[]
    const skipped: string[] = []

    if (mode === 'replace') {
      newProfiles = pendingImportProfiles
    } else {
      // Merge: keep existing, add new ones (skip duplicates by ID)
      const existingIds = new Set(profiles.map(p => p.id))
      const toAdd = pendingImportProfiles.filter(p => {
        if (existingIds.has(p.id)) {
          skipped.push(p.name)
          return false
        }
        return true
      })
      newProfiles = [...profiles, ...toAdd]
    }

    setProfiles(newProfiles)

    // Update default profile if needed (when replacing and old default no longer exists)
    const newIds = new Set(newProfiles.map(p => p.id))
    if (!newIds.has(defaultProfile) && newProfiles.length > 0) {
      setDefaultProfile(newProfiles[0].id)
    }

    // Show summary
    if (skipped.length > 0) {
      console.log(`[Settings] Import: Skipped ${skipped.length} duplicate profiles: ${skipped.join(', ')}`)
    }

    setShowImportDialog(false)
    setPendingImportProfiles([])
    setImportWarnings([])
  }

  // MCP handlers
  const handleMcpToolToggle = (toolId: string) => {
    // Core tools are always required
    const tool = MCP_TOOLS.find(t => t.id === toolId)
    if (tool?.locked) return

    setMcpEnabledTools(prev => {
      const newTools = prev.includes(toolId)
        ? prev.filter(t => t !== toolId)
        : [...prev, toolId]
      return newTools
    })
    setMcpConfigChanged(true)
  }

  const handleMcpPreset = (preset: keyof typeof PRESETS) => {
    setMcpEnabledTools(PRESETS[preset])
    setMcpConfigChanged(true)
  }

  const handleMcpSave = async () => {
    // Always save to Chrome storage first
    chrome.storage.local.set({ mcpEnabledTools, allowAllUrls, customDomains }, () => {
      console.log('[Settings] MCP config saved to Chrome storage:', { mcpEnabledTools, allowAllUrls, customDomains })
    })

    // Then sync to backend
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

    // Mark as saved (shows restart notice) and clear changed flag
    setMcpConfigSaved(true)
    setMcpConfigChanged(false)
    // Don't close modal - let user see the restart notice
  }

  // Audio handlers
  const handleAudioToggle = (enabled: boolean) => {
    setAudioEnabled(enabled)
    chrome.storage.local.set({ audioEnabled: enabled })
  }

  const handleAudioReadyToggle = (enabled: boolean) => {
    setAudioReadyEnabled(enabled)
    chrome.storage.local.set({ audioReadyEnabled: enabled })
  }

  const handleAudioVolumeChange = (volume: number) => {
    setAudioVolume(volume)
    chrome.storage.local.set({ audioVolume: volume })
  }

  const handleAudioTest = async () => {
    if (audioTestPlaying) return
    setAudioTestPlaying(true)

    try {
      const response = await fetch('http://localhost:8129/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Ready' })
      })
      const data = await response.json()

      if (data.success && data.url) {
        const audio = new Audio(data.url)
        audio.volume = audioVolume
        audio.onended = () => setAudioTestPlaying(false)
        audio.onerror = () => setAudioTestPlaying(false)
        await audio.play()
      } else {
        setAudioTestPlaying(false)
      }
    } catch (err) {
      console.error('[Settings] Audio test failed:', err)
      setAudioTestPlaying(false)
    }
  }

  // Calculate token estimate from individual tools
  const estimatedTokens = mcpEnabledTools.reduce((sum, toolId) => {
    const tool = MCP_TOOLS.find(t => t.id === toolId)
    return sum + (tool?.tokens || 0)
  }, 0)

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Import Confirmation Dialog */}
      {showImportDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-[#1a1a1a] border border-gray-700 rounded-lg max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-4">Import Profiles</h3>
            <p className="text-sm text-gray-400 mb-2">
              Found {pendingImportProfiles.length} profile{pendingImportProfiles.length !== 1 ? 's' : ''} to import.
            </p>
            {importWarnings.length > 0 && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <p className="text-xs text-yellow-400 font-medium mb-1">Warnings:</p>
                {importWarnings.map((warning, i) => (
                  <p key={i} className="text-xs text-yellow-300">{warning}</p>
                ))}
              </div>
            )}
            <p className="text-sm text-gray-400 mb-4">
              How would you like to handle existing profiles?
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleImportConfirm('merge')}
                className="w-full px-4 py-2 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors"
              >
                Merge (add new, keep existing)
              </button>
              <button
                onClick={() => handleImportConfirm('replace')}
                className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm transition-colors"
              >
                Replace all
              </button>
              <button
                onClick={() => {
                  setShowImportDialog(false)
                  setPendingImportProfiles([])
                  setImportWarnings([])
                }}
                className="w-full px-4 py-2 bg-transparent hover:bg-white/5 text-gray-400 rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 px-6">
          <button
            onClick={() => setActiveTab('profiles')}
            className={`
              flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[1px]
              ${activeTab === 'profiles'
                ? 'text-[#00ff88] border-[#00ff88]'
                : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
              }
            `}
          >
            <TerminalIcon className="h-4 w-4" />
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
          >
            <Wrench className="h-4 w-4" />
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
          >
            <Volume2 className="h-4 w-4" />
            Audio
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Profiles Tab */}
          {activeTab === 'profiles' && (
            !isAdding ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-400">
                  Configure terminal profiles with custom settings
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportProfiles}
                    disabled={profiles.length === 0}
                    className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-sm transition-colors flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Export profiles to JSON"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleImportClick}
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
            )
          )}

          {/* MCP Tools Tab */}
          {activeTab === 'mcp' && (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-400">
                  Control which MCP tools are available to Claude Code.
                  Fewer tools = less context usage = faster responses.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  💡 <a
                    href="https://gist.github.com/GGPrompts/50e82596b345557656df2fc8d2d54e2c"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#00c8ff] hover:underline"
                  >Save ~80% tokens with mcp-cli mode</a>
                </p>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs text-gray-500">Quick presets:</span>
                <button
                  onClick={() => handleMcpPreset('minimal')}
                  className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  Minimal
                </button>
                <button
                  onClick={() => handleMcpPreset('standard')}
                  className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  Standard
                </button>
                <button
                  onClick={() => handleMcpPreset('full')}
                  className="px-2 py-1 text-xs rounded bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
                >
                  Full
                </button>
              </div>

              {/* Individual Tools */}
              {mcpLoading ? (
                <div className="text-center py-8 text-gray-500">
                  Loading MCP configuration...
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Core tools (always enabled) */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Core Tools</span>
                      <span className="text-xs text-gray-600">(always enabled)</span>
                    </div>
                    <div className="space-y-1">
                      {MCP_TOOLS.filter(t => t.locked).map((tool) => (
                        <div
                          key={tool.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-black/20 border border-gray-800/50 opacity-70"
                        >
                          <input
                            type="checkbox"
                            checked={true}
                            disabled={true}
                            className="w-4 h-4 rounded border-gray-600 bg-black/50 text-[#00ff88] cursor-not-allowed"
                          />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="font-medium text-white text-sm">{tool.name}</span>
                            <span className="text-xs text-gray-500 truncate">{tool.desc}</span>
                            <span className="text-xs text-gray-600 ml-auto flex-shrink-0">
                              {tool.tokens.toLocaleString()} tok
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Optional tools */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Optional Tools</span>
                    </div>
                    <div className="space-y-1">
                      {MCP_TOOLS.filter(t => !t.locked).map((tool) => {
                        const isEnabled = mcpEnabledTools.includes(tool.id)
                        const isOpenUrl = tool.id === 'tabz_open_url'

                        return (
                          <div key={tool.id}>
                            <div
                              className={`
                                flex items-center gap-3 p-2 rounded-lg border transition-all
                                ${isEnabled
                                  ? 'bg-[#00ff88]/5 border-[#00ff88]/30'
                                  : 'bg-black/30 border-gray-800 hover:border-gray-700'
                                }
                                ${isOpenUrl && urlSettingsExpanded ? 'rounded-b-none' : ''}
                              `}
                            >
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => handleMcpToolToggle(tool.id)}
                                className="w-4 h-4 rounded border-gray-600 bg-black/50 text-[#00ff88] focus:ring-[#00ff88] focus:ring-offset-0 cursor-pointer"
                              />
                              <label
                                onClick={() => handleMcpToolToggle(tool.id)}
                                className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer"
                              >
                                <span className="font-medium text-white text-sm">{tool.name}</span>
                                <span className="text-xs text-gray-500 truncate">{tool.desc}</span>
                              </label>
                              {isOpenUrl && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setUrlSettingsExpanded(!urlSettingsExpanded)
                                  }}
                                  className={`
                                    p-1 rounded transition-colors flex-shrink-0
                                    ${urlSettingsExpanded
                                      ? 'bg-[#00ff88]/20 text-[#00ff88]'
                                      : 'hover:bg-white/10 text-gray-400 hover:text-white'
                                    }
                                  `}
                                  title="Configure allowed URLs"
                                >
                                  <Settings className="h-4 w-4" />
                                </button>
                              )}
                              <span className="text-xs text-gray-600 flex-shrink-0">
                                {tool.tokens.toLocaleString()} tok
                              </span>
                            </div>

                            {/* URL Settings Panel */}
                            {isOpenUrl && urlSettingsExpanded && (
                              <div className="border border-t-0 border-[#00ff88]/30 rounded-b-lg bg-black/40 p-3 space-y-3">
                                {/* YOLO Mode */}
                                <label className="flex items-center gap-3 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={allowAllUrls}
                                    onChange={(e) => {
                                      setAllowAllUrls(e.target.checked)
                                      setMcpConfigChanged(true)
                                    }}
                                    className="w-4 h-4 rounded border-gray-600 bg-black/50 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-0"
                                  />
                                  <div>
                                    <span className="text-sm text-white font-medium">Allow all URLs</span>
                                    <span className="text-xs text-yellow-500 ml-2">(YOLO mode)</span>
                                  </div>
                                </label>
                                {allowAllUrls && (
                                  <div className="text-xs text-yellow-500/80 pl-7 space-y-1">
                                    <p>⚠️ Claude can open and interact with any website.</p>
                                    <p className="text-yellow-600">Recommended: Use a separate Chrome profile without sensitive logins (banking, email, etc.)</p>
                                  </div>
                                )}

                                {/* Custom Domains */}
                                <div className={allowAllUrls ? 'opacity-50 pointer-events-none' : ''}>
                                  <label className="block text-xs text-gray-400 mb-1">
                                    Custom allowed domains (one per line)
                                  </label>
                                  <textarea
                                    value={customDomains}
                                    onChange={(e) => {
                                      setCustomDomains(e.target.value)
                                      setMcpConfigChanged(true)
                                    }}
                                    placeholder="example.com&#10;*.mycompany.com&#10;internal.dev:8080"
                                    rows={3}
                                    className="w-full px-2 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-xs font-mono focus:border-[#00ff88] focus:outline-none resize-none"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">
                                    Added to built-in domains (GitHub, localhost, Vercel, etc.)
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Token Estimate & Restart Notice */}
              <div className="mt-6 pt-4 border-t border-gray-800 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Estimated context usage:</span>
                  <span className="font-mono text-[#00ff88]">~{estimatedTokens.toLocaleString()} tokens</span>
                </div>

                {mcpConfigSaved ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                    <span className="text-green-400 flex-shrink-0">✓</span>
                    <span className="text-xs text-green-200">
                      Saved! Restart Claude Code to apply changes
                    </span>
                  </div>
                ) : mcpConfigChanged ? (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
                    <span className="text-blue-400 flex-shrink-0">●</span>
                    <span className="text-xs text-blue-200">
                      Unsaved changes
                    </span>
                  </div>
                ) : null}
              </div>
            </>
          )}

          {/* Audio Tab */}
          {activeTab === 'audio' && (
            <>
              <div className="mb-4">
                <p className="text-sm text-gray-400">
                  Play audio notifications when Claude Code status changes.
                  Audio is generated using neural text-to-speech and played through Chrome.
                </p>
              </div>

              {/* Master Toggle */}
              <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-white">Enable Audio Notifications</h4>
                    <p className="text-xs text-gray-500 mt-1">Master switch for all audio alerts</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={audioEnabled}
                      onChange={(e) => handleAudioToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ff88]"></div>
                  </label>
                </div>
              </div>

              {/* Notification Types */}
              <div className={`space-y-3 ${!audioEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <h4 className="text-sm font-medium text-white">Notification Types</h4>

                <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-sm text-white">"Ready" notification</h5>
                      <p className="text-xs text-gray-500 mt-1">Play when Claude finishes and is awaiting input</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={audioReadyEnabled}
                        onChange={(e) => handleAudioReadyToggle(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ff88]"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Volume Control */}
              <div className={`space-y-3 ${!audioEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <h4 className="text-sm font-medium text-white">Volume</h4>
                <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={audioVolume}
                      onChange={(e) => handleAudioVolumeChange(parseFloat(e.target.value))}
                      className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
                    />
                    <span className="text-sm text-gray-400 w-12 text-right">{Math.round(audioVolume * 100)}%</span>
                  </div>
                </div>
              </div>

              {/* Test Button */}
              <div className={`${!audioEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <button
                  onClick={handleAudioTest}
                  disabled={audioTestPlaying}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Volume2 className="h-4 w-4" />
                  {audioTestPlaying ? 'Playing...' : 'Test Sound'}
                </button>
              </div>

              {/* Info */}
              <div className="text-xs text-gray-500 mt-4 p-3 bg-gray-900/50 rounded-lg">
                <p><strong>Note:</strong> Audio uses edge-tts neural voices. First playback may have a brief delay while the audio is generated - subsequent plays are instant (cached).</p>
              </div>
            </>
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
