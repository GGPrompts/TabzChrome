# Audio/TTS System

TabzChrome includes a neural text-to-speech system for audio notifications when Claude Code status changes. Audio is generated using edge-tts and played through Chrome.

## Architecture

```
Extension (useAudioNotifications.ts)
    ↓ POST /api/audio/generate
Backend (server.js)
    ↓ edge-tts CLI
Microsoft Edge TTS Service
    ↓ MP3 cached in /tmp/claude-audio-cache/
Extension plays audio via Chrome
```

## Settings Location

Settings → Audio tab, or per-profile overrides in Settings → Profiles → [profile] → Audio.

## Parameters

### Voice

Neural voices from Microsoft Edge TTS. Default: `en-US-AndrewMultilingualNeural`

| Voice | Code |
|-------|------|
| Andrew (US Male) | `en-US-AndrewMultilingualNeural` |
| Emma (US Female) | `en-US-EmmaMultilingualNeural` |
| Brian (US Male) | `en-US-BrianMultilingualNeural` |
| Aria (US Female) | `en-US-AriaNeural` |
| Guy (US Male) | `en-US-GuyNeural` |
| Jenny (US Female) | `en-US-JennyNeural` |
| Sonia (UK Female) | `en-GB-SoniaNeural` |
| Ryan (UK Male) | `en-GB-RyanNeural` |
| Natasha (AU Female) | `en-AU-NatashaNeural` |
| William (AU Male) | `en-AU-WilliamNeural` |

**Voice pool**: Select "Random (unique per terminal)" to auto-assign different voices to each terminal session. Helps distinguish multiple Claude sessions by ear.

### Rate

Speech speed as percentage. Format: `+N%` or `-N%`

| Value | Effect |
|-------|--------|
| `-50%` | Half speed (slower) |
| `+0%` | Normal speed (default) |
| `+50%` | 1.5x speed |
| `+100%` | Double speed (faster) |

Range: -50% to +100%

### Pitch

Voice pitch in Hz. Format: `+NHz` or `-NHz`

| Value | Effect |
|-------|--------|
| `-200Hz` | Much lower, calmer tone |
| `-100Hz` | Lower tone |
| `+0Hz` | Normal pitch (default) |
| `+100Hz` | Higher, noticeable urgency |
| `+200Hz` | High alert tone |
| `+300Hz` | Maximum pitch |

Range: -200Hz to +300Hz (wider range for noticeable difference)

**Context alerts auto-elevate pitch + rate for distinct urgency:**
- 50% warning: `+100Hz` pitch, `+15%` rate, "Warning!" prefix
- 75% critical: `+200Hz` pitch, `+30%` rate, "Alert!" prefix

### Volume

Playback volume. Range: 0.0 to 1.0 (default: 0.7)

## Audio Events

| Event | Description |
|-------|-------------|
| Ready | Claude finishes and awaits input |
| Session Start | New Claude session begins/closes |
| Tools | Tool usage announcements ("Reading", "Editing") |
| Tool Details | Include file names ("Reading settings.tsx") |
| Subagents | Agent spawn/completion announcements |
| Context Warning | Alert when context reaches 50% |
| Context Critical | Alert when context reaches 75% |

### Tool Debounce

Minimum time between tool announcements (default: 1000ms). Prevents audio spam during rapid tool usage.

## Backend API

### POST /api/audio/generate

Generate TTS audio and return URL for playback.

```bash
curl -X POST http://localhost:8129/api/audio/generate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Claude ready",
    "voice": "en-US-AndrewMultilingualNeural",
    "rate": "+0%",
    "pitch": "+0Hz"
  }'
```

**Response:**
```json
{
  "success": true,
  "url": "http://localhost:8129/audio/<hash>.mp3",
  "cached": false
}
```

**Parameters:**
| Param | Required | Default | Format |
|-------|----------|---------|--------|
| text | Yes | - | String |
| voice | No | `en-US-AndrewMultilingualNeural` | Voice code |
| rate | No | `+0%` | `+N%` or `-N%` |
| pitch | No | `+0Hz` | `+NHz` or `-NHz` |

**Rate limited:** 30 requests/minute per IP

### POST /api/audio/speak

Generate TTS audio AND broadcast to extension for playback.

```bash
curl -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Task complete",
    "voice": "en-US-EmmaMultilingualNeural",
    "rate": "+10%",
    "pitch": "+20Hz",
    "volume": 0.8
  }'
```

**Additional parameter:**
| Param | Default | Description |
|-------|---------|-------------|
| volume | 0.7 | Playback volume (0.0-1.0) |

Broadcasts WebSocket message `{ type: 'audio-speak', url, volume, text }` to all connected clients.

## Caching

Audio files are cached in `/tmp/claude-audio-cache/` with MD5 hash keys based on `voice:rate:pitch:text`. First playback may have a brief delay; subsequent plays are instant.

## Profile Overrides

Per-profile audio settings override global defaults:

| Setting | Options |
|---------|---------|
| Mode | `default` (follow global), `enabled` (always on), `disabled` (never) |
| Voice | Override voice selection |
| Rate | Override speech rate |
| Pitch | Override pitch |

## Master Mute

Header mute button (🔊/🔇) silences all audio regardless of profile settings.

## Troubleshooting

**No audio playing:**
1. Check master mute in header (should show 🔊)
2. Verify audio enabled in Settings → Audio
3. Check backend running: `curl http://localhost:8129/api/health`
4. Verify edge-tts installed: `edge-tts --version`

**Audio delayed:**
- First play generates audio (network delay)
- Subsequent plays use cache (instant)
- Timeout: 3 seconds max wait

**Wrong voice playing:**
- Check profile overrides in Settings → Profiles → [profile]
- "Random" voice assigns unique voice per terminal session
