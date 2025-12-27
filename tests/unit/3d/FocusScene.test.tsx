import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import React from 'react'

// Hoist mock functions to ensure they're available when vi.mock runs
const { mockUseThree, mockUseFrame } = vi.hoisted(() => ({
  mockUseThree: vi.fn(() => ({
    camera: {
      position: { x: 0, y: 0, z: 3.5 },
      lookAt: vi.fn(),
    },
  })),
  mockUseFrame: vi.fn((callback: (state: any, delta: number) => void) => {
    // Can optionally call callback for testing
  }),
}))

// Mock Three.js
vi.mock('three', () => ({
  default: {},
  NoToneMapping: 0,
  SRGBColorSpace: 'srgb',
}))

// Mock React Three Fiber
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="canvas-mock">{children}</div>
  ),
  useFrame: mockUseFrame,
  useThree: mockUseThree,
}))

// Mock React Three Drei
vi.mock('@react-three/drei', () => ({
  Html: ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div data-testid="html-mock" style={style}>{children}</div>
  ),
  Stars: () => <div data-testid="stars-mock" />,
}))

// Mock Terminal component
vi.mock('../../../extension/components/Terminal', () => ({
  Terminal: ({ sessionName, terminalId, themeName, fontSize }: any) => (
    <div data-testid="terminal-mock" data-session={sessionName} data-id={terminalId} data-theme={themeName} data-fontsize={fontSize}>
      Mock Terminal
    </div>
  ),
}))

// Mock useTerminal3DMouseFix hook
vi.mock('../../../extension/3d/useTerminal3DMouseFix', () => ({
  useTerminal3DMouseFix: vi.fn(),
}))

// Hoist messaging mocks
const { mockConnectToBackground, mockSendMessage, mockDisconnect } = vi.hoisted(() => ({
  mockConnectToBackground: vi.fn(),
  mockSendMessage: vi.fn(),
  mockDisconnect: vi.fn(),
}))

vi.mock('../../../extension/shared/messaging', () => ({
  connectToBackground: (name: string, callback: (message: any) => void) => {
    mockConnectToBackground(name, callback)
    // Return mock port with hoisted disconnect
    return {
      disconnect: mockDisconnect,
    }
  },
  sendMessage: (message: any) => mockSendMessage(message),
}))

// Mock useProfiles hook
vi.mock('../../../extension/hooks/useProfiles', () => ({
  useProfiles: () => ({
    profiles: [
      {
        id: 'default',
        name: 'Default',
        themeName: 'high-contrast',
        fontSize: 16,
        fontFamily: 'monospace',
        panelColor: '#000000',
      },
    ],
  }),
}))

// Mock useTerminalSessions hook
vi.mock('../../../extension/hooks/useTerminalSessions', () => ({
  useTerminalSessions: () => ({
    sessions: [],
    handleWebSocketMessage: vi.fn(),
  }),
}))

// Import after mocks
import FocusScene from '../../../extension/3d/FocusScene'

describe('FocusScene', () => {
  let originalLocation: Location

  beforeEach(() => {
    vi.clearAllMocks()

    // Save original location
    originalLocation = window.location

    // Mock window.location
    delete (window as any).location
    window.location = {
      ...originalLocation,
      search: '',
    } as Location
  })

  afterEach(() => {
    window.location = originalLocation
  })

  describe('URL parameter handling', () => {
    it('should show error message when no session is specified', () => {
      window.location.search = ''

      render(<FocusScene />)

      expect(screen.getByText(/No session specified/)).toBeInTheDocument()
      expect(screen.getByText(/\?session=session-name/)).toBeInTheDocument()
    })

    it('should parse session name from URL', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.queryByText(/No session specified/)).not.toBeInTheDocument()
      })

      // Should send OPEN_SESSION message
      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'OPEN_SESSION',
        sessionName: 'my-terminal',
      })
    })

    it('should parse terminal ID from URL', async () => {
      window.location.search = '?session=my-session&id=my-id'

      render(<FocusScene />)

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          type: 'FOCUS_IN_3D',
          terminalId: 'my-id',
        })
      })
    })

    it('should use session name as terminal ID when id not provided', async () => {
      window.location.search = '?session=my-session'

      render(<FocusScene />)

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          type: 'FOCUS_IN_3D',
          terminalId: 'my-session',
        })
      })
    })

    it('should set document title based on session name', async () => {
      window.location.search = '?session=test-session'

      render(<FocusScene />)

      await waitFor(() => {
        expect(document.title).toBe('3D Focus: test-session')
      })
    })
  })

  describe('3D canvas rendering', () => {
    it('should render Canvas when session is specified', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.getByTestId('canvas-mock')).toBeInTheDocument()
      })
    })

    it('should render Stars component', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.getByTestId('stars-mock')).toBeInTheDocument()
      })
    })

    it('should render Html wrapper for terminal', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.getByTestId('html-mock')).toBeInTheDocument()
      })
    })
  })

  describe('UI elements', () => {
    it('should show 3D Focus Mode label', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.getByText('3D Focus Mode')).toBeInTheDocument()
      })
    })

    it('should show instructions text', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.getByText(/Scroll: zoom/)).toBeInTheDocument()
        expect(screen.getByText(/F2:/)).toBeInTheDocument()
        expect(screen.getByText(/Esc: unfocus terminal/)).toBeInTheDocument()
      })
    })

    it('should show Return to Sidebar button', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.getByText('← Return to Sidebar')).toBeInTheDocument()
      })
    })

    it('should show session name in bottom-right corner', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        // Session name appears in UI
        expect(screen.getByText('my-terminal')).toBeInTheDocument()
      })
    })

    it('should not show LOCKED indicator initially', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.queryByText('LOCKED')).not.toBeInTheDocument()
      })
    })
  })

  describe('background connection', () => {
    it('should connect to background with 3d-focus name', async () => {
      window.location.search = '?session=my-terminal'

      render(<FocusScene />)

      await waitFor(() => {
        expect(mockConnectToBackground).toHaveBeenCalledWith(
          '3d-focus',
          expect.any(Function)
        )
      })
    })

    it('should disconnect on unmount', async () => {
      window.location.search = '?session=my-terminal'
      mockDisconnect.mockClear()

      const { unmount } = render(<FocusScene />)

      await waitFor(() => {
        expect(mockConnectToBackground).toHaveBeenCalled()
      })

      unmount()

      expect(mockDisconnect).toHaveBeenCalled()
    })
  })

  describe('cleanup on window close', () => {
    it('should send RETURN_FROM_3D message on beforeunload', async () => {
      window.location.search = '?session=my-session&id=my-id'

      render(<FocusScene />)

      await waitFor(() => {
        expect(mockSendMessage).toHaveBeenCalledWith({
          type: 'FOCUS_IN_3D',
          terminalId: 'my-id',
        })
      })

      // Simulate beforeunload
      act(() => {
        window.dispatchEvent(new Event('beforeunload'))
      })

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'RETURN_FROM_3D',
        terminalId: 'my-id',
      })
    })
  })

  describe('Return to Sidebar button', () => {
    it('should call window.close when clicked', async () => {
      window.location.search = '?session=my-terminal'

      const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => {})

      render(<FocusScene />)

      await waitFor(() => {
        expect(screen.getByText('← Return to Sidebar')).toBeInTheDocument()
      })

      const button = screen.getByText('← Return to Sidebar')
      act(() => {
        button.click()
      })

      expect(closeSpy).toHaveBeenCalled()

      closeSpy.mockRestore()
    })
  })
})

describe('FocusScene with profile settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    delete (window as any).location
    window.location = {
      search: '?session=test',
    } as Location
  })

  it('should apply default profile settings when no session profile', async () => {
    render(<FocusScene />)

    await waitFor(() => {
      expect(screen.getByTestId('canvas-mock')).toBeInTheDocument()
    })

    // Terminal should receive default profile values
    const terminal = screen.getByTestId('terminal-mock')
    expect(terminal).toHaveAttribute('data-theme', 'high-contrast')
    expect(terminal).toHaveAttribute('data-fontsize', '16')
  })
})
