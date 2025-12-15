import { useEffect, useState, useCallback, useRef } from 'react'
import type { Profile, AudioMode, CategorySettings } from '../components/SettingsModal'

export { DEFAULT_CATEGORY_COLOR } from '../components/SettingsModal'

// Re-export types that consumers need
export type { Profile, CategorySettings }

interface TerminalSession {
  id: string
  name: string
  profile?: Profile
}

export interface UseProfilesReturn {
  profiles: Profile[]
  setProfiles: React.Dispatch<React.SetStateAction<Profile[]>>
  defaultProfileId: string
  setDefaultProfileId: (id: string) => void
  dropdownCollapsedCategories: Set<string>
  toggleDropdownCategory: (category: string) => void
  getGroupedProfilesForDropdown: () => { category: string; profiles: Profile[] }[]
  getCategoryColor: (category: string) => string
  getSessionCategoryColor: (session: TerminalSession, categorySettings: CategorySettings) => string | null
  categorySettings: CategorySettings
  setCategorySettings: React.Dispatch<React.SetStateAction<CategorySettings>>
}

interface UseProfilesParams {
  // No longer needs categorySettings - it's managed internally
}

const DEFAULT_CATEGORY_COLOR = '#6b7280'  // Gray for uncategorized

/**
 * Hook to manage terminal profiles
 * - Loads profiles from Chrome storage (or profiles.json on first run)
 * - Handles profile migration for old formats
 * - Provides helpers for category grouping and colors
 * - Manages categorySettings (category colors and order)
 */
export function useProfiles(_params: UseProfilesParams): UseProfilesReturn {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [defaultProfileId, setDefaultProfileId] = useState<string>('default')
  const [dropdownCollapsedCategories, setDropdownCollapsedCategories] = useState<Set<string>>(new Set())
  const [categorySettings, setCategorySettings] = useState<CategorySettings>({})

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true)

  // Load profiles and categorySettings from Chrome storage (or initialize from profiles.json if not present)
  useEffect(() => {
    isMountedRef.current = true

    chrome.storage.local.get(['profiles', 'defaultProfile', 'categorySettings'], async (result) => {
      // Load categorySettings
      if (result.categorySettings && typeof result.categorySettings === 'object') {
        setCategorySettings(result.categorySettings as CategorySettings)
      }
      if (!isMountedRef.current) return

      if (result.profiles && Array.isArray(result.profiles) && result.profiles.length > 0) {
        // Migrate old profiles: ensure all required fields have defaults
        // Also migrate old 'theme' field to new 'themeName' field
        // Also migrate old audioOverrides format (enabled: boolean) to new format (mode: AudioMode)
        const migratedProfiles = (result.profiles as any[]).map(p => {
          // Convert old theme field to themeName
          let themeName = p.themeName
          if (!themeName && p.theme) {
            themeName = 'high-contrast' // Map old dark/light to high-contrast
          }

          // Migrate audioOverrides: convert enabled:false to mode:'disabled'
          let audioOverrides = p.audioOverrides
          if (audioOverrides) {
            const { enabled, events, ...rest } = audioOverrides
            // Convert enabled: false → mode: 'disabled'
            if (enabled === false) {
              audioOverrides = { ...rest, mode: 'disabled' as AudioMode }
            } else if (events !== undefined || enabled !== undefined) {
              // Remove old fields (events, enabled)
              audioOverrides = Object.keys(rest).length > 0 ? rest : undefined
            }
          }

          return {
            ...p,
            fontSize: p.fontSize ?? 16,
            fontFamily: p.fontFamily ?? 'monospace',
            themeName: themeName ?? 'high-contrast',
            theme: undefined, // Remove old field
            audioOverrides,
          }
        })
        setProfiles(migratedProfiles)

        // Set default profile ID (with validation)
        const savedDefaultId = (result.defaultProfile as string) || 'default'
        const profileIds = migratedProfiles.map((p: Profile) => p.id)
        if (profileIds.includes(savedDefaultId)) {
          setDefaultProfileId(savedDefaultId)
        } else if (migratedProfiles.length > 0) {
          setDefaultProfileId(migratedProfiles[0].id)
        }

        // Save migrated profiles back to storage if any were updated
        const needsMigration = (result.profiles as any[]).some(
          p => p.fontSize === undefined || p.fontFamily === undefined || p.themeName === undefined || p.theme !== undefined ||
               (p.audioOverrides && (p.audioOverrides.enabled !== undefined || p.audioOverrides.events !== undefined))
        )
        if (needsMigration) {
          chrome.storage.local.set({ profiles: migratedProfiles })
        }
      } else {
        // Initialize profiles from profiles.json on first load
        try {
          const url = chrome.runtime.getURL('profiles.json')
          const response = await fetch(url)
          const data = await response.json()

          if (!isMountedRef.current) return

          setProfiles(data.profiles as Profile[])
          setDefaultProfileId(data.defaultProfile || 'default')

          // Save to storage so they persist
          chrome.storage.local.set({
            profiles: data.profiles,
            defaultProfile: data.defaultProfile || 'default'
          })
        } catch (error) {
          console.error('[useProfiles] Failed to load default profiles:', error)
        }
      }
    })

    // Listen for storage changes (when settings modal updates profiles)
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (!isMountedRef.current) return

      if (changes.profiles) {
        setProfiles((changes.profiles.newValue as Profile[]) || [])
      }
      if (changes.defaultProfile) {
        setDefaultProfileId((changes.defaultProfile.newValue as string) || 'default')
      }
      if (changes.categorySettings) {
        setCategorySettings((changes.categorySettings.newValue as CategorySettings) || {})
      }
    }

    // Listen for category settings changes from SettingsModal (via custom event)
    const handleCategorySettingsChange = (e: Event) => {
      if (!isMountedRef.current) return
      const customEvent = e as CustomEvent<CategorySettings>
      setCategorySettings(customEvent.detail)
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    window.addEventListener('categorySettingsChanged', handleCategorySettingsChange)

    return () => {
      isMountedRef.current = false
      chrome.storage.onChanged.removeListener(handleStorageChange)
      window.removeEventListener('categorySettingsChanged', handleCategorySettingsChange)
    }
  }, [])

  // Get category color for a session's profile
  const getSessionCategoryColor = useCallback((session: TerminalSession, catSettings: CategorySettings): string | null => {
    const category = session.profile?.category
    if (!category) return null
    return catSettings[category]?.color || DEFAULT_CATEGORY_COLOR
  }, [])

  // Group profiles by category for dropdown display
  const getGroupedProfilesForDropdown = useCallback((): { category: string; profiles: Profile[] }[] => {
    // Get unique categories from profiles
    const categoryMap = new Map<string, Profile[]>()

    profiles.forEach(profile => {
      const category = profile.category || ''
      if (!categoryMap.has(category)) {
        categoryMap.set(category, [])
      }
      categoryMap.get(category)!.push(profile)
    })

    // Sort categories: use order from categorySettings, then alphabetically, uncategorized last
    const sortedCategories = Array.from(categoryMap.keys()).sort((a, b) => {
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
      profiles: categoryMap.get(category)!
    }))
  }, [profiles, categorySettings])

  // Toggle category collapsed state in dropdown
  const toggleDropdownCategory = useCallback((category: string) => {
    setDropdownCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }, [])

  // Get category color from settings
  const getCategoryColor = useCallback((category: string): string => {
    return categorySettings[category]?.color || DEFAULT_CATEGORY_COLOR
  }, [categorySettings])

  return {
    profiles,
    setProfiles,
    defaultProfileId,
    setDefaultProfileId,
    dropdownCollapsedCategories,
    toggleDropdownCategory,
    getGroupedProfilesForDropdown,
    getCategoryColor,
    getSessionCategoryColor,
    categorySettings,
    setCategorySettings,
  }
}
