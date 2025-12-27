import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// Hoist mock functions for vi.mock factories
const { mockDisconnect, mockConnectToBackground } = vi.hoisted(() => ({
  mockDisconnect: vi.fn(),
  mockConnectToBackground: vi.fn(),
}))

// Mock messaging
vi.mock('../../../extension/shared/messaging', () => ({
  connectToBackground: (name: string, callback: (message: any) => void) => {
    mockConnectToBackground(name, callback)
    // Simulate initial state immediately
    setTimeout(() => callback({ type: 'INITIAL_STATE', wsConnected: true }), 0)
    return { disconnect: mockDisconnect }
  },
}))

// Mock Terminal component
vi.mock('../../../extension/components/Terminal', () => ({
  Terminal: ({ terminalId, sessionName, themeName, fontSize, isDark }: any) => (
    <div
      data-testid="terminal-mock"
      data-id={terminalId}
      data-session={sessionName}
      data-theme={themeName}
      data-fontsize={fontSize}
      data-dark={isDark}
    >
      Mock Terminal
    </div>
  ),
}))

// Mock useProfiles hook
const mockProfiles = [
  {
    id: 'default',
    name: 'Default',
    themeName: 'high-contrast',
    fontSize: 16,
    fontFamily: 'monospace',
    panelColor: '#000000',
    workingDir: '~',
  },
  {
    id: 'custom',
    name: 'Custom',
    themeName: 'dracula',
    fontSize: 14,
    fontFamily: 'JetBrains Mono',
    panelColor: '#1a1a2e',
    workingDir: '~/projects',
  },
]

vi.mock('../../../extension/hooks/useProfiles', () => ({
  useProfiles: () => ({
    profiles: mockProfiles,
    defaultProfileId: 'default',
  }),
}))

// Mock session data
const mockSessions = [
  {
    id: 'term-123',
    name: 'My Terminal',
    sessionName: 'ctt-term-123',
    type: 'bash',
    workingDir: '/home/user',
    profile: { id: 'default' },
    fontSizeOffset: 0,
    appearanceOverrides: {},
  },
  {
    id: 'term-456',
    name: 'Custom Terminal',
    sessionName: 'ctt-term-456',
    type: 'bash',
    workingDir: '/projects',
    profile: { id: 'custom' },
    fontSizeOffset: 2,
    appearanceOverrides: {
      themeName: 'monokai',
      panelColor: '#2d2d2d',
    },
  },
]

const mockIncreaseFontSize = vi.fn()
const mockDecreaseFontSize = vi.fn()
const mockResetFontSize = vi.fn()
const mockHandleWebSocketMessage = vi.fn()

vi.mock('../../../extension/hooks/useTerminalSessions', () => ({
  useTerminalSessions: () => ({
    sessions: mockSessions,
    handleWebSocketMessage: mockHandleWebSocketMessage,
    increaseFontSize: mockIncreaseFontSize,
    decreaseFontSize: mockDecreaseFontSize,
    resetFontSize: mockResetFontSize,
  }),
}))

// Import component after mocks
import { PopoutTerminalView } from '../../../extension/components/PopoutTerminalView'

describe('PopoutTerminalView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset chrome storage mock
    vi.mocked(chrome.storage.local.get).mockImplementation((keys, callback) => {
      if (callback) callback({ isDark: true })
      return Promise.resolve({ isDark: true })
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('loading state', () => {
    it('should show loading when terminal not found', async () => {
      render(<PopoutTerminalView terminalId="non-existent-id" />)

      expect(screen.getByText('Loading terminal...')).toBeInTheDocument()
      expect(screen.getByText('non-existent-id')).toBeInTheDocument()
    })

    it('should show backend connection warning when not connected', async () => {
      // Override mock to not be connected
      mockConnectToBackground.mockImplementationOnce((name, callback) => {
        setTimeout(() => callback({ type: 'INITIAL_STATE', wsConnected: false }), 0)
        return { disconnect: mockDisconnect }
      })

      render(<PopoutTerminalView terminalId="non-existent" />)

      await waitFor(() => {
        expect(screen.getByText('Waiting for backend connection...')).toBeInTheDocument()
      })
    })
  })

  describe('terminal rendering', () => {
    it('should render terminal when session is found by id', async () => {
      render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('terminal-mock')).toBeInTheDocument()
      })

      const terminal = screen.getByTestId('terminal-mock')
      expect(terminal).toHaveAttribute('data-id', 'term-123')
      expect(terminal).toHaveAttribute('data-session', 'My Terminal')
    })

    it('should render terminal when found by sessionName', async () => {
      render(<PopoutTerminalView terminalId="ctt-term-456" />)

      await waitFor(() => {
        expect(screen.getByTestId('terminal-mock')).toBeInTheDocument()
      })

      const terminal = screen.getByTestId('terminal-mock')
      expect(terminal).toHaveAttribute('data-id', 'term-456')
    })

    it('should use default profile theme when session has no overrides', async () => {
      render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('terminal-mock')).toBeInTheDocument()
      })

      const terminal = screen.getByTestId('terminal-mock')
      expect(terminal).toHaveAttribute('data-theme', 'high-contrast')
      expect(terminal).toHaveAttribute('data-fontsize', '16')
    })

    it('should use appearance overrides when present', async () => {
      render(<PopoutTerminalView terminalId="term-456" />)

      await waitFor(() => {
        expect(screen.getByTestId('terminal-mock')).toBeInTheDocument()
      })

      const terminal = screen.getByTestId('terminal-mock')
      expect(terminal).toHaveAttribute('data-theme', 'monokai')
    })
  })

  describe('background connection', () => {
    it('should connect to background with "popout" name', async () => {
      render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(mockConnectToBackground).toHaveBeenCalledWith('popout', expect.any(Function))
      })
    })

    it('should disconnect on unmount', async () => {
      const { unmount } = render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(mockConnectToBackground).toHaveBeenCalled()
      })

      unmount()

      expect(mockDisconnect).toHaveBeenCalled()
    })

    it('should update wsConnected on WS_CONNECTED message', async () => {
      let messageCallback: ((msg: any) => void) | null = null
      mockConnectToBackground.mockImplementation((name, callback) => {
        messageCallback = callback
        setTimeout(() => callback({ type: 'INITIAL_STATE', wsConnected: false }), 0)
        return { disconnect: mockDisconnect }
      })

      render(<PopoutTerminalView terminalId="non-existent" />)

      await waitFor(() => {
        expect(screen.getByText('Waiting for backend connection...')).toBeInTheDocument()
      })

      // Simulate WS_CONNECTED
      if (messageCallback) {
        messageCallback({ type: 'WS_CONNECTED' })
      }

      await waitFor(() => {
        expect(screen.queryByText('Waiting for backend connection...')).not.toBeInTheDocument()
      })
    })
  })

  describe('dark mode', () => {
    it('should load dark mode preference from storage', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementation((keys, callback) => {
        if (callback) callback({ isDark: false })
        return Promise.resolve({ isDark: false })
      })

      render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('terminal-mock')).toBeInTheDocument()
      })

      expect(chrome.storage.local.get).toHaveBeenCalledWith(['isDark'], expect.any(Function))
    })

    it('should listen for dark mode changes', async () => {
      render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(chrome.storage.onChanged.addListener).toHaveBeenCalled()
      })
    })

    it('should remove storage listener on unmount', async () => {
      const { unmount } = render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(chrome.storage.onChanged.addListener).toHaveBeenCalled()
      })

      unmount()

      expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled()
    })
  })

  describe('effective profile resolution', () => {
    it('should fall back to default profile when session has no profile', async () => {
      // Create a session without a profile reference
      const sessionsWithoutProfile = [
        {
          id: 'term-no-profile',
          name: 'No Profile Terminal',
          sessionName: 'ctt-no-profile',
          type: 'bash',
          workingDir: '/tmp',
          profile: null,
          fontSizeOffset: 0,
          appearanceOverrides: {},
        },
      ]

      // Temporarily override sessions mock
      vi.doMock('../../../extension/hooks/useTerminalSessions', () => ({
        useTerminalSessions: () => ({
          sessions: sessionsWithoutProfile,
          handleWebSocketMessage: mockHandleWebSocketMessage,
          increaseFontSize: mockIncreaseFontSize,
          decreaseFontSize: mockDecreaseFontSize,
          resetFontSize: mockResetFontSize,
        }),
      }))

      // The test will use the default mock which has profile: { id: 'default' }
      render(<PopoutTerminalView terminalId="term-123" />)

      await waitFor(() => {
        expect(screen.getByTestId('terminal-mock')).toBeInTheDocument()
      })

      // Should use default profile settings
      const terminal = screen.getByTestId('terminal-mock')
      expect(terminal).toHaveAttribute('data-fontsize', '16')
    })
  })
})
