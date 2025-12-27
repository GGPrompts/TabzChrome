import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useChatInput } from '../../../extension/hooks/useChatInput'

// Mock sendMessage
const mockSendMessage = vi.fn()
vi.mock('../../../extension/shared/messaging', () => ({
  sendMessage: (...args: any[]) => mockSendMessage(...args),
}))

// Mock useOutsideClick
vi.mock('../../../extension/hooks/useOutsideClick', () => ({
  useOutsideClick: vi.fn(),
}))

describe('useChatInput', () => {
  const mockAddToHistory = vi.fn()
  const mockNavigateHistory = vi.fn().mockReturnValue(null)
  const mockResetNavigation = vi.fn()

  const defaultParams = {
    sessions: [
      { id: 'term-1', name: 'Terminal 1', sessionName: 'session-1' },
      { id: 'term-2', name: 'Terminal 2', sessionName: 'session-2' },
    ] as any[],
    currentSession: 'term-1',
    claudeStatuses: new Map(),
    commandHistory: {
      history: [],
      addToHistory: mockAddToHistory,
      navigateHistory: mockNavigateHistory,
      resetNavigation: mockResetNavigation,
    },
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initialization', () => {
    it('should initialize with empty input text', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.chatInputText).toBe('')
    })

    it('should initialize with execute mode', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.chatInputMode).toBe('execute')
    })

    it('should initialize with empty target tabs', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.targetTabs.size).toBe(0)
    })

    it('should initialize with dropdowns closed', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.showTargetDropdown).toBe(false)
      expect(result.current.showHistoryDropdown).toBe(false)
    })
  })

  describe('input text handling', () => {
    it('should update chat input text', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('Hello Claude')
      })

      expect(result.current.chatInputText).toBe('Hello Claude')
    })

    it('should handle input change event', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.handleChatInputChange({
          target: { value: 'Test input' },
        } as any)
      })

      expect(result.current.chatInputText).toBe('Test input')
      expect(mockResetNavigation).toHaveBeenCalled()
    })
  })

  describe('mode switching', () => {
    it('should switch between execute and send modes', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.chatInputMode).toBe('execute')

      act(() => {
        result.current.setChatInputMode('send')
      })

      expect(result.current.chatInputMode).toBe('send')

      act(() => {
        result.current.setChatInputMode('execute')
      })

      expect(result.current.chatInputMode).toBe('execute')
    })
  })

  describe('target tab selection', () => {
    it('should toggle target tabs', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.toggleTargetTab('term-1')
      })

      expect(result.current.targetTabs.has('term-1')).toBe(true)

      act(() => {
        result.current.toggleTargetTab('term-1')
      })

      expect(result.current.targetTabs.has('term-1')).toBe(false)
    })

    it('should select multiple target tabs', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.toggleTargetTab('term-1')
        result.current.toggleTargetTab('term-2')
      })

      expect(result.current.targetTabs.size).toBe(2)
      expect(result.current.targetTabs.has('term-1')).toBe(true)
      expect(result.current.targetTabs.has('term-2')).toBe(true)
    })

    it('should select all tabs', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.selectAllTargetTabs()
      })

      expect(result.current.targetTabs.size).toBe(2)
    })

    it('should deselect all when all are selected', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.selectAllTargetTabs()
      })

      expect(result.current.targetTabs.size).toBe(2)

      act(() => {
        result.current.selectAllTargetTabs()
      })

      expect(result.current.targetTabs.size).toBe(0)
    })
  })

  describe('target label', () => {
    it('should return "Current" when no tabs selected', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.getTargetLabel()).toBe('Current')
    })

    it('should return tab name when one tab selected', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.toggleTargetTab('term-1')
      })

      expect(result.current.getTargetLabel()).toBe('Terminal 1')
    })

    it('should return count when multiple tabs selected', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.toggleTargetTab('term-1')
        result.current.toggleTargetTab('term-2')
      })

      expect(result.current.getTargetLabel()).toBe('2 tabs')
    })
  })

  describe('sending messages', () => {
    it('should not send empty messages', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.handleChatInputSend()
      })

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should not send whitespace-only messages', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('   ')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('should send message to current session when no targets selected', async () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      // Let setTimeout run
      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(mockSendMessage).toHaveBeenCalled()
      expect(mockAddToHistory).toHaveBeenCalledWith('Hello')
    })

    it('should send message to selected targets', async () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.toggleTargetTab('term-1')
        result.current.toggleTargetTab('term-2')
      })

      act(() => {
        result.current.setChatInputText('Hello all')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      await act(async () => {
        vi.advanceTimersByTime(200) // 50ms stagger * 2 + extra
      })

      // Should have sent to both terminals (with stagger)
      expect(mockSendMessage).toHaveBeenCalledTimes(2)
    })

    it('should clear input after sending', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      expect(result.current.chatInputText).toBe('')
    })

    it('should use TARGETED_PANE_SEND when tmuxPane available', async () => {
      const claudeStatuses = new Map([
        ['term-1', { tmuxPane: '%42' }],
      ])

      const { result } = renderHook(() =>
        useChatInput({ ...defaultParams, claudeStatuses })
      )

      act(() => {
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TARGETED_PANE_SEND',
        tmuxPane: '%42',
        text: 'Hello',
        sendEnter: true,
      })
    })

    it('should use TMUX_SESSION_SEND when sessionName available but no tmuxPane', async () => {
      const sessions = [
        { id: 'term-1', name: 'Terminal 1', sessionName: 'my-session' },
      ]

      const { result } = renderHook(() =>
        useChatInput({ ...defaultParams, sessions: sessions as any })
      )

      act(() => {
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TMUX_SESSION_SEND',
        sessionName: 'my-session',
        text: 'Hello',
        sendEnter: true,
      })
    })

    it('should use TERMINAL_INPUT as fallback', async () => {
      const sessions = [
        { id: 'term-1', name: 'Terminal 1' }, // No sessionName
      ]

      const { result } = renderHook(() =>
        useChatInput({ ...defaultParams, sessions: sessions as any })
      )

      act(() => {
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TERMINAL_INPUT',
        terminalId: 'term-1',
        data: 'Hello',
      })
    })

    it('should send Enter key after delay in execute mode with TERMINAL_INPUT fallback', async () => {
      const sessions = [
        { id: 'term-1', name: 'Terminal 1' },
      ]

      const { result } = renderHook(() =>
        useChatInput({ ...defaultParams, sessions: sessions as any })
      )

      act(() => {
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      await act(async () => {
        vi.advanceTimersByTime(100)
      })

      // First call - the text
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TERMINAL_INPUT',
        terminalId: 'term-1',
        data: 'Hello',
      })

      // Wait for Enter key delay
      await act(async () => {
        vi.advanceTimersByTime(400)
      })

      // Second call - the Enter key
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TERMINAL_INPUT',
        terminalId: 'term-1',
        data: '\r',
      })
    })

    it('should not send Enter in send mode', async () => {
      const sessions = [
        { id: 'term-1', name: 'Terminal 1' },
      ]

      const { result } = renderHook(() =>
        useChatInput({ ...defaultParams, sessions: sessions as any })
      )

      act(() => {
        result.current.setChatInputMode('send')
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      await act(async () => {
        vi.advanceTimersByTime(500)
      })

      // Only one call - the text (no Enter)
      expect(mockSendMessage).toHaveBeenCalledTimes(1)
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'TERMINAL_INPUT',
        terminalId: 'term-1',
        data: 'Hello',
      })
    })
  })

  describe('keyboard handling', () => {
    it('should send on Enter', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('Hello')
      })

      const preventDefault = vi.fn()
      act(() => {
        result.current.handleChatInputKeyDown({
          key: 'Enter',
          preventDefault,
        } as any)
      })

      expect(preventDefault).toHaveBeenCalled()
      expect(mockAddToHistory).toHaveBeenCalledWith('Hello')
    })

    it('should clear and blur on Escape', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('Hello')
      })

      const preventDefault = vi.fn()
      act(() => {
        result.current.handleChatInputKeyDown({
          key: 'Escape',
          preventDefault,
        } as any)
      })

      expect(preventDefault).toHaveBeenCalled()
      expect(result.current.chatInputText).toBe('')
      expect(mockResetNavigation).toHaveBeenCalled()
    })

    it('should navigate history up on ArrowUp', () => {
      mockNavigateHistory.mockReturnValue('previous command')

      const { result } = renderHook(() => useChatInput(defaultParams))

      const preventDefault = vi.fn()
      act(() => {
        result.current.handleChatInputKeyDown({
          key: 'ArrowUp',
          preventDefault,
        } as any)
      })

      expect(preventDefault).toHaveBeenCalled()
      expect(mockNavigateHistory).toHaveBeenCalledWith('up', '')
      expect(result.current.chatInputText).toBe('previous command')
    })

    it('should navigate history down on ArrowDown', () => {
      mockNavigateHistory.mockReturnValue('next command')

      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('current')
      })

      const preventDefault = vi.fn()
      act(() => {
        result.current.handleChatInputKeyDown({
          key: 'ArrowDown',
          preventDefault,
        } as any)
      })

      expect(preventDefault).toHaveBeenCalled()
      expect(mockNavigateHistory).toHaveBeenCalledWith('down', 'current')
      expect(result.current.chatInputText).toBe('next command')
    })

    it('should not update text when navigateHistory returns null', () => {
      mockNavigateHistory.mockReturnValue(null)

      const { result } = renderHook(() => useChatInput(defaultParams))

      act(() => {
        result.current.setChatInputText('current text')
      })

      act(() => {
        result.current.handleChatInputKeyDown({
          key: 'ArrowUp',
          preventDefault: vi.fn(),
        } as any)
      })

      expect(result.current.chatInputText).toBe('current text')
    })
  })

  describe('dropdown controls', () => {
    it('should toggle target dropdown', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.showTargetDropdown).toBe(false)

      act(() => {
        result.current.setShowTargetDropdown(true)
      })

      expect(result.current.showTargetDropdown).toBe(true)

      act(() => {
        result.current.setShowTargetDropdown(false)
      })

      expect(result.current.showTargetDropdown).toBe(false)
    })

    it('should toggle history dropdown', () => {
      const { result } = renderHook(() => useChatInput(defaultParams))

      expect(result.current.showHistoryDropdown).toBe(false)

      act(() => {
        result.current.setShowHistoryDropdown(true)
      })

      expect(result.current.showHistoryDropdown).toBe(true)
    })
  })

  describe('no current session', () => {
    it('should not send when no current session and no targets', () => {
      const { result } = renderHook(() =>
        useChatInput({ ...defaultParams, currentSession: null })
      )

      act(() => {
        result.current.setChatInputText('Hello')
      })

      act(() => {
        result.current.handleChatInputSend()
      })

      // Should add to history but not send
      expect(mockAddToHistory).toHaveBeenCalledWith('Hello')
      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })
})
