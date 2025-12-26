import React, { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { Terminal } from '../components/Terminal'
import { useTerminal3DMouseFix } from './useTerminal3DMouseFix'
import { connectToBackground, sendMessage } from '../shared/messaging'
import { useProfiles } from '../hooks/useProfiles'
import { useTerminalSessions } from '../hooks/useTerminalSessions'

// Camera controller - mouse movement + zoom
function FocusedCameraController({ locked, onToggleLock }: { locked: boolean; onToggleLock: () => void }) {
  const { camera } = useThree()
  const mousePosition = useRef({ x: 0, y: 0 })
  const lockedPosition = useRef({ x: 0, y: 0 })
  const zoomDistance = useRef(3.5) // Start zoomed in for readability

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!locked) {
        mousePosition.current.x = (event.clientX / window.innerWidth) * 2 - 1
        mousePosition.current.y = -(event.clientY / window.innerHeight) * 2 + 1
      }
    }

    // Wheel behavior depends on lock state:
    // - Unlocked: wheel zooms camera (even over terminal)
    // - Locked: wheel scrolls terminal scrollback (when over terminal)
    const handleWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement
      const isOverTerminal = target.closest('.xterm') !== null

      // When locked and over terminal, let wheel scroll terminal
      if (locked && isOverTerminal) {
        return
      }

      // Otherwise, wheel controls camera zoom
      event.preventDefault()
      event.stopPropagation()
      const zoomSpeed = 0.4
      const delta = event.deltaY > 0 ? zoomSpeed : -zoomSpeed
      // Min 1.5 (very close), max 25 (overview)
      zoomDistance.current = Math.max(1.5, Math.min(25, zoomDistance.current + delta))
    }

    // Keyboard handling - be careful not to intercept terminal input
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isTerminalFocused = target.tagName === 'TEXTAREA' || target.closest('.xterm')

      // F2 always toggles lock, even when terminal is focused
      if (event.code === 'F2') {
        event.preventDefault()
        onToggleLock()
        return
      }

      // If terminal is focused, let all other keys through to xterm
      if (isTerminalFocused) {
        return
      }

      // Escape unfocuses terminal (only when not already in terminal)
      if (event.code === 'Escape') {
        const activeElement = document.activeElement as HTMLElement
        if (activeElement?.closest('.xterm')) {
          activeElement.blur()
          event.preventDefault()
        }
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    // Use capture phase for wheel to intercept before terminal's handler
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false })
    // Use capture phase for keydown to intercept F2 before xterm captures it
    window.addEventListener('keydown', handleKeyDown, { capture: true })

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('wheel', handleWheel, { capture: true })
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
    }
  }, [locked, onToggleLock])

  // Save position when locking
  useEffect(() => {
    if (locked) {
      lockedPosition.current = { ...mousePosition.current }
    }
  }, [locked])

  useFrame(() => {
    const pos = locked ? lockedPosition.current : mousePosition.current
    const targetX = pos.x * 1.5
    const targetY = pos.y * 1

    camera.position.x += (targetX - camera.position.x) * 0.1
    camera.position.y += (targetY - camera.position.y) * 0.1
    camera.position.z += (zoomDistance.current - camera.position.z) * 0.08

    camera.lookAt(0, 0, 0)
  })

  return null
}

// Terminal wrapper with 3D mouse fix
interface Terminal3DWrapperProps {
  sessionName: string
  terminalId: string
  width?: number
  height?: number
  themeName?: string
  fontSize?: number
  fontFamily?: string
  panelColor?: string
  backgroundGradient?: string
  transparency?: number
  isDark?: boolean
}

function Terminal3DWrapper({
  sessionName,
  terminalId,
  width = 1200,
  height = 800,
  themeName = 'high-contrast',
  fontSize = 16,
  fontFamily = 'monospace',
  panelColor = '#000000',
  backgroundGradient,
  transparency = 100,
  isDark = true,
}: Terminal3DWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useTerminal3DMouseFix(containerRef, true)

  return (
    <div
      ref={containerRef}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        background: 'transparent',
        borderRadius: '8px',
        overflow: 'hidden',
        pointerEvents: 'auto',
        boxShadow: '0 0 60px rgba(0, 255, 255, 0.3)',
        border: '1px solid rgba(0, 255, 255, 0.2)',
      }}
      onClick={(e) => {
        const textarea = e.currentTarget.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement
        if (textarea) {
          textarea.focus()
          e.stopPropagation()
        }
      }}
    >
      <Terminal
        key={terminalId}
        terminalId={terminalId}
        sessionName={sessionName}
        isActive={true}
        onClose={() => window.close()}
        themeName={themeName}
        fontSize={fontSize}
        fontFamily={fontFamily}
        panelColor={panelColor}
        backgroundGradient={backgroundGradient}
        transparency={transparency}
        isDark={isDark}
      />
    </div>
  )
}

// Main 3D Terminal Display
interface TerminalDisplayProps {
  sessionName: string
  terminalId: string
  themeName?: string
  fontSize?: number
  fontFamily?: string
  panelColor?: string
  backgroundGradient?: string
  transparency?: number
  isDark?: boolean
}

function TerminalDisplay({
  sessionName,
  terminalId,
  themeName,
  fontSize,
  fontFamily,
  panelColor,
  backgroundGradient,
  transparency,
  isDark,
}: TerminalDisplayProps) {
  const terminalWidth = 1200
  const terminalHeight = 800

  return (
    <group>
      <Html
        transform
        distanceFactor={1}
        position={[0, 0, 0.01]}
        style={{
          width: `${terminalWidth}px`,
          height: `${terminalHeight}px`,
          pointerEvents: 'auto',
        }}
      >
        <Terminal3DWrapper
          sessionName={sessionName}
          terminalId={terminalId}
          width={terminalWidth}
          height={terminalHeight}
          themeName={themeName}
          fontSize={fontSize}
          fontFamily={fontFamily}
          panelColor={panelColor}
          backgroundGradient={backgroundGradient}
          transparency={transparency}
          isDark={isDark}
        />
      </Html>
    </group>
  )
}

// Main scene component
export default function FocusScene() {
  const [sessionName, setSessionName] = useState<string>('')
  const [terminalId, setTerminalId] = useState<string>('')
  const [cameraLocked, setCameraLocked] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const [wsConnected, setWsConnected] = useState(false)
  const portRef = useRef<chrome.runtime.Port | null>(null)

  // Use profiles hook to get current profile settings (syncs with Chrome storage)
  const { profiles } = useProfiles({})

  // Use terminal sessions hook to get session with appearance overrides
  const {
    sessions,
    handleWebSocketMessage,
  } = useTerminalSessions({
    wsConnected,
    profiles,
    getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
  })

  // Find the target session from sessions list (includes appearance overrides)
  const targetSession = sessions.find(s => s.id === terminalId || s.sessionName === sessionName)

  // Get current profile settings (updates when profiles change in settings)
  const sessionProfileId = targetSession?.profile?.id
  const currentProfile = sessionProfileId ? profiles.find(p => p.id === sessionProfileId) : null
  const defaultProfile = profiles.find(p => p.id === 'default') || profiles[0]
  const effectiveProfile = currentProfile || defaultProfile

  // Get theme settings - session overrides take precedence over profile settings
  const themeName = targetSession?.appearanceOverrides?.themeName ?? effectiveProfile?.themeName ?? 'high-contrast'
  const fontSize = effectiveProfile?.fontSize || 16
  const fontFamily = targetSession?.appearanceOverrides?.fontFamily ?? effectiveProfile?.fontFamily ?? 'monospace'
  const panelColor = targetSession?.appearanceOverrides?.panelColor ?? effectiveProfile?.panelColor ?? '#000000'
  const backgroundGradient = targetSession?.appearanceOverrides?.backgroundGradient ?? effectiveProfile?.backgroundGradient
  const transparency = targetSession?.appearanceOverrides?.transparency ?? effectiveProfile?.transparency ?? 100

  // Connect to background worker for WebSocket messages (needed for session data)
  useEffect(() => {
    const port = connectToBackground('3d-focus', (message) => {
      if (message.type === 'INITIAL_STATE') {
        setWsConnected(message.wsConnected)
      } else if (message.type === 'WS_CONNECTED') {
        setWsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        setWsConnected(false)
      } else if (message.type === 'WS_MESSAGE') {
        handleWebSocketMessage(message.data)
      }
    })

    portRef.current = port

    return () => {
      port.disconnect()
      portRef.current = null
    }
  }, [handleWebSocketMessage])

  // Load dark mode preference and listen for changes
  useEffect(() => {
    chrome.storage.local.get(['isDark'], (result) => {
      if (typeof result.isDark === 'boolean') {
        setIsDark(result.isDark)
      }
    })

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.isDark && typeof changes.isDark.newValue === 'boolean') {
        setIsDark(changes.isDark.newValue)
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  useEffect(() => {
    // Get session info from URL params
    const params = new URLSearchParams(window.location.search)
    const session = params.get('session') || ''
    // Use session name as terminal ID for consistency with sidebar
    const id = params.get('id') || session || `3d-${Date.now()}`

    setSessionName(session)
    setTerminalId(id)

    // Set page title
    document.title = session ? `3D Focus: ${session}` : '3D Focus Mode'

    // Attach to existing tmux session and notify sidebar
    if (session) {
      console.log('[3D Focus] Attaching to session:', session)
      sendMessage({
        type: 'OPEN_SESSION',
        sessionName: session,
      })
      // Tell sidebar this terminal is now in 3D focus mode
      sendMessage({
        type: 'FOCUS_IN_3D',
        terminalId: id,
      })
    }

    // Send message when 3D page closes to return terminal to sidebar
    const handleClose = () => {
      if (id) {
        sendMessage({
          type: 'RETURN_FROM_3D',
          terminalId: id,
        })
      }
    }

    window.addEventListener('beforeunload', handleClose)
    return () => {
      window.removeEventListener('beforeunload', handleClose)
      handleClose() // Also call on unmount
    }
  }, [])

  if (!sessionName) {
    return (
      <div style={{
        width: '100vw',
        height: '100vh',
        background: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#00ffff',
        fontFamily: 'monospace',
        fontSize: '18px',
      }}>
        No session specified. Use ?session=session-name
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: panelColor }}>
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 60 }}
        dpr={Math.min(window.devicePixelRatio, 2)}
        gl={{
          antialias: true,
          toneMapping: THREE.NoToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <ambientLight intensity={0.5} />

        {/* Starfield background */}
        <Stars radius={100} depth={50} count={2000} factor={4} fade speed={1} />

        {/* Terminal */}
        <TerminalDisplay
          sessionName={sessionName}
          terminalId={terminalId}
          themeName={themeName}
          fontSize={fontSize}
          fontFamily={fontFamily}
          panelColor={panelColor}
          backgroundGradient={backgroundGradient}
          transparency={transparency}
          isDark={isDark}
        />

        {/* Camera controller */}
        <FocusedCameraController locked={cameraLocked} onToggleLock={() => setCameraLocked(l => !l)} />
      </Canvas>

      {/* Minimal UI */}
      <div style={{
        position: 'absolute',
        top: 16,
        left: 16,
        color: '#00ffff',
        fontFamily: 'monospace',
        fontSize: '12px',
        opacity: 0.7,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>3D Focus Mode</span>
          {cameraLocked && (
            <span style={{
              background: '#00ff00',
              color: '#000',
              padding: '2px 6px',
              borderRadius: 3,
              fontSize: 10,
            }}>
              LOCKED
            </span>
          )}
        </div>
        <div style={{ color: '#00ff00', marginTop: 4, opacity: 0.8 }}>
          Scroll: zoom | F2: {cameraLocked ? 'unlock' : 'lock'} | Esc: unfocus terminal
        </div>
      </div>

      {/* Top-right controls */}
      <div style={{
        position: 'absolute',
        top: 16,
        right: 16,
        display: 'flex',
        gap: 8,
      }}>
        {/* Return to Sidebar button */}
        <button
          onClick={() => window.close()}
          style={{
            background: 'rgba(0, 255, 255, 0.1)',
            border: '1px solid rgba(0, 255, 255, 0.3)',
            color: '#00ffff',
            padding: '8px 16px',
            borderRadius: 6,
            fontFamily: 'monospace',
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.2)'
            e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 255, 255, 0.1)'
            e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.3)'
          }}
        >
          ← Return to Sidebar
        </button>
      </div>

      {/* Session info */}
      <div style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        color: '#00ff00',
        fontFamily: 'monospace',
        fontSize: '11px',
        opacity: 0.6,
      }}>
        {sessionName}
      </div>
    </div>
  )
}
