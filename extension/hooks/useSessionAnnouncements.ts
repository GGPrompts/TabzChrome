import { useEffect, useRef, useCallback } from 'react'
import type { Profile, AudioSettings } from '../components/SettingsModal'

export interface TerminalSession {
  id: string
  name: string
  profile?: Profile
  assignedVoice?: string
}

interface SessionInfo {
  name: string
  voice?: string
}

export interface UseSessionAnnouncementsParams {
  sessions: TerminalSession[]
  audioSettings: AudioSettings
  audioGlobalMute: boolean
  settingsLoaded: boolean
  getAudioSettingsForProfile: (profile?: Profile, assignedVoice?: string) => {
    voice: string
    rate: string
    pitch: string
    volume: number
    enabled: boolean
  }
  playAudio: (text: string, session?: TerminalSession, isToolAnnouncement?: boolean) => Promise<void>
}

export interface UseSessionAnnouncementsReturn {
  markSessionDetached: (sessionId: string) => void
}

/**
 * Hook to announce session start/close events.
 * Tracks session lifecycle and plays appropriate announcements.
 */
export function useSessionAnnouncements({
  sessions,
  audioSettings,
  audioGlobalMute,
  settingsLoaded,
  getAudioSettingsForProfile,
  playAudio,
}: UseSessionAnnouncementsParams): UseSessionAnnouncementsReturn {
  // Track announced sessions (name + voice for closure announcement)
  const announcedSessionsRef = useRef<Map<string, SessionInfo>>(new Map())
  // Track detached sessions (say "detached" instead of "closed")
  const detachedSessionsRef = useRef<Set<string>>(new Set())
  // Track if this is initial load (don't announce restored sessions)
  const initialLoadRef = useRef(true)

  // Mark initial load complete after first render with sessions
  useEffect(() => {
    if (sessions.length > 0 && initialLoadRef.current) {
      const timer = setTimeout(() => {
        sessions.forEach(s => {
          const displayName = s.profile?.name || s.name || 'Terminal'
          announcedSessionsRef.current.set(s.id, { name: displayName, voice: s.assignedVoice })
        })
        initialLoadRef.current = false
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [sessions.length])

  // Announce new and closed sessions
  useEffect(() => {
    if (!settingsLoaded) return
    if (!audioSettings.events.sessionStart || audioGlobalMute) return
    if (initialLoadRef.current) return

    // Announce new sessions
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
        const wasDetached = detachedSessionsRef.current.has(id)
        if (audioSettings.events.sessionStart) {
          const closedSession = { id, name: sessionInfo.name, assignedVoice: sessionInfo.voice } as TerminalSession
          playAudio(`${sessionInfo.name} ${wasDetached ? 'detached' : 'closed'}`, closedSession)
        }
        announcedSessionsRef.current.delete(id)
        detachedSessionsRef.current.delete(id)
      }
    }
  }, [sessions, audioSettings.events.sessionStart, audioGlobalMute, settingsLoaded, getAudioSettingsForProfile, playAudio])

  // Mark a session as detached (announces "detached" instead of "closed")
  const markSessionDetached = useCallback((sessionId: string) => {
    detachedSessionsRef.current.add(sessionId)
  }, [])

  return { markSessionDetached }
}
