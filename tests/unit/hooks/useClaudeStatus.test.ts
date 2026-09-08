import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import {
  useClaudeStatus,
  getRobotEmojis,
  getToolEmoji,
  getStatusEmoji,
  getStatusText,
  getFullStatusText,
  getContextColor,
  getStatusColor,
  type ClaudeStatus,
} from '../../../extension/hooks/useClaudeStatus'

// Mock fetch for API calls
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('useClaudeStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('never polls protected editors, including recovered protected session names', async () => {
      const { result } = renderHook(() => useClaudeStatus([
        { id: 'flagged', secret: true, workingDir: '/synthetic', profileCommand: 'claude' },
        { id: 'ctt-secret-fixture', workingDir: '/synthetic', profileCommand: 'claude' },
        { id: 'recovered', sessionName: 'ctt-secret-recovered', workingDir: '/synthetic', profileCommand: 'claude' },
      ]))
      await act(async () => { vi.advanceTimersByTime(5000) })
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.current.statuses.size).toBe(0)
    })

    it('does not overlap reads or restore removed terminals from a late response', async () => {
      let finish!: (value: unknown) => void
      mockFetch.mockImplementation(() => new Promise(resolve => { finish = resolve }))
      const initial = [{ id: 'fixture', workingDir: '/synthetic', profileCommand: 'claude' }]
      const { result, rerender } = renderHook(({ terminals }) => useClaudeStatus(terminals), {
        initialProps: { terminals: initial },
      })
      await act(async () => { vi.advanceTimersByTime(1000) })
      expect(mockFetch).toHaveBeenCalledTimes(1)
      rerender({ terminals: [] })
      await act(async () => {
        finish({ ok: true, json: async () => ({ success: true, status: 'tool_use', current_tool: 'Read' }) })
      })
      expect(result.current.statuses.size).toBe(0)
      expect(result.current.history.size).toBe(0)
    })

    it('requires a Claude foreground pane for status from a plain shell profile', async () => {
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({
        success: true, status: 'tool_use', current_tool: 'Read', pane_command: 'bash',
      }) })
      const { result } = renderHook(() => useClaudeStatus([
        { id: 'fixture', sessionName: 'ctt-fixture', workingDir: '/synthetic', profileCommand: 'bash' },
      ]))
      await act(async () => {})
      expect(result.current.statuses.size).toBe(0)
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({
        success: true, status: 'tool_use', current_tool: 'Read', pane_command: 'claude',
      }) })
      await act(async () => { vi.advanceTimersByTime(1000) })
      expect(result.current.statuses.get('fixture')?.tmuxPane).toBeUndefined()
      expect(result.current.statuses.get('fixture')?.current_tool).toBe('Read')
      expect(mockFetch.mock.calls[0][0]).toContain('sessionName=ctt-fixture')
    })

    it('should start with empty statuses and history maps', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, status: 'unknown' }),
      })

      const { result } = renderHook(() =>
        useClaudeStatus([])
      )

      expect(result.current.statuses.size).toBe(0)
      expect(result.current.history.size).toBe(0)
    })

    it('should not poll terminals without workingDir', async () => {
      const terminals = [
        { id: 'term-1', sessionName: 'test', profileCommand: 'claude' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // Should not make any fetch calls since no workingDir
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.current.statuses.size).toBe(0)
    })

    it('should not poll non-Claude terminals', async () => {
      const terminals = [
        { id: 'term-1', workingDir: '/home/test', profileCommand: 'bash' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        vi.advanceTimersByTime(1000)
      })

      // Should not make fetch calls for non-claude terminals
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.current.statuses.size).toBe(0)
    })
  })

  describe('status fetching', () => {
    it('should fetch status for Claude terminals with workingDir', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'processing',
            current_tool: 'Read',
            last_updated: new Date().toISOString(),
          }),
      })

      const terminals = [
        {
          id: 'ctt-claude-123',
          workingDir: '/home/test/project',
          profileCommand: 'claude',
          sessionName: 'test-session',
        },
      ]

      renderHook(() => useClaudeStatus(terminals))

      // Initial check happens immediately
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/claude-status?dir='),
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })

    it('should update statuses on successful fetch', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'tool_use',
            current_tool: 'Edit',
            last_updated: new Date().toISOString(),
            tmuxPane: '%42',
            subagent_count: 2,
            context_window: { context_pct: 35 },
            details: { args: { file_path: '/test/file.ts' } },
          }),
      })

      const terminals = [
        {
          id: 'ctt-claude-123',
          workingDir: '/home/test',
          profileCommand: 'claude',
        },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      // Advance timer to trigger initial fetch and allow promises to resolve
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await Promise.resolve() // flush microtasks
      })

      // Check that fetch was called and status was updated
      expect(mockFetch).toHaveBeenCalled()
      expect(result.current.statuses.size).toBe(1)

      const status = result.current.statuses.get('ctt-claude-123')
      expect(status).toBeDefined()
      expect(status?.status).toBe('tool_use')
      expect(status?.current_tool).toBe('Edit')
      expect(status?.tmuxPane).toBe('%42')
      expect(status?.subagent_count).toBe(2)
      expect(status?.context_pct).toBe(35)
    })

    it('should poll every 1 second', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, status: 'idle' }),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })
      expect(mockFetch).toHaveBeenCalledTimes(1)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(mockFetch).toHaveBeenCalledTimes(2)

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })
      expect(mockFetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('miss counter logic', () => {
    it('should maintain status during brief unknown periods', async () => {
      // First call returns valid status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'processing',
            current_tool: 'Read',
          }),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.statuses.get('term-1')?.status).toBe('processing')

      // Next call returns unknown - should maintain previous status
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, status: 'unknown' }),
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      // Status should be maintained (miss count = 1, threshold = 3)
      expect(result.current.statuses.get('term-1')?.status).toBe('processing')
    })

    it('should remove status after exceeding miss threshold', async () => {
      // First call returns valid status with context_pct
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'processing',
            context_window: { context_pct: 50 },
          }),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // Return unknown 3 times (miss threshold)
      for (let i = 0; i < 3; i++) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: true, status: 'unknown' }),
        })

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000)
        })
      }

      // After threshold, status should transition to idle preserving context_pct
      const status = result.current.statuses.get('term-1')
      expect(status?.status).toBe('idle')
      expect(status?.context_pct).toBe(50)
    })
  })

  describe('history tracking', () => {
    it('should add new entries to history for status changes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'tool_use',
            current_tool: 'Read',
            details: { args: { file_path: '/test/file.ts' } },
          }),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      // Advance timer to trigger fetch and flush promises
      await act(async () => {
        vi.advanceTimersByTime(1000)
        await Promise.resolve()
      })

      expect(mockFetch).toHaveBeenCalled()
      const history = result.current.history.get('term-1')
      expect(history?.length).toBeGreaterThan(0)
      expect(history?.[0].text).toContain('Read')
      expect(history?.[0].text).toContain('file.ts')
    })

    it('should not add duplicate history entries', async () => {
      // Same status twice
      const statusResponse = {
        success: true,
        status: 'tool_use',
        current_tool: 'Read',
        details: { args: { file_path: '/test/file.ts' } },
      }

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(statusResponse),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000)
      })

      // Should only have one entry since status didn't change
      expect(result.current.history.get('term-1')?.length).toBe(1)
    })

    it('should skip idle/awaiting_input from history', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'idle',
          }),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // History should be empty for idle status
      expect(result.current.history.get('term-1')).toBeUndefined()
    })

    it('should skip internal Claude files from history', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            status: 'tool_use',
            current_tool: 'Read',
            details: { args: { file_path: '/home/user/.claude/session-memory/test.json' } },
          }),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      const { result } = renderHook(() => useClaudeStatus(terminals))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      // History should be empty for internal Claude files
      expect(result.current.history.get('term-1')).toBeUndefined()
    })
  })

  describe('terminal cleanup', () => {
    it('should clean up miss counts for removed terminals', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ success: true, status: 'processing' }),
      })

      const terminals = [
        { id: 'term-1', workingDir: '/test', profileCommand: 'claude' },
      ]

      const { result, rerender } = renderHook(
        ({ terminals }) => useClaudeStatus(terminals),
        { initialProps: { terminals } }
      )

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.statuses.has('term-1')).toBe(true)

      // Remove terminal
      rerender({ terminals: [] })

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0)
      })

      expect(result.current.statuses.size).toBe(0)
    })
  })
})

describe('getRobotEmojis', () => {
  it('should return empty string for undefined status', () => {
    expect(getRobotEmojis(undefined)).toBe('')
  })

  it('should return one robot for 0 subagents', () => {
    const status: ClaudeStatus = { status: 'idle', subagent_count: 0 }
    expect(getRobotEmojis(status)).toBe('🤖')
  })

  it('should return two robots for 1 subagent', () => {
    const status: ClaudeStatus = { status: 'processing', subagent_count: 1 }
    expect(getRobotEmojis(status)).toBe('🤖🤖')
  })

  it('should return three robots for 2 subagents', () => {
    const status: ClaudeStatus = { status: 'processing', subagent_count: 2 }
    expect(getRobotEmojis(status)).toBe('🤖🤖🤖')
  })

  it('should handle missing subagent_count as 0', () => {
    const status: ClaudeStatus = { status: 'idle' }
    expect(getRobotEmojis(status)).toBe('🤖')
  })
})

describe('getToolEmoji', () => {
  it('should return correct emoji for each tool', () => {
    expect(getToolEmoji('Read')).toBe('📖')
    expect(getToolEmoji('Write')).toBe('📝')
    expect(getToolEmoji('Edit')).toBe('✏️')
    expect(getToolEmoji('Bash')).toBe('🔺')
    expect(getToolEmoji('Glob')).toBe('🔍')
    expect(getToolEmoji('Grep')).toBe('🔎')
    expect(getToolEmoji('Task')).toBe('🤖')
    expect(getToolEmoji('WebFetch')).toBe('🌐')
    expect(getToolEmoji('WebSearch')).toBe('🔍')
    expect(getToolEmoji('TodoWrite')).toBe('📋')
    expect(getToolEmoji('NotebookEdit')).toBe('📓')
    expect(getToolEmoji('AskUserQuestion')).toBe('❓')
  })

  it('should return default emoji for unknown tools', () => {
    expect(getToolEmoji('UnknownTool')).toBe('🔧')
    expect(getToolEmoji('CustomTool')).toBe('🔧')
  })

  it('should return default emoji for undefined', () => {
    expect(getToolEmoji(undefined)).toBe('🔧')
  })
})

describe('getStatusEmoji', () => {
  it('should return empty string for undefined status', () => {
    expect(getStatusEmoji(undefined)).toBe('')
  })

  it('should return checkmark for idle status', () => {
    expect(getStatusEmoji({ status: 'idle' })).toBe('✓')
  })

  it('should return checkmark for awaiting_input status', () => {
    expect(getStatusEmoji({ status: 'awaiting_input' })).toBe('✓')
  })

  it('should return tool emoji when processing with current_tool', () => {
    expect(getStatusEmoji({ status: 'processing', current_tool: 'Read' })).toBe('📖')
    expect(getStatusEmoji({ status: 'processing', current_tool: 'Bash' })).toBe('🔺')
  })

  it('should return hourglass when processing without current_tool', () => {
    expect(getStatusEmoji({ status: 'processing' })).toBe('⏳')
  })

  it('should return tool emoji for tool_use status', () => {
    expect(getStatusEmoji({ status: 'tool_use', current_tool: 'Edit' })).toBe('✏️')
  })

  it('should return thought bubble for working status', () => {
    expect(getStatusEmoji({ status: 'working' })).toBe('💭')
  })

  it('should return empty string for unknown status', () => {
    expect(getStatusEmoji({ status: 'unknown' })).toBe('')
  })
})

describe('getStatusText', () => {
  it('should return empty string for undefined status', () => {
    expect(getStatusText(undefined)).toBe('')
  })

  it('should return Ready for idle status without profile', () => {
    expect(getStatusText({ status: 'idle' })).toBe('✓ Ready')
  })

  it('should return profile name for idle status with profile', () => {
    expect(getStatusText({ status: 'idle' }, 'Claude Code')).toBe('✓ Claude Code')
  })

  it('should return Ready for awaiting_input status', () => {
    expect(getStatusText({ status: 'awaiting_input' })).toBe('✓ Ready')
  })

  it('should return processing text with tool and file details', () => {
    const status: ClaudeStatus = {
      status: 'processing',
      current_tool: 'Read',
      details: { args: { file_path: '/home/test/components/App.tsx' } },
    }
    expect(getStatusText(status)).toBe('📖 Read: App.tsx')
  })

  it('should return processing text with description', () => {
    const status: ClaudeStatus = {
      status: 'processing',
      current_tool: 'Bash',
      details: { args: { description: 'Running npm test' } },
    }
    expect(getStatusText(status)).toBe('🔺 Bash: Running npm test')
  })

  it('should return processing text with command', () => {
    const status: ClaudeStatus = {
      status: 'processing',
      current_tool: 'Bash',
      details: { args: { command: 'git status' } },
    }
    expect(getStatusText(status)).toBe('🔺 Bash: git status')
  })

  it('should return generic processing when no details', () => {
    expect(getStatusText({ status: 'processing' })).toBe('⏳ Processing')
  })

  it('should return tool_use text with pattern', () => {
    const status: ClaudeStatus = {
      status: 'tool_use',
      current_tool: 'Glob',
      details: { args: { pattern: '**/*.ts' } },
    }
    expect(getStatusText(status)).toBe('🔍 Glob: **/*.ts')
  })

  it('should return Working for working status', () => {
    expect(getStatusText({ status: 'working' })).toBe('⚙️ Working')
  })

  it('should hide internal Claude file operations', () => {
    const status: ClaudeStatus = {
      status: 'processing',
      current_tool: 'Read',
      details: { args: { file_path: '/home/user/.claude/memory.json' } },
    }
    expect(getStatusText(status)).toBe('⏳ Processing')
  })

  it('should hide session-memory file operations', () => {
    const status: ClaudeStatus = {
      status: 'tool_use',
      current_tool: 'Write',
      details: { args: { file_path: '/tmp/session-memory/data.json' } },
    }
    expect(getStatusText(status)).toBe('🔧 Working')
  })
})

describe('getFullStatusText', () => {
  it('should return empty string for undefined status', () => {
    expect(getFullStatusText(undefined)).toBe('')
  })

  it('should return full file path for processing with file', () => {
    const status: ClaudeStatus = {
      status: 'processing',
      current_tool: 'Read',
      details: { args: { file_path: '/home/user/projects/app/src/index.ts' } },
    }
    expect(getFullStatusText(status)).toBe('Processing Read: /home/user/projects/app/src/index.ts')
  })

  it('should return full description for tool_use', () => {
    const status: ClaudeStatus = {
      status: 'tool_use',
      current_tool: 'Bash',
      details: { args: { description: 'Running comprehensive test suite for all modules' } },
    }
    expect(getFullStatusText(status)).toBe('Bash: Running comprehensive test suite for all modules')
  })

  it('should return Ready for input for idle status', () => {
    expect(getFullStatusText({ status: 'idle' })).toBe('Ready for input')
  })

  it('should return Processing... for processing without details', () => {
    expect(getFullStatusText({ status: 'processing' })).toBe('Processing...')
  })

  it('should return Working... for working status', () => {
    expect(getFullStatusText({ status: 'working' })).toBe('Working...')
  })

  it('should hide internal Claude files', () => {
    const status: ClaudeStatus = {
      status: 'processing',
      details: { args: { file_path: '/home/user/.claude/settings.json' } },
    }
    expect(getFullStatusText(status)).toBe('Processing...')
  })
})

describe('getContextColor', () => {
  it('should return empty string for undefined', () => {
    expect(getContextColor(undefined)).toBe('')
  })

  it('should return empty string for null', () => {
    expect(getContextColor(null as any)).toBe('')
  })

  it('should return green for context < 50%', () => {
    expect(getContextColor(0)).toBe('#00ff88')
    expect(getContextColor(25)).toBe('#00ff88')
    expect(getContextColor(49)).toBe('#00ff88')
  })

  it('should return yellow for context 50-74%', () => {
    expect(getContextColor(50)).toBe('#fbbf24')
    expect(getContextColor(60)).toBe('#fbbf24')
    expect(getContextColor(74)).toBe('#fbbf24')
  })

  it('should return red for context >= 75%', () => {
    expect(getContextColor(75)).toBe('#ef4444')
    expect(getContextColor(90)).toBe('#ef4444')
    expect(getContextColor(100)).toBe('#ef4444')
  })
})

describe('getStatusColor', () => {
  it('should return empty string for undefined status', () => {
    expect(getStatusColor(undefined)).toBe('')
  })

  it('should return green for idle status', () => {
    expect(getStatusColor({ status: 'idle' })).toBe('#00ff88')
  })

  it('should return green for awaiting_input status', () => {
    expect(getStatusColor({ status: 'awaiting_input' })).toBe('#00ff88')
  })

  it('should return empty string for processing status', () => {
    expect(getStatusColor({ status: 'processing' })).toBe('')
  })

  it('should return empty string for tool_use status', () => {
    expect(getStatusColor({ status: 'tool_use' })).toBe('')
  })

  it('should return empty string for working status', () => {
    expect(getStatusColor({ status: 'working' })).toBe('')
  })
})
