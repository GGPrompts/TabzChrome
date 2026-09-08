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

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { docsPointer } from "../descriptions.js";

// Available voices (edge-tts neural voices that are known to work)
// The extension UI may show more, but these are the reliable ones
const VOICE_OPTIONS = [
  // US Voices
  'en-US-AndrewMultilingualNeural',  // Male, warm
  'en-US-EmmaMultilingualNeural',    // Female, cheerful
  'en-US-BrianMultilingualNeural',   // Male, casual
  'en-US-AriaNeural',                // Female, confident
  'en-US-GuyNeural',                 // Male, passionate
  'en-US-JennyNeural',               // Female, friendly
  'en-US-ChristopherNeural',         // Male, authoritative
  'en-US-AvaNeural',                 // Female, caring
  // UK Voices
  'en-GB-SoniaNeural',               // Female
  'en-GB-RyanNeural',                // Male
  // AU Voices
  'en-AU-NatashaNeural',             // Female
  'en-AU-WilliamMultilingualNeural', // Male
] as const;

type VoiceOption = typeof VOICE_OPTIONS[number];

// Priority levels for audio playback
const PRIORITY_OPTIONS = ['low', 'high'] as const;
type PriorityOption = typeof PRIORITY_OPTIONS[number];

// Input schema for tabz_play_audio
const PlayAudioSchema = z.object({
  url: z.string()
    .min(1)
    .describe("Audio URL, local or remote."),
  volume: z.number()
    .min(0)
    .max(1)
    .optional()
    .describe("Volume from 0 to 1; configured default otherwise."),
  priority: z.enum(PRIORITY_OPTIONS)
    .default('low')
    .describe("High interrupts; low may be skipped.")
}).strict();

type PlayAudioInput = z.infer<typeof PlayAudioSchema>;

// Input schema for tabz_speak
const SpeakSchema = z.object({
  text: z.string()
    .min(1)
    .max(3000)
    .describe("Text to speak; Markdown is stripped. Max 3000 characters."),
  voice: z.enum(VOICE_OPTIONS as unknown as [string, ...string[]])
    .optional()
    .describe("Voice name; configured voice by default."),
  rate: z.string()
    .regex(/^[+-]?\d{1,3}%$/)
    .optional()
    .describe("Speech rate, e.g. '+30%' or '-20%'."),
  pitch: z.string()
    .regex(/^[+-]?\d{1,3}Hz$/)
    .optional()
    .describe("Pitch, e.g. '+50Hz' or '-100Hz'."),
  priority: z.enum(PRIORITY_OPTIONS)
    .default('low')
    .describe("High interrupts; low may be skipped.")
}).strict();

type SpeakInput = z.infer<typeof SpeakSchema>;

// Input schema for tabz_list_voices
const ListVoicesSchema = z.object({}).strict();

/**
 * Speak text through the browser using TTS
 */
async function speak(params: SpeakInput): Promise<{ success: boolean; error?: string }> {
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
  } catch (error) {
    const err = handleApiError(error, 'tabz_speak');
    return { success: false, error: err.message };
  }
}

/**
 * Play an audio file through the browser
 */
async function playAudio(params: PlayAudioInput): Promise<{ success: boolean; error?: string }> {
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
  } catch (error) {
    const err = handleApiError(error, 'tabz_play_audio');
    return { success: false, error: err.message };
  }
}

/**
 * List available TTS voices
 */
function listVoices(): { voices: Array<{ code: string; description: string }> } {
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
export function registerAudioTools(server: McpServer): void {
  // Speak tool
  registerTabzTool(server,
    "tabz_speak",
    "Speak text with the configured browser voice. " + docsPointer("tabz_speak"),
    SpeakSchema,
    async (params: SpeakInput) => {
      try {
        const result = await speak(params);

        let resultText: string;
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
        } else {
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
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // List voices tool
  registerTabzTool(server,
    "tabz_list_voices",
    "List available text-to-speech voices. " + docsPointer("tabz_list_voices"),
    ListVoicesSchema,
    async () => {
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
    }
  );

  // Play audio file tool
  registerTabzTool(server,
    "tabz_play_audio",
    "Play an audio URL through the browser. " + docsPointer("tabz_play_audio"),
    PlayAudioSchema,
    async (params: PlayAudioInput) => {
      try {
        const result = await playAudio(params);

        let resultText: string;
        if (result.success) {
          resultText = `## Audio Playback Initiated

**URL:** ${params.url}
${params.volume !== undefined ? `**Volume:** ${params.volume}` : '**Volume:** User default'}
**Priority:** ${params.priority}

Audio will play through the browser. The user's mute setting applies.`;
        } else {
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
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}
