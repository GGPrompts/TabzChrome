import React, { useState } from 'react'
import { Volume2, Music } from 'lucide-react'
import { AudioSettings, AudioEventSettings, AudioEventSfxSettings, EventSfxConfig, TTS_VOICES, DEFAULT_SFX_FILES } from './types'

interface AudioTabProps {
  audioSettings: AudioSettings
  updateAudioSettings: (updates: Partial<AudioSettings>) => void
  updateAudioEvents: (updates: Partial<AudioEventSettings>) => void
  updateAudioSfx: (event: keyof AudioEventSfxSettings, config: Partial<EventSfxConfig>) => void
}

// Event row component with TTS and SFX toggles
interface EventRowProps {
  label: string
  description: string
  eventKey: keyof AudioEventSettings & keyof AudioEventSfxSettings
  ttsEnabled: boolean
  sfxConfig: EventSfxConfig
  onTtsChange: (enabled: boolean) => void
  onSfxChange: (config: Partial<EventSfxConfig>) => void
  showSfxPath?: boolean
  colorClass?: string // For context warning/critical color highlighting
}

function EventRow({
  label,
  description,
  eventKey,
  ttsEnabled,
  sfxConfig,
  onTtsChange,
  onSfxChange,
  showSfxPath = true,
  colorClass = ''
}: EventRowProps) {
  const [sfxTestPlaying, setSfxTestPlaying] = useState(false)

  const handleSfxTest = async () => {
    if (sfxTestPlaying) return
    setSfxTestPlaying(true)

    try {
      const response = await fetch('http://localhost:8129/api/audio/sfx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: eventKey,
          customPath: sfxConfig.customPath
        })
      })
      const data = await response.json()

      if (data.success && data.url) {
        const audio = new Audio(data.url)
        audio.volume = 0.7
        audio.onended = () => setSfxTestPlaying(false)
        audio.onerror = () => setSfxTestPlaying(false)
        await audio.play()
      } else {
        console.warn('[SFX Test] No SFX found:', data.error)
        setSfxTestPlaying(false)
      }
    } catch (err) {
      console.error('[SFX Test] Failed:', err)
      setSfxTestPlaying(false)
    }
  }

  return (
    <div className="p-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white">{label}</span>
          <p className={`text-xs text-gray-400 ${colorClass}`}>{description}</p>
        </div>
        <div className="flex items-center gap-3 ml-3">
          {/* TTS Toggle */}
          <div className="flex items-center gap-1.5" title="Text-to-Speech">
            <Volume2 className="h-3.5 w-3.5 text-gray-400" />
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={(e) => onTtsChange(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00ff88]"></div>
            </label>
          </div>
          {/* SFX Toggle */}
          <div className="flex items-center gap-1.5" title="Sound Effect">
            <Music className="h-3.5 w-3.5 text-gray-400" />
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={sfxConfig.enabled}
                onChange={(e) => onSfxChange({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#f59e0b]"></div>
            </label>
          </div>
        </div>
      </div>

      {/* SFX Path (shown when SFX enabled) */}
      {showSfxPath && sfxConfig.enabled && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="text"
            placeholder={`Default: ${DEFAULT_SFX_FILES[eventKey]}`}
            value={sfxConfig.customPath || ''}
            onChange={(e) => onSfxChange({ customPath: e.target.value || undefined })}
            className="flex-1 px-2 py-1 bg-black/50 border border-gray-700 rounded text-white text-xs focus:border-[#f59e0b] focus:outline-none"
          />
          <button
            onClick={handleSfxTest}
            disabled={sfxTestPlaying}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs disabled:opacity-50"
            title="Test SFX"
          >
            {sfxTestPlaying ? '...' : '▶'}
          </button>
        </div>
      )}
    </div>
  )
}

export function AudioTab({
  audioSettings,
  updateAudioSettings,
  updateAudioEvents,
  updateAudioSfx,
}: AudioTabProps) {
  const [audioTestPlaying, setAudioTestPlaying] = useState(false)

  // Ensure sfx settings exist (for backward compatibility)
  const sfxSettings = audioSettings.sfx || {
    ready: { enabled: false },
    sessionStart: { enabled: false },
    tools: { enabled: false },
    subagents: { enabled: false },
    contextWarning: { enabled: false },
    contextCritical: { enabled: false },
    mcpDownloads: { enabled: false },
  }

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
          Use <Volume2 className="inline h-3.5 w-3.5" /> TTS for spoken announcements or <Music className="inline h-3.5 w-3.5" /> SFX for sound effects.
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
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white">Events</h4>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Volume2 className="h-3 w-3" /> TTS</span>
            <span className="flex items-center gap-1"><Music className="h-3 w-3" /> SFX</span>
          </div>
        </div>
        <div className="bg-black/30 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {/* Ready */}
          <EventRow
            label="Ready notification"
            description="When Claude finishes and awaits input"
            eventKey="ready"
            ttsEnabled={audioSettings.events.ready}
            sfxConfig={sfxSettings.ready}
            onTtsChange={(enabled) => updateAudioEvents({ ready: enabled })}
            onSfxChange={(config) => updateAudioSfx('ready', config)}
          />

          {/* Session Start */}
          <EventRow
            label="Session start"
            description="When a new Claude session begins"
            eventKey="sessionStart"
            ttsEnabled={audioSettings.events.sessionStart}
            sfxConfig={sfxSettings.sessionStart}
            onTtsChange={(enabled) => updateAudioEvents({ sessionStart: enabled })}
            onSfxChange={(config) => updateAudioSfx('sessionStart', config)}
          />

          {/* Tools */}
          <EventRow
            label="Tool announcements"
            description={`"Reading", "Editing", "Searching"...`}
            eventKey="tools"
            ttsEnabled={audioSettings.events.tools}
            sfxConfig={sfxSettings.tools}
            onTtsChange={(enabled) => updateAudioEvents({ tools: enabled })}
            onSfxChange={(config) => updateAudioSfx('tools', config)}
          />

          {/* Tool Details (only shown if tools TTS enabled) */}
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
          <EventRow
            label="Subagent activity"
            description={`"Spawning agent", agent count changes`}
            eventKey="subagents"
            ttsEnabled={audioSettings.events.subagents}
            sfxConfig={sfxSettings.subagents}
            onTtsChange={(enabled) => updateAudioEvents({ subagents: enabled })}
            onSfxChange={(config) => updateAudioSfx('subagents', config)}
          />

          {/* Context Warning */}
          <EventRow
            label="Context warning"
            description="Alert when context reaches 50%"
            eventKey="contextWarning"
            ttsEnabled={audioSettings.events.contextWarning}
            sfxConfig={sfxSettings.contextWarning}
            onTtsChange={(enabled) => updateAudioEvents({ contextWarning: enabled })}
            onSfxChange={(config) => updateAudioSfx('contextWarning', config)}
            colorClass="text-yellow-400"
          />

          {/* Context Critical */}
          <EventRow
            label="Context critical"
            description="Alert when context reaches 75%"
            eventKey="contextCritical"
            ttsEnabled={audioSettings.events.contextCritical}
            sfxConfig={sfxSettings.contextCritical}
            onTtsChange={(enabled) => updateAudioEvents({ contextCritical: enabled })}
            onSfxChange={(config) => updateAudioSfx('contextCritical', config)}
            colorClass="text-red-400"
          />

          {/* MCP Downloads */}
          <EventRow
            label="MCP downloads"
            description={`"Downloaded image.png" when files complete`}
            eventKey="mcpDownloads"
            ttsEnabled={audioSettings.events.mcpDownloads}
            sfxConfig={sfxSettings.mcpDownloads}
            onTtsChange={(enabled) => updateAudioEvents({ mcpDownloads: enabled })}
            onSfxChange={(config) => updateAudioSfx('mcpDownloads', config)}
          />
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
          {audioTestPlaying ? 'Playing...' : 'Test TTS Voice'}
        </button>
      </div>

      {/* Info */}
      <div className="text-xs text-gray-400 mt-4 p-3 bg-gray-900/50 rounded-lg space-y-2">
        <p><strong>TTS:</strong> Uses edge-tts neural voices. First playback may have a brief delay while audio is generated.</p>
        <p><strong>SFX:</strong> Place custom sounds in <code className="bg-black/50 px-1 rounded">backend/public/sfx/</code> or provide a full path.</p>
        <p className="text-gray-500">Tip: Download free sounds from Mixkit or Pixabay using the prompts in <code className="bg-black/50 px-1 rounded">.prompts/audio/</code></p>
      </div>
    </>
  )
}
