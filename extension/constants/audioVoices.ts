import type { AudioSettings } from '../components/SettingsModal'

// Voice pool for auto-assignment (rotates through these when no profile override)
export const VOICE_POOL = [
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
] as const

// Default audio settings for new users
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  enabled: false,
  volume: 0.7,
  voice: 'en-US-AndrewMultilingualNeural',
  rate: '+0%',
  pitch: '+0Hz',
  events: {
    ready: true,
    sessionStart: false,
    tools: false,
    toolDetails: false,
    subagents: false,
    contextWarning: false,
    contextCritical: false,
    mcpDownloads: true,
  },
  toolDebounceMs: 1000,
}

// Thresholds for context usage alerts (match statusline colors)
export const CONTEXT_THRESHOLDS = {
  WARNING: 50,   // Yellow threshold
  CRITICAL: 75,  // Red threshold
} as const

// Cooldown period between ready announcements (prevents duplicate triggers)
export const READY_ANNOUNCEMENT_COOLDOWN_MS = 30000

// How long a status update is considered fresh (for staleness check)
export const STATUS_FRESHNESS_MS = 5000
