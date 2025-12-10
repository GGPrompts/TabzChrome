import { useEffect, useState, useCallback, useRef } from 'react'
import type { Profile, AudioSettings } from '../components/SettingsModal'
import type { ClaudeStatus } from './useClaudeStatus'

// Re-export types that consumers need
export type { AudioSettings }

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

  // Refs for tracking state transitions
  const prevClaudeStatusesRef = useRef<Map<string, string>>(new Map())
  const prevToolNamesRef = useRef<Map<string, string>>(new Map())
  const prevSubagentCountsRef = useRef<Map<string, number>>(new Map())
  const lastAudioTimeRef = useRef<number>(0)
  const lastToolAudioTimeRef = useRef<number>(0)

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true)

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

    return {
      // Voice priority: 1. Profile override, 2. Auto-assigned voice, 3. Global default
      voice: overrides?.voice || assignedVoice || audioSettings.voice,
      rate: overrides?.rate || audioSettings.rate,
      volume: audioSettings.volume,
      enabled,
    }
  }, [audioGlobalMute, audioSettings])

  // Audio playback helper - plays MP3 from backend cache via Chrome
  const playAudio = useCallback(async (text: string, session?: TerminalSession, isToolAnnouncement = false) => {
    const settings = getAudioSettingsForProfile(session?.profile, session?.assignedVoice)
    if (!settings.enabled) return

    // Debounce: use separate timers for tools vs other announcements
    const now = Date.now()
    if (isToolAnnouncement) {
      if (now - lastToolAudioTimeRef.current < audioSettings.toolDebounceMs) return
      lastToolAudioTimeRef.current = now
    } else {
      if (now - lastAudioTimeRef.current < 1000) return
      lastAudioTimeRef.current = now
    }

    try {
      // Request audio generation from backend (uses edge-tts with caching)
      const response = await fetch('http://localhost:8129/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: settings.voice,
          rate: settings.rate
        })
      })
      const data = await response.json()

      if (data.success && data.url) {
        const audio = new Audio(data.url)
        audio.volume = settings.volume
        audio.play().catch(err => console.warn('[Audio] Playback failed:', err.message))
      }
    } catch (err) {
      console.warn('[Audio] Failed to generate/play:', err)
    }
  }, [getAudioSettingsForProfile, audioSettings.toolDebounceMs])

  // Watch Claude status changes and trigger audio notifications
  useEffect(() => {
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
      const shouldPlayReady = audioSettings.events.ready &&
          (prevStatus === 'processing' || prevStatus === 'tool_use') &&
          currentStatus === 'awaiting_input' &&
          currentSubagentCount === 0

      if (shouldPlayReady) {
        playAudio(`${getDisplayName()} ready`, session)
      }

      // EVENT: Tool announcements
      // Trigger when: tool_use status, OR processing/tool_use with a NEW tool name
      // This catches tools even if we poll during 'processing' state (post-tool)
      const prevToolName = prevToolNamesRef.current.get(terminalId) || ''
      const currentToolName = status.current_tool || ''
      const isActiveStatus = currentStatus === 'tool_use' || currentStatus === 'processing'
      const isNewTool = currentToolName !== '' && currentToolName !== prevToolName

      // Skip internal Claude session files (session memory updates)
      const filePath = status.details?.args?.file_path || ''
      const isInternalFile = filePath.includes('/.claude/') || filePath.includes('/session-memory/')

      if (audioSettings.events.tools && isActiveStatus && isNewTool && !isInternalFile) {
        let announcement = ''
        switch (currentToolName) {
          case 'Read': announcement = 'Reading'; break
          case 'Write': announcement = 'Writing'; break
          case 'Edit': announcement = 'Editing'; break
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
          }
        }

        playAudio(announcement, session, true)
      }

      // Update previous tool name
      prevToolNamesRef.current.set(terminalId, currentToolName)

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
  }, [claudeStatuses, audioSettings, audioGlobalMute, sessions, getAudioSettingsForProfile, playAudio])

  return {
    audioSettings,
    audioGlobalMute,
    setAudioGlobalMute,
    getNextAvailableVoice,
    getAudioSettingsForProfile,
    playAudio,
  }
}
