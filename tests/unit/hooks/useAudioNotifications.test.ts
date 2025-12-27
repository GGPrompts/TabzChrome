import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAudioNotifications } from '../../../extension/hooks/useAudioNotifications'
import type { ClaudeStatus } from '../../../extension/hooks/useClaudeStatus'

// Mock the sub-hooks
const mockPlayAudio = vi.fn()
const mockMarkSessionDetached = vi.fn()
const mockSetAudioGlobalMute = vi.fn()
const mockGetNextAvailableVoice = vi.fn(() => 'voice-1')
const mockGetAudioSettingsForProfile = vi.fn(() => ({
  voice: 'voice-1',
  rate: '1.0',
  pitch: '1.0',
  volume: 1.0,
  enabled: true,
}))

vi.mock('../../../extension/hooks/useAudioPlayback', () => ({
  useAudioPlayback: vi.fn(() => ({
    audioSettings: {
      events: {
        ready: true,
        tools: true,
        toolDetails: true,
        subagents: true,
        contextWarning: true,
        contextCritical: true,
        sessionStart: true,
        sessionClose: true,
      },
      defaultVoice: 'voice-1',
      defaultRate: '1.0',
      defaultPitch: '1.0',
      defaultVolume: 1.0,
    },
    audioGlobalMute: false,
    setAudioGlobalMute: mockSetAudioGlobalMute,
    settingsLoaded: true,
    getNextAvailableVoice: mockGetNextAvailableVoice,
    getAudioSettingsForProfile: mockGetAudioSettingsForProfile,
    playAudio: mockPlayAudio,
  })),
}))

vi.mock('../../../extension/hooks/useStatusTransitions', () => ({
  useStatusTransitions: vi.fn(),
}))

vi.mock('../../../extension/hooks/useSessionAnnouncements', () => ({
  useSessionAnnouncements: vi.fn(() => ({
    markSessionDetached: mockMarkSessionDetached,
  })),
}))

describe('useAudioNotifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should return audio settings and controls', () => {
      const { result } = renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
        })
      )

      expect(result.current.audioSettings).toBeDefined()
      expect(result.current.audioGlobalMute).toBe(false)
      expect(typeof result.current.setAudioGlobalMute).toBe('function')
      expect(typeof result.current.getNextAvailableVoice).toBe('function')
      expect(typeof result.current.getAudioSettingsForProfile).toBe('function')
      expect(typeof result.current.playAudio).toBe('function')
      expect(typeof result.current.markSessionDetached).toBe('function')
    })

    it('should pass sessions to useAudioPlayback', async () => {
      const { useAudioPlayback } = await import('../../../extension/hooks/useAudioPlayback')

      const sessions = [
        { id: 'term-1', name: 'Test', profile: { id: 'default', name: 'Default' } },
      ]

      renderHook(() =>
        useAudioNotifications({
          sessions: sessions as any,
          claudeStatuses: new Map(),
        })
      )

      expect(useAudioPlayback).toHaveBeenCalledWith({ sessions })
    })
  })

  describe('popout mode', () => {
    it('should pass effectiveGlobalMute=true when isPopoutMode is true', async () => {
      const { useStatusTransitions } = await import('../../../extension/hooks/useStatusTransitions')
      const { useSessionAnnouncements } = await import('../../../extension/hooks/useSessionAnnouncements')

      renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
          isPopoutMode: true,
        })
      )

      // Both hooks should receive effectiveGlobalMute = true
      expect(useStatusTransitions).toHaveBeenCalledWith(
        expect.objectContaining({
          audioGlobalMute: true,
        })
      )
      expect(useSessionAnnouncements).toHaveBeenCalledWith(
        expect.objectContaining({
          audioGlobalMute: true,
        })
      )
    })

    it('should pass effectiveGlobalMute=false when isPopoutMode is false', async () => {
      const { useStatusTransitions } = await import('../../../extension/hooks/useStatusTransitions')

      renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
          isPopoutMode: false,
        })
      )

      expect(useStatusTransitions).toHaveBeenCalledWith(
        expect.objectContaining({
          audioGlobalMute: false,
        })
      )
    })
  })

  describe('claude statuses forwarding', () => {
    it('should pass claudeStatuses to useStatusTransitions', async () => {
      const { useStatusTransitions } = await import('../../../extension/hooks/useStatusTransitions')

      const claudeStatuses = new Map<string, ClaudeStatus>([
        ['term-1', { status: 'processing', current_tool: 'Read' }],
      ])

      renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses,
        })
      )

      expect(useStatusTransitions).toHaveBeenCalledWith(
        expect.objectContaining({
          claudeStatuses,
        })
      )
    })
  })

  describe('returned functions', () => {
    it('should return getNextAvailableVoice that works', () => {
      const { result } = renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
        })
      )

      const voice = result.current.getNextAvailableVoice()
      expect(voice).toBe('voice-1')
      expect(mockGetNextAvailableVoice).toHaveBeenCalled()
    })

    it('should return getAudioSettingsForProfile that works', () => {
      const { result } = renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
        })
      )

      const settings = result.current.getAudioSettingsForProfile()
      expect(settings.enabled).toBe(true)
      expect(settings.voice).toBe('voice-1')
    })

    it('should return playAudio that can be called', async () => {
      const { result } = renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
        })
      )

      await result.current.playAudio('Test announcement')
      expect(mockPlayAudio).toHaveBeenCalledWith('Test announcement')
    })

    it('should return markSessionDetached from useSessionAnnouncements', () => {
      const { result } = renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
        })
      )

      result.current.markSessionDetached('term-1')
      expect(mockMarkSessionDetached).toHaveBeenCalledWith('term-1')
    })
  })

  describe('audio settings structure', () => {
    it('should have correct events structure', () => {
      const { result } = renderHook(() =>
        useAudioNotifications({
          sessions: [],
          claudeStatuses: new Map(),
        })
      )

      expect(result.current.audioSettings.events).toEqual({
        ready: true,
        tools: true,
        toolDetails: true,
        subagents: true,
        contextWarning: true,
        contextCritical: true,
        sessionStart: true,
        sessionClose: true,
      })
    })
  })
})
