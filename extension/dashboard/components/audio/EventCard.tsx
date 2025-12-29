import React, { useState } from 'react'
import { ChevronDown, ChevronUp, RotateCcw, Volume2 } from 'lucide-react'
import type { AudioEventConfig, AudioEventType, SoundEffect, SoundMode } from '../../../components/settings/types'
import { TTS_VOICES } from '../../../components/settings/types'
import { renderPreview, getDefaultPhrase } from '../../../utils/audioTemplates'
import PhraseEditor from './PhraseEditor'
import SoundEffectPicker from './SoundEffectPicker'
import WordSubstitutionEditor from './WordSubstitutionEditor'

interface EventCardProps {
  eventType: AudioEventType
  label: string
  description: React.ReactNode
  enabled: boolean
  config?: AudioEventConfig
  onToggle: (enabled: boolean) => void
  onConfigChange: (config: AudioEventConfig | undefined) => void
  nested?: boolean
  children?: React.ReactNode  // For nested content like toolDetails
  volume?: number  // For sound preview
  globalVoice?: string  // Global voice setting for fallback
  globalRate?: string   // Global rate setting for fallback
  globalPitch?: string  // Global pitch setting for fallback
}

// Helper to check if config has any overrides
function hasOverrides(config?: AudioEventConfig): boolean {
  if (!config) return false
  return !!(
    config.voice !== undefined ||
    config.rate !== undefined ||
    config.pitch !== undefined ||
    config.phraseTemplate !== undefined ||
    config.soundMode !== undefined ||
    config.soundEffect !== undefined ||
    (config.wordSubstitutions && Object.keys(config.wordSubstitutions).length > 0)
  )
}

// Parse rate string to number (e.g., "+30%" -> 30, "-10%" -> -10)
function parseRate(rate: string): number {
  const match = rate.match(/([+-]?\d+)%/)
  return match ? parseInt(match[1], 10) : 0
}

// Format rate number to string (e.g., 30 -> "+30%", -10 -> "-10%")
function formatRate(value: number): string {
  return value >= 0 ? `+${value}%` : `${value}%`
}

// Parse pitch string to number (e.g., "+20Hz" -> 20)
function parsePitch(pitch: string): number {
  const match = pitch.match(/\+?(\d+)Hz/)
  return match ? parseInt(match[1], 10) : 0
}

// Format pitch number to string (e.g., 20 -> "+20Hz")
function formatPitch(value: number): string {
  return `+${value}Hz`
}

export default function EventCard({
  eventType,
  label,
  description,
  enabled,
  config,
  onToggle,
  onConfigChange,
  nested = false,
  children,
  volume = 0.7,
  globalVoice = 'en-US-AriaNeural',
  globalRate = '+0%',
  globalPitch = '+0Hz',
}: EventCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [previewPlaying, setPreviewPlaying] = useState(false)
  const isCustom = hasOverrides(config)

  // Get effective settings (custom or global fallback)
  const getEffectiveVoice = () => {
    if (config?.voice) return config.voice
    // Handle "random" by picking a random voice for preview
    if (globalVoice === 'random') {
      return TTS_VOICES[Math.floor(Math.random() * TTS_VOICES.length)].value
    }
    return globalVoice
  }
  const getEffectiveRate = () => config?.rate || globalRate
  const getEffectivePitch = () => config?.pitch || globalPitch

  // Generate sample text for preview
  const getSampleText = () => {
    const template = config?.phraseTemplate || getDefaultPhrase(eventType)
    return renderPreview(template, eventType)
  }

  // Play audio preview with current settings
  const handlePreview = async () => {
    if (previewPlaying) return
    setPreviewPlaying(true)

    try {
      const text = getSampleText()
      const response = await fetch('http://localhost:8129/api/audio/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: getEffectiveVoice(),
          rate: getEffectiveRate(),
          pitch: getEffectivePitch(),
        }),
      })
      const data = await response.json()

      if (data.success && data.url) {
        const audio = new Audio(data.url)
        audio.volume = volume
        audio.onended = () => setPreviewPlaying(false)
        audio.onerror = () => setPreviewPlaying(false)
        await audio.play()
      } else {
        setPreviewPlaying(false)
      }
    } catch (err) {
      console.error('[EventCard] Preview failed:', err)
      setPreviewPlaying(false)
    }
  }

  const handleVoiceChange = (voice: string) => {
    if (voice === '') {
      // "Use global" selected - remove voice override
      const newConfig = config ? { ...config } : {}
      delete newConfig.voice
      onConfigChange(hasOverrides(newConfig) ? newConfig : undefined)
    } else {
      onConfigChange({ ...config, voice })
    }
  }

  const handleRateChange = (rateValue: number) => {
    const rate = formatRate(rateValue)
    onConfigChange({ ...config, rate })
  }

  const handlePitchChange = (pitchValue: number) => {
    const pitch = formatPitch(pitchValue)
    onConfigChange({ ...config, pitch })
  }

  const handleResetToGlobal = () => {
    onConfigChange(undefined)
  }

  const handleClearRate = () => {
    const newConfig = config ? { ...config } : {}
    delete newConfig.rate
    onConfigChange(hasOverrides(newConfig) ? newConfig : undefined)
  }

  const handleClearPitch = () => {
    const newConfig = config ? { ...config } : {}
    delete newConfig.pitch
    onConfigChange(hasOverrides(newConfig) ? newConfig : undefined)
  }

  const handlePhraseChange = (phraseTemplate: string | undefined) => {
    if (phraseTemplate === undefined) {
      // Reset to default
      const newConfig = config ? { ...config } : {}
      delete newConfig.phraseTemplate
      onConfigChange(hasOverrides(newConfig) ? newConfig : undefined)
    } else {
      onConfigChange({ ...config, phraseTemplate })
    }
  }

  const handleSoundModeChange = (soundMode: SoundMode) => {
    if (soundMode === 'tts') {
      // Reset to TTS only - remove sound effect config
      const newConfig = config ? { ...config } : {}
      delete newConfig.soundMode
      delete newConfig.soundEffect
      onConfigChange(hasOverrides(newConfig) ? newConfig : undefined)
    } else {
      onConfigChange({ ...config, soundMode })
    }
  }

  const handleSoundEffectChange = (soundEffect: SoundEffect | undefined) => {
    if (!soundEffect) {
      const newConfig = config ? { ...config } : {}
      delete newConfig.soundEffect
      onConfigChange(hasOverrides(newConfig) ? newConfig : undefined)
    } else {
      onConfigChange({ ...config, soundEffect })
    }
  }

  const handleWordSubstitutionsChange = (wordSubstitutions: Record<string, SoundEffect> | undefined) => {
    if (!wordSubstitutions) {
      const newConfig = config ? { ...config } : {}
      delete newConfig.wordSubstitutions
      onConfigChange(hasOverrides(newConfig) ? newConfig : undefined)
    } else {
      onConfigChange({ ...config, wordSubstitutions })
    }
  }

  return (
    <div className={nested ? 'bg-muted/30' : ''}>
      {/* Header row - always visible */}
      <div className={`flex items-center justify-between p-4 ${nested ? 'pl-8' : ''}`}>
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Enable toggle */}
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
          </label>

          {/* Label and description */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{label}</span>
              {isCustom && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-primary/20 text-primary">
                  Custom
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>

        {/* Quick actions - Preview, Reset, Expand */}
        {!nested && (
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            {/* Preview button */}
            <button
              onClick={handlePreview}
              disabled={previewPlaying || !enabled}
              className="p-2 rounded-lg hover:bg-muted transition-colors disabled:opacity-30"
              title="Preview sound"
            >
              <Volume2 className={`w-4 h-4 ${previewPlaying ? 'text-primary animate-pulse' : 'text-muted-foreground'}`} />
            </button>

            {/* Reset button - only show if has customizations */}
            {isCustom && (
              <button
                onClick={handleResetToGlobal}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                title="Reset to global settings"
              >
                <RotateCcw className="w-4 h-4 text-muted-foreground" />
              </button>
            )}

            {/* Expand button */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              title={expanded ? 'Collapse settings' : 'Expand for custom voice/rate/pitch'}
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Expanded content - voice, rate, pitch overrides */}
      {expanded && !nested && (
        <div className="px-4 pb-4 pt-0 space-y-4 border-t border-border mx-4 mt-0">
          <div className="pt-4">
            {/* Voice selector */}
            <div className="mb-4">
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                Voice {config?.voice ? '' : '(using global)'}
              </label>
              <select
                value={config?.voice || ''}
                onChange={(e) => handleVoiceChange(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:border-primary focus:outline-none"
              >
                <option value="">Use global setting</option>
                {TTS_VOICES.map((voice) => (
                  <option key={voice.value} value={voice.value}>
                    {voice.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Rate slider */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Speech Rate {config?.rate ? '' : '(using global)'}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {config?.rate || 'global'}
                  </span>
                  {config?.rate && (
                    <button
                      onClick={handleClearRate}
                      className="text-xs text-muted-foreground hover:text-foreground"
                      title="Use global rate"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min="-50"
                max="100"
                step="10"
                value={config?.rate ? parseRate(config.rate) : 0}
                onChange={(e) => handleRateChange(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>-50%</span>
                <span>0%</span>
                <span>+100%</span>
              </div>
            </div>

            {/* Pitch slider */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Pitch {config?.pitch ? '' : '(using global)'}
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {config?.pitch || 'global'}
                  </span>
                  {config?.pitch && (
                    <button
                      onClick={handleClearPitch}
                      className="text-xs text-muted-foreground hover:text-foreground"
                      title="Use global pitch"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="300"
                step="10"
                value={config?.pitch ? parsePitch(config.pitch) : 0}
                onChange={(e) => handlePitchChange(parseInt(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0Hz</span>
                <span>+150Hz</span>
                <span>+300Hz</span>
              </div>
            </div>

            {/* Phrase template editor */}
            <div className="mb-4 pt-2 border-t border-border">
              <PhraseEditor
                eventType={eventType}
                phraseTemplate={config?.phraseTemplate}
                onChange={handlePhraseChange}
              />
            </div>

            {/* Sound effect picker */}
            <div className="mb-4 pt-2 border-t border-border">
              <SoundEffectPicker
                soundMode={config?.soundMode}
                soundEffect={config?.soundEffect}
                onModeChange={handleSoundModeChange}
                onEffectChange={handleSoundEffectChange}
                volume={volume}
              />
            </div>

            {/* Word substitutions */}
            <div className="mb-4 pt-2 border-t border-border">
              <WordSubstitutionEditor
                substitutions={config?.wordSubstitutions}
                onChange={handleWordSubstitutionsChange}
                volume={volume}
              />
            </div>

            {/* Actions: Preview and Reset */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <button
                onClick={handlePreview}
                disabled={previewPlaying}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                <Volume2 className="w-3 h-3" />
                {previewPlaying ? 'Playing...' : 'Preview'}
              </button>

              {isCustom && (
                <button
                  onClick={handleResetToGlobal}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset all to global
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Nested children (e.g., toolDetails under tools) */}
      {children}
    </div>
  )
}
