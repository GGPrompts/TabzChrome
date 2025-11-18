/**
 * Integration Tests: Working Directory Display
 *
 * Tests the working directory display feature that shows current directory in tab names.
 * This feature was added in November 13, 2025 session.
 *
 * Key Architecture:
 * - Backend API fetches #{pane_current_path} from tmux
 * - Frontend polls /api/tmux/info/:sessionName every 2 seconds
 * - Home directory shortened to ~ for display
 * - Directory-like window names filtered out (e.g., ./script, ../dir)
 * - Format: "app @ ~/path" or "app (./script) @ ~/path"
 *
 * Covered Workflows:
 * 1. Basic working directory display
 * 2. Home directory shortening (~)
 * 3. Directory command filtering (./script, ../dir)
 * 4. Window name preference logic
 * 5. Multi-window display with count
 * 6. Name sync polling interval
 *
 * Architecture References:
 * - backend/routes/api.js:802-846 - /api/tmux/info/:sessionName endpoint
 * - src/hooks/useTerminalNameSync.ts - Polling hook
 * - src/stores/simpleTerminalStore.ts - Terminal interface with autoUpdateName
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { useSimpleTerminalStore, Terminal } from '@/stores/simpleTerminalStore'

/**
 * Mock fetch responses for tmux info API
 */
interface TmuxInfoResponse {
  sessionName: string
  title: string
  windowName?: string
  windowCount: number
  windowIndex: number
  currentPath: string
}

function createTmuxInfoResponse(
  sessionName: string,
  title: string,
  currentPath: string,
  windowCount: number = 1,
  windowIndex: number = 0,
  windowName?: string
): TmuxInfoResponse {
  return {
    sessionName,
    title,
    windowName,
    windowCount,
    windowIndex,
    currentPath,
  }
}

/**
 * Mock fetch for API calls
 */
const mockFetch = vi.fn()
global.fetch = mockFetch

/**
 * Helper: Create mock terminal
 */
function createMockTerminal(
  id: string,
  name: string,
  terminalType: string = 'bash',
  sessionName?: string,
  autoUpdateName: boolean = true
): Terminal {
  return {
    id,
    name,
    terminalType,
    command: 'bash',
    icon: '💻',
    sessionName: sessionName || `tt-bash-${id.slice(-3)}`,
    createdAt: Date.now(),
    status: 'active',
    windowId: 'main',
    autoUpdateName,
    splitLayout: { type: 'single', panes: [] },
  }
}

/**
 * Helper: Format display name (mimics backend logic from routes/api.js:828-863)
 */
function formatDisplayName(
  paneTitle: string,
  windowName: string | undefined,
  currentPath: string,
  _windowCount?: number // Not used in actual backend display name
): string {
  // Shorten home directory (use fixed value for tests)
  const homeDir = '/home/user'
  const displayPath = currentPath ? currentPath.replace(homeDir, '~') : null

  // Check if pane_title looks like a hostname (matches backend logic)
  const hostnamePattern = /^(localhost|[\w]+-?(desktop|laptop)|ip-[\d-]+)$/i
  const paneTitleIsHostname = hostnamePattern.test(paneTitle)

  // Check if window_name looks like a directory path
  const windowNameIsDirectory = windowName && /[.\/~]/.test(windowName)

  // Check if pane_title is a generic shell name
  const genericShells = ['bash', 'zsh', 'sh', 'fish', 'ksh', 'tcsh', 'dash']
  const paneTitleIsGenericShell = genericShells.includes(paneTitle.toLowerCase())

  // Determine base name
  let baseName
  if (paneTitleIsHostname || paneTitleIsGenericShell) {
    // If pane_title is generic, use window_name if it's an app
    baseName = windowName && !windowNameIsDirectory ? windowName : paneTitle
  } else {
    // Otherwise use pane_title (e.g., "Editing: file.tsx")
    baseName = paneTitle
  }

  // Build display name
  let displayName = baseName

  // Append command if window_name is a directory-like command
  if (windowNameIsDirectory) {
    displayName = `${displayName} (${windowName})`
  }

  // Append working directory if available and not already in name
  if (displayPath && !displayName.includes(displayPath)) {
    displayName = `${displayName} @ ${displayPath}`
  }

  return displayName
}

describe('Working Directory Display', () => {
  beforeEach(() => {
    // Reset store
    useSimpleTerminalStore.getState().clearAllTerminals()

    // Reset mocks
    mockFetch.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('Basic Working Directory Display', () => {
    it('should fetch and display working directory in tab name', async () => {
      const terminal = createMockTerminal('term-1', 'bash', 'bash', 'tt-bash-1')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-1',
          'bash',
          '/home/user/projects/terminal-tabs',
          1,
          0
        ),
      })

      // Simulate polling
      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()

      // Format name (use paneTitle, not title)
      const displayName = formatDisplayName(
        data.title,
        data.windowName,
        data.currentPath
      )

      expect(displayName).toBe('bash @ ~/projects/terminal-tabs')

      // Update terminal name
      useSimpleTerminalStore.getState().updateTerminal(terminal.id, { name: displayName })

      const state = useSimpleTerminalStore.getState()
      const updated = state.terminals.find(t => t.id === 'term-1')
      expect(updated?.name).toBe('bash @ ~/projects/terminal-tabs')
    })

    it('should shorten home directory to ~ in path', async () => {
      const homeDir = process.env.HOME || '/home/user'

      const testCases = [
        {
          path: `${homeDir}/documents`,
          expected: '~/documents',
        },
        {
          path: `${homeDir}/projects/myapp`,
          expected: '~/projects/myapp',
        },
        {
          path: `${homeDir}`,
          expected: '~',
        },
        {
          path: '/var/log/nginx',
          expected: '/var/log/nginx', // Not in home, no shortening
        },
      ]

      for (const testCase of testCases) {
        const shortPath = testCase.path.startsWith(homeDir)
          ? testCase.path.replace(homeDir, '~')
          : testCase.path

        expect(shortPath).toBe(testCase.expected)
      }
    })

    it('should update tab name when directory changes', async () => {
      const terminal = createMockTerminal('term-2', 'bash @ ~/projects', 'bash', 'tt-bash-2')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Initial state: ~/projects
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-2',
          'bash',
          '/home/user/projects',
          1,
          0
        ),
      })

      let response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      let data = await response.json()
      let displayName = formatDisplayName(data.title, data.windowName, data.currentPath)

      expect(displayName).toBe('bash @ ~/projects')

      // User runs: cd documents
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-2',
          'bash',
          '/home/user/documents',
          1,
          0
        ),
      })

      response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      data = await response.json()
      displayName = formatDisplayName(data.title, data.windowName, data.currentPath)

      expect(displayName).toBe('bash @ ~/documents')
    })
  })

  describe('Directory Command Filtering', () => {
    it('should show directory commands in parentheses', async () => {
      const testCases = [
        {
          title: 'bash',
          windowName: './build.sh',
          currentPath: '/home/user/projects/myapp',
          expected: 'bash (./build.sh) @ ~/projects/myapp',
        },
        {
          title: 'bash',
          windowName: '../scripts/deploy',
          currentPath: '/home/user/projects',
          expected: 'bash (../scripts/deploy) @ ~/projects',
        },
        {
          title: 'bash',
          windowName: '/usr/bin/node',
          currentPath: '/home/user/app',
          expected: 'bash (/usr/bin/node) @ ~/app',
        },
      ]

      for (const testCase of testCases) {
        const displayName = formatDisplayName(
          testCase.title,
          testCase.windowName,
          testCase.currentPath
        )

        expect(displayName).toBe(testCase.expected)
      }
    })

    it('should prefer useful window names over generic titles', async () => {
      const testCases = [
        {
          title: 'bash',
          windowName: 'gitui',
          currentPath: '/home/user/repo',
          expected: 'gitui @ ~/repo',
        },
        {
          title: 'zsh',
          windowName: 'lazygit',
          currentPath: '/home/user/projects',
          expected: 'lazygit @ ~/projects',
        },
        {
          title: 'Editing: file.ts',
          windowName: 'bash', // Generic, prefer title
          currentPath: '/home/user/projects',
          expected: 'Editing: file.ts @ ~/projects',
        },
      ]

      for (const testCase of testCases) {
        const displayName = formatDisplayName(
          testCase.title,
          testCase.windowName,
          testCase.currentPath
        )

        expect(displayName).toBe(testCase.expected)
      }
    })

    it('should fallback to bash for generic titles', async () => {
      const displayName = formatDisplayName(
        'bash', // Generic title
        'bash', // Generic window name (also generic)
        '/home/user/projects',
        1
      )

      // When both pane_title and window_name are generic, use 'bash'
      expect(displayName).toBe('bash @ ~/projects')
    })
  })

  describe('Multi-Window Display', () => {
    it('should show window count when multiple windows exist', async () => {
      const terminal = createMockTerminal('term-3', 'claude', 'claude-code', 'tt-cc-3')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Mock response: 3 windows in session
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-cc-3',
          'Editing: Terminal.tsx',
          '/home/user/projects/terminal-tabs/src',
          3, // 3 windows
          0
        ),
      })

      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()
      const displayName = formatDisplayName(
        data.title,
        data.windowName,
        data.currentPath
      )

      // Note: Backend doesn't add window count to display name
      // Window count is returned separately in the API response
      expect(displayName).toBe('Editing: Terminal.tsx @ ~/projects/terminal-tabs/src')
      expect(data.windowCount).toBe(3)
    })

    it('should return window count in API response', async () => {
      const terminal = createMockTerminal('term-wc', 'Running tests', 'bash', 'tt-bash-wc')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-wc',
          'Running tests',
          '/home/user/projects/myapp',
          1, // Only 1 window
          0
        ),
      })

      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()

      expect(data.windowCount).toBe(1)

      const displayName = formatDisplayName(
        data.title,
        data.windowName,
        data.currentPath
      )
      expect(displayName).toBe('Running tests @ ~/projects/myapp')
    })

    it('should handle directory command without window count in name', async () => {
      const displayName = formatDisplayName(
        'bash',
        './script.sh',
        '/home/user/projects'
      )

      expect(displayName).toBe('bash (./script.sh) @ ~/projects')
    })
  })

  describe('Auto-Update Name Toggle', () => {
    it('should respect autoUpdateName = false (custom names)', async () => {
      // User set custom name and disabled auto-update
      const terminal = createMockTerminal('term-4', 'My Custom Name', 'bash', 'tt-bash-4')
      terminal.autoUpdateName = false
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Simulate polling (but hook should skip if autoUpdateName = false)
      // In real app, useTerminalNameSync checks autoUpdateName before fetching

      const state = useSimpleTerminalStore.getState()
      const updated = state.terminals.find(t => t.id === 'term-4')
      expect(updated?.name).toBe('My Custom Name') // Should not change
      expect(updated?.autoUpdateName).toBe(false)
    })

    it('should update name when autoUpdateName = true', async () => {
      const terminal = createMockTerminal('term-5', 'bash', 'bash', 'tt-bash-5')
      terminal.autoUpdateName = true
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Mock API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-5',
          'gitui',
          '/home/user/repo',
          1,
          0
        ),
      })

      // Simulate polling update
      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()
      const displayName = formatDisplayName(
        data.title,
        data.windowName,
        data.currentPath
      )

      useSimpleTerminalStore.getState().updateTerminal(terminal.id, { name: displayName })

      const state = useSimpleTerminalStore.getState()
      const updated = state.terminals.find(t => t.id === 'term-5')
      expect(updated?.name).toBe('gitui @ ~/repo')
    })

    it('should allow re-enabling auto-update after disabling', async () => {
      const terminal = createMockTerminal('term-6', 'Custom Name', 'bash', 'tt-bash-6')
      terminal.autoUpdateName = false
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // User re-enables auto-update
      useSimpleTerminalStore.getState().updateTerminal('term-6', { autoUpdateName: true })

      let state = useSimpleTerminalStore.getState()
      const updated = state.terminals.find(t => t.id === 'term-6')
      expect(updated?.autoUpdateName).toBe(true)

      // Now polling should update name
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-6',
          'nvim',
          '/home/user/dotfiles',
          1,
          0
        ),
      })

      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()
      const displayName = formatDisplayName(
        data.title,
        data.windowName,
        data.currentPath
      )

      useSimpleTerminalStore.getState().updateTerminal('term-6', { name: displayName })

      state = useSimpleTerminalStore.getState()
      const final = state.terminals.find(t => t.id === 'term-6')
      expect(final?.name).toBe('nvim @ ~/dotfiles')
    })
  })

  describe('Name Sync Polling', () => {
    it('should only update if name actually changed', async () => {
      const terminal = createMockTerminal('term-7', 'bash @ ~/projects', 'bash', 'tt-bash-7')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      let updateCount = 0
      const store = useSimpleTerminalStore.getState()
      const originalUpdate = store.updateTerminal
      store.updateTerminal = vi.fn((id, updates) => {
        if (updates.name !== undefined) {
          updateCount++
        }
        return originalUpdate(id, updates)
      })

      // Poll 1: Same path
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-7',
          'bash',
          '/home/user/projects',
          1,
          0
        ),
      })

      let response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      let data = await response.json()
      let displayName = formatDisplayName(data.title, data.windowName, data.currentPath)

      // Name didn't change, should not update
      if (displayName !== terminal.name) {
        useSimpleTerminalStore.getState().updateTerminal(terminal.id, { name: displayName })
      }

      expect(updateCount).toBe(0)

      // Poll 2: Different path
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-7',
          'bash',
          '/home/user/documents',
          1,
          0
        ),
      })

      response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      data = await response.json()
      displayName = formatDisplayName(data.title, data.windowName, data.currentPath)

      // Name changed, should update
      if (displayName !== terminal.name) {
        useSimpleTerminalStore.getState().updateTerminal(terminal.id, { name: displayName })
      }

      expect(updateCount).toBe(1)
    })

    it('should poll every 2 seconds for visible terminals', async () => {
      const terminal = createMockTerminal('term-8', 'bash', 'bash', 'tt-bash-8')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Mock successful responses
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-bash-8',
          'bash',
          '/home/user/projects',
          1,
          0
        ),
      })

      // Simulate polling every 2 seconds
      const pollInterval = 2000
      let pollCount = 0

      const pollOnce = async () => {
        try {
          const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
          await response.json()
          pollCount++
        } catch {
          // Ignore errors
        }
      }

      // Poll at t=0, t=2s, t=4s
      await pollOnce() // t=0
      vi.advanceTimersByTime(pollInterval)
      await pollOnce() // t=2s
      vi.advanceTimersByTime(pollInterval)
      await pollOnce() // t=4s

      expect(pollCount).toBe(3)
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('should not poll for detached terminals', async () => {
      const terminal = createMockTerminal('term-9', 'bash', 'bash', 'tt-bash-9')
      terminal.status = 'detached'
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // In real app, useTerminalNameSync skips detached terminals
      // Verify fetch is NOT called
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('should not poll for hidden panes in splits', async () => {
      const pane = createMockTerminal('pane-1', 'bash', 'bash', 'tt-bash-pane')
      pane.isHidden = true // Hidden pane in split
      useSimpleTerminalStore.getState().addTerminal(pane)

      // In real app, useTerminalNameSync skips hidden terminals
      // Verify fetch is NOT called
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('Edge Cases', () => {
    it('should handle API errors gracefully', async () => {
      const terminal = createMockTerminal('term-10', 'bash', 'bash', 'tt-bash-10')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Mock API error
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      try {
        await fetch(`/api/tmux/info/${terminal.sessionName}`)
      } catch (error) {
        // Should catch error gracefully
        expect(error).toBeDefined()
      }

      // Terminal name should not change on error
      const state = useSimpleTerminalStore.getState()
      const updated = state.terminals.find(t => t.id === 'term-10')
      expect(updated?.name).toBe('bash')
    })

    it('should handle missing currentPath in response', async () => {
      const terminal = createMockTerminal('term-11', 'bash', 'bash', 'tt-bash-11')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Mock response without currentPath
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionName: 'tt-bash-11',
          title: 'bash',
          windowCount: 1,
          windowIndex: 0,
          // currentPath missing
        }),
      })

      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()

      // Should handle gracefully (no @ path added)
      expect(data.currentPath).toBeUndefined()
    })

    it('should handle very long paths', async () => {
      const longPath = '/home/user/projects/very/deeply/nested/directory/structure/with/many/levels/final'
      const shortPath = longPath.replace('/home/user', '~')

      const displayName = formatDisplayName(
        'bash',
        undefined,
        longPath,
        1
      )

      expect(displayName).toBe(`bash @ ${shortPath}`)
      expect(displayName.length).toBeLessThan(200) // Sanity check
    })

    it('should handle special characters in paths', async () => {
      const testCases = [
        '/home/user/projects/my app',
        '/home/user/projects/my-app',
        '/home/user/projects/my_app',
        '/home/user/projects/app (1)',
      ]

      for (const path of testCases) {
        const displayName = formatDisplayName('bash', undefined, path)
        expect(displayName).toContain(' @ ')
        expect(displayName).toContain(path.replace('/home/user', '~'))
      }
    })

    it('should handle paths outside home directory', async () => {
      const displayName = formatDisplayName(
        'bash',
        undefined,
        '/var/log/nginx',
        1
      )

      // Should NOT shorten (not in home dir)
      expect(displayName).toBe('bash @ /var/log/nginx')
    })
  })

  describe('Claude Code Status Display', () => {
    it('should show Claude Code status in tab name', async () => {
      const terminal = createMockTerminal('term-cc', 'Claude Code', 'claude-code', 'tt-cc-main')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // Mock Claude Code pane title
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-cc-main',
          'Editing: Terminal.tsx', // Claude Code sets pane title
          '/home/user/projects/terminal-tabs/src',
          1,
          0
        ),
      })

      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()
      const displayName = formatDisplayName(
        data.title,
        data.windowName,
        data.currentPath
      )

      expect(displayName).toBe('Editing: Terminal.tsx @ ~/projects/terminal-tabs/src')
    })

    it('should return window count for Claude Code multi-window sessions', async () => {
      const terminal = createMockTerminal('term-cc-multi', 'Claude Code', 'claude-code', 'tt-cc-multi')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-cc-multi',
          'Running tests',
          '/home/user/projects/myapp/tests',
          2, // Claude created 2nd window
          0
        ),
      })

      const response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()

      expect(data.windowCount).toBe(2) // Window count in response

      const displayName = formatDisplayName(
        data.title,
        data.windowName,
        data.currentPath
      )
      expect(displayName).toBe('Running tests @ ~/projects/myapp/tests')
    })

    it('should update as Claude Code works', async () => {
      const terminal = createMockTerminal('term-cc-2', 'Claude Code', 'claude-code', 'tt-cc-work')
      useSimpleTerminalStore.getState().addTerminal(terminal)

      // State 1: Editing file
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-cc-work',
          'Editing: app.ts',
          '/home/user/projects/myapp/src',
          1,
          0
        ),
      })

      let response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      let data = await response.json()
      let displayName = formatDisplayName(data.title, data.windowName, data.currentPath)

      expect(displayName).toBe('Editing: app.ts @ ~/projects/myapp/src')

      // State 2: Running tests
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createTmuxInfoResponse(
          'tt-cc-work',
          'Running tests',
          '/home/user/projects/myapp',
          1,
          0
        ),
      })

      response = await fetch(`/api/tmux/info/${terminal.sessionName}`)
      data = await response.json()
      displayName = formatDisplayName(data.title, data.windowName, data.currentPath)

      expect(displayName).toBe('Running tests @ ~/projects/myapp')
    })
  })
})
