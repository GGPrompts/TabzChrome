import { useEffect, useRef } from 'react'
import type { Profile, AudioSettings } from '../components/SettingsModal'
import type { ClaudeStatus } from './useClaudeStatus'
import {
  CONTEXT_THRESHOLDS,
  READY_ANNOUNCEMENT_COOLDOWN_MS,
  STATUS_FRESHNESS_MS,
} from '../constants/audioVoices'

export interface TerminalSession {
  id: string
  name: string
  profile?: Profile
  assignedVoice?: string
}

export interface UseStatusTransitionsParams {
  sessions: TerminalSession[]
  claudeStatuses: Map<string, ClaudeStatus>
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
  playAudio: (
    text: string,
    session?: TerminalSession,
    isToolAnnouncement?: boolean,
    overrides?: { pitch?: string; rate?: string }
  ) => Promise<void>
}

/**
 * Hook to track Claude status transitions and trigger appropriate audio notifications.
 * Handles: ready announcements, tool announcements, subagent changes, and context alerts.
 */
export function useStatusTransitions({
  sessions,
  claudeStatuses,
  audioSettings,
  audioGlobalMute,
  settingsLoaded,
  getAudioSettingsForProfile,
  playAudio,
}: UseStatusTransitionsParams): void {
  // Refs for tracking state transitions
  const prevClaudeStatusesRef = useRef<Map<string, string>>(new Map())
  const prevToolNamesRef = useRef<Map<string, string>>(new Map())
  const prevSubagentCountsRef = useRef<Map<string, number>>(new Map())
  const prevContextPctRef = useRef<Map<string, number>>(new Map())
  const lastReadyAnnouncementRef = useRef<Map<string, number>>(new Map())
  const lastStatusUpdateRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    if (!settingsLoaded) return
    if (audioGlobalMute) return

    claudeStatuses.forEach((status, terminalId) => {
      const prevStatus = prevClaudeStatusesRef.current.get(terminalId)
      const prevSubagentCount = prevSubagentCountsRef.current.get(terminalId) || 0
      const currentStatus = status.status
      const currentSubagentCount = status.subagent_count || 0

      const session = sessions.find(s => s.id === terminalId)

      const audioForProfile = getAudioSettingsForProfile(session?.profile, session?.assignedVoice)
      if (!audioForProfile.enabled) {
        prevClaudeStatusesRef.current.set(terminalId, currentStatus)
        prevSubagentCountsRef.current.set(terminalId, currentSubagentCount)
        return
      }

      // Get display name for announcements (handles duplicate names)
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

      // Ready announcement with multiple safeguards
      const now = Date.now()
      const lastReadyTime = lastReadyAnnouncementRef.current.get(terminalId) || 0
      const wasWorking = prevStatus === 'processing' || prevStatus === 'tool_use'
      const isNowReady = currentStatus === 'awaiting_input' || currentStatus === 'idle'
      const isValidTransition = wasWorking && isNowReady && currentSubagentCount === 0
      const cooldownPassed = (now - lastReadyTime) > READY_ANNOUNCEMENT_COOLDOWN_MS

      // Freshness checks to prevent stale status files from triggering audio
      const currentLastUpdated = status.last_updated || ''
      const prevLastUpdated = lastStatusUpdateRef.current.get(terminalId) || ''
      const isStatusFresh = currentLastUpdated !== prevLastUpdated && currentLastUpdated !== ''
      const statusAge = currentLastUpdated ? (now - new Date(currentLastUpdated).getTime()) : Infinity
      const isNotStale = statusAge < STATUS_FRESHNESS_MS

      const shouldPlayReady = audioSettings.events.ready &&
                              isValidTransition &&
                              cooldownPassed &&
                              isStatusFresh &&
                              isNotStale

      if (shouldPlayReady) {
        lastReadyAnnouncementRef.current.set(terminalId, now)
        lastStatusUpdateRef.current.set(terminalId, currentLastUpdated)
        playAudio(`${getDisplayName()} ready`, session)
      }

      // Tool announcements
      const prevToolKey = prevToolNamesRef.current.get(terminalId) || ''
      const currentToolName = status.current_tool || ''
      const toolDetail = status.details?.args?.description ||
                        status.details?.args?.file_path ||
                        status.details?.args?.pattern || ''
      const currentToolKey = `${currentToolName}:${toolDetail}`
      const isActiveStatus = currentStatus === 'tool_use' || currentStatus === 'processing'
      const isNewTool = currentToolName !== '' && currentToolKey !== prevToolKey

      // Skip internal Claude session files
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

        if (audioSettings.events.toolDetails && status.details?.args) {
          const args = status.details.args
          if (args.file_path) {
            const parts = args.file_path.split('/')
            const filename = parts[parts.length - 1]
            announcement += ` ${filename}`
          } else if (args.pattern && (currentToolName === 'Glob' || currentToolName === 'Grep')) {
            announcement += ` for ${args.pattern}`
          } else if (currentToolName === 'Bash' && args.description) {
            announcement = args.description
          }
        }

        playAudio(announcement, session, true)
      }

      prevToolNamesRef.current.set(terminalId, currentToolKey)

      // Subagent count changes (chipmunk voice for distinction)
      if (audioSettings.events.subagents && currentSubagentCount !== prevSubagentCount) {
        const chipmunkVoice = { pitch: '+50Hz', rate: '+15%' }
        if (currentSubagentCount > prevSubagentCount) {
          playAudio(
            `${currentSubagentCount} agent${currentSubagentCount > 1 ? 's' : ''} running`,
            session,
            true,
            chipmunkVoice
          )
        } else if (currentSubagentCount === 0 && prevSubagentCount > 0) {
          playAudio('All agents complete', session, false, chipmunkVoice)
        }
      }

      // Context threshold alerts (uses hysteresis)
      const currentContextPct = status.context_pct
      const prevContextPct = prevContextPctRef.current.get(terminalId)

      if (currentContextPct != null && prevContextPct != null) {
        const displayName = getDisplayName()

        if (audioSettings.events.contextWarning) {
          const crossedWarningUp = prevContextPct < CONTEXT_THRESHOLDS.WARNING &&
                                   currentContextPct >= CONTEXT_THRESHOLDS.WARNING
          if (crossedWarningUp) {
            playAudio(
              `Warning! ${displayName} 50 percent context!`,
              session,
              false,
              { pitch: '+15Hz', rate: '+5%' }
            )
          }
        }

        if (audioSettings.events.contextCritical) {
          const crossedCriticalUp = prevContextPct < CONTEXT_THRESHOLDS.CRITICAL &&
                                    currentContextPct >= CONTEXT_THRESHOLDS.CRITICAL
          if (crossedCriticalUp) {
            playAudio(
              `Alert! ${displayName} context critical!`,
              session,
              false,
              { pitch: '+25Hz', rate: '+10%' }
            )
          }
        }
      }

      // Update previous values
      prevClaudeStatusesRef.current.set(terminalId, currentStatus)
      prevSubagentCountsRef.current.set(terminalId, currentSubagentCount)
      if (currentContextPct != null) {
        prevContextPctRef.current.set(terminalId, currentContextPct)
      }
    })

    // Clean up removed terminals
    for (const id of prevClaudeStatusesRef.current.keys()) {
      if (!claudeStatuses.has(id)) {
        prevClaudeStatusesRef.current.delete(id)
        prevToolNamesRef.current.delete(id)
        prevSubagentCountsRef.current.delete(id)
        prevContextPctRef.current.delete(id)
      }
    }
  }, [claudeStatuses, audioSettings, audioGlobalMute, settingsLoaded, sessions, getAudioSettingsForProfile, playAudio])
}
