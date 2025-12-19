import { useEffect, useState, useCallback, useRef } from 'react'
import type { Profile, AudioSettings } from '../components/SettingsModal'
import type { ClaudeStatus } from './useClaudeStatus'

// Re-export types that consumers need
export type { AudioSettings }

// Strip emojis from text for cleaner TTS announcements
// Matches most emoji ranges: emoticons, symbols, pictographs, transport, flags, etc.
const stripEmojis = (text: string): string => {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Symbols, pictographs, emoticons
    .replace(/[\u{2600}-\u{26FF}]/gu, '')   // Misc symbols (☀️, ⚡, etc.)
    .replace(/[\u{2700}-\u{27BF}]/gu, '')   // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')   // Variation selectors
    .replace(/[\u{1F000}-\u{1F02F}]/gu, '') // Mahjong, dominos
    .replace(/[\u{1F0A0}-\u{1F0FF}]/gu, '') // Playing cards
    .trim()
    .replace(/\s+/g, ' ') // Collapse multiple spaces from removed emojis
}

// Voice pool for auto-assignment (rotates through these when no profile override)
const VOICE_POOL = [
  'en-US-AndrewMultilingualNeural',  // Andrew (US Male)
  'en-US-EmmaMultilingualNeural',    // Emma (US Female)
  'en-GB-SoniaNeural',               // Sonia (UK Female)
  'en-GB-RyanNeural',                // Ryan (UK Male)
  'en-AU-NatashaNeural',             // Natasha (AU Female)
  'en-AU-WilliamNeural',             // William (AU Male)
  'en-US-BrianMultilingualNeural',   // Brian (US Male)
  'en-US-AriaNeural',                // Aria (US Female)
  'en-US-GuyNeural',                 // Guy (US Male)
  'en-US-JennyNeural',               // Jenny (US Female)
]

interface TerminalSession {
  id: string
  name: string
  profile?: Profile
  assignedVoice?: string
}

export interface UseAudioNotificationsParams {
  sessions: TerminalSession[]
  claudeStatuses: Map<string, ClaudeStatus>
}

export interface UseAudioNotificationsReturn {
  audioSettings: AudioSettings
  audioGlobalMute: boolean
  setAudioGlobalMute: (mute: boolean) => void
  getNextAvailableVoice: () => string
  getAudioSettingsForProfile: (profile?: Profile, assignedVoice?: string) => { voice: string; rate: string; volume: number; enabled: boolean }
  playAudio: (text: string, session?: TerminalSession, isToolAnnouncement?: boolean) => Promise<void>
  markSessionDetached: (sessionId: string) => void
}

const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: false,
  volume: 0.7,
  voice: 'en-US-AndrewMultilingualNeural',
  rate: '+0%',
  events: { ready: true, sessionStart: false, tools: false, toolDetails: false, subagents: false },
  toolDebounceMs: 1000,
}

/**
 * Hook to manage audio notifications for Claude status changes
 * - Loads audio settings and category settings from Chrome storage
 * - Tracks Claude status transitions and plays appropriate announcements
 * - Handles voice pool rotation for multi-terminal scenarios
 */
export function useAudioNotifications({ sessions, claudeStatuses }: UseAudioNotificationsParams): UseAudioNotificationsReturn {
  const [audioSettings, setAudioSettings] = useState<AudioSettings>(DEFAULT_AUDIO_SETTINGS)
  const [audioGlobalMute, setAudioGlobalMute] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  // Refs for tracking state transitions
  const prevClaudeStatusesRef = useRef<Map<string, string>>(new Map())
  const prevToolNamesRef = useRef<Map<string, string>>(new Map())
  const prevSubagentCountsRef = useRef<Map<string, number>>(new Map())
  const lastAudioTimeRef = useRef<number>(0)
  const lastToolAudioTimeRef = useRef<number>(0)
  // Track when we last announced "ready" for each terminal to prevent duplicates
  // This is a backup safeguard in case prevStatus ref gets reset somehow
  const lastReadyAnnouncementRef = useRef<Map<string, number>>(new Map())
  // Track last_updated timestamps to filter stale status files (Codex fix)
  const lastStatusUpdateRef = useRef<Map<string, string>>(new Map())
  // Track announced sessions for session-start audio (Codex fix)
  // Store session info (name + voice) so we can announce with correct voice when closed
  const announcedSessionsRef = useRef<Map<string, { name: string; voice?: string }>>(new Map())
  // Track sessions that were detached (not killed) - these say "detached" instead of "closed"
  const detachedSessionsRef = useRef<Set<string>>(new Set())
  // Track if this is initial load (don't announce restored sessions)
  const initialLoadRef = useRef(true)

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true)
  const mountIdRef = useRef(Math.random().toString(36).slice(2, 8))

  // Track mount/unmount for debugging (logs removed to reduce console spam)
  useEffect(() => {
    return () => {
      // Cleanup on unmount
    }
  }, [])

  // Load audio settings from Chrome storage
  useEffect(() => {
    isMountedRef.current = true

    chrome.storage.local.get(['audioSettings', 'audioGlobalMute'], (result) => {
      if (!isMountedRef.current) return

      if (result.audioSettings && typeof result.audioSettings === 'object') {
        setAudioSettings(prev => ({ ...prev, ...(result.audioSettings as Partial<AudioSettings>) }))
      }
      if (typeof result.audioGlobalMute === 'boolean') {
        setAudioGlobalMute(result.audioGlobalMute)
      }
      setSettingsLoaded(true)
    })

    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Save audio mute state when it changes
  useEffect(() => {
    chrome.storage.local.set({ audioGlobalMute })
  }, [audioGlobalMute])

  // Listen for audioSettings changes from settings modal
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (!isMountedRef.current) return
      if (changes.audioSettings?.newValue && typeof changes.audioSettings.newValue === 'object') {
        setAudioSettings(prev => ({ ...prev, ...(changes.audioSettings.newValue as Partial<AudioSettings>) }))
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Mark initial load complete after first render with sessions
  // This prevents announcing restored sessions on page load
  useEffect(() => {
    if (sessions.length > 0 && initialLoadRef.current) {
      // Give a short delay to let restored sessions populate
      const timer = setTimeout(() => {
        // Mark all current sessions as already announced (store their names + voices)
        sessions.forEach(s => {
          const displayName = s.profile?.name || s.name || 'Terminal'
          announcedSessionsRef.current.set(s.id, { name: displayName, voice: s.assignedVoice })
        })
        initialLoadRef.current = false
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [sessions.length])

  // Get the next available voice from the pool (round-robin based on active sessions)
  const getNextAvailableVoice = useCallback((): string => {
    const usedVoices = sessions
      .filter(s => s.assignedVoice)
      .map(s => s.assignedVoice!)

    // Find first unused voice
    for (const voice of VOICE_POOL) {
      if (!usedVoices.includes(voice)) {
        return voice
      }
    }

    // All voices used - pick based on session count (round-robin)
    return VOICE_POOL[sessions.length % VOICE_POOL.length]
  }, [sessions])

  // Get merged audio settings for a profile (global + profile overrides)
  // Logic matrix:
  // | Header Mute | Profile Mode | Result |
  // |-------------|--------------|--------|
  // | OFF (🔊)    | default      | ✅ Plays (if audioSettings.enabled) |
  // | OFF (🔊)    | enabled      | ✅ Plays |
  // | OFF (🔊)    | disabled     | ❌ Silent |
  // | ON (🔇)     | default      | ❌ Silent (master mute) |
  // | ON (🔇)     | enabled      | ❌ Silent (master mute) |
  // | ON (🔇)     | disabled     | ❌ Silent |
  const getAudioSettingsForProfile = useCallback((profile?: Profile, assignedVoice?: string): { voice: string; rate: string; volume: number; enabled: boolean } => {
    const overrides = profile?.audioOverrides
    const mode = overrides?.mode || 'default'

    // Determine if audio is enabled for this profile
    let enabled = false
    if (mode === 'disabled') {
      // Profile explicitly disabled - never plays
      enabled = false
    } else if (audioGlobalMute) {
      // Master mute is on - nothing plays
      enabled = false
    } else if (mode === 'enabled') {
      // Profile explicitly enabled - plays (respects master mute above)
      enabled = true
    } else {
      // mode === 'default' - follow global settings
      enabled = audioSettings.enabled
    }

    // Determine voice: profile override > global setting > auto-assigned fallback
    let voice: string
    if (overrides?.voice) {
      // Profile has explicit voice override
      voice = overrides.voice
    } else if (audioSettings.voice === 'random') {
      // Global setting is "random" - use auto-assigned voice for this terminal
      voice = assignedVoice || VOICE_POOL[0]
    } else if (audioSettings.voice) {
      // Global setting is a specific voice
      voice = audioSettings.voice
    } else {
      // Fallback
      voice = assignedVoice || 'en-US-AndrewMultilingualNeural'
    }

    return {
      voice,
      rate: overrides?.rate || audioSettings.rate,
      volume: audioSettings.volume,
      enabled,
    }
  }, [audioGlobalMute, audioSettings])

  // Audio playback helper - plays MP3 from backend cache via Chrome
  const playAudio = useCallback(async (text: string, session?: TerminalSession, isToolAnnouncement = false) => {
    const settings = getAudioSettingsForProfile(session?.profile, session?.assignedVoice)
    if (!settings.enabled) return

    // Strip emojis for cleaner TTS (e.g., "🟠 Amber Claude" → "Amber Claude")
    const cleanText = stripEmojis(text)

    // Debounce: use separate timers for tools vs other announcements
    const now = Date.now()
    if (isToolAnnouncement) {
      const timeSinceLast = now - lastToolAudioTimeRef.current
      if (timeSinceLast < audioSettings.toolDebounceMs) return
      lastToolAudioTimeRef.current = now
    } else {
      const timeSinceLast = now - lastAudioTimeRef.current
      if (timeSinceLast < 1000) return
      lastAudioTimeRef.current = now
    }

    try {
      // Request audio generation from backend (uses edge-tts with caching)
      // Use AbortController for fast timeout - don't let failed requests pile up
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout

      const response = await fetch('http://localhost:8129/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          voice: settings.voice,
          rate: settings.rate
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      const data = await response.json()

      if (data.success && data.url) {
        const audio = new Audio(data.url)
        audio.volume = settings.volume
        audio.play().catch(err => console.warn('[Audio] Playback failed:', err.message))
      }
    } catch {
      // Silently ignore errors (timeouts, network issues) to prevent console spam
    }
  }, [getAudioSettingsForProfile, audioSettings.toolDebounceMs])

  // SESSION START: Announce new sessions when they're spawned (Codex fix)
  useEffect(() => {
    // Skip until settings are loaded from Chrome storage (prevents race condition on first spawn)
    if (!settingsLoaded) return
    // Skip if sessionStart audio is disabled or master mute is on
    if (!audioSettings.events.sessionStart || audioGlobalMute) return
    // Skip during initial load (restored sessions shouldn't announce)
    if (initialLoadRef.current) return

    sessions.forEach(session => {
      if (!announcedSessionsRef.current.has(session.id)) {
        const displayName = session.profile?.name || session.name || 'Terminal'
        announcedSessionsRef.current.set(session.id, { name: displayName, voice: session.assignedVoice })

        const settings = getAudioSettingsForProfile(session.profile, session.assignedVoice)
        if (settings.enabled) {
          playAudio(`${displayName} started`, session)
        }
      }
    })

    // Announce and clean up removed sessions
    for (const [id, sessionInfo] of announcedSessionsRef.current) {
      if (!sessions.find(s => s.id === id)) {
        // Check if session was detached (not killed)
        const wasDetached = detachedSessionsRef.current.has(id)
        if (audioSettings.events.sessionStart) {
          // Create a minimal session object with the stored voice for playAudio
          const closedSession = { id, name: sessionInfo.name, assignedVoice: sessionInfo.voice } as TerminalSession
          playAudio(`${sessionInfo.name} ${wasDetached ? 'detached' : 'closed'}`, closedSession)
        }
        announcedSessionsRef.current.delete(id)
        detachedSessionsRef.current.delete(id)
      }
    }
  }, [sessions, audioSettings.events.sessionStart, audioGlobalMute, settingsLoaded, getAudioSettingsForProfile, playAudio])

  // Watch Claude status changes and trigger audio notifications
  useEffect(() => {
    // Skip until settings are loaded from Chrome storage
    if (!settingsLoaded) return
    // If master mute is on, no audio plays regardless of profile settings
    if (audioGlobalMute) return

    // Check each terminal for status transitions
    claudeStatuses.forEach((status, terminalId) => {
      const prevStatus = prevClaudeStatusesRef.current.get(terminalId)
      const prevSubagentCount = prevSubagentCountsRef.current.get(terminalId) || 0
      const currentStatus = status.status
      const currentSubagentCount = status.subagent_count || 0

      // Find the session to get its profile and assigned voice
      const session = sessions.find(s => s.id === terminalId)

      // Check if audio is enabled for this profile (uses getAudioSettingsForProfile logic)
      const audioForProfile = getAudioSettingsForProfile(session?.profile, session?.assignedVoice)
      if (!audioForProfile.enabled) {
        prevClaudeStatusesRef.current.set(terminalId, currentStatus)
        prevSubagentCountsRef.current.set(terminalId, currentSubagentCount)
        return
      }

      // Get the display name for announcements
      const getDisplayName = () => {
        if (!session) return 'Claude'
        const baseName = session.profile?.name || session.name || 'Claude'
        const sameNameSessions = sessions.filter(s =>
          (s.profile?.name || s.name) === baseName
        )
        if (sameNameSessions.length > 1) {
          const index = sameNameSessions.findIndex(s => s.id === terminalId) + 1
          return `${baseName} ${index}`
        }
        return baseName
      }

      // EVENT: Ready notification (processing/tool_use → awaiting_input)
      // Multiple safeguards (Codex fixes):
      // 1. Check prevStatus transition (should only fire once per work→ready)
      // 2. 30-second cooldown per terminal (backup if refs get reset)
      // 3. last_updated gating - only fire if status file actually updated
      const now = Date.now()
      const lastReadyTime = lastReadyAnnouncementRef.current.get(terminalId) || 0
      const cooldownMs = 30000 // 30 seconds minimum between ready announcements

      // Check for REAL transition: must have been working, now ready
      const wasWorking = prevStatus === 'processing' || prevStatus === 'tool_use'
      const isNowReady = currentStatus === 'awaiting_input' || currentStatus === 'idle'
      const isValidTransition = wasWorking && isNowReady && currentSubagentCount === 0
      const cooldownPassed = (now - lastReadyTime) > cooldownMs

      // NEW: last_updated gating - prevent stale status files from triggering audio
      // If status hasn't actually updated since our last announcement, skip it
      const currentLastUpdated = status.last_updated || ''
      const prevLastUpdated = lastStatusUpdateRef.current.get(terminalId) || ''
      const isStatusFresh = currentLastUpdated !== prevLastUpdated && currentLastUpdated !== ''

      // Also reject status files older than 5 seconds (stale heartbeats)
      const statusAge = currentLastUpdated ? (now - new Date(currentLastUpdated).getTime()) : Infinity
      const isNotStale = statusAge < 5000


      // Include freshness checks in the decision (Codex fix for flapping status)
      const shouldPlayReady = audioSettings.events.ready &&
                              isValidTransition &&
                              cooldownPassed &&
                              isStatusFresh &&
                              isNotStale

      if (shouldPlayReady) {
        lastReadyAnnouncementRef.current.set(terminalId, now)
        lastStatusUpdateRef.current.set(terminalId, currentLastUpdated) // Track to prevent re-triggering
        const displayName = getDisplayName()
        playAudio(`${displayName} ready`, session)
      }

      // EVENT: Tool announcements
      // Trigger when: tool_use status with a NEW tool invocation
      // Track by tool name + description/file_path to catch consecutive same-tool calls (e.g., multiple Bash)
      const prevToolKey = prevToolNamesRef.current.get(terminalId) || ''
      const currentToolName = status.current_tool || ''
      const toolDetail = status.details?.args?.description || status.details?.args?.file_path || status.details?.args?.pattern || ''
      const currentToolKey = `${currentToolName}:${toolDetail}`
      const isActiveStatus = currentStatus === 'tool_use' || currentStatus === 'processing'
      const isNewTool = currentToolName !== '' && currentToolKey !== prevToolKey

      // Skip internal Claude session files (session memory updates)
      // Only applies to file operations (Read/Edit/Write), not Bash/Grep/etc.
      const filePath = status.details?.args?.file_path || ''
      const isInternalFile = filePath && (filePath.includes('/.claude/') || filePath.includes('/session-memory/'))

      if (audioSettings.events.tools && isActiveStatus && isNewTool && !isInternalFile) {
        let announcement = ''
        switch (currentToolName) {
          case 'Read': announcement = 'Reading'; break
          case 'Write': announcement = 'Writing'; break
          case 'Edit': announcement = 'Edit'; break
          case 'Bash': announcement = 'Running command'; break
          case 'Glob': announcement = 'Searching files'; break
          case 'Grep': announcement = 'Searching code'; break
          case 'Task': announcement = 'Spawning agent'; break
          case 'WebFetch': announcement = 'Fetching web'; break
          case 'WebSearch': announcement = 'Searching web'; break
          default: announcement = `Using ${currentToolName}`
        }

        // Add file details if enabled
        if (audioSettings.events.toolDetails && status.details?.args) {
          const args = status.details.args
          if (args.file_path) {
            // Extract just the filename from the path
            const parts = args.file_path.split('/')
            const filename = parts[parts.length - 1]
            announcement += ` ${filename}`
          } else if (args.pattern && (currentToolName === 'Glob' || currentToolName === 'Grep')) {
            // Add search pattern for search tools
            announcement += ` for ${args.pattern}`
          } else if (currentToolName === 'Bash' && args.description) {
            // Add command description for Bash (Claude provides a short description)
            announcement = args.description
          }
        }

        playAudio(announcement, session, true)
      }

      // Update previous tool key (name + detail)
      prevToolNamesRef.current.set(terminalId, currentToolKey)

      // EVENT: Subagent count changes
      if (audioSettings.events.subagents && currentSubagentCount !== prevSubagentCount) {
        if (currentSubagentCount > prevSubagentCount) {
          // New subagent spawned
          playAudio(`${currentSubagentCount} agent${currentSubagentCount > 1 ? 's' : ''} running`, session, true)
        } else if (currentSubagentCount === 0 && prevSubagentCount > 0) {
          // All subagents finished
          playAudio('All agents complete', session)
        }
      }

      // Update previous values
      prevClaudeStatusesRef.current.set(terminalId, currentStatus)
      prevSubagentCountsRef.current.set(terminalId, currentSubagentCount)
    })

    // Clean up removed terminals from prev refs
    for (const id of prevClaudeStatusesRef.current.keys()) {
      if (!claudeStatuses.has(id)) {
        prevClaudeStatusesRef.current.delete(id)
        prevToolNamesRef.current.delete(id)
        prevSubagentCountsRef.current.delete(id)
      }
    }
  }, [claudeStatuses, audioSettings, audioGlobalMute, settingsLoaded, sessions, getAudioSettingsForProfile, playAudio])

  // Mark a session as detached (so it announces "detached" instead of "closed")
  const markSessionDetached = useCallback((sessionId: string) => {
    detachedSessionsRef.current.add(sessionId)
  }, [])

  return {
    audioSettings,
    audioGlobalMute,
    setAudioGlobalMute,
    getNextAvailableVoice,
    getAudioSettingsForProfile,
    playAudio,
    markSessionDetached,
  }
}
