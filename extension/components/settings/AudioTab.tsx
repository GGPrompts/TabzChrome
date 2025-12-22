import React, { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { AudioSettings, AudioEventSettings, TTS_VOICES } from './types'

interface AudioTabProps {
  audioSettings: AudioSettings
  updateAudioSettings: (updates: Partial<AudioSettings>) => void
  updateAudioEvents: (updates: Partial<AudioEventSettings>) => void
}

export function AudioTab({
  audioSettings,
  updateAudioSettings,
  updateAudioEvents,
}: AudioTabProps) {
  const [audioTestPlaying, setAudioTestPlaying] = useState(false)

  const handleAudioTest = async () => {
    if (audioTestPlaying) return
    setAudioTestPlaying(true)

    try {
      // If voice is "random", pick a random voice from the pool for testing
      const testVoice = audioSettings.voice === 'random'
        ? TTS_VOICES[Math.floor(Math.random() * TTS_VOICES.length)].value
        : audioSettings.voice

      const response = await fetch('http://localhost:8129/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Claude ready',
          voice: testVoice,
          rate: audioSettings.rate,
          pitch: audioSettings.pitch
        })
      })
      const data = await response.json()

      if (data.success && data.url) {
        const audio = new Audio(data.url)
        audio.volume = audioSettings.volume
        audio.onended = () => setAudioTestPlaying(false)
        audio.onerror = () => setAudioTestPlaying(false)
        await audio.play()
      } else {
        setAudioTestPlaying(false)
      }
    } catch (err) {
      console.error('[Settings] Audio test failed:', err)
      setAudioTestPlaying(false)
    }
  }

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-gray-400">
          Play audio notifications when Claude Code status changes.
          Audio is generated using neural text-to-speech and played through Chrome.
        </p>
      </div>

      {/* Master Toggle */}
      <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-white">Enable Audio Notifications</h4>
            <p className="text-xs text-gray-400 mt-1">Master switch for all audio alerts</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={audioSettings.enabled}
              onChange={(e) => updateAudioSettings({ enabled: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#00ff88]"></div>
          </label>
        </div>
      </div>

      {/* Voice & Speed Settings */}
      <div className={`space-y-4 ${!audioSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <h4 className="text-sm font-medium text-white">Voice & Speed</h4>
        <div className="bg-black/30 border border-gray-800 rounded-lg p-4 space-y-4">
          {/* Voice Selection */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">Voice</label>
            <select
              value={audioSettings.voice}
              onChange={(e) => updateAudioSettings({ voice: e.target.value })}
              className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
            >
              <option value="random">Random (unique per terminal)</option>
              {TTS_VOICES.map((voice) => (
                <option key={voice.value} value={voice.value}>
                  {voice.label}
                </option>
              ))}
            </select>
            {audioSettings.voice === 'random' && (
              <p className="text-xs text-gray-400 mt-1">
                Each terminal gets a unique voice. Helps distinguish multiple Claude sessions.
              </p>
            )}
          </div>

          {/* Rate Slider */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Speech Rate: {audioSettings.rate}
            </label>
            <input
              type="range"
              min="-50"
              max="100"
              step="10"
              value={parseInt(audioSettings.rate)}
              onChange={(e) => {
                const val = parseInt(e.target.value)
                updateAudioSettings({ rate: val >= 0 ? `+${val}%` : `${val}%` })
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>-50% (slower)</span>
              <span>0%</span>
              <span>+100% (faster)</span>
            </div>
          </div>

          {/* Pitch Slider */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Pitch: {audioSettings.pitch}
            </label>
            <input
              type="range"
              min="0"
              max="300"
              step="50"
              value={parseInt(audioSettings.pitch)}
              onChange={(e) => {
                const val = parseInt(e.target.value)
                updateAudioSettings({ pitch: `+${val}Hz` })
              }}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>0Hz (default)</span>
              <span>+150Hz</span>
              <span>+300Hz (higher)</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Context alerts auto-elevate: warning (+100Hz, +15% rate), critical (+200Hz, +30% rate)
            </p>
          </div>

          {/* Volume Slider */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Volume: {Math.round(audioSettings.volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={audioSettings.volume}
              onChange={(e) => updateAudioSettings({ volume: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
            />
          </div>
        </div>
      </div>

      {/* Event Toggles */}
      <div className={`space-y-3 ${!audioSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <h4 className="text-sm font-medium text-white">Events</h4>
        <div className="bg-black/30 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {/* Ready */}
          <div className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm text-white">Ready notification</span>
              <p className="text-xs text-gray-400">When Claude finishes and awaits input</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={audioSettings.events.ready}
                onChange={(e) => updateAudioEvents({ ready: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
            </label>
          </div>

          {/* Session Start */}
          <div className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm text-white">Session start</span>
              <p className="text-xs text-gray-400">When a new Claude session begins</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={audioSettings.events.sessionStart}
                onChange={(e) => updateAudioEvents({ sessionStart: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
            </label>
          </div>

          {/* Tools */}
          <div className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm text-white">Tool announcements</span>
              <p className="text-xs text-gray-400">"Reading", "Editing", "Searching"...</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={audioSettings.events.tools}
                onChange={(e) => updateAudioEvents({ tools: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
            </label>
          </div>

          {/* Tool Details (only shown if tools enabled) */}
          {audioSettings.events.tools && (
            <div className="flex items-center justify-between p-3 pl-8 bg-black/20">
              <div>
                <span className="text-sm text-white">Include file names</span>
                <p className="text-xs text-gray-400">"Reading settings.tsx", "Editing api.js"...</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={audioSettings.events.toolDetails}
                  onChange={(e) => updateAudioEvents({ toolDetails: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
              </label>
            </div>
          )}

          {/* Subagents */}
          <div className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm text-white">Subagent activity</span>
              <p className="text-xs text-gray-400">"Spawning agent", agent count changes</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={audioSettings.events.subagents}
                onChange={(e) => updateAudioEvents({ subagents: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
            </label>
          </div>

          {/* Context Warning */}
          <div className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm text-white">Context warning</span>
              <p className="text-xs text-gray-400">Alert when context reaches <span className="text-yellow-400">50%</span></p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={audioSettings.events.contextWarning}
                onChange={(e) => updateAudioEvents({ contextWarning: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
            </label>
          </div>

          {/* Context Critical */}
          <div className="flex items-center justify-between p-3">
            <div>
              <span className="text-sm text-white">Context critical</span>
              <p className="text-xs text-gray-400">Alert when context reaches <span className="text-red-400">75%</span></p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={audioSettings.events.contextCritical}
                onChange={(e) => updateAudioEvents({ contextCritical: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
            </label>
          </div>
        </div>

        {/* Tool Debounce (only shown if tools enabled) */}
        {audioSettings.events.tools && (
          <div className="bg-black/30 border border-gray-800 rounded-lg p-3">
            <label className="block text-xs text-gray-400 mb-1">
              Tool debounce: {audioSettings.toolDebounceMs}ms
            </label>
            <input
              type="range"
              min="0"
              max="3000"
              step="250"
              value={audioSettings.toolDebounceMs}
              onChange={(e) => updateAudioSettings({ toolDebounceMs: parseInt(e.target.value) })}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-[#00ff88]"
            />
            <p className="text-xs text-gray-400 mt-1">
              Minimum time between tool announcements (prevents spam)
            </p>
          </div>
        )}
      </div>

      {/* Test Button */}
      <div className={`${!audioSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <button
          onClick={handleAudioTest}
          disabled={audioTestPlaying}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
        >
          <Volume2 className="h-4 w-4" />
          {audioTestPlaying ? 'Playing...' : 'Test Sound'}
        </button>
      </div>

      {/* Info */}
      <div className="text-xs text-gray-400 mt-4 p-3 bg-gray-900/50 rounded-lg">
        <p><strong>Note:</strong> Audio uses edge-tts neural voices. First playback may have a brief delay while audio is generated - subsequent plays are instant (cached).</p>
      </div>
    </>
  )
}
