# Text-to-Speech Notifications

## Speak Text
```
mcp__tabz__tabz_speak
```
Options:
- `text`: What to say
- `voice`: Voice name (optional)
- `priority`: "high" interrupts current speech

## List Available Voices
```
mcp__tabz__tabz_list_voices
```
Returns available TTS voices with language codes.

## Play Audio File
```
mcp__tabz__tabz_play_audio
```
Options:
- `url`: Audio file URL or path

## Use Cases

- Task completion: "Build complete"
- Errors: "Tests failed"
- Attention needed: "Waiting for input"
- Long operation done: "Download finished"
