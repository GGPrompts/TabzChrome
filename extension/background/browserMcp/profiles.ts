/**
 * Browser MCP - Profile and settings handlers
 * Get terminal profiles and extension settings
 * CRUD operations for profile management via API
 */

import { sendToWebSocket } from '../websocket'
import type { Profile } from '../../components/settings/types'

/**
 * Generate a unique profile ID
 */
function generateProfileId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const timestamp = Date.now().toString(36)
  return `${slug}-${timestamp}`
}

/**
 * Get all profiles from Chrome storage
 * Allows Claude to see available terminal profiles for spawning
 * Optional: categories filter to only return profiles in specified categories
 */
export async function handleBrowserGetProfiles(message: {
  requestId: string
  categories?: string[]
}): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['profiles', 'defaultProfile', 'globalWorkingDir'])
    // Return full profile data - don't strip fields
    let profiles = (result.profiles || []) as Array<Record<string, unknown>>
    const defaultProfileId = result.defaultProfile as string | undefined
    const globalWorkingDir = (result.globalWorkingDir as string) || '~'

    // Track total before filtering
    const total = profiles.length

    // Filter by category if specified
    if (message.categories && message.categories.length > 0) {
      const categorySet = new Set(message.categories.map(c => c.toLowerCase()))
      profiles = profiles.filter(p => {
        const profileCategory = (p.category as string)?.toLowerCase()
        return profileCategory && categorySet.has(profileCategory)
      })
    }

    sendToWebSocket({
      type: 'browser-profiles-result',
      requestId: message.requestId,
      success: true,
      profiles,  // Pass through all profile fields
      total,  // Total profiles in system (before filter)
      filtered: profiles.length,  // Profiles returned after filter
      defaultProfileId,
      globalWorkingDir
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-profiles-result',
      requestId: message.requestId,
      success: false,
      profiles: [],
      error: (err as Error).message
    })
  }
}

/**
 * Get all unique category names from profiles
 * Returns sorted list of categories for use in filtering
 */
export async function handleBrowserGetCategories(message: { requestId: string }): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['profiles'])
    const profiles = (result.profiles || []) as Array<{ category?: string }>

    // Extract unique categories (case-preserving, but dedupe case-insensitively)
    const categoryMap = new Map<string, string>()  // lowercase -> original
    for (const profile of profiles) {
      if (profile.category) {
        const lower = profile.category.toLowerCase()
        if (!categoryMap.has(lower)) {
          categoryMap.set(lower, profile.category)
        }
      }
    }

    // Sort alphabetically
    const categories = Array.from(categoryMap.values()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )

    sendToWebSocket({
      type: 'browser-categories-result',
      requestId: message.requestId,
      success: true,
      categories,
      total: profiles.length
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-categories-result',
      requestId: message.requestId,
      success: false,
      categories: [],
      error: (err as Error).message
    })
  }
}

/**
 * Get lightweight settings for external integrations (like GGPrompts)
 * Returns just globalWorkingDir and default profile name - no full profiles array
 */
export async function handleBrowserGetSettings(message: { requestId: string }): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['profiles', 'defaultProfile', 'globalWorkingDir'])
    const profiles = (result.profiles || []) as Array<{ id: string; name: string }>
    const defaultProfileId = result.defaultProfile as string | undefined
    const globalWorkingDir = (result.globalWorkingDir as string) || '~'

    // Find default profile name
    const defaultProfile = profiles.find(p => p.id === defaultProfileId)
    const defaultProfileName = defaultProfile?.name || 'Bash'

    sendToWebSocket({
      type: 'browser-settings-result',
      requestId: message.requestId,
      success: true,
      globalWorkingDir,
      defaultProfileName
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-settings-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Create a new profile
 * Required: name
 * Optional: workingDir, command, fontSize, fontFamily, themeName, category, etc.
 */
export async function handleBrowserCreateProfile(message: {
  requestId: string
  profile: Partial<Profile> & { name: string }
}): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['profiles'])
    const profiles = (result.profiles || []) as Profile[]

    // Generate ID if not provided
    const id = message.profile.id || generateProfileId(message.profile.name)

    // Check for duplicate ID
    if (profiles.some(p => p.id === id)) {
      sendToWebSocket({
        type: 'browser-create-profile-result',
        requestId: message.requestId,
        success: false,
        error: `Profile with ID "${id}" already exists`
      })
      return
    }

    // Create profile with defaults
    const newProfile: Profile = {
      id,
      name: message.profile.name,
      workingDir: message.profile.workingDir || '',
      command: message.profile.command,
      fontSize: message.profile.fontSize ?? 16,
      fontFamily: message.profile.fontFamily ?? 'monospace',
      themeName: message.profile.themeName ?? 'high-contrast',
      backgroundGradient: message.profile.backgroundGradient,
      panelColor: message.profile.panelColor,
      transparency: message.profile.transparency,
      backgroundMedia: message.profile.backgroundMedia,
      backgroundMediaType: message.profile.backgroundMediaType,
      backgroundMediaOpacity: message.profile.backgroundMediaOpacity,
      audioOverrides: message.profile.audioOverrides,
      category: message.profile.category,
      reference: message.profile.reference,
      pinnedToNewTab: message.profile.pinnedToNewTab,
      useDefaultTheme: message.profile.useDefaultTheme,
    }

    profiles.push(newProfile)
    await chrome.storage.local.set({ profiles })

    sendToWebSocket({
      type: 'browser-create-profile-result',
      requestId: message.requestId,
      success: true,
      profile: newProfile
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-create-profile-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Update an existing profile
 * Required: id
 * All other fields are optional and will be merged with existing profile
 */
export async function handleBrowserUpdateProfile(message: {
  requestId: string
  id: string
  updates: Partial<Profile>
}): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['profiles'])
    const profiles = (result.profiles || []) as Profile[]

    const index = profiles.findIndex(p => p.id === message.id)
    if (index === -1) {
      sendToWebSocket({
        type: 'browser-update-profile-result',
        requestId: message.requestId,
        success: false,
        error: `Profile with ID "${message.id}" not found`
      })
      return
    }

    // Merge updates with existing profile (don't allow changing ID)
    const updatedProfile: Profile = {
      ...profiles[index],
      ...message.updates,
      id: message.id  // Preserve original ID
    }

    profiles[index] = updatedProfile
    await chrome.storage.local.set({ profiles })

    sendToWebSocket({
      type: 'browser-update-profile-result',
      requestId: message.requestId,
      success: true,
      profile: updatedProfile
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-update-profile-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Delete a profile by ID
 */
export async function handleBrowserDeleteProfile(message: {
  requestId: string
  id: string
}): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['profiles', 'defaultProfile'])
    const profiles = (result.profiles || []) as Profile[]
    const defaultProfileId = result.defaultProfile as string | undefined

    const index = profiles.findIndex(p => p.id === message.id)
    if (index === -1) {
      sendToWebSocket({
        type: 'browser-delete-profile-result',
        requestId: message.requestId,
        success: false,
        error: `Profile with ID "${message.id}" not found`
      })
      return
    }

    // Don't allow deleting the last profile
    if (profiles.length === 1) {
      sendToWebSocket({
        type: 'browser-delete-profile-result',
        requestId: message.requestId,
        success: false,
        error: 'Cannot delete the last profile'
      })
      return
    }

    const deletedProfile = profiles[index]
    profiles.splice(index, 1)

    // If we deleted the default profile, set a new default
    const updates: { profiles: Profile[]; defaultProfile?: string } = { profiles }
    if (defaultProfileId === message.id) {
      updates.defaultProfile = profiles[0].id
    }

    await chrome.storage.local.set(updates)

    sendToWebSocket({
      type: 'browser-delete-profile-result',
      requestId: message.requestId,
      success: true,
      deletedProfile
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-delete-profile-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Bulk import profiles from JSON
 * Options:
 * - merge (default): Add new profiles, skip duplicates
 * - replace: Replace all existing profiles with imported ones
 */
export async function handleBrowserImportProfiles(message: {
  requestId: string
  profiles: Array<Partial<Profile> & { name: string }>
  mode?: 'merge' | 'replace'
}): Promise<void> {
  try {
    const mode = message.mode || 'merge'
    const result = await chrome.storage.local.get(['profiles'])
    let existingProfiles = (result.profiles || []) as Profile[]

    const importedProfiles: Profile[] = []
    const skipped: string[] = []

    for (const profileData of message.profiles) {
      // Generate ID if not provided
      const id = profileData.id || generateProfileId(profileData.name)

      // Check for duplicates in merge mode
      if (mode === 'merge' && existingProfiles.some(p => p.id === id)) {
        skipped.push(id)
        continue
      }

      const newProfile: Profile = {
        id,
        name: profileData.name,
        workingDir: profileData.workingDir || '',
        command: profileData.command,
        fontSize: profileData.fontSize ?? 16,
        fontFamily: profileData.fontFamily ?? 'monospace',
        themeName: profileData.themeName ?? 'high-contrast',
        backgroundGradient: profileData.backgroundGradient,
        panelColor: profileData.panelColor,
        transparency: profileData.transparency,
        backgroundMedia: profileData.backgroundMedia,
        backgroundMediaType: profileData.backgroundMediaType,
        backgroundMediaOpacity: profileData.backgroundMediaOpacity,
        audioOverrides: profileData.audioOverrides,
        category: profileData.category,
        reference: profileData.reference,
        pinnedToNewTab: profileData.pinnedToNewTab,
        useDefaultTheme: profileData.useDefaultTheme,
      }

      importedProfiles.push(newProfile)
    }

    // Apply changes based on mode
    if (mode === 'replace') {
      existingProfiles = importedProfiles
    } else {
      existingProfiles = [...existingProfiles, ...importedProfiles]
    }

    await chrome.storage.local.set({ profiles: existingProfiles })

    sendToWebSocket({
      type: 'browser-import-profiles-result',
      requestId: message.requestId,
      success: true,
      imported: importedProfiles.length,
      skipped: skipped.length,
      skippedIds: skipped,
      total: existingProfiles.length
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-import-profiles-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
