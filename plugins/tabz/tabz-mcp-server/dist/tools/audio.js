/**
 * Audio Tools
 *
 * Tools for text-to-speech announcements through the browser.
 * Uses edge-tts neural voices via the TabzChrome backend.
 *
 * The extension automatically applies user-configured audio settings
 * (voice, rate, pitch, volume) from Chrome storage, so Claude doesn't
 * need to specify these unless overriding for a specific purpose.
 */
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
// Available voices (edge-tts neural voices that are known to work)
// The extension UI may show more, but these are the reliable ones
const VOICE_OPTIONS = [
    // US Voices
    'en-US-AndrewMultilingualNeural', // Male, warm
    'en-US-EmmaMultilingualNeural', // Female, cheerful
    'en-US-BrianMultilingualNeural', // Male, casual
    'en-US-AriaNeural', // Female, confident
    'en-US-GuyNeural', // Male, passionate
    'en-US-JennyNeural', // Female, friendly
    'en-US-ChristopherNeural', // Male, authoritative
    'en-US-AvaNeural', // Female, caring
    // UK Voices
    'en-GB-SoniaNeural', // Female
    'en-GB-RyanNeural', // Male
    // AU Voices
    'en-AU-NatashaNeural', // Female
    'en-AU-WilliamMultilingualNeural', // Male
];
// Priority levels for audio playback
const PRIORITY_OPTIONS = ['low', 'high'];
// Input schema for tabz_play_audio
const PlayAudioSchema = z.object({
    url: z.string()
        .min(1)
        .describe("URL of the audio file to play. Can be a local URL (e.g., http://localhost:8129/sounds/ding.mp3) or remote URL."),
    volume: z.number()
        .min(0)
        .max(1)
        .optional()
        .describe("Playback volume from 0.0 to 1.0. If not specified, uses user's configured volume."),
    priority: z.enum(PRIORITY_OPTIONS)
        .default('low')
        .describe("Audio priority. 'high' interrupts current audio, 'low' may be skipped if high-priority audio is playing.")
}).strict();
// Input schema for tabz_speak
const SpeakSchema = z.object({
    text: z.string()
        .min(1)
        .max(3000)
        .describe("The text to speak aloud. Markdown formatting will be stripped automatically. Maximum 3000 characters."),
    voice: z.enum(VOICE_OPTIONS)
        .optional()
        .describe("Voice to use. If not specified, uses the user's configured voice from settings. Options: en-US-AndrewMultilingualNeural (default), en-US-EmmaMultilingualNeural, en-US-AriaNeural, en-GB-SoniaNeural, etc."),
    rate: z.string()
        .regex(/^[+-]?\d{1,3}%$/)
        .optional()
        .describe("Speech rate as percentage. Format: '+30%' (faster), '-20%' (slower), '+0%' (normal). If not specified, uses user's configured rate."),
    pitch: z.string()
        .regex(/^[+-]?\d{1,3}Hz$/)
        .optional()
        .describe("Voice pitch in Hz. Format: '+50Hz' (higher), '-100Hz' (lower), '+0Hz' (normal). If not specified, uses user's configured pitch."),
    priority: z.enum(PRIORITY_OPTIONS)
        .default('low')
        .describe("Audio priority. 'high' interrupts current audio (use for important announcements). 'low' is skipped if high-priority audio is playing (use for status updates).")
}).strict();
// Input schema for tabz_list_voices
const ListVoicesSchema = z.object({}).strict();
/**
 * Speak text through the browser using TTS
 */
async function speak(params) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/audio/speak`, {
            text: params.text,
            // Only include optional params if explicitly provided
            // The extension will apply user settings for any missing values
            ...(params.voice && { voice: params.voice }),
            ...(params.rate && { rate: params.rate }),
            ...(params.pitch && { pitch: params.pitch }),
            priority: params.priority
        }, { timeout: 60000 }); // Longer timeout for TTS generation
        if (response.data.success) {
            return { success: true };
        }
        return { success: false, error: response.data.error || 'Speech generation failed' };
    }
    catch (error) {
        const err = handleApiError(error, 'tabz_speak');
        return { success: false, error: err.message };
    }
}
/**
 * Play an audio file through the browser
 */
async function playAudio(params) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/audio/play`, {
            url: params.url,
            volume: params.volume,
            priority: params.priority
        }, { timeout: 5000 });
        if (response.data.success) {
            return { success: true };
        }
        return { success: false, error: response.data.error || 'Audio playback failed' };
    }
    catch (error) {
        const err = handleApiError(error, 'tabz_play_audio');
        return { success: false, error: err.message };
    }
}
/**
 * List available TTS voices
 */
function listVoices() {
    return {
        voices: [
            { code: 'en-US-AndrewMultilingualNeural', description: 'Andrew - US Male, warm and confident' },
            { code: 'en-US-EmmaMultilingualNeural', description: 'Emma - US Female, cheerful and clear' },
            { code: 'en-US-BrianMultilingualNeural', description: 'Brian - US Male, casual and approachable' },
            { code: 'en-US-AriaNeural', description: 'Aria - US Female, confident news-style' },
            { code: 'en-US-GuyNeural', description: 'Guy - US Male, passionate' },
            { code: 'en-US-JennyNeural', description: 'Jenny - US Female, friendly and considerate' },
            { code: 'en-US-ChristopherNeural', description: 'Christopher - US Male, reliable and authoritative' },
            { code: 'en-US-AvaNeural', description: 'Ava - US Female, expressive and caring' },
            { code: 'en-GB-SoniaNeural', description: 'Sonia - UK Female, friendly' },
            { code: 'en-GB-RyanNeural', description: 'Ryan - UK Male, friendly' },
            { code: 'en-AU-NatashaNeural', description: 'Natasha - AU Female, friendly' },
            { code: 'en-AU-WilliamMultilingualNeural', description: 'William - AU Male, friendly' },
        ]
    };
}
/**
 * Register audio tools with the MCP server
 */
export function registerAudioTools(server) {
    // Speak tool
    server.tool("tabz_speak", `Speak text aloud through the browser using neural text-to-speech.

Uses Microsoft Edge neural TTS voices for high-quality, natural speech.
The extension automatically applies the user's configured audio settings
(voice, rate, pitch, volume) unless you explicitly override them.

IMPORTANT: Audio settings from the TabzChrome dashboard are respected:
- If user has disabled audio, this tool will still work (direct invocation)
- User's preferred voice/rate/pitch are used by default
- Override parameters only when you need a specific effect

Args:
  - text (required): The text to speak. Markdown is stripped automatically. Max 3000 chars.
  - voice (optional): Override voice. See tabz_list_voices for options.
  - rate (optional): Override speech rate (e.g., '+30%' faster, '-20%' slower)
  - pitch (optional): Override pitch (e.g., '+50Hz' higher, '-100Hz' lower)
  - priority (optional): 'high' interrupts current audio, 'low' (default) may be skipped

Returns:
  - success: Whether the speech was initiated
  - error: Error message if failed

Examples:
  - Simple announcement: text="Task complete. Ready for next request."
  - Urgent alert: text="Build failed with 3 errors", priority="high"
  - Custom voice: text="Hello!", voice="en-GB-SoniaNeural"
  - Fast reading: text="Summary of changes...", rate="+40%"

Best Practices:
  - Keep text concise for status updates
  - Use priority='high' sparingly (for errors, completion of long tasks)
  - Let user settings control voice unless you have a specific reason to override

Error Handling:
  - "Cannot connect": Backend not running at localhost:8129
  - "TTS generation failed": edge-tts service issue (network/timeout)`, SpeakSchema.shape, async (params) => {
        try {
            const result = await speak(params);
            let resultText;
            if (result.success) {
                const textPreview = params.text.length > 50
                    ? params.text.substring(0, 50) + '...'
                    : params.text;
                resultText = `## Speech Initiated

**Text:** "${textPreview}"
**Priority:** ${params.priority}
${params.voice ? `**Voice:** ${params.voice}` : '**Voice:** User default'}
${params.rate ? `**Rate:** ${params.rate}` : ''}
${params.pitch ? `**Pitch:** ${params.pitch}` : ''}

Audio will play through the browser. The user's volume and mute settings apply.`;
            }
            else {
                resultText = `## Speech Failed

**Error:** ${result.error}

Possible causes:
- Backend not running: Check \`localhost:8129\`
- TTS service unavailable: Network issues with edge-tts
- Invalid parameters: Check voice/rate/pitch format`;
            }
            return {
                content: [{ type: "text", text: resultText }],
                isError: !result.success
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // List voices tool
    server.tool("tabz_list_voices", `List available text-to-speech voices.

Returns the neural TTS voices available for use with tabz_speak.
All voices are high-quality Microsoft Edge neural voices.

Returns:
  - List of voice codes with descriptions

Use the voice code (e.g., 'en-US-AriaNeural') with tabz_speak's voice parameter.`, ListVoicesSchema.shape, async () => {
        const result = listVoices();
        const lines = [
            "# Available TTS Voices",
            "",
            "Use these voice codes with `tabz_speak`'s `voice` parameter.",
            "If not specified, the user's configured voice from Settings is used.",
            "",
            "## US English",
            ...result.voices
                .filter(v => v.code.startsWith('en-US'))
                .map(v => `- **${v.code}**: ${v.description}`),
            "",
            "## UK English",
            ...result.voices
                .filter(v => v.code.startsWith('en-GB'))
                .map(v => `- **${v.code}**: ${v.description}`),
            "",
            "## Australian English",
            ...result.voices
                .filter(v => v.code.startsWith('en-AU'))
                .map(v => `- **${v.code}**: ${v.description}`),
        ];
        return {
            content: [{ type: "text", text: lines.join("\n") }]
        };
    });
    // Play audio file tool
    server.tool("tabz_play_audio", `Play an audio file through the browser.

Plays MP3, WAV, OGG, or other browser-supported audio formats.
Useful for soundboards, notifications, alerts, or any audio feedback.

The backend can serve static audio files from its public directory,
or you can play any accessible URL.

Args:
  - url (required): URL of the audio file to play
    - Local: http://localhost:8129/sounds/ding.mp3
    - Remote: https://example.com/sound.mp3
  - volume (optional): 0.0 to 1.0 (uses user's setting if not specified)
  - priority (optional): 'high' interrupts, 'low' (default) may be skipped

Returns:
  - success: Whether playback was initiated
  - error: Error message if failed

Examples:
  - Play notification: url="http://localhost:8129/sounds/notify.mp3"
  - Play at half volume: url="...", volume=0.5
  - Urgent sound: url="...", priority="high"

Serving Audio Files:
  Place audio files in backend/public/sounds/ to serve them at:
  http://localhost:8129/sounds/<filename>

Error Handling:
  - "Cannot connect": Backend not running
  - Audio may not play if browser tab is not focused (browser limitation)`, PlayAudioSchema.shape, async (params) => {
        try {
            const result = await playAudio(params);
            let resultText;
            if (result.success) {
                resultText = `## Audio Playback Initiated

**URL:** ${params.url}
${params.volume !== undefined ? `**Volume:** ${params.volume}` : '**Volume:** User default'}
**Priority:** ${params.priority}

Audio will play through the browser. The user's mute setting applies.`;
            }
            else {
                resultText = `## Audio Playback Failed

**Error:** ${result.error}

Possible causes:
- Backend not running at localhost:8129
- Audio URL not accessible
- Invalid audio format`;
            }
            return {
                content: [{ type: "text", text: resultText }],
                isError: !result.success
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=audio.js.map