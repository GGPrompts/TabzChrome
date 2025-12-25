import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import {
  Profile,
  CategorySettings,
  AudioSettings,
  AudioEventSettings,
  PRESETS,
  DEFAULT_AUDIO_SETTINGS,
} from './types'

// Context value type
export interface SettingsContextValue {
  // Modal state
  isOpen: boolean

  // Profile state
  profiles: Profile[]
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>
  defaultProfile: string
  setDefaultProfile: React.Dispatch<React.SetStateAction<string>>
  categorySettings: CategorySettings
  setCategorySettings: React.Dispatch<React.SetStateAction<CategorySettings>>

  // MCP state
  mcpEnabledTools: string[]
  setMcpEnabledTools: React.Dispatch<React.SetStateAction<string[]>>
  mcpConfigChanged: boolean
  setMcpConfigChanged: React.Dispatch<React.SetStateAction<boolean>>
  mcpConfigSaved: boolean
  setMcpConfigSaved: React.Dispatch<React.SetStateAction<boolean>>
  mcpLoading: boolean
  allowAllUrls: boolean
  setAllowAllUrls: React.Dispatch<React.SetStateAction<boolean>>
  customDomains: string
  setCustomDomains: React.Dispatch<React.SetStateAction<string>>

  // Audio state
  audioSettings: AudioSettings
  updateAudioSettings: (updates: Partial<AudioSettings>) => void
  updateAudioEvents: (eventUpdates: Partial<AudioEventSettings>) => void

  // Import/Export
  fileInputRef: React.RefObject<HTMLInputElement>
  showImportDialog: boolean
  setShowImportDialog: React.Dispatch<React.SetStateAction<boolean>>
  pendingImportProfiles: Profile[]
  setPendingImportProfiles: React.Dispatch<React.SetStateAction<Profile[]>>
  pendingImportCategorySettings: CategorySettings | undefined
  setPendingImportCategorySettings: React.Dispatch<React.SetStateAction<CategorySettings | undefined>>
  importWarnings: string[]
  setImportWarnings: React.Dispatch<React.SetStateAction<string[]>>

  // Handlers
  handleSaveProfiles: () => void
  handleMcpSave: () => Promise<void>
  handleExportProfiles: () => void
  handleImportClick: () => void
  handleFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleImportConfirm: (mode: 'merge' | 'replace') => void
  handleImportCancel: () => void

  // Token state
  showTokenHelp: boolean
  setShowTokenHelp: React.Dispatch<React.SetStateAction<boolean>>
  tokenCopied: boolean
  handleCopyToken: () => Promise<void>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return context
}

interface SettingsProviderProps {
  isOpen: boolean
  onClose: () => void
  children: React.ReactNode
}

export function SettingsProvider({ isOpen, onClose, children }: SettingsProviderProps) {
  // Profile state
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [defaultProfile, setDefaultProfile] = useState<string>('default')
  const [categorySettings, setCategorySettings] = useState<CategorySettings>({})

  // MCP state
  const [mcpEnabledTools, setMcpEnabledTools] = useState<string[]>(PRESETS.standard)
  const [mcpConfigChanged, setMcpConfigChanged] = useState(false)
  const [mcpConfigSaved, setMcpConfigSaved] = useState(false)
  const [mcpLoading, setMcpLoading] = useState(false)
  const [allowAllUrls, setAllowAllUrls] = useState(false)
  const [customDomains, setCustomDomains] = useState('')

  // Audio state
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS)

  // Import/Export state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [pendingImportProfiles, setPendingImportProfiles] = useState<Profile[]>([])
  const [pendingImportCategorySettings, setPendingImportCategorySettings] = useState<CategorySettings | undefined>(undefined)
  const [importWarnings, setImportWarnings] = useState<string[]>([])

  // Token state
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
    if (!isOpen) return

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
        if (data.allowAllUrls !== undefined) setAllowAllUrls(data.allowAllUrls)
        if (data.customDomains) setCustomDomains(data.customDomains)
      })
      .catch(err => {
        console.warn('[Settings] Backend unavailable, using Chrome storage:', err.message)
        chrome.storage.local.get(['mcpEnabledTools', 'mcpEnabledGroups', 'allowAllUrls', 'customDomains'], (result) => {
          if (result.mcpEnabledTools && Array.isArray(result.mcpEnabledTools)) {
            setMcpEnabledTools(result.mcpEnabledTools as string[])
          } else if (result.mcpEnabledGroups) {
            setMcpEnabledTools(PRESETS.standard)
          }
          if (result.allowAllUrls !== undefined) setAllowAllUrls(result.allowAllUrls as boolean)
          if (result.customDomains) setCustomDomains(result.customDomains as string)
        })
      })
      .finally(() => setMcpLoading(false))

    // Load audio settings
    chrome.storage.local.get(['audioSettings'], (result) => {
      if (result.audioSettings) {
        setAudioSettings({ ...DEFAULT_AUDIO_SETTINGS, ...result.audioSettings })
      }
    })

    // Load category settings
    chrome.storage.local.get(['categorySettings'], (result) => {
      if (result.categorySettings) {
        setCategorySettings(result.categorySettings as CategorySettings)
      }
    })
  }, [isOpen])

  // Load profiles
  useEffect(() => {
    if (!isOpen) return

    chrome.storage.local.get(['profiles', 'defaultProfile'], async (result) => {
      if (!result.profiles || !Array.isArray(result.profiles) || result.profiles.length === 0) {
        try {
          const url = chrome.runtime.getURL('profiles.json')
          const response = await fetch(url)
          const data = await response.json()
          setProfiles(data.profiles as Profile[])
          setDefaultProfile(data.defaultProfile || 'default')
          chrome.storage.local.set({ profiles: data.profiles, defaultProfile: data.defaultProfile || 'default' })
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
              audioOverrides = { ...rest, mode: 'disabled' as const }
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
          console.log(`[Settings] defaultProfile '${savedDefault}' not found, using '${validDefault}'`)
          chrome.storage.local.set({ defaultProfile: validDefault })
        }
        setDefaultProfile(validDefault)

        const needsMigration = (result.profiles as any[]).some(
          p => p.fontSize === undefined || p.fontFamily === undefined || p.themeName === undefined || p.theme !== undefined ||
               (p.audioOverrides && (p.audioOverrides.enabled !== undefined || p.audioOverrides.events !== undefined))
        )
        if (needsMigration) {
          console.log('[Settings] Migrating old profiles')
          chrome.storage.local.set({ profiles: migratedProfiles })
        }
      }
    })
  }, [isOpen])

  // Audio handlers
  const updateAudioSettings = (updates: Partial<AudioSettings>) => {
    const newSettings = { ...audioSettings, ...updates }
    setAudioSettings(newSettings)
    chrome.storage.local.set({ audioSettings: newSettings })
  }

  const updateAudioEvents = (eventUpdates: Partial<AudioEventSettings>) => {
    updateAudioSettings({ events: { ...audioSettings.events, ...eventUpdates } })
  }

  // Profile save handler
  const handleSaveProfiles = () => {
    chrome.storage.local.set({ profiles, defaultProfile }, () => {
      console.log('[Settings] Saved:', { profiles: profiles.length, defaultProfile })
      onClose()
    })
  }

  // MCP save handler
  const handleMcpSave = async () => {
    chrome.storage.local.set({ mcpEnabledTools, allowAllUrls, customDomains }, () => {
      console.log('[Settings] MCP config saved to Chrome storage')
    })

    try {
      const response = await fetch('http://localhost:8129/api/mcp-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledTools: mcpEnabledTools, allowAllUrls, customDomains })
      })
      const data = await response.json()
      if (data.success) {
        console.log('[Settings] MCP config synced to backend')
      }
    } catch (err) {
      console.error('[Settings] Failed to sync MCP config to backend:', err)
    }

    setMcpConfigSaved(true)
    setMcpConfigChanged(false)
  }

  // Export handler
  const handleExportProfiles = () => {
    const exportData = {
      version: 2,
      exported: new Date().toISOString(),
      profiles,
      categorySettings,
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
            warnings.push(`Profile ${i + 1}: Missing required fields - skipped`)
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
            backgroundGradient: p.backgroundGradient,
            panelColor: p.panelColor,
            transparency: p.transparency,
            category: p.category,
            audioOverrides: p.audioOverrides,
            reference: p.reference,
          })
        })

        if (validProfiles.length === 0) {
          alert('No valid profiles found in file')
          return
        }

        setPendingImportProfiles(validProfiles)
        setPendingImportCategorySettings(json.categorySettings as CategorySettings | undefined)
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

    if (mode === 'replace') {
      newProfiles = pendingImportProfiles
      if (pendingImportCategorySettings) {
        newCategorySettings = pendingImportCategorySettings
      }
    } else {
      const existingIds = new Set(profiles.map(p => p.id))
      const skipped: string[] = []
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
      if (skipped.length > 0) {
        console.log(`[Settings] Import: Skipped ${skipped.length} duplicates: ${skipped.join(', ')}`)
      }
    }

    setProfiles(newProfiles)
    setCategorySettings(newCategorySettings)

    const newIds = new Set(newProfiles.map(p => p.id))
    if (!newIds.has(defaultProfile) && newProfiles.length > 0) {
      setDefaultProfile(newProfiles[0].id)
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

  // Token handler
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

  const value: SettingsContextValue = {
    isOpen,
    profiles,
    setProfiles,
    defaultProfile,
    setDefaultProfile,
    categorySettings,
    setCategorySettings,
    mcpEnabledTools,
    setMcpEnabledTools,
    mcpConfigChanged,
    setMcpConfigChanged,
    mcpConfigSaved,
    setMcpConfigSaved,
    mcpLoading,
    allowAllUrls,
    setAllowAllUrls,
    customDomains,
    setCustomDomains,
    audioSettings,
    updateAudioSettings,
    updateAudioEvents,
    fileInputRef,
    showImportDialog,
    setShowImportDialog,
    pendingImportProfiles,
    setPendingImportProfiles,
    pendingImportCategorySettings,
    setPendingImportCategorySettings,
    importWarnings,
    setImportWarnings,
    handleSaveProfiles,
    handleMcpSave,
    handleExportProfiles,
    handleImportClick,
    handleFileSelect,
    handleImportConfirm,
    handleImportCancel,
    showTokenHelp,
    setShowTokenHelp,
    tokenCopied,
    handleCopyToken,
  }

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  )
}
