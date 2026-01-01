import { useState, useEffect } from 'react'

interface Profile {
  id: string
  name: string
  icon?: string
  color?: string
  category?: string
  favorite?: boolean
  command?: string
  workingDir?: string
}

interface UseProfilesReturn {
  profiles: Profile[]
  defaultProfileId: string
  loading: boolean
}

/**
 * Hook to load terminal profiles from Chrome storage
 * Simplified version of the main useProfiles hook for the New Tab page
 */
export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [defaultProfileId, setDefaultProfileId] = useState('default')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Load from Chrome storage
    chrome.storage.local.get(['profiles', 'defaultProfile'], async (result) => {
      if (result.profiles && Array.isArray(result.profiles)) {
        setProfiles(result.profiles)
        setDefaultProfileId(result.defaultProfile || 'default')
        setLoading(false)
      } else {
        // Try loading from profiles.json (first run)
        try {
          const url = chrome.runtime.getURL('profiles.json')
          const response = await fetch(url)
          const data = await response.json()
          setProfiles(data.profiles || [])
          setDefaultProfileId(data.defaultProfile || 'default')
        } catch (e) {
          console.error('[useProfiles] Failed to load profiles:', e)
        }
        setLoading(false)
      }
    })

    // Listen for changes
    const handleChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.profiles?.newValue) {
        setProfiles(changes.profiles.newValue)
      }
      if (changes.defaultProfile?.newValue) {
        setDefaultProfileId(changes.defaultProfile.newValue)
      }
    }

    chrome.storage.local.onChanged.addListener(handleChange)
    return () => chrome.storage.local.onChanged.removeListener(handleChange)
  }, [])

  return { profiles, defaultProfileId, loading }
}
