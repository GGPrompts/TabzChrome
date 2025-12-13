import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useProfiles } from '../../../extension/hooks/useProfiles'
import { setChromeStorageData, getChromeStorageData } from '../../setup'
import type { Profile, CategorySettings } from '../../../extension/components/settings/types'

// Sample profiles for testing
const sampleProfiles: Profile[] = [
  {
    id: 'bash-1',
    name: 'Bash',
    workingDir: '~',
    fontSize: 16,
    fontFamily: 'monospace',
    themeName: 'high-contrast',
  },
  {
    id: 'dev-1',
    name: 'Development',
    workingDir: '~/projects',
    command: 'npm run dev',
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    themeName: 'dracula',
    category: 'Dev Tools',
  },
  {
    id: 'claude-1',
    name: 'Claude Code',
    workingDir: '',  // inherits from header
    command: 'claude',
    fontSize: 16,
    fontFamily: 'monospace',
    themeName: 'high-contrast',
    category: 'Claude Code',
  },
  {
    id: 'lazygit-1',
    name: 'LazyGit',
    workingDir: '',  // inherits from header
    command: 'lazygit',
    fontSize: 16,
    fontFamily: 'monospace',
    themeName: 'dracula',
    category: 'Dev Tools',
  },
]

const sampleCategorySettings: CategorySettings = {
  'Claude Code': { color: '#22c55e', order: 0 },
  'Dev Tools': { color: '#3b82f6', order: 1 },
}

describe('useProfiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should start with empty profiles when storage is empty', async () => {
      // Mock fetch to return default profiles.json
      vi.mocked(global.fetch).mockResolvedValueOnce({
        json: () => Promise.resolve({
          profiles: sampleProfiles.slice(0, 1),
          defaultProfile: 'bash-1',
        }),
      } as Response)

      const { result } = renderHook(() => useProfiles({}))

      // Initially empty
      expect(result.current.profiles).toEqual([])

      // Wait for profiles to load from fetch
      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(1)
      })

      expect(result.current.profiles[0].id).toBe('bash-1')
      expect(result.current.defaultProfileId).toBe('bash-1')
    })

    it('should load profiles from Chrome storage', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'dev-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      expect(result.current.profiles).toEqual(sampleProfiles)
      expect(result.current.defaultProfileId).toBe('dev-1')
    })

    it('should load category settings from Chrome storage', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
        categorySettings: sampleCategorySettings,
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.categorySettings).toEqual(sampleCategorySettings)
      })
    })

    it('should fall back to first profile if default profile not found', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'non-existent-id',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.defaultProfileId).toBe('bash-1')
      })
    })
  })

  describe('profile migration', () => {
    it('should migrate old theme field to themeName', async () => {
      const oldProfiles = [
        {
          id: 'old-1',
          name: 'Old Profile',
          workingDir: '~',
          theme: 'dark',  // old format
        },
      ]

      setChromeStorageData({
        profiles: oldProfiles,
        defaultProfile: 'old-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(1)
      })

      // Should have themeName, not theme
      expect(result.current.profiles[0].themeName).toBe('high-contrast')
      expect((result.current.profiles[0] as any).theme).toBeUndefined()
    })

    it('should add default values for missing fields', async () => {
      const minimalProfiles = [
        {
          id: 'minimal-1',
          name: 'Minimal',
          workingDir: '~',
          // Missing fontSize, fontFamily, themeName
        },
      ]

      setChromeStorageData({
        profiles: minimalProfiles,
        defaultProfile: 'minimal-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(1)
      })

      expect(result.current.profiles[0].fontSize).toBe(16)
      expect(result.current.profiles[0].fontFamily).toBe('JetBrains Mono NF')
      expect(result.current.profiles[0].themeName).toBe('high-contrast')
    })

    it('should migrate old audioOverrides format', async () => {
      const oldAudioProfiles = [
        {
          id: 'audio-1',
          name: 'Audio Profile',
          workingDir: '~',
          fontSize: 16,
          fontFamily: 'monospace',
          themeName: 'high-contrast',
          audioOverrides: {
            enabled: false,  // old format
            events: { ready: true },  // old format
          },
        },
      ]

      setChromeStorageData({
        profiles: oldAudioProfiles,
        defaultProfile: 'audio-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(1)
      })

      // Should migrate enabled: false to mode: 'disabled'
      expect(result.current.profiles[0].audioOverrides?.mode).toBe('disabled')
      // Old fields should be removed
      expect((result.current.profiles[0].audioOverrides as any)?.enabled).toBeUndefined()
      expect((result.current.profiles[0].audioOverrides as any)?.events).toBeUndefined()
    })
  })

  describe('category grouping', () => {
    it('should group profiles by category', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
        categorySettings: sampleCategorySettings,
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      const grouped = result.current.getGroupedProfilesForDropdown()

      // Should have 3 groups: Claude Code, Dev Tools, uncategorized
      expect(grouped).toHaveLength(3)

      // Claude Code should be first (order: 0)
      expect(grouped[0].category).toBe('Claude Code')
      expect(grouped[0].profiles).toHaveLength(1)

      // Dev Tools should be second (order: 1)
      expect(grouped[1].category).toBe('Dev Tools')
      expect(grouped[1].profiles).toHaveLength(2)

      // Uncategorized should be last
      expect(grouped[2].category).toBe('')
      expect(grouped[2].profiles).toHaveLength(1)
    })

    it('should sort uncategorized profiles last', async () => {
      const mixedProfiles: Profile[] = [
        { id: '1', name: 'A', workingDir: '~', fontSize: 16, fontFamily: 'monospace', themeName: 'high-contrast' },
        { id: '2', name: 'B', workingDir: '~', fontSize: 16, fontFamily: 'monospace', themeName: 'high-contrast', category: 'Tools' },
      ]

      setChromeStorageData({
        profiles: mixedProfiles,
        defaultProfile: '1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(2)
      })

      const grouped = result.current.getGroupedProfilesForDropdown()

      // Categorized first, uncategorized last
      expect(grouped[0].category).toBe('Tools')
      expect(grouped[1].category).toBe('')
    })
  })

  describe('category colors', () => {
    it('should return category color from settings', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
        categorySettings: sampleCategorySettings,
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.categorySettings).toEqual(sampleCategorySettings)
      })

      expect(result.current.getCategoryColor('Claude Code')).toBe('#22c55e')
      expect(result.current.getCategoryColor('Dev Tools')).toBe('#3b82f6')
    })

    it('should return default color for unknown category', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
        categorySettings: sampleCategorySettings,
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      // Unknown category should return default gray
      expect(result.current.getCategoryColor('Unknown')).toBe('#6b7280')
    })

    it('should get session category color', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
        categorySettings: sampleCategorySettings,
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      // Session with profile that has a category
      const sessionWithCategory = {
        id: 'session-1',
        name: 'Test',
        profile: sampleProfiles[2],  // Claude Code profile
      }
      expect(result.current.getSessionCategoryColor(sessionWithCategory, sampleCategorySettings)).toBe('#22c55e')

      // Session with profile without category
      const sessionNoCategory = {
        id: 'session-2',
        name: 'Test 2',
        profile: sampleProfiles[0],  // Bash profile (no category)
      }
      expect(result.current.getSessionCategoryColor(sessionNoCategory, sampleCategorySettings)).toBeNull()
    })
  })

  describe('dropdown category collapse', () => {
    it('should start with no collapsed categories', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      expect(result.current.dropdownCollapsedCategories.size).toBe(0)
    })

    it('should toggle category collapsed state', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      // Collapse a category
      act(() => {
        result.current.toggleDropdownCategory('Dev Tools')
      })

      expect(result.current.dropdownCollapsedCategories.has('Dev Tools')).toBe(true)

      // Toggle again to expand
      act(() => {
        result.current.toggleDropdownCategory('Dev Tools')
      })

      expect(result.current.dropdownCollapsedCategories.has('Dev Tools')).toBe(false)
    })
  })

  describe('storage change listener', () => {
    it('should update profiles when storage changes', async () => {
      setChromeStorageData({
        profiles: sampleProfiles.slice(0, 1),
        defaultProfile: 'bash-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(1)
      })

      // Simulate storage change (like from settings modal)
      act(() => {
        chrome.storage.local.set({
          profiles: sampleProfiles,
          defaultProfile: 'dev-1',
        })
      })

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
        expect(result.current.defaultProfileId).toBe('dev-1')
      })
    })

    it('should update category settings when storage changes', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
        categorySettings: {},
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      // Simulate category settings change
      act(() => {
        chrome.storage.local.set({
          categorySettings: sampleCategorySettings,
        })
      })

      await waitFor(() => {
        expect(result.current.categorySettings).toEqual(sampleCategorySettings)
      })
    })
  })

  describe('setDefaultProfileId', () => {
    it('should update default profile ID', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.defaultProfileId).toBe('bash-1')
      })

      act(() => {
        result.current.setDefaultProfileId('dev-1')
      })

      expect(result.current.defaultProfileId).toBe('dev-1')
    })
  })

  describe('custom events', () => {
    it('should respond to categorySettingsChanged event', async () => {
      setChromeStorageData({
        profiles: sampleProfiles,
        defaultProfile: 'bash-1',
      })

      const { result } = renderHook(() => useProfiles({}))

      await waitFor(() => {
        expect(result.current.profiles).toHaveLength(4)
      })

      // Dispatch custom event
      act(() => {
        window.dispatchEvent(
          new CustomEvent('categorySettingsChanged', {
            detail: sampleCategorySettings,
          })
        )
      })

      await waitFor(() => {
        expect(result.current.categorySettings).toEqual(sampleCategorySettings)
      })
    })
  })
})
