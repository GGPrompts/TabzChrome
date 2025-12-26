// Re-export DEFAULT_AUDIO_SETTINGS from types.ts to avoid duplication
export { DEFAULT_AUDIO_SETTINGS } from '../components/settings/types'

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

// Thresholds for context usage alerts (match statusline colors)
export const CONTEXT_THRESHOLDS = {
  WARNING: 50,   // Yellow threshold
  CRITICAL: 75,  // Red threshold
} as const

// Cooldown period between ready announcements (prevents duplicate triggers)
export const READY_ANNOUNCEMENT_COOLDOWN_MS = 30000

// How long a status update is considered fresh (for staleness check)
export const STATUS_FRESHNESS_MS = 5000
