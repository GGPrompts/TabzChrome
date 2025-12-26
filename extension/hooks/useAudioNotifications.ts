import type { AudioSettings } from '../components/SettingsModal'
import type { ClaudeStatus } from './useClaudeStatus'
import { useAudioPlayback, type TerminalSession } from './useAudioPlayback'
import { useStatusTransitions } from './useStatusTransitions'
import { useSessionAnnouncements } from './useSessionAnnouncements'

// Re-export types that consumers need
export type { AudioSettings }
export type { TerminalSession }

export interface UseAudioNotificationsParams {
  sessions: TerminalSession[]
  claudeStatuses: Map<string, ClaudeStatus>
  /** When true, audio is completely disabled (for popout windows to prevent duplicate announcements) */
  isPopoutMode?: boolean
}

export interface UseAudioNotificationsReturn {
  audioSettings: AudioSettings
  audioGlobalMute: boolean
  setAudioGlobalMute: (mute: boolean) => void
  getNextAvailableVoice: () => string
  getAudioSettingsForProfile: (
    profile?: TerminalSession['profile'],
    assignedVoice?: string
  ) => { voice: string; rate: string; pitch: string; volume: number; enabled: boolean }
  playAudio: (
    text: string,
    session?: TerminalSession,
    isToolAnnouncement?: boolean
  ) => Promise<void>
  markSessionDetached: (sessionId: string) => void
}

/**
 * Hook to manage audio notifications for Claude status changes.
 * Composes smaller focused hooks for:
 * - Audio playback and settings (useAudioPlayback)
 * - Status transitions and announcements (useStatusTransitions)
 * - Session start/close announcements (useSessionAnnouncements)
 */
export function useAudioNotifications({
  sessions,
  claudeStatuses,
  isPopoutMode = false,
}: UseAudioNotificationsParams): UseAudioNotificationsReturn {
  // Core audio playback and settings
  const {
    audioSettings,
    audioGlobalMute,
    setAudioGlobalMute,
    settingsLoaded,
    getNextAvailableVoice,
    getAudioSettingsForProfile,
    playAudio,
  } = useAudioPlayback({ sessions })

  // In popout mode, treat audio as globally muted to prevent duplicate announcements
  // The sidebar still tracks all terminals and plays audio - popouts should be silent
  const effectiveGlobalMute = audioGlobalMute || isPopoutMode

  // Status transition tracking (ready, tools, subagents, context alerts)
  useStatusTransitions({
    sessions,
    claudeStatuses,
    audioSettings,
    audioGlobalMute: effectiveGlobalMute,
    settingsLoaded,
    getAudioSettingsForProfile,
    playAudio,
  })

  // Session lifecycle announcements (start/close)
  const { markSessionDetached } = useSessionAnnouncements({
    sessions,
    audioSettings,
    audioGlobalMute: effectiveGlobalMute,
    settingsLoaded,
    getAudioSettingsForProfile,
    playAudio,
  })

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
