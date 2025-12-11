/**
 * Profile Working Directory Inheritance Integration Tests
 *
 * Tests the critical profile inheritance flow:
 * 1. Profile with empty workingDir inherits from global header
 * 2. Profile with explicit workingDir ignores global header
 * 3. Profile with "~" (home) workingDir also inherits from header
 *
 * This is a core UX feature enabling one "lazygit" profile to work
 * across all projects - just change the header directory.
 *
 * These tests verify STATE FLOW across hooks, not individual functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWorkingDirectory } from '../../extension/hooks/useWorkingDirectory'
import type { Profile } from '../../extension/components/settings/types'
import { resetChromeStorage, setChromeStorageData, getChromeStorageData } from '../setup'

// ============================================
// Helper: Calculate Effective Working Dir
// ============================================

/**
 * Mirrors the logic from sidepanel.tsx and useKeyboardShortcuts.ts
 * for determining the effective working directory when spawning a profile.
 *
 * Rules:
 * - If profile.workingDir is set AND not "~", use it directly
 * - Otherwise (empty string, undefined, or "~"), inherit from globalWorkingDir
 */
function calculateEffectiveWorkingDir(profile: Profile, globalWorkingDir: string): string {
  // Use profile.workingDir only if it's set AND not just "~" (which means "inherit")
  return (profile.workingDir && profile.workingDir !== '~')
    ? profile.workingDir
    : globalWorkingDir
}

// ============================================
// Test Setup
// ============================================

describe('Profile Working Directory Inheritance', () => {
  // Track messages sent via chrome.runtime.sendMessage
  let sentMessages: Array<{ type: string; [key: string]: unknown }> = []

  beforeEach(() => {
    resetChromeStorage()
    sentMessages = []

    vi.useFakeTimers()
  })

  // ============================================
  // Test: useWorkingDirectory Hook
  // ============================================

  describe('useWorkingDirectory Hook', () => {
    it('should initialize with default values', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      // Default values before storage loads
      expect(result.current.globalWorkingDir).toBe('~')
      expect(result.current.recentDirs).toEqual(['~', '~/projects'])
    })

    it('should load saved globalWorkingDir from Chrome storage', async () => {
      setChromeStorageData({
        globalWorkingDir: '/home/user/my-project',
        recentDirs: ['/home/user/my-project', '~/other'],
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      expect(result.current.globalWorkingDir).toBe('/home/user/my-project')
      expect(result.current.recentDirs).toEqual(['/home/user/my-project', '~/other'])
    })

    it('should persist globalWorkingDir to Chrome storage when changed', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Change global working dir
      act(() => {
        result.current.setGlobalWorkingDir('/home/user/new-project')
      })

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Verify it was saved to storage
      const storageData = getChromeStorageData()
      expect(storageData.globalWorkingDir).toBe('/home/user/new-project')
    })

    it('should add directories to recent list', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      act(() => {
        result.current.addToRecentDirs('/home/user/new-dir')
      })

      // New dir should be at front of list
      expect(result.current.recentDirs[0]).toBe('/home/user/new-dir')
    })
  })

  // ============================================
  // Test: Profile Inheritance Logic
  // ============================================

  describe('Profile Inheritance Logic', () => {
    const globalWorkingDir = '/home/user/current-project'

    it('should inherit from header when profile.workingDir is empty string', () => {
      const profile: Profile = {
        id: 'lazygit',
        name: 'lazygit',
        workingDir: '',  // Empty = inherit
        command: 'lazygit',
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      const effectiveDir = calculateEffectiveWorkingDir(profile, globalWorkingDir)
      expect(effectiveDir).toBe('/home/user/current-project')
    })

    it('should inherit from header when profile.workingDir is "~"', () => {
      const profile: Profile = {
        id: 'htop',
        name: 'htop',
        workingDir: '~',  // Home = also treated as inherit
        command: 'htop',
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      const effectiveDir = calculateEffectiveWorkingDir(profile, globalWorkingDir)
      expect(effectiveDir).toBe('/home/user/current-project')
    })

    it('should use explicit profile.workingDir when set', () => {
      const profile: Profile = {
        id: 'backend',
        name: 'Backend',
        workingDir: '/home/user/backend-repo',  // Explicit directory
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      const effectiveDir = calculateEffectiveWorkingDir(profile, globalWorkingDir)
      expect(effectiveDir).toBe('/home/user/backend-repo')
    })

    it('should use explicit ~/path style workingDir', () => {
      const profile: Profile = {
        id: 'fixed-project',
        name: 'Fixed Project',
        workingDir: '~/projects/always-this-one',  // Explicit but with ~
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      const effectiveDir = calculateEffectiveWorkingDir(profile, globalWorkingDir)
      expect(effectiveDir).toBe('~/projects/always-this-one')
    })

    it('should handle undefined workingDir as inherit', () => {
      const profile = {
        id: 'minimal',
        name: 'Minimal',
        // workingDir is undefined
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      } as Profile

      const effectiveDir = calculateEffectiveWorkingDir(profile, globalWorkingDir)
      expect(effectiveDir).toBe('/home/user/current-project')
    })
  })

  // ============================================
  // Test: Spawn Message Integration
  // ============================================

  describe('Spawn Message with Inheritance', () => {
    /**
     * Simulates the spawn logic from sidepanel.tsx
     * This is what happens when user clicks a profile in the dropdown
     */
    function simulateSpawnProfile(
      profile: Profile,
      globalWorkingDir: string,
      sendMessage: (msg: { type: string; [key: string]: unknown }) => void
    ): { type: string; [key: string]: unknown } {
      const effectiveWorkingDir = calculateEffectiveWorkingDir(profile, globalWorkingDir)

      const message = {
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: profile.name,
        workingDir: effectiveWorkingDir,
        command: profile.command || '',
        profile: { ...profile, workingDir: effectiveWorkingDir },
      }

      sendMessage(message)
      return message
    }

    it('should spawn terminal with inherited workingDir', () => {
      const profile: Profile = {
        id: 'lazygit',
        name: 'lazygit',
        workingDir: '',  // Inherit
        command: 'lazygit',
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      const globalDir = '/home/user/my-awesome-project'

      simulateSpawnProfile(profile, globalDir, (msg) => sentMessages.push(msg))

      expect(sentMessages).toHaveLength(1)
      expect(sentMessages[0].workingDir).toBe('/home/user/my-awesome-project')
      expect((sentMessages[0].profile as Profile).workingDir).toBe('/home/user/my-awesome-project')
    })

    it('should spawn terminal with explicit workingDir ignoring header', () => {
      const profile: Profile = {
        id: 'backend',
        name: 'Backend Dev',
        workingDir: '/home/user/fixed-backend',
        command: 'npm run dev',
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'dracula',
      }

      const globalDir = '/home/user/frontend-project'  // Different from profile

      simulateSpawnProfile(profile, globalDir, (msg) => sentMessages.push(msg))

      expect(sentMessages).toHaveLength(1)
      // Should use profile's explicit dir, NOT the global header dir
      expect(sentMessages[0].workingDir).toBe('/home/user/fixed-backend')
    })

    it('should handle multiple spawns with different header values', () => {
      const lazygitProfile: Profile = {
        id: 'lazygit',
        name: 'lazygit',
        workingDir: '',
        command: 'lazygit',
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      // First spawn with project A
      simulateSpawnProfile(lazygitProfile, '/home/user/project-a', (msg) => sentMessages.push(msg))

      // Second spawn with project B (user changed header)
      simulateSpawnProfile(lazygitProfile, '/home/user/project-b', (msg) => sentMessages.push(msg))

      expect(sentMessages).toHaveLength(2)
      expect(sentMessages[0].workingDir).toBe('/home/user/project-a')
      expect(sentMessages[1].workingDir).toBe('/home/user/project-b')
    })
  })

  // ============================================
  // Test: Edge Cases
  // ============================================

  describe('Edge Cases', () => {
    it('should handle empty global working dir by falling back to home', () => {
      const profile: Profile = {
        id: 'bash',
        name: 'Bash',
        workingDir: '',
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      // When globalWorkingDir is empty/undefined (shouldn't happen in practice)
      // but the code uses '~' as fallback
      const globalDir = '' as string

      // In real code, globalWorkingDir is initialized to '~', but test edge case
      const effectiveDir = calculateEffectiveWorkingDir(profile, globalDir || '~')
      expect(effectiveDir).toBe('~')
    })

    it('should handle profile with both command and inherited workingDir', () => {
      const profile: Profile = {
        id: 'npm-dev',
        name: 'NPM Dev',
        workingDir: '',  // Inherit - enables using this profile across projects
        command: 'npm run dev',
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'ocean',
      }

      const globalDir = '/home/user/frontend-project'
      const effectiveDir = calculateEffectiveWorkingDir(profile, globalDir)

      expect(effectiveDir).toBe('/home/user/frontend-project')
      expect(profile.command).toBe('npm run dev')
    })

    it('should preserve profile identity when spawning with inherited dir', () => {
      const profile: Profile = {
        id: 'lazygit',
        name: 'lazygit',
        workingDir: '',
        command: 'lazygit',
        fontSize: 18,
        fontFamily: 'Fira Code',
        themeName: 'dracula',
      }

      const globalDir = '/home/user/current'
      const effectiveWorkingDir = calculateEffectiveWorkingDir(profile, globalDir)

      // Create the modified profile as done in sidepanel.tsx
      const spawnedProfile = { ...profile, workingDir: effectiveWorkingDir }

      // Profile identity should be preserved
      expect(spawnedProfile.id).toBe('lazygit')
      expect(spawnedProfile.name).toBe('lazygit')
      expect(spawnedProfile.fontSize).toBe(18)
      expect(spawnedProfile.fontFamily).toBe('Fira Code')
      expect(spawnedProfile.themeName).toBe('dracula')
      expect(spawnedProfile.command).toBe('lazygit')
      // But workingDir is now the inherited value
      expect(spawnedProfile.workingDir).toBe('/home/user/current')
    })
  })

  // ============================================
  // Test: Storage Integration
  // ============================================

  describe('Storage Integration', () => {
    it('should load profiles with their original workingDir', async () => {
      const savedProfiles: Profile[] = [
        {
          id: 'inherit-profile',
          name: 'Inherit Profile',
          workingDir: '',  // Saved as empty = inherit
          fontSize: 16,
          fontFamily: 'monospace',
          themeName: 'high-contrast',
        },
        {
          id: 'fixed-profile',
          name: 'Fixed Profile',
          workingDir: '/home/user/fixed',  // Saved with explicit path
          fontSize: 16,
          fontFamily: 'monospace',
          themeName: 'high-contrast',
        },
      ]
      setChromeStorageData({
        profiles: savedProfiles,
        globalWorkingDir: '/home/user/header-dir',
      })

      // Simulate what happens when profiles are loaded
      const storageData = getChromeStorageData()
      const loadedProfiles = storageData.profiles as Profile[]
      const loadedGlobalDir = storageData.globalWorkingDir as string

      // Inherit profile should use header value
      expect(calculateEffectiveWorkingDir(loadedProfiles[0], loadedGlobalDir)).toBe('/home/user/header-dir')

      // Fixed profile should use its explicit value
      expect(calculateEffectiveWorkingDir(loadedProfiles[1], loadedGlobalDir)).toBe('/home/user/fixed')
    })

    it('should not modify saved profile when calculating effective dir', () => {
      const savedProfile: Profile = {
        id: 'test',
        name: 'Test',
        workingDir: '',  // Empty = inherit
        fontSize: 16,
        fontFamily: 'monospace',
        themeName: 'high-contrast',
      }

      // Make a copy to check mutation
      const originalWorkingDir = savedProfile.workingDir

      // Calculate effective dir (should NOT mutate original)
      calculateEffectiveWorkingDir(savedProfile, '/home/user/current')

      // Original profile should be unchanged
      expect(savedProfile.workingDir).toBe(originalWorkingDir)
      expect(savedProfile.workingDir).toBe('')
    })
  })

  // ============================================
  // Test: Recent Directories Integration
  // ============================================

  describe('Recent Directories', () => {
    it('should add effective working dir to recent list when spawning', async () => {
      setChromeStorageData({ recentDirs: ['~', '~/projects'] })

      const { result } = renderHook(() => useWorkingDirectory())

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Simulate spawning a terminal (would add to recent)
      const effectiveDir = '/home/user/new-project'
      act(() => {
        result.current.addToRecentDirs(effectiveDir)
      })

      // New dir should be at front
      expect(result.current.recentDirs[0]).toBe(effectiveDir)

      // Should be persisted
      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      const storageData = getChromeStorageData()
      expect(storageData.recentDirs).toContain(effectiveDir)
    })

    it('should not duplicate directories in recent list', async () => {
      setChromeStorageData({ recentDirs: ['/home/user/existing', '~'] })

      const { result } = renderHook(() => useWorkingDirectory())

      await act(async () => {
        vi.advanceTimersByTime(0)
      })

      // Add same directory again
      act(() => {
        result.current.addToRecentDirs('/home/user/existing')
      })

      // Should not have duplicate
      const existing = result.current.recentDirs.filter(d => d === '/home/user/existing')
      expect(existing.length).toBe(1)

      // But should be moved to front
      expect(result.current.recentDirs[0]).toBe('/home/user/existing')
    })
  })
})
