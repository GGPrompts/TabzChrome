# Audio/TTS Integration for External Projects

Add voice notifications to your scripts and applications using TabzChrome's TTS system.

## Quick Start

Speak text from any terminal or script:

```bash
curl -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Build complete"}'
```

## Available Voices

Neural voices from Microsoft Edge TTS:

| Voice | Code | Accent |
|-------|------|--------|
| Andrew | `en-US-AndrewNeural` | US Male (default) |
| Emma | `en-US-EmmaNeural` | US Female |
| Brian | `en-US-BrianNeural` | US Male |
| Aria | `en-US-AriaNeural` | US Female |
| Guy | `en-US-GuyNeural` | US Male |
| Jenny | `en-US-JennyNeural` | US Female |
| Sonia | `en-GB-SoniaNeural` | UK Female |
| Ryan | `en-GB-RyanNeural` | UK Male |
| Natasha | `en-AU-NatashaNeural` | AU Female |
| William | `en-AU-WilliamNeural` | AU Male |

## Parameters

### Rate (Speed)

Format: `+N%` or `-N%`

| Value | Effect |
|-------|--------|
| `-50%` | Half speed |
| `+0%` | Normal (default) |
| `+50%` | 1.5x speed |
| `+100%` | Double speed |

### Pitch

Format: `+NHz` or `-NHz`

| Value | Effect |
|-------|--------|
| `-200Hz` | Much lower, calmer |
| `+0Hz` | Normal (default) |
| `+100Hz` | Higher, urgent |
| `+300Hz` | Maximum pitch |

### Priority

- `low` (default) - Normal announcements, can be skipped if high-priority playing
- `high` - Important alerts, interrupts other audio

## Shell Helper Function

Add to `.bashrc` or `.zshrc`:

```bash
say() {
  local text="$*"
  curl -s -X POST http://localhost:8129/api/audio/speak \
    -H "Content-Type: application/json" \
    -d "{\"text\": $(echo "$text" | jq -Rs .)}" > /dev/null
}

# Usage:
# say "Build complete"
# say "Error: tests failed"
```

### With Options

```bash
say_urgent() {
  local text="$*"
  curl -s -X POST http://localhost:8129/api/audio/speak \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": $(echo "$text" | jq -Rs .),
      \"priority\": \"high\",
      \"pitch\": \"+100Hz\",
      \"rate\": \"+20%\"
    }" > /dev/null
}

# Usage: say_urgent "Critical error!"
```

## JavaScript/Node.js

```javascript
async function speak(text, options = {}) {
  await fetch('http://localhost:8129/api/audio/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...options })
  });
}

// Usage
await speak('Task complete');
await speak('Warning!', { priority: 'high', pitch: '+100Hz' });
```

## Python

```python
import requests

def speak(text, **kwargs):
    requests.post('http://localhost:8129/api/audio/speak',
                  json={'text': text, **kwargs})

# Usage
speak("Build complete")
speak("Error!", priority="high", pitch="+100Hz")
```

## MCP Tool

From Claude Code or MCP-compatible clients:

```bash
mcp-cli call tabz/tabz_speak '{"text": "Build complete"}'
mcp-cli call tabz/tabz_speak '{"text": "Alert!", "priority": "high"}'
```

## Use Cases

### Build/Test Notifications

```bash
npm run build && say "Build succeeded" || say_urgent "Build failed"
npm test && say "Tests passed" || say_urgent "Tests failed"
```

### Long-Running Task Completion

```bash
./long-script.sh; say "Script finished"
```

### CI/CD Integration

```bash
# In CI script
curl -X POST http://localhost:8129/api/audio/speak \
  -d '{"text": "Deployment complete", "priority": "high"}'
```

## Audio Caching

Audio is cached in `/tmp/claude-audio-cache/` based on text + voice + rate + pitch hash. First play generates audio (brief delay), subsequent plays are instant.

## Rate Limiting

The API is rate-limited to 30 requests per minute per IP to prevent abuse.

## Troubleshooting

**No audio playing**
- Check backend running: `curl http://localhost:8129/api/health`
- Verify edge-tts installed: `edge-tts --version`
- Check Chrome sidebar is open

**Wrong voice**
- User settings may override; specify voice explicitly in API call

**Audio delayed**
- First generation has network delay; subsequent plays use cache
