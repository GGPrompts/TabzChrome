/**
 * Unit Tests: useTerminalSpawning Hook
 *
 * Tests the terminal spawning logic focusing on:
 * - Synchronous pendingSpawns ref tracking (race condition fix - Nov 10, 2025)
 * - Commands execution vs shell spawning (critical bug fix - Nov 7, 2025)
 * - Session name generation with abbreviations
 * - Spawn options application (theme, font, transparency)
 * - Working directory handling (3-tier priority)
 * - TUI tools vs regular terminals
 * - Window assignment for multi-window support
 *
 * Architecture Note:
 * This hook extracts spawn logic from SimpleTerminalApp.tsx (Phase 4 refactoring).
 * It's critical for preventing duplicate terminals via synchronous ref updates.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTerminalSpawning } from '@/hooks/useTerminalSpawning'
import { useSimpleTerminalStore, Terminal } from '@/stores/simpleTerminalStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { MockWebSocket } from '../../mocks/MockWebSocket'
import SimpleSpawnService from '@/services/SimpleSpawnService'

/**
 * Helper: Create mock spawn option with sensible defaults
 */
function createSpawnOption(overrides: any = {}) {
  return {
    label: 'Test Terminal',
    command: 'bash',
    terminalType: 'bash',
    icon: '💻',
    description: 'Test terminal',
    workingDir: '/tmp',
    defaultTheme: 'amber',
    defaultTransparency: 100,
    defaultFontSize: 14,
    ...overrides,
  }
}

describe('useTerminalSpawning', () => {
  let mockWs: MockWebSocket
  let wsRef: React.MutableRefObject<WebSocket | null>
  let pendingSpawns: React.MutableRefObject<Map<string, Terminal>>

  beforeEach(() => {
    // Clear stores
    useSimpleTerminalStore.getState().clearAllTerminals()
    localStorage.clear()

    // Reset settings store to defaults
    useSettingsStore.getState().resetSettings()

    // Create mock WebSocket
    mockWs = new MockWebSocket('ws://localhost:8127')
    mockWs.simulateOpen()
    wsRef = { current: mockWs as any }

    // Initialize pending spawns ref
    pendingSpawns = { current: new Map() }

    // Initialize SimpleSpawnService with mock WebSocket
    SimpleSpawnService.initialize(wsRef)
  })

  afterEach(() => {
    vi.clearAllMocks()
    pendingSpawns.current.clear()
  })

  describe('Spawn Flow (Race Condition Prevention)', () => {
    it('should add terminal to pendingSpawns ref immediately (synchronous)', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption()

      // CRITICAL: pendingSpawns should be populated BEFORE handleSpawnTerminal returns
      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      // This is the key fix for race conditions (Nov 10, 2025)
      expect(pendingSpawns.current.size).toBe(1)

      const [requestId, terminal] = Array.from(pendingSpawns.current.entries())[0]
      expect(requestId).toMatch(/^spawn-\d+-[a-z0-9]+$/)
      expect(terminal.status).toBe('spawning')
      expect(terminal.requestId).toBe(requestId)
    })

    it('should create placeholder terminal with status=spawning', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({ label: 'My Terminal' })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminals = useSimpleTerminalStore.getState().terminals
      expect(terminals).toHaveLength(1)
      expect(terminals[0].name).toBe('My Terminal')
      expect(terminals[0].status).toBe('spawning')
      expect(terminals[0].requestId).toBeDefined()
    })

    it('should prevent duplicate terminals via synchronous ref tracking', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const option1 = createSpawnOption({ label: 'Terminal 1' })
      const option2 = createSpawnOption({ label: 'Terminal 2' })

      // Spawn rapidly without awaiting
      await act(async () => {
        const promise1 = result.current.handleSpawnTerminal(option1)
        const promise2 = result.current.handleSpawnTerminal(option2)
        await Promise.all([promise1, promise2])
      })

      // Should have exactly 2 terminals
      const terminals = useSimpleTerminalStore.getState().terminals
      expect(terminals).toHaveLength(2)
      expect(terminals[0].name).toBe('Terminal 1')
      expect(terminals[1].name).toBe('Terminal 2')

      // Both should be tracked in pendingSpawns
      expect(pendingSpawns.current.size).toBe(2)

      // RequestIds should be unique
      const requestIds = terminals.map(t => t.requestId!)
      expect(new Set(requestIds).size).toBe(2)
    })

    it('should store requestId on terminal for matching with backend response', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.requestId).toBeDefined()
      expect(terminal.requestId).toMatch(/^spawn-\d+-[a-z0-9]+$/)

      // RequestId should match the one in pendingSpawns
      expect(pendingSpawns.current.has(terminal.requestId!)).toBe(true)
      expect(pendingSpawns.current.get(terminal.requestId!)).toEqual(terminal)
    })
  })

  describe('Session Name Generation', () => {
    it('should generate session names with correct terminal type abbreviations', () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const testCases = [
        { terminalType: 'claude-code', expected: /^tt-cc-[a-z0-9]{3}$/ },
        { terminalType: 'bash', expected: /^tt-bash-[a-z0-9]{3}$/ },
        { terminalType: 'opencode', expected: /^tt-oc-[a-z0-9]{3}$/ },
        { terminalType: 'codex', expected: /^tt-cx-[a-z0-9]{3}$/ },
        { terminalType: 'gemini', expected: /^tt-gm-[a-z0-9]{3}$/ },
      ]

      for (const { terminalType, expected } of testCases) {
        const sessionName = result.current.generateSessionName(terminalType)
        expect(sessionName).toMatch(expected)
      }
    })

    it('should use command abbreviations when available (priority over terminal type)', () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // TFE command gets "tfe" abbrev (not "bash")
      const tfeSession = result.current.generateSessionName('bash', undefined, 'tfe')
      expect(tfeSession).toMatch(/^tt-tfe-[a-z0-9]{3}$/)

      // LazyGit gets "lg" abbrev
      const lgSession = result.current.generateSessionName('bash', undefined, 'lazygit')
      expect(lgSession).toMatch(/^tt-lg-[a-z0-9]{3}$/)

      // Micro gets "micro" abbrev
      const microSession = result.current.generateSessionName('bash', undefined, 'micro')
      expect(microSession).toMatch(/^tt-micro-[a-z0-9]{3}$/)
    })

    it('should generate unique session names for same terminal type', () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const name1 = result.current.generateSessionName('bash')
      const name2 = result.current.generateSessionName('bash')
      const name3 = result.current.generateSessionName('bash')

      // All should match pattern
      expect(name1).toMatch(/^tt-bash-[a-z0-9]{3}$/)
      expect(name2).toMatch(/^tt-bash-[a-z0-9]{3}$/)
      expect(name3).toMatch(/^tt-bash-[a-z0-9]{3}$/)

      // All should be unique (random suffix prevents collisions)
      expect(new Set([name1, name2, name3]).size).toBe(3)
    })

    it('should fallback to first 4 chars for unknown terminal types', () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const sessionName = result.current.generateSessionName('custom-type')
      expect(sessionName).toMatch(/^tt-cust-[a-z0-9]{3}$/)
    })

    it('should use session names when useTmux=true', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns) // useTmux=true
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption({ terminalType: 'claude-code' }))
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.sessionName).toMatch(/^tt-cc-[a-z0-9]{3}$/)
    })

    it('should not generate session names when useTmux=false', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', false, wsRef, pendingSpawns) // useTmux=false
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption({ terminalType: 'bash' }))
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.sessionName).toBeUndefined()
    })
  })

  describe('Command Execution (Nov 7 Critical Fix)', () => {
    it('should execute command via commands array (not just spawn shell)', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        command: 'echo "Hello World"',
        terminalType: 'bash',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const sentMessages = mockWs.getSentMessages()
      expect(sentMessages).toHaveLength(1)

      const message = JSON.parse(sentMessages[0] as string)
      // CRITICAL: Command should be in commands array for execution
      expect(message.config.commands).toEqual(['echo "Hello World"'])
      expect(message.config.startCommand).toBe('echo "Hello World"')
    })

    it('should handle TUI tools via toolName (not commands array)', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        command: 'lazygit',
        terminalType: 'tui-tool',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      // TUI tools use toolName field
      expect(message.config.toolName).toBe('lazygit')
      expect(message.config.commands).toBeUndefined()
    })

    it('should spawn shell when no command provided', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        command: undefined, // No command
        terminalType: 'bash',
      })
      delete spawnOption.command

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      // Should not have commands array when no command
      expect(message.config.commands).toBeUndefined()
      expect(message.config.toolName).toBeUndefined()
    })

    it('should handle complex commands with pipes and chains', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const complexCommand = 'cd /tmp && ls -la | grep test'
      const spawnOption = createSpawnOption({
        command: complexCommand,
        terminalType: 'bash',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      expect(message.config.commands).toEqual([complexCommand])
      expect(message.config.startCommand).toBe(complexCommand)
    })
  })

  describe('Working Directory Handling (3-Tier Priority)', () => {
    it('should use spawn option workingDir (2nd priority)', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Set global default
      useSettingsStore.getState().updateSettings({ workingDirectory: '/home/user' })

      const spawnOption = createSpawnOption({
        workingDir: '/home/custom',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.workingDir).toBe('/home/custom')

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)
      expect(message.config.workingDir).toBe('/home/custom')
    })

    it('should use spawn option workingDir even when override is provided (spawn option has priority)', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Set global default
      useSettingsStore.getState().updateSettings({ workingDirectory: '/home/user' })

      const spawnOption = createSpawnOption({
        workingDir: '/home/default',
        workingDirOverride: '/home/override',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.workingDir).toBe('/home/default')

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)
      expect(message.config.workingDir).toBe('/home/default')
    })

    it('should use workingDirOverride when spawn option has no workingDir', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Set global default
      useSettingsStore.getState().updateSettings({ workingDirectory: '/home/global' })

      const spawnOption = createSpawnOption({
        workingDirOverride: '/home/override',
      })
      delete spawnOption.workingDir // Ensure no workingDir set

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.workingDir).toBe('/home/override')

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)
      expect(message.config.workingDir).toBe('/home/override')
    })

    it('should fallback to global default when no workingDir specified', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Set global default
      useSettingsStore.getState().updateSettings({ workingDirectory: '/home/global' })

      const spawnOption = createSpawnOption()
      delete spawnOption.workingDir

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.workingDir).toBe('/home/global')
    })

    it('should use tilde ~ as final fallback', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Clear global default
      useSettingsStore.getState().updateSettings({ workingDirectory: '' })

      const spawnOption = createSpawnOption()
      delete spawnOption.workingDir

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.workingDir).toBe('~')
    })
  })

  describe('Spawn Options Application', () => {
    it('should apply theme from spawn option', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        defaultTheme: 'matrix',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.theme).toBe('matrix')

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)
      expect(message.config.theme).toBe('matrix')
    })

    it('should apply transparency from spawn option', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        defaultTransparency: 75,
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.transparency).toBe(75)

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)
      expect(message.config.transparency).toBe(75)
    })

    it('should apply font size from spawn option', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        defaultFontSize: 18,
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.fontSize).toBe(18)
    })

    it('should fallback to settings store default font size when not specified', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Set global default font size
      useSettingsStore.getState().updateSettings({ terminalDefaultFontSize: 20 })

      const spawnOption = createSpawnOption()
      delete spawnOption.defaultFontSize

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.fontSize).toBe(20)
    })

    it('should apply font family from spawn option', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        defaultFontFamily: 'Fira Code',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.fontFamily).toBe('Fira Code')
    })

    it('should apply background gradient based on theme', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        defaultTheme: 'amber',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      // THEME_BACKGROUNDS['amber'] = 'amber-warmth'
      expect(terminal.background).toBe('amber-warmth')
    })

    it('should allow custom background override', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        defaultTheme: 'amber',
        defaultBackground: 'custom-gradient',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.background).toBe('custom-gradient')
    })

    it('should apply all customizations together', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        label: 'Customized Terminal',
        defaultTheme: 'cyberpunk',
        defaultTransparency: 85,
        defaultFontSize: 16,
        defaultFontFamily: 'JetBrains Mono',
        workingDir: '/home/projects',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.name).toBe('Customized Terminal')
      expect(terminal.theme).toBe('cyberpunk')
      expect(terminal.transparency).toBe(85)
      expect(terminal.fontSize).toBe(16)
      expect(terminal.fontFamily).toBe('JetBrains Mono')
      expect(terminal.workingDir).toBe('/home/projects')
    })
  })

  describe('Window Assignment (Multi-Window Support)', () => {
    it('should assign terminal to current window', async () => {
      const windowId = 'window-test-123'
      const { result } = renderHook(() =>
        useTerminalSpawning(windowId, true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.windowId).toBe(windowId)
    })

    it('should assign to main window by default', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.windowId).toBe('main')
    })

    it('should handle multiple windows independently', async () => {
      // Window 1
      const pendingSpawns1 = { current: new Map() }
      const { result: result1 } = renderHook(() =>
        useTerminalSpawning('window-1', true, wsRef, pendingSpawns1)
      )

      // Window 2
      const pendingSpawns2 = { current: new Map() }
      const { result: result2 } = renderHook(() =>
        useTerminalSpawning('window-2', true, wsRef, pendingSpawns2)
      )

      await act(async () => {
        await result1.current.handleSpawnTerminal(createSpawnOption({ label: 'Window 1 Terminal' }))
        await result2.current.handleSpawnTerminal(createSpawnOption({ label: 'Window 2 Terminal' }))
      })

      const terminals = useSimpleTerminalStore.getState().terminals
      expect(terminals).toHaveLength(2)
      expect(terminals[0].windowId).toBe('window-1')
      expect(terminals[1].windowId).toBe('window-2')

      // Each window tracks its own pending spawns
      expect(pendingSpawns1.current.size).toBe(1)
      expect(pendingSpawns2.current.size).toBe(1)
    })
  })

  describe('WebSocket Communication', () => {
    it('should send spawn request via WebSocket with correct structure', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const spawnOption = createSpawnOption({
        command: 'tfe',
        terminalType: 'bash',
        workingDir: '/home/test',
      })

      await act(async () => {
        await result.current.handleSpawnTerminal(spawnOption)
      })

      const sentMessages = mockWs.getSentMessages()
      expect(sentMessages).toHaveLength(1)

      const message = JSON.parse(sentMessages[0] as string)
      expect(message.type).toBe('spawn')
      expect(message.requestId).toMatch(/^spawn-\d+-[a-z0-9]+$/)
      expect(message.config).toBeDefined()
      expect(message.config.terminalType).toBe('bash')
      expect(message.config.platform).toBe('local')
      expect(message.config.useTmux).toBe(true)
      expect(message.config.sessionName).toMatch(/^tt-tfe-[a-z0-9]{3}$/)
    })

    it('should include size in spawn config', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      expect(message.config.size).toEqual({ width: 800, height: 600 })
    })

    it('should set resumable=true when useTmux=true', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      expect(message.config.resumable).toBe(true)
    })

    it('should not set resumable when useTmux=false', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', false, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      expect(message.config.resumable).toBe(false)
    })
  })

  describe('Error Handling', () => {
    it('should set terminal status to error if WebSocket not connected', async () => {
      // Close WebSocket
      mockWs.close()
      wsRef.current = null

      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.status).toBe('error')
    })

    it('should handle spawn failures gracefully', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Simulate spawn returning null (failure)
      const originalSpawn = SimpleSpawnService.spawn
      SimpleSpawnService.spawn = vi.fn().mockResolvedValue(null)

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.status).toBe('error')

      // Restore
      SimpleSpawnService.spawn = originalSpawn
    })

    it('should not throw on spawn errors', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Simulate spawn throwing error
      const originalSpawn = SimpleSpawnService.spawn
      SimpleSpawnService.spawn = vi.fn().mockRejectedValue(new Error('Spawn failed'))

      // Should not throw
      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      // Terminal should still be created (error handling is graceful)
      const terminals = useSimpleTerminalStore.getState().terminals
      expect(terminals).toHaveLength(1)

      // Restore
      SimpleSpawnService.spawn = originalSpawn
    })
  })

  describe('Active Terminal Management', () => {
    it('should set spawned terminal as active', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })

      const state = useSimpleTerminalStore.getState()
      expect(state.activeTerminalId).toBe(state.terminals[0].id)
    })

    it('should change active terminal when spawning new terminal', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Spawn first terminal
      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption({ label: 'Terminal 1' }))
      })

      const firstTerminalId = useSimpleTerminalStore.getState().terminals[0].id
      expect(useSimpleTerminalStore.getState().activeTerminalId).toBe(firstTerminalId)

      // Spawn second terminal
      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption({ label: 'Terminal 2' }))
      })

      const secondTerminalId = useSimpleTerminalStore.getState().terminals[1].id
      // handleSpawnTerminal explicitly calls setActiveTerminal (line 116)
      expect(useSimpleTerminalStore.getState().activeTerminalId).toBe(secondTerminalId)
    })
  })

  describe('Terminal Metadata', () => {
    it('should store original command for reconnection', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption({ command: 'tfe' }))
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.command).toBe('tfe')
    })

    it('should store terminal type', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption({ terminalType: 'claude-code' }))
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.terminalType).toBe('claude-code')
    })

    it('should store icon', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption({ icon: '🚀' }))
      })

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.icon).toBe('🚀')
    })

    it('should store createdAt timestamp', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const beforeSpawn = Date.now()
      await act(async () => {
        await result.current.handleSpawnTerminal(createSpawnOption())
      })
      const afterSpawn = Date.now()

      const terminal = useSimpleTerminalStore.getState().terminals[0]
      expect(terminal.createdAt).toBeGreaterThanOrEqual(beforeSpawn)
      expect(terminal.createdAt).toBeLessThanOrEqual(afterSpawn)
    })
  })

  describe('Terminal Reconnection (Persistence)', () => {
    it('should reconnect to existing terminal session', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      // Create an existing terminal (simulating one that survived refresh)
      const existingTerminal: Terminal = {
        id: 'terminal-existing-123',
        name: 'Existing Terminal',
        terminalType: 'bash',
        command: 'bash',
        icon: '💻',
        sessionName: 'tt-bash-xyz',
        agentId: 'old-agent-id',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
        theme: 'matrix',
        transparency: 80,
        fontSize: 18,
        workingDir: '/home/test',
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      const spawnOption = createSpawnOption()

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, spawnOption)
      })

      // Terminal should be updated to spawning status
      const terminal = useSimpleTerminalStore.getState().terminals.find(t => t.id === existingTerminal.id)!
      expect(terminal.status).toBe('spawning')
      expect(terminal.requestId).toMatch(/^reconnect-\d+-[a-z0-9]+$/)
      expect(terminal.agentId).toBeUndefined() // Old agentId cleared

      // Should be in pendingSpawns
      expect(pendingSpawns.current.size).toBe(1)
      const [requestId] = Array.from(pendingSpawns.current.keys())
      expect(requestId).toMatch(/^reconnect-\d+-[a-z0-9]+$/)
    })

    it('should preserve terminal customizations on reconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-existing-456',
        name: 'Custom Terminal',
        terminalType: 'bash',
        command: 'tfe',
        icon: '⚡',
        sessionName: 'tt-tfe-abc',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
        theme: 'cyberpunk',
        transparency: 90,
        fontSize: 20,
        fontFamily: 'Fira Code',
        workingDir: '/home/projects',
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, createSpawnOption())
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      // Should use EXISTING terminal's customizations
      expect(message.config.theme).toBe('cyberpunk')
      expect(message.config.transparency).toBe(90)
      expect(message.config.fontSize).toBe(20)
      expect(message.config.fontFamily).toBe('Fira Code')
      expect(message.config.workingDir).toBe('/home/projects')
      expect(message.config.sessionName).toBe('tt-tfe-abc') // CRITICAL: Reuse existing session!
    })

    it('should preserve windowId on reconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('window-2', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-window-2',
        name: 'Window 2 Terminal',
        terminalType: 'bash',
        sessionName: 'tt-bash-w2',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'window-2',
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals.find(t => t.id === existingTerminal.id)!
      expect(terminal.windowId).toBe('window-2')
    })

    it('should preserve split layout on reconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-split',
        name: 'Split Terminal',
        terminalType: 'bash',
        sessionName: 'tt-bash-split',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
        splitLayout: {
          type: 'horizontal',
          panes: [
            { id: 'pane-1', terminalId: 'terminal-left', size: 50, position: 'left' },
            { id: 'pane-2', terminalId: 'terminal-right', size: 50, position: 'right' },
          ],
        },
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals.find(t => t.id === existingTerminal.id)!
      expect(terminal.splitLayout).toEqual(existingTerminal.splitLayout)
    })

    it('should preserve isHidden flag on reconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-hidden',
        name: 'Hidden Terminal',
        terminalType: 'bash',
        sessionName: 'tt-bash-hidden',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
        isHidden: true, // Part of a split
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals.find(t => t.id === existingTerminal.id)!
      expect(terminal.isHidden).toBe(true)
    })

    it('should set useTmux=true and resumable=true on reconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-reconnect',
        name: 'Reconnect Terminal',
        terminalType: 'bash',
        sessionName: 'tt-bash-reconnect',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, createSpawnOption())
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      expect(message.config.useTmux).toBe(true)
      expect(message.config.resumable).toBe(true)
    })

    it('should handle TUI tools on reconnect', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-tui',
        name: 'LazyGit',
        terminalType: 'tui-tool',
        command: 'lazygit',
        sessionName: 'tt-lg-tui',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      await act(async () => {
        await result.current.handleReconnectTerminal(
          existingTerminal,
          createSpawnOption({ command: 'lazygit', terminalType: 'tui-tool' })
        )
      })

      const sentMessages = mockWs.getSentMessages()
      const message = JSON.parse(sentMessages[0] as string)

      expect(message.config.toolName).toBe('lazygit')
      expect(message.config.commands).toBeUndefined()
    })

    it('should handle reconnect failure gracefully', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-fail',
        name: 'Fail Terminal',
        terminalType: 'bash',
        sessionName: 'tt-bash-fail',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      // Simulate spawn failure
      const originalSpawn = SimpleSpawnService.spawn
      SimpleSpawnService.spawn = vi.fn().mockResolvedValue(null)

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals.find(t => t.id === existingTerminal.id)!
      expect(terminal.status).toBe('error')

      // Restore
      SimpleSpawnService.spawn = originalSpawn
    })

    it('should handle reconnect errors gracefully', async () => {
      const { result } = renderHook(() =>
        useTerminalSpawning('main', true, wsRef, pendingSpawns)
      )

      const existingTerminal: Terminal = {
        id: 'terminal-error',
        name: 'Error Terminal',
        terminalType: 'bash',
        sessionName: 'tt-bash-error',
        createdAt: Date.now() - 10000,
        status: 'detached',
        windowId: 'main',
      }

      useSimpleTerminalStore.getState().addTerminal(existingTerminal)

      // Simulate spawn throwing error
      const originalSpawn = SimpleSpawnService.spawn
      SimpleSpawnService.spawn = vi.fn().mockRejectedValue(new Error('Reconnect failed'))

      await act(async () => {
        await result.current.handleReconnectTerminal(existingTerminal, createSpawnOption())
      })

      const terminal = useSimpleTerminalStore.getState().terminals.find(t => t.id === existingTerminal.id)!
      expect(terminal.status).toBe('error')

      // Restore
      SimpleSpawnService.spawn = originalSpawn
    })
  })
})
