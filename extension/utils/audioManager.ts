/**
 * Audio Manager with Priority Support
 *
 * Manages audio playback with priority levels to prevent low-priority
 * status updates from interrupting high-priority content like summaries
 * or page readings.
 *
 * Priority levels:
 * - 'high': Summaries, handoffs, page readings - interrupts everything, blocks low priority
 * - 'low': Claude status updates (tools, ready, context warnings)
 */

export type AudioPriority = 'low' | 'high'

interface AudioState {
  currentPriority: AudioPriority | null
  currentAudio: HTMLAudioElement | null
  isPlaying: boolean
}

// Singleton state for audio management
const state: AudioState = {
  currentPriority: null,
  currentAudio: null,
  isPlaying: false
}

// Listeners for state changes (useful for UI updates)
type StateListener = (isHighPriorityPlaying: boolean) => void
const listeners: Set<StateListener> = new Set()

function notifyListeners() {
  const isHighPriority = state.isPlaying && state.currentPriority === 'high'
  listeners.forEach(listener => listener(isHighPriority))
}

/**
 * Subscribe to audio state changes
 * Returns unsubscribe function
 */
export function subscribeToAudioState(listener: StateListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Check if high-priority audio is currently playing
 */
export function isHighPriorityPlaying(): boolean {
  return state.isPlaying && state.currentPriority === 'high'
}

/**
 * Stop any currently playing audio
 */
export function stopCurrentAudio(): void {
  if (state.currentAudio) {
    state.currentAudio.pause()
    state.currentAudio.currentTime = 0
    state.currentAudio = null
  }
  state.isPlaying = false
  state.currentPriority = null
  notifyListeners()
}

/**
 * Play audio with priority handling
 *
 * - High priority: Stops current audio and plays immediately
 * - Low priority: Skipped if high priority is playing
 *
 * @param url - URL of the audio file to play
 * @param priority - 'high' for summaries/readings, 'low' for status updates
 * @param volume - Volume level 0-1 (default: 1)
 * @returns Promise that resolves when audio finishes or is skipped
 */
export function playWithPriority(
  url: string,
  priority: AudioPriority,
  volume = 1
): Promise<void> {
  return new Promise((resolve, reject) => {
    // If high-priority is playing and this is low-priority, skip
    if (state.currentPriority === 'high' && state.isPlaying && priority === 'low') {
      console.log('[AudioManager] Skipping low-priority - high-priority playing')
      resolve()
      return
    }

    // If new high-priority arrives, stop current audio
    if (priority === 'high' && state.currentAudio) {
      console.log('[AudioManager] High-priority audio interrupting current playback')
      stopCurrentAudio()
    }

    // Create and configure audio element
    const audio = new Audio(url)
    audio.volume = Math.max(0, Math.min(1, volume))

    // Update state
    state.currentAudio = audio
    state.currentPriority = priority
    state.isPlaying = true
    notifyListeners()

    // Handle completion
    audio.onended = () => {
      // Only clear state if this is still the current audio
      if (state.currentAudio === audio) {
        state.currentAudio = null
        state.currentPriority = null
        state.isPlaying = false
        notifyListeners()
      }
      resolve()
    }

    // Handle errors
    audio.onerror = (e) => {
      console.error('[AudioManager] Playback error:', e)
      if (state.currentAudio === audio) {
        state.currentAudio = null
        state.currentPriority = null
        state.isPlaying = false
        notifyListeners()
      }
      // Resolve instead of reject to not break callers
      resolve()
    }

    // Start playback
    audio.play().catch(err => {
      console.warn('[AudioManager] Play failed:', err.message)
      if (state.currentAudio === audio) {
        state.currentAudio = null
        state.currentPriority = null
        state.isPlaying = false
        notifyListeners()
      }
      resolve()
    })
  })
}

/**
 * Play high-priority audio (summaries, handoffs, page readings)
 * Convenience wrapper for playWithPriority
 */
export function playHighPriority(url: string, volume = 1): Promise<void> {
  return playWithPriority(url, 'high', volume)
}

/**
 * Play low-priority audio (status updates, tool announcements)
 * Will be skipped if high-priority audio is playing
 * Convenience wrapper for playWithPriority
 */
export function playLowPriority(url: string, volume = 1): Promise<void> {
  return playWithPriority(url, 'low', volume)
}
