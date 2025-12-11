import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWorkingDirectory } from '../../../extension/hooks/useWorkingDirectory'
import { setChromeStorageData, getChromeStorageData } from '../../setup'

describe('useWorkingDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should start with default values when storage is empty', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      // Default values
      expect(result.current.globalWorkingDir).toBe('~')
      expect(result.current.recentDirs).toEqual(['~', '~/projects'])
    })

    it('should load global working directory from Chrome storage', async () => {
      setChromeStorageData({
        globalWorkingDir: '~/my-project',
        recentDirs: ['~/my-project', '~/other', '~'],
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.globalWorkingDir).toBe('~/my-project')
      })

      expect(result.current.recentDirs).toEqual(['~/my-project', '~/other', '~'])
    })

    it('should handle missing recentDirs in storage', async () => {
      setChromeStorageData({
        globalWorkingDir: '~/projects/tabz',
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.globalWorkingDir).toBe('~/projects/tabz')
      })

      // Should keep default recentDirs since nothing was stored
      expect(result.current.recentDirs).toEqual(['~', '~/projects'])
    })

    it('should handle missing globalWorkingDir in storage', async () => {
      setChromeStorageData({
        recentDirs: ['~/custom', '~/another'],
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.recentDirs).toEqual(['~/custom', '~/another'])
      })

      // Should keep default globalWorkingDir
      expect(result.current.globalWorkingDir).toBe('~')
    })
  })

  describe('setGlobalWorkingDir', () => {
    it('should update global working directory', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      act(() => {
        result.current.setGlobalWorkingDir('~/new-project')
      })

      expect(result.current.globalWorkingDir).toBe('~/new-project')
    })

    it('should persist global working directory to Chrome storage', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      act(() => {
        result.current.setGlobalWorkingDir('~/persisted-project')
      })

      await waitFor(() => {
        const storageData = getChromeStorageData()
        expect(storageData.globalWorkingDir).toBe('~/persisted-project')
      })
    })
  })

  describe('recentDirs management', () => {
    it('should set recent directories directly', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      const newDirs = ['~/dir1', '~/dir2', '~/dir3']
      act(() => {
        result.current.setRecentDirs(newDirs)
      })

      expect(result.current.recentDirs).toEqual(newDirs)
    })

    it('should persist recent directories to Chrome storage', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      const newDirs = ['~/stored1', '~/stored2']
      act(() => {
        result.current.setRecentDirs(newDirs)
      })

      await waitFor(() => {
        const storageData = getChromeStorageData()
        expect(storageData.recentDirs).toEqual(newDirs)
      })
    })
  })

  describe('addToRecentDirs', () => {
    it('should add new directory to the beginning of recent list', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      act(() => {
        result.current.addToRecentDirs('~/new-dir')
      })

      expect(result.current.recentDirs[0]).toBe('~/new-dir')
    })

    it('should move existing directory to the beginning', async () => {
      setChromeStorageData({
        recentDirs: ['~/first', '~/second', '~/third'],
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.recentDirs).toEqual(['~/first', '~/second', '~/third'])
      })

      // Add existing directory (should move to front)
      act(() => {
        result.current.addToRecentDirs('~/third')
      })

      expect(result.current.recentDirs).toEqual(['~/third', '~/first', '~/second'])
    })

    it('should not add empty directory', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      const initialDirs = [...result.current.recentDirs]

      act(() => {
        result.current.addToRecentDirs('')
      })

      expect(result.current.recentDirs).toEqual(initialDirs)
    })

    it('should not add home directory (~)', async () => {
      setChromeStorageData({
        recentDirs: ['~/projects'],
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.recentDirs).toEqual(['~/projects'])
      })

      act(() => {
        result.current.addToRecentDirs('~')
      })

      // Should not change
      expect(result.current.recentDirs).toEqual(['~/projects'])
    })

    it('should limit recent directories to 10', async () => {
      const initialDirs = Array.from({ length: 10 }, (_, i) => `~/dir-${i}`)
      setChromeStorageData({
        recentDirs: initialDirs,
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.recentDirs).toHaveLength(10)
      })

      // Add an 11th directory
      act(() => {
        result.current.addToRecentDirs('~/new-dir')
      })

      expect(result.current.recentDirs).toHaveLength(10)
      expect(result.current.recentDirs[0]).toBe('~/new-dir')
      // Last one should be dropped
      expect(result.current.recentDirs).not.toContain('~/dir-9')
    })

    it('should remove duplicates when adding', async () => {
      setChromeStorageData({
        recentDirs: ['~/a', '~/b', '~/c', '~/a'],  // duplicate
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.recentDirs).toEqual(['~/a', '~/b', '~/c', '~/a'])
      })

      // Adding ~/b should result in no duplicates
      act(() => {
        result.current.addToRecentDirs('~/b')
      })

      // Should be at front, with old position removed
      expect(result.current.recentDirs[0]).toBe('~/b')
      expect(result.current.recentDirs.filter(d => d === '~/b')).toHaveLength(1)
    })
  })

  describe('working directory inheritance', () => {
    // This tests the concept described in CLAUDE.md:
    // "Profiles with empty workingDir inherit from the global working directory in the header"

    it('should provide global working directory for inheritance', async () => {
      setChromeStorageData({
        globalWorkingDir: '~/projects/my-app',
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.globalWorkingDir).toBe('~/projects/my-app')
      })

      // A profile with empty workingDir would use this value
      // The inheritance logic happens in the component/spawn logic,
      // but the hook provides the globalWorkingDir for that purpose
      const profileWorkingDir = ''  // empty = inherit
      const effectiveDir = profileWorkingDir || result.current.globalWorkingDir
      expect(effectiveDir).toBe('~/projects/my-app')
    })

    it('should allow profile to override global working directory', async () => {
      setChromeStorageData({
        globalWorkingDir: '~/projects/my-app',
      })

      const { result } = renderHook(() => useWorkingDirectory())

      await waitFor(() => {
        expect(result.current.globalWorkingDir).toBe('~/projects/my-app')
      })

      // A profile with explicit workingDir ignores global
      const profileWorkingDir = '~/specific-project'
      const effectiveDir = profileWorkingDir || result.current.globalWorkingDir
      expect(effectiveDir).toBe('~/specific-project')
    })
  })

  describe('storage persistence', () => {
    it('should persist changes immediately', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      // Change both values
      act(() => {
        result.current.setGlobalWorkingDir('~/test-project')
        result.current.setRecentDirs(['~/test-project', '~/other'])
      })

      // Check storage was updated
      await waitFor(() => {
        const storageData = getChromeStorageData()
        expect(storageData.globalWorkingDir).toBe('~/test-project')
        expect(storageData.recentDirs).toEqual(['~/test-project', '~/other'])
      })
    })

    it('should handle rapid updates correctly', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      // Multiple rapid updates
      act(() => {
        result.current.setGlobalWorkingDir('~/first')
      })
      act(() => {
        result.current.setGlobalWorkingDir('~/second')
      })
      act(() => {
        result.current.setGlobalWorkingDir('~/final')
      })

      expect(result.current.globalWorkingDir).toBe('~/final')

      await waitFor(() => {
        const storageData = getChromeStorageData()
        expect(storageData.globalWorkingDir).toBe('~/final')
      })
    })
  })

  describe('path formats', () => {
    it('should accept tilde paths', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      act(() => {
        result.current.setGlobalWorkingDir('~/projects/app')
      })

      expect(result.current.globalWorkingDir).toBe('~/projects/app')
    })

    it('should accept absolute paths', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      act(() => {
        result.current.setGlobalWorkingDir('/home/user/projects')
      })

      expect(result.current.globalWorkingDir).toBe('/home/user/projects')
    })

    it('should accept paths with spaces', async () => {
      const { result } = renderHook(() => useWorkingDirectory())

      act(() => {
        result.current.setGlobalWorkingDir('~/My Projects/Important App')
      })

      expect(result.current.globalWorkingDir).toBe('~/My Projects/Important App')
    })
  })
})
