import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardShortcuts } from '../../../extension/hooks/useKeyboardShortcuts'
import { setChromeStorageData, resetChromeStorage } from '../../setup'

// Mock sendMessage
const mockSendMessage = vi.fn()
vi.mock('../../../extension/shared/messaging', () => ({
  sendMessage: (...args: any[]) => mockSendMessage(...args),
}))

// Mock getEffectiveWorkingDir
vi.mock('../../../extension/shared/utils', () => ({
  getEffectiveWorkingDir: vi.fn((profileDir: string | undefined, globalDir: string) => {
    return profileDir || globalDir
  }),
}))

describe('useKeyboardShortcuts', () => {
  const mockSetCurrentSession = vi.fn()
  const mockSwitchToSession = vi.fn()
  const mockAddToRecentDirs = vi.fn()

  const sessions = [
    { id: 'term-1', name: 'Terminal 1' },
    { id: 'term-2', name: 'Terminal 2' },
    { id: 'term-3', name: 'Terminal 3' },
  ]

  const profiles = [
    { id: 'default', name: 'Default', command: 'bash' },
    { id: 'claude', name: 'Claude', command: 'claude' },
  ]

  const createParams = (overrides = {}) => ({
    sessionsRef: { current: sessions },
    currentSessionRef: { current: 'term-2' },
    globalWorkingDirRef: { current: '~/projects' },
    profiles,
    defaultProfileId: 'default',
    setCurrentSession: mockSetCurrentSession,
    switchToSession: mockSwitchToSession,
    addToRecentDirs: mockAddToRecentDirs,
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    resetChromeStorage()
    // Set up default profiles in Chrome storage
    setChromeStorageData({
      profiles,
      defaultProfile: 'default',
    })
  })

  describe('handleKeyboardNewTab', () => {
    it('should spawn terminal with default profile', async () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      await act(async () => {
        result.current.handleKeyboardNewTab()
        await Promise.resolve()
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: 'Default',
        workingDir: '~/projects',
        command: 'bash',
        profile: expect.objectContaining({
          id: 'default',
          name: 'Default',
        }),
      })
    })

    it('should use global working dir from ref', async () => {
      const params = createParams({
        globalWorkingDirRef: { current: '/home/user/work' },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      await act(async () => {
        result.current.handleKeyboardNewTab()
        await Promise.resolve()
      })

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDir: '/home/user/work',
        })
      )
    })

    it('should add to recent dirs', async () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      await act(async () => {
        result.current.handleKeyboardNewTab()
        await Promise.resolve()
      })

      expect(mockAddToRecentDirs).toHaveBeenCalledWith('~/projects')
    })

    it('should auto-fix invalid defaultProfile', async () => {
      setChromeStorageData({
        profiles,
        defaultProfile: 'nonexistent',
      })

      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      await act(async () => {
        result.current.handleKeyboardNewTab()
        await Promise.resolve()
      })

      // Should use first profile as fallback
      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Default',
        })
      )
    })

    it('should spawn basic bash when no profiles exist', async () => {
      setChromeStorageData({
        profiles: [],
        defaultProfile: 'default',
      })

      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      await act(async () => {
        result.current.handleKeyboardNewTab()
        await Promise.resolve()
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: 'Bash',
        workingDir: '~/projects',
      })
    })
  })

  describe('handleKeyboardCloseTab', () => {
    it('should close current session', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardCloseTab()
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'CLOSE_TERMINAL',
        terminalId: 'term-2',
      })
    })

    it('should switch to adjacent session after close', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardCloseTab()
      })

      // term-2 is index 1, should switch to term-1 (previous)
      expect(mockSetCurrentSession).toHaveBeenCalledWith('term-1')
    })

    it('should switch to next session when closing first tab', () => {
      const params = createParams({
        currentSessionRef: { current: 'term-1' },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardCloseTab()
      })

      // Closing first tab should switch to second
      expect(mockSetCurrentSession).toHaveBeenCalledWith('term-2')
    })

    it('should not close when no current session', () => {
      const params = createParams({
        currentSessionRef: { current: null },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardCloseTab()
      })

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should not close when no sessions', () => {
      const params = createParams({
        sessionsRef: { current: [] },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardCloseTab()
      })

      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('handleKeyboardNextTab', () => {
    it('should switch to next session', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardNextTab()
      })

      // Current is term-2 (index 1), next is term-3
      expect(mockSwitchToSession).toHaveBeenCalledWith('term-3')
    })

    it('should wrap around to first session', () => {
      const params = createParams({
        currentSessionRef: { current: 'term-3' },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardNextTab()
      })

      // Current is term-3 (index 2, last), next should wrap to term-1
      expect(mockSwitchToSession).toHaveBeenCalledWith('term-1')
    })

    it('should not switch when only one session', () => {
      const params = createParams({
        sessionsRef: { current: [{ id: 'term-1', name: 'Terminal 1' }] },
        currentSessionRef: { current: 'term-1' },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardNextTab()
      })

      expect(mockSwitchToSession).not.toHaveBeenCalled()
    })

    it('should not switch when no current session', () => {
      const params = createParams({
        currentSessionRef: { current: null },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardNextTab()
      })

      expect(mockSwitchToSession).not.toHaveBeenCalled()
    })
  })

  describe('handleKeyboardPrevTab', () => {
    it('should switch to previous session', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardPrevTab()
      })

      // Current is term-2 (index 1), prev is term-1
      expect(mockSwitchToSession).toHaveBeenCalledWith('term-1')
    })

    it('should wrap around to last session', () => {
      const params = createParams({
        currentSessionRef: { current: 'term-1' },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardPrevTab()
      })

      // Current is term-1 (index 0), prev should wrap to term-3
      expect(mockSwitchToSession).toHaveBeenCalledWith('term-3')
    })

    it('should not switch when only one session', () => {
      const params = createParams({
        sessionsRef: { current: [{ id: 'term-1', name: 'Terminal 1' }] },
        currentSessionRef: { current: 'term-1' },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      act(() => {
        result.current.handleKeyboardPrevTab()
      })

      expect(mockSwitchToSession).not.toHaveBeenCalled()
    })
  })

  describe('handleKeyboardSwitchTab', () => {
    it('should switch to tab by index', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardSwitchTab(0)
      })

      expect(mockSwitchToSession).toHaveBeenCalledWith('term-1')
    })

    it('should switch to second tab', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardSwitchTab(1)
      })

      expect(mockSwitchToSession).toHaveBeenCalledWith('term-2')
    })

    it('should switch to third tab', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardSwitchTab(2)
      })

      expect(mockSwitchToSession).toHaveBeenCalledWith('term-3')
    })

    it('should not switch when index out of bounds', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardSwitchTab(5)
      })

      expect(mockSwitchToSession).not.toHaveBeenCalled()
    })

    it('should not switch when negative index', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      act(() => {
        result.current.handleKeyboardSwitchTab(-1)
      })

      expect(mockSwitchToSession).not.toHaveBeenCalled()
    })
  })

  describe('handleOmniboxSpawnProfile', () => {
    it('should spawn terminal with specified profile', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      const profile = { id: 'claude', name: 'Claude', command: 'claude', workingDir: '~/code' }

      act(() => {
        result.current.handleOmniboxSpawnProfile(profile as any)
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: 'Claude',
        workingDir: '~/code',
        command: 'claude',
        profile: expect.objectContaining({
          id: 'claude',
          name: 'Claude',
          workingDir: '~/code',
        }),
      })
    })

    it('should use global working dir when profile has no workingDir', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      const profile = { id: 'basic', name: 'Basic' }

      act(() => {
        result.current.handleOmniboxSpawnProfile(profile as any)
      })

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDir: '~/projects',
        })
      )
    })

    it('should add to recent dirs', () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      const profile = { id: 'claude', name: 'Claude', workingDir: '~/work' }

      act(() => {
        result.current.handleOmniboxSpawnProfile(profile as any)
      })

      expect(mockAddToRecentDirs).toHaveBeenCalledWith('~/work')
    })
  })

  describe('handleOmniboxRunCommand', () => {
    it('should spawn terminal with command', async () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      await act(async () => {
        result.current.handleOmniboxRunCommand('git status')
        await Promise.resolve()
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: 'git',
        command: 'git status',
        workingDir: '~/projects',
        profile: expect.objectContaining({
          id: 'default',
        }),
      })
    })

    it('should use first word as tab name', async () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      await act(async () => {
        result.current.handleOmniboxRunCommand('npm install package')
        await Promise.resolve()
      })

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'npm',
          command: 'npm install package',
        })
      )
    })

    it('should use global working dir', async () => {
      const params = createParams({
        globalWorkingDirRef: { current: '/var/www' },
      })

      const { result } = renderHook(() => useKeyboardShortcuts(params))

      await act(async () => {
        result.current.handleOmniboxRunCommand('ls -la')
        await Promise.resolve()
      })

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          workingDir: '/var/www',
        })
      )
    })

    it('should add to recent dirs', async () => {
      const { result } = renderHook(() => useKeyboardShortcuts(createParams()))

      await act(async () => {
        result.current.handleOmniboxRunCommand('echo hello')
        await Promise.resolve()
      })

      expect(mockAddToRecentDirs).toHaveBeenCalledWith('~/projects')
    })
  })

  describe('refs behavior', () => {
    it('should use current ref values when handlers are called', () => {
      const sessionsRef = { current: sessions }
      const currentSessionRef = { current: 'term-2' as string | null }

      const { result } = renderHook(() =>
        useKeyboardShortcuts(createParams({
          sessionsRef,
          currentSessionRef,
        }))
      )

      // Update refs directly
      currentSessionRef.current = 'term-3'

      act(() => {
        result.current.handleKeyboardNextTab()
      })

      // Should use the updated ref value (term-3 -> wraps to term-1)
      expect(mockSwitchToSession).toHaveBeenCalledWith('term-1')
    })
  })
})
