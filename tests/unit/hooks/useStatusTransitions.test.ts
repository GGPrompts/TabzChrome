import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useStatusTransitions } from '../../../extension/hooks/useStatusTransitions'
import type { ClaudeStatus } from '../../../extension/hooks/useClaudeStatus'

describe('useStatusTransitions', () => {
  const mockPlayAudio = vi.fn().mockResolvedValue(undefined)
  const mockGetAudioSettingsForProfile = vi.fn().mockReturnValue({
    voice: 'test-voice',
    rate: '1.0',
    pitch: '1.0',
    volume: 1.0,
    enabled: true,
  })

  const defaultAudioSettings = {
    events: {
      ready: true,
      tools: true,
      toolDetails: true,
      subagents: true,
      contextWarning: true,
      contextCritical: true,
      sessionStart: false,
      sessionClose: false,
    },
    defaultVoice: 'test-voice',
    defaultRate: '1.0',
    defaultPitch: '1.0',
    defaultVolume: 1.0,
  }

  const defaultSessions = [
    { id: 'term-1', name: 'Claude', profile: { id: 'default', name: 'Claude Code' } },
  ]

  beforeEach(() => {
    vi.useFakeTimers()
    mockPlayAudio.mockClear()
    mockGetAudioSettingsForProfile.mockClear()
    mockGetAudioSettingsForProfile.mockReturnValue({
      voice: 'test-voice',
      rate: '1.0',
      pitch: '1.0',
      volume: 1.0,
      enabled: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createHookParams = (overrides = {}) => ({
    sessions: defaultSessions as any,
    claudeStatuses: new Map<string, ClaudeStatus>(),
    audioSettings: defaultAudioSettings as any,
    audioGlobalMute: false,
    settingsLoaded: true,
    getAudioSettingsForProfile: mockGetAudioSettingsForProfile,
    playAudio: mockPlayAudio,
    ...overrides,
  })

  describe('initialization', () => {
    it('should not play audio when settingsLoaded is false', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle' }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({
            claudeStatuses,
            settingsLoaded: false,
          }))
        )
      })

      expect(mockPlayAudio).not.toHaveBeenCalled()
    })

    it('should not play audio when audioGlobalMute is true', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle' }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({
            claudeStatuses,
            audioGlobalMute: true,
          }))
        )
      })

      expect(mockPlayAudio).not.toHaveBeenCalled()
    })

    it('should not play audio when profile audio is disabled', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', current_tool: 'Read' }],
      ])

      mockGetAudioSettingsForProfile.mockReturnValue({
        voice: 'test-voice',
        rate: '1.0',
        pitch: '1.0',
        volume: 1.0,
        enabled: false,
      })

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({
            claudeStatuses,
          }))
        )
      })

      expect(mockPlayAudio).not.toHaveBeenCalled()
    })
  })

  describe('ready announcements', () => {
    it('should play ready announcement on transition from processing to idle', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const freshTimestamp = new Date(now).toISOString()

      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', last_updated: freshTimestamp }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses } }
      )

      mockPlayAudio.mockClear()

      const newTimestamp = new Date(now + 1000).toISOString()
      const idleStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle', last_updated: newTimestamp, subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: idleStatuses })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Claude Code ready',
        expect.any(Object),
        false,
        { eventType: 'ready' }
      )
    })

    it('should play ready announcement on transition from tool_use to awaiting_input', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const freshTimestamp = new Date(now).toISOString()

      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'tool_use', current_tool: 'Read', last_updated: freshTimestamp }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses } }
      )

      mockPlayAudio.mockClear()

      const newTimestamp = new Date(now + 1000).toISOString()
      const awaitingStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'awaiting_input', last_updated: newTimestamp, subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: awaitingStatuses })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Claude Code ready',
        expect.any(Object),
        false,
        { eventType: 'ready' }
      )
    })

    it('should not play ready announcement if subagent_count > 0', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const freshTimestamp = new Date(now).toISOString()

      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', last_updated: freshTimestamp }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses } }
      )

      mockPlayAudio.mockClear()

      const newTimestamp = new Date(now + 1000).toISOString()
      const idleStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle', last_updated: newTimestamp, subagent_count: 2 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: idleStatuses })
      })

      expect(mockPlayAudio).not.toHaveBeenCalledWith(
        expect.stringContaining('ready'),
        expect.any(Object)
      )
    })

    it('should respect cooldown between ready announcements', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const freshTimestamp = new Date(now).toISOString()
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', last_updated: freshTimestamp }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses } }
      )

      // First transition to idle
      const newTimestamp = new Date(now + 1000).toISOString()
      const idleStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle', last_updated: newTimestamp, subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: idleStatuses })
      })

      expect(mockPlayAudio).toHaveBeenCalledTimes(1)
      mockPlayAudio.mockClear()

      // Quick transition back to processing and idle again (within cooldown)
      vi.advanceTimersByTime(5000) // Only 5 seconds

      const processingAgain = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', last_updated: new Date(now + 6000).toISOString() }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: processingAgain })
      })

      const idleAgain = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle', last_updated: new Date(now + 7000).toISOString(), subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: idleAgain })
      })

      // Should not play because cooldown hasn't passed
      expect(mockPlayAudio).not.toHaveBeenCalled()
    })

    it('should not play ready if ready event is disabled', async () => {
      const now = Date.now()
      vi.setSystemTime(now)
      const freshTimestamp = new Date(now).toISOString()

      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', last_updated: freshTimestamp }],
      ])

      const audioSettings = {
        ...defaultAudioSettings,
        events: { ...defaultAudioSettings.events, ready: false },
      }

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({
          claudeStatuses,
          audioSettings,
        })),
        { initialProps: { claudeStatuses } }
      )

      mockPlayAudio.mockClear()

      const newTimestamp = new Date(now + 1000).toISOString()
      const idleStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle', last_updated: newTimestamp, subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: idleStatuses })
      })

      expect(mockPlayAudio).not.toHaveBeenCalled()
    })
  })

  describe('tool announcements', () => {
    it('should announce tool usage', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'tool_use', current_tool: 'Read' }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({ claudeStatuses }))
        )
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Reading',
        expect.any(Object),
        true,
        { eventType: 'tools' }
      )
    })

    it('should announce different tools correctly', async () => {
      const testCases = [
        { tool: 'Read', expected: 'Reading' },
        { tool: 'Write', expected: 'Writing' },
        { tool: 'Edit', expected: 'Edit' },
        { tool: 'Bash', expected: 'Running command' },
        { tool: 'Glob', expected: 'Searching files' },
        { tool: 'Grep', expected: 'Searching code' },
        { tool: 'Task', expected: 'Spawning agent' },
        { tool: 'WebFetch', expected: 'Fetching web' },
        { tool: 'WebSearch', expected: 'Searching web' },
        { tool: 'CustomTool', expected: 'Using CustomTool' },
      ]

      for (const { tool, expected } of testCases) {
        mockPlayAudio.mockClear()

        const claudeStatuses = new Map<string, ClaudeStatus>([
          ['term-1', { status: 'processing', current_tool: tool }],
        ])

        await act(async () => {
          renderHook(() =>
            useStatusTransitions(createHookParams({ claudeStatuses }))
          )
        })

        expect(mockPlayAudio).toHaveBeenCalledWith(
          expect.stringContaining(expected),
          expect.any(Object),
          true,
          { eventType: 'tools' }
        )
      }
    })

    it('should include filename in tool announcement when toolDetails enabled', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'tool_use',
          current_tool: 'Read',
          details: { args: { file_path: '/home/user/project/src/App.tsx' } },
        }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({ claudeStatuses }))
        )
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Reading App.tsx',
        expect.any(Object),
        true,
        { eventType: 'tools' }
      )
    })

    it('should include pattern in Glob/Grep announcement', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'tool_use',
          current_tool: 'Glob',
          details: { args: { pattern: '**/*.ts' } },
        }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({ claudeStatuses }))
        )
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Searching files **/*.ts',
        expect.any(Object),
        true,
        { eventType: 'tools' }
      )
    })

    it('should use Bash description when available', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'processing',
          current_tool: 'Bash',
          details: { args: { description: 'Running tests' } },
        }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({ claudeStatuses }))
        )
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Running tests',
        expect.any(Object),
        true,
        { eventType: 'tools' }
      )
    })

    it('should not announce internal Claude files', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'tool_use',
          current_tool: 'Read',
          details: { args: { file_path: '/home/user/.claude/session.json' } },
        }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({ claudeStatuses }))
        )
      })

      expect(mockPlayAudio).not.toHaveBeenCalled()
    })

    it('should not announce session-memory files', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'tool_use',
          current_tool: 'Write',
          details: { args: { file_path: '/tmp/session-memory/data.json' } },
        }],
      ])

      await act(async () => {
        renderHook(() =>
          useStatusTransitions(createHookParams({ claudeStatuses }))
        )
      })

      expect(mockPlayAudio).not.toHaveBeenCalled()
    })

    it('should not announce same tool twice', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'tool_use',
          current_tool: 'Read',
          details: { args: { file_path: '/test/file.ts' } },
        }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses } }
      )

      expect(mockPlayAudio).toHaveBeenCalledTimes(1)
      mockPlayAudio.mockClear()

      // Same tool, same file
      await act(async () => {
        rerender({ claudeStatuses })
      })

      expect(mockPlayAudio).not.toHaveBeenCalled()
    })

    it('should announce when tool changes to different file', async () => {
      const claudeStatuses1 = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'tool_use',
          current_tool: 'Read',
          details: { args: { file_path: '/test/file1.ts' } },
        }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses: claudeStatuses1 } }
      )

      expect(mockPlayAudio).toHaveBeenCalledTimes(1)
      mockPlayAudio.mockClear()

      // Same tool, different file
      const claudeStatuses2 = new Map<string, ClaudeStatus>([
        ['term-1', {
          status: 'tool_use',
          current_tool: 'Read',
          details: { args: { file_path: '/test/file2.ts' } },
        }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: claudeStatuses2 })
      })

      expect(mockPlayAudio).toHaveBeenCalledTimes(1)
    })
  })

  describe('subagent announcements', () => {
    it('should announce when subagent count increases', async () => {
      const claudeStatuses1 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', subagent_count: 0 }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses: claudeStatuses1 } }
      )

      mockPlayAudio.mockClear()

      const claudeStatuses2 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', subagent_count: 2 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: claudeStatuses2 })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        '2 agents running',
        expect.any(Object),
        true,
        { eventType: 'subagents' }
      )
    })

    it('should announce 1 agent running', async () => {
      const claudeStatuses1 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', subagent_count: 0 }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses: claudeStatuses1 } }
      )

      mockPlayAudio.mockClear()

      const claudeStatuses2 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', subagent_count: 1 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: claudeStatuses2 })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        '1 agents running',
        expect.any(Object),
        true,
        { eventType: 'subagents' }
      )
    })

    it('should announce when all agents complete', async () => {
      const claudeStatuses1 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', subagent_count: 2 }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses: claudeStatuses1 } }
      )

      mockPlayAudio.mockClear()

      const claudeStatuses2 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: claudeStatuses2 })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'All agents complete',
        expect.any(Object),
        false,
        { eventType: 'subagents' }
      )
    })
  })

  describe('context threshold alerts', () => {
    it('should announce warning at 50% threshold', async () => {
      const claudeStatuses1 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', context_pct: 45 }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses: claudeStatuses1 } }
      )

      mockPlayAudio.mockClear()

      const claudeStatuses2 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', context_pct: 52 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: claudeStatuses2 })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Warning! Claude Code 50 percent context!',
        expect.any(Object),
        false,
        { pitch: '+15Hz', rate: '+5%', eventType: 'contextWarning' }
      )
    })

    it('should announce critical at 75% threshold', async () => {
      const claudeStatuses1 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', context_pct: 70 }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses: claudeStatuses1 } }
      )

      mockPlayAudio.mockClear()

      const claudeStatuses2 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', context_pct: 78 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: claudeStatuses2 })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Alert! Claude Code context critical!',
        expect.any(Object),
        false,
        { pitch: '+25Hz', rate: '+10%', eventType: 'contextCritical' }
      )
    })

    it('should not re-announce when staying above threshold', async () => {
      const claudeStatuses1 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', context_pct: 52 }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses: claudeStatuses1 } }
      )

      mockPlayAudio.mockClear()

      // Increase but don't cross another threshold
      const claudeStatuses2 = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', context_pct: 60 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: claudeStatuses2 })
      })

      // Should not announce warning again (only announces on crossing)
      expect(mockPlayAudio).not.toHaveBeenCalledWith(
        expect.stringContaining('Warning'),
        expect.any(Object),
        expect.any(Boolean),
        expect.any(Object)
      )
    })
  })

  describe('terminal cleanup', () => {
    it('should clean up refs when terminal is removed', async () => {
      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', current_tool: 'Read' }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({ claudeStatuses })),
        { initialProps: { claudeStatuses } }
      )

      mockPlayAudio.mockClear()

      // Remove the terminal
      await act(async () => {
        rerender({ claudeStatuses: new Map() })
      })

      // Add it back - should announce as new
      const newStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'tool_use', current_tool: 'Write' }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: newStatuses })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        expect.stringContaining('Writing'),
        expect.any(Object),
        true,
        { eventType: 'tools' }
      )
    })
  })

  describe('display name handling', () => {
    it('should use profile name for announcements', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const sessions = [
        { id: 'term-1', name: 'Terminal 1', profile: { id: 'custom', name: 'My Claude' } },
      ]

      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', last_updated: new Date(now).toISOString() }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({
          sessions: sessions as any,
          claudeStatuses,
        })),
        { initialProps: { claudeStatuses } }
      )

      mockPlayAudio.mockClear()

      const idleStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'idle', last_updated: new Date(now + 1000).toISOString(), subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: idleStatuses })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'My Claude ready',
        expect.any(Object),
        false,
        { eventType: 'ready' }
      )
    })

    it('should add index for duplicate names', async () => {
      const now = Date.now()
      vi.setSystemTime(now)

      const sessions = [
        { id: 'term-1', name: 'Claude', profile: { id: 'default', name: 'Claude Code' } },
        { id: 'term-2', name: 'Claude', profile: { id: 'default', name: 'Claude Code' } },
      ]

      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-2', { status: 'processing', last_updated: new Date(now).toISOString() }],
      ])

      const { rerender } = renderHook(
        ({ claudeStatuses }) => useStatusTransitions(createHookParams({
          sessions: sessions as any,
          claudeStatuses,
        })),
        { initialProps: { claudeStatuses } }
      )

      mockPlayAudio.mockClear()

      const idleStatuses = new Map<string, ClaudeStatus>([
        ['term-2', { status: 'idle', last_updated: new Date(now + 1000).toISOString(), subagent_count: 0 }],
      ])

      await act(async () => {
        rerender({ claudeStatuses: idleStatuses })
      })

      expect(mockPlayAudio).toHaveBeenCalledWith(
        'Claude Code 2 ready',
        expect.any(Object),
        false,
        { eventType: 'ready' }
      )
    })
  })
})
