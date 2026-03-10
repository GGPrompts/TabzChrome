/**
 * Emulation Tools
 *
 * Tools for Chrome DevTools Protocol Emulation domain.
 * Provides device emulation, network throttling, geolocation spoofing,
 * media emulation, and vision deficiency simulation.
 *
 * Note: CDP emulation settings persist while the debugger is attached.
 * The debugger banner will appear in Chrome while emulation is active.
 * Use tabz_emulate_clear to reset all emulation and detach.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import { ResponseFormat } from "../types.js";

// =====================================
// Device Presets
// =====================================

const DEVICE_PRESETS = {
  iPhone_14: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true },
  iPhone_14_Pro_Max: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true },
  iPhone_SE: { width: 375, height: 667, deviceScaleFactor: 2, mobile: true },
  Pixel_7: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true },
  Pixel_7_Pro: { width: 412, height: 892, deviceScaleFactor: 3.5, mobile: true },
  iPad: { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true },
  iPad_Pro: { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true },
  Galaxy_S23: { width: 360, height: 780, deviceScaleFactor: 3, mobile: true },
  Galaxy_Fold: { width: 280, height: 653, deviceScaleFactor: 3, mobile: true },
} as const;

const DEVICE_NAMES = Object.keys(DEVICE_PRESETS) as (keyof typeof DEVICE_PRESETS)[];

// =====================================
// Network Presets
// =====================================

const NETWORK_PRESETS = {
  offline: { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0, description: 'No network connection' },
  slow_3g: { offline: false, downloadThroughput: 50000, uploadThroughput: 50000, latency: 2000, description: 'Slow 3G (50 KB/s, 2s latency)' },
  fast_3g: { offline: false, downloadThroughput: 180000, uploadThroughput: 84375, latency: 562, description: 'Fast 3G (180 KB/s, 562ms latency)' },
  '4g': { offline: false, downloadThroughput: 4000000, uploadThroughput: 3000000, latency: 20, description: '4G LTE (4 MB/s, 20ms latency)' },
  wifi: { offline: false, downloadThroughput: 30000000, uploadThroughput: 15000000, latency: 2, description: 'WiFi (30 MB/s, 2ms latency)' },
  no_throttle: { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0, description: 'No throttling' },
} as const;

const NETWORK_PRESET_NAMES = Object.keys(NETWORK_PRESETS) as (keyof typeof NETWORK_PRESETS)[];

// =====================================
// Vision Deficiency Types
// =====================================

const VISION_TYPES = [
  'none',
  'blurredVision',
  'reducedContrast',
  'achromatopsia',
  'deuteranopia',
  'protanopia',
  'tritanopia'
] as const;

const VISION_DESCRIPTIONS: Record<typeof VISION_TYPES[number], string> = {
  none: 'Normal vision',
  blurredVision: 'Blurred vision simulation',
  reducedContrast: 'Reduced contrast sensitivity',
  achromatopsia: 'Total color blindness (monochromacy)',
  deuteranopia: 'Red-green color blindness (green-blind, ~6% of males)',
  protanopia: 'Red-green color blindness (red-blind, ~2% of males)',
  tritanopia: 'Blue-yellow color blindness (~0.01% of population)'
};

// =====================================
// API Functions
// =====================================

interface EmulateDeviceResult {
  success: boolean;
  device?: string;
  metrics?: { width: number; height: number; deviceScaleFactor: number; mobile: boolean };
  message?: string;
  error?: string;
}

async function emulateDevice(options: {
  tabId?: number;
  device?: string;
  width?: number;
  height?: number;
  deviceScaleFactor?: number;
  mobile?: boolean;
}): Promise<EmulateDeviceResult> {
  try {
    const response = await axios.post<EmulateDeviceResult>(
      `${BACKEND_URL}/api/browser/emulation/device`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to emulate device");
  }
}

interface EmulateClearResult {
  success: boolean;
  cleared?: string[];
  message?: string;
  error?: string;
}

async function emulateClear(options: { tabId?: number }): Promise<EmulateClearResult> {
  try {
    const response = await axios.post<EmulateClearResult>(
      `${BACKEND_URL}/api/browser/emulation/clear`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to clear emulation");
  }
}

interface EmulateGeolocationResult {
  success: boolean;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  message?: string;
  error?: string;
}

async function emulateGeolocation(options: {
  tabId?: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  clear?: boolean;
}): Promise<EmulateGeolocationResult> {
  try {
    const response = await axios.post<EmulateGeolocationResult>(
      `${BACKEND_URL}/api/browser/emulation/geolocation`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to emulate geolocation");
  }
}

interface EmulateNetworkResult {
  success: boolean;
  preset?: string;
  conditions?: { offline: boolean; downloadThroughput: number; uploadThroughput: number; latency: number };
  message?: string;
  error?: string;
}

async function emulateNetwork(options: {
  tabId?: number;
  preset?: string;
  offline?: boolean;
  downloadThroughput?: number;
  uploadThroughput?: number;
  latency?: number;
}): Promise<EmulateNetworkResult> {
  try {
    const response = await axios.post<EmulateNetworkResult>(
      `${BACKEND_URL}/api/browser/emulation/network`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to emulate network");
  }
}

interface EmulateMediaResult {
  success: boolean;
  media?: string;
  features?: Array<{ name: string; value: string }>;
  message?: string;
  error?: string;
}

async function emulateMedia(options: {
  tabId?: number;
  media?: 'screen' | 'print' | '';
  colorScheme?: 'light' | 'dark' | 'no-preference';
  reducedMotion?: 'reduce' | 'no-preference';
  forcedColors?: 'active' | 'none';
}): Promise<EmulateMediaResult> {
  try {
    const response = await axios.post<EmulateMediaResult>(
      `${BACKEND_URL}/api/browser/emulation/media`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to emulate media");
  }
}

interface EmulateVisionResult {
  success: boolean;
  visionType?: string;
  message?: string;
  error?: string;
}

async function emulateVision(options: {
  tabId?: number;
  type: string;
}): Promise<EmulateVisionResult> {
  try {
    const response = await axios.post<EmulateVisionResult>(
      `${BACKEND_URL}/api/browser/emulation/vision`,
      options,
      { timeout: 15000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to emulate vision deficiency");
  }
}

// =====================================
// Input Schemas
// =====================================

const EmulateDeviceSchema = z.object({
  device: z.enum(['custom', ...DEVICE_NAMES] as [string, ...string[]])
    .optional()
    .describe(`Device preset to emulate. Options: ${DEVICE_NAMES.join(', ')}. Use 'custom' for manual dimensions.`),
  width: z.number()
    .int()
    .min(1)
    .max(4096)
    .optional()
    .describe("Viewport width in pixels (required if device='custom')"),
  height: z.number()
    .int()
    .min(1)
    .max(4096)
    .optional()
    .describe("Viewport height in pixels (required if device='custom')"),
  deviceScaleFactor: z.number()
    .min(0.5)
    .max(4)
    .default(1)
    .describe("Device pixel ratio (2-3 for retina/mobile displays)"),
  mobile: z.boolean()
    .default(true)
    .describe("Enable mobile mode (touch events, mobile user agent)"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target tab ID (defaults to active tab)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

type EmulateDeviceInput = z.infer<typeof EmulateDeviceSchema>;

const EmulateClearSchema = z.object({
  tabId: z.number()
    .int()
    .optional()
    .describe("Target tab ID (defaults to active tab)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

type EmulateClearInput = z.infer<typeof EmulateClearSchema>;

const EmulateGeolocationSchema = z.object({
  latitude: z.number()
    .min(-90)
    .max(90)
    .optional()
    .describe("Latitude in degrees (-90 to 90)"),
  longitude: z.number()
    .min(-180)
    .max(180)
    .optional()
    .describe("Longitude in degrees (-180 to 180)"),
  accuracy: z.number()
    .min(0)
    .default(100)
    .describe("Accuracy in meters"),
  clear: z.boolean()
    .optional()
    .describe("Set to true to clear geolocation override"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target tab ID (defaults to active tab)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

type EmulateGeolocationInput = z.infer<typeof EmulateGeolocationSchema>;

const EmulateNetworkSchema = z.object({
  preset: z.enum(NETWORK_PRESET_NAMES as [string, ...string[]])
    .optional()
    .describe(`Network preset: ${NETWORK_PRESET_NAMES.join(', ')}`),
  offline: z.boolean()
    .optional()
    .describe("Simulate offline mode (for custom conditions)"),
  downloadThroughput: z.number()
    .optional()
    .describe("Download speed in bytes/sec, -1 for disabled (for custom conditions)"),
  uploadThroughput: z.number()
    .optional()
    .describe("Upload speed in bytes/sec, -1 for disabled (for custom conditions)"),
  latency: z.number()
    .optional()
    .describe("Network latency in milliseconds (for custom conditions)"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target tab ID (defaults to active tab)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

type EmulateNetworkInput = z.infer<typeof EmulateNetworkSchema>;

const EmulateMediaSchema = z.object({
  media: z.enum(['screen', 'print', ''])
    .optional()
    .describe("CSS media type: 'screen', 'print', or '' to reset"),
  colorScheme: z.enum(['light', 'dark', 'no-preference'])
    .optional()
    .describe("Emulate prefers-color-scheme media feature"),
  reducedMotion: z.enum(['reduce', 'no-preference'])
    .optional()
    .describe("Emulate prefers-reduced-motion media feature"),
  forcedColors: z.enum(['active', 'none'])
    .optional()
    .describe("Emulate forced-colors media feature (high contrast mode)"),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target tab ID (defaults to active tab)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

type EmulateMediaInput = z.infer<typeof EmulateMediaSchema>;

const EmulateVisionSchema = z.object({
  type: z.enum(VISION_TYPES)
    .describe(`Vision deficiency type: ${VISION_TYPES.join(', ')}`),
  tabId: z.number()
    .int()
    .optional()
    .describe("Target tab ID (defaults to active tab)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

type EmulateVisionInput = z.infer<typeof EmulateVisionSchema>;

// =====================================
// Tool Registration
// =====================================

/**
 * Register emulation tools with the MCP server
 */
export function registerEmulationTools(server: McpServer): void {

  // Emulate Device
  server.tool(
    "tabz_emulate_device",
    `Emulate mobile or tablet device viewport using Chrome DevTools Protocol.

Changes the page viewport to match the selected device dimensions, pixel ratio, and mobile mode.
The debugger will remain attached while emulation is active.

**Available Presets:**
${DEVICE_NAMES.map(name => {
  const d = DEVICE_PRESETS[name];
  return `- ${name}: ${d.width}x${d.height} @${d.deviceScaleFactor}x`;
}).join('\n')}

**Note:** Chrome will show a "debugging" banner while emulation is active.
Use tabz_emulate_clear to reset viewport and detach debugger.

Args:
  - device: Preset name or 'custom' for manual dimensions
  - width/height: Required if device='custom'
  - deviceScaleFactor: Pixel ratio (default: from preset or 1)
  - mobile: Enable mobile mode (default: true)
  - tabId: Target tab (default: active tab)

Examples:
  - iPhone 14: device="iPhone_14"
  - iPad Pro: device="iPad_Pro"
  - Custom: device="custom", width=400, height=800, deviceScaleFactor=2`,
    EmulateDeviceSchema.shape,
    async (params: EmulateDeviceInput) => {
      try {
        const result = await emulateDevice({
          tabId: params.tabId,
          device: params.device,
          width: params.width,
          height: params.height,
          deviceScaleFactor: params.deviceScaleFactor,
          mobile: params.mobile
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Device Emulation Failed\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Device Emulation Active");
          lines.push("");
          lines.push(`**Device:** ${result.device}`);
          if (result.metrics) {
            lines.push(`**Viewport:** ${result.metrics.width}x${result.metrics.height}`);
            lines.push(`**Scale Factor:** ${result.metrics.deviceScaleFactor}x`);
            lines.push(`**Mobile Mode:** ${result.metrics.mobile ? 'Yes' : 'No'}`);
          }
          lines.push("");
          lines.push("---");
          lines.push("Use `tabz_emulate_clear` to reset viewport and detach debugger.");
          resultText = lines.join("\n");
        }

        return { content: [{ type: "text", text: resultText }] };
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

  // Clear Emulation
  server.tool(
    "tabz_emulate_clear",
    `Clear all emulation overrides and detach the Chrome debugger.

Resets device viewport, geolocation, network conditions, media features, and vision deficiency simulation.
Also detaches the debugger, removing the yellow debugging banner.

Use this tool after testing responsive designs or accessibility features.

Args:
  - tabId: Target tab (default: active tab)`,
    EmulateClearSchema.shape,
    async (params: EmulateClearInput) => {
      try {
        const result = await emulateClear({ tabId: params.tabId });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Clear Emulation Failed\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Emulation Cleared");
          lines.push("");
          if (result.cleared && result.cleared.length > 0) {
            lines.push(`**Cleared:** ${result.cleared.join(', ')}`);
          }
          lines.push("");
          lines.push("Debugger detached. Page returned to normal state.");
          resultText = lines.join("\n");
        }

        return { content: [{ type: "text", text: resultText }] };
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

  // Emulate Geolocation
  server.tool(
    "tabz_emulate_geolocation",
    `Override browser geolocation using Chrome DevTools Protocol.

Spoofs the GPS coordinates returned by the Geolocation API.
Useful for testing location-based features.

**Common Locations:**
- San Francisco: 37.7749, -122.4194
- New York: 40.7128, -74.0060
- London: 51.5074, -0.1278
- Tokyo: 35.6762, 139.6503
- Sydney: -33.8688, 151.2093

**Note:** Chrome will show a "debugging" banner while override is active.

Args:
  - latitude: Latitude in degrees (-90 to 90)
  - longitude: Longitude in degrees (-180 to 180)
  - accuracy: Accuracy in meters (default: 100)
  - clear: Set to true to clear the override
  - tabId: Target tab (default: active tab)

Examples:
  - San Francisco: latitude=37.7749, longitude=-122.4194
  - Clear override: clear=true`,
    EmulateGeolocationSchema.shape,
    async (params: EmulateGeolocationInput) => {
      try {
        const result = await emulateGeolocation({
          tabId: params.tabId,
          latitude: params.latitude,
          longitude: params.longitude,
          accuracy: params.accuracy,
          clear: params.clear
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Geolocation Override Failed\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          const lines: string[] = [];
          if (params.clear) {
            lines.push("# Geolocation Override Cleared");
            lines.push("");
            lines.push("Browser will use real location for geolocation requests.");
          } else {
            lines.push("# Geolocation Override Active");
            lines.push("");
            lines.push(`**Latitude:** ${result.latitude}`);
            lines.push(`**Longitude:** ${result.longitude}`);
            lines.push(`**Accuracy:** ${result.accuracy}m`);
            lines.push("");
            lines.push("---");
            lines.push("Use `tabz_emulate_geolocation` with `clear=true` to reset.");
          }
          resultText = lines.join("\n");
        }

        return { content: [{ type: "text", text: resultText }] };
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

  // Emulate Network
  server.tool(
    "tabz_emulate_network",
    `Throttle network speed using Chrome DevTools Protocol.

Simulates slow network conditions like 3G or offline mode.
Useful for testing loading states and offline behavior.

**Available Presets:**
${NETWORK_PRESET_NAMES.map(name => `- ${name}: ${NETWORK_PRESETS[name].description}`).join('\n')}

**Note:** Chrome will show a "debugging" banner while throttling is active.
Network throttling affects all requests from the tab.

Args:
  - preset: Network preset name
  - Or custom values: offline, downloadThroughput, uploadThroughput, latency
  - tabId: Target tab (default: active tab)

Examples:
  - Slow 3G: preset="slow_3g"
  - Offline: preset="offline"
  - Remove throttling: preset="no_throttle"`,
    EmulateNetworkSchema.shape,
    async (params: EmulateNetworkInput) => {
      try {
        const result = await emulateNetwork({
          tabId: params.tabId,
          preset: params.preset,
          offline: params.offline,
          downloadThroughput: params.downloadThroughput,
          uploadThroughput: params.uploadThroughput,
          latency: params.latency
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Network Emulation Failed\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Network Throttling Active");
          lines.push("");
          lines.push(`**Preset:** ${result.preset}`);
          if (result.conditions) {
            const c = result.conditions;
            lines.push(`**Offline:** ${c.offline ? 'Yes' : 'No'}`);
            if (!c.offline) {
              const formatSpeed = (bps: number) => bps < 0 ? 'Unlimited' : bps >= 1000000 ? `${(bps/1000000).toFixed(1)} MB/s` : `${(bps/1000).toFixed(0)} KB/s`;
              lines.push(`**Download:** ${formatSpeed(c.downloadThroughput)}`);
              lines.push(`**Upload:** ${formatSpeed(c.uploadThroughput)}`);
              lines.push(`**Latency:** ${c.latency}ms`);
            }
          }
          lines.push("");
          lines.push("---");
          lines.push("Use `tabz_emulate_clear` or `preset=\"no_throttle\"` to reset.");
          resultText = lines.join("\n");
        }

        return { content: [{ type: "text", text: resultText }] };
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

  // Emulate Media
  server.tool(
    "tabz_emulate_media",
    `Emulate CSS media type and features using Chrome DevTools Protocol.

Override media queries for testing responsive designs and accessibility preferences.

**Media Types:**
- screen: Normal display
- print: Print preview mode

**Media Features:**
- colorScheme: prefers-color-scheme (light/dark)
- reducedMotion: prefers-reduced-motion (reduce/no-preference)
- forcedColors: forced-colors (active/none for high contrast)

**Note:** Chrome will show a "debugging" banner while emulation is active.

Args:
  - media: CSS media type ('screen', 'print', or '' to clear)
  - colorScheme: 'light', 'dark', or 'no-preference'
  - reducedMotion: 'reduce' or 'no-preference'
  - forcedColors: 'active' or 'none'
  - tabId: Target tab (default: active tab)

Examples:
  - Dark mode: colorScheme="dark"
  - Print preview: media="print"
  - Reduced motion: reducedMotion="reduce"`,
    EmulateMediaSchema.shape,
    async (params: EmulateMediaInput) => {
      try {
        const result = await emulateMedia({
          tabId: params.tabId,
          media: params.media,
          colorScheme: params.colorScheme,
          reducedMotion: params.reducedMotion,
          forcedColors: params.forcedColors
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Media Emulation Failed\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Media Emulation Active");
          lines.push("");
          if (result.media) {
            lines.push(`**Media Type:** ${result.media}`);
          }
          if (result.features && result.features.length > 0) {
            lines.push("**Features:**");
            for (const f of result.features) {
              lines.push(`- ${f.name}: ${f.value}`);
            }
          }
          if (result.message) {
            lines.push("");
            lines.push(result.message);
          }
          lines.push("");
          lines.push("---");
          lines.push("Use `tabz_emulate_clear` to reset all media features.");
          resultText = lines.join("\n");
        }

        return { content: [{ type: "text", text: resultText }] };
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

  // Emulate Vision Deficiency
  server.tool(
    "tabz_emulate_vision",
    `Simulate vision deficiency using Chrome DevTools Protocol.

Applies color filters to simulate how the page appears to users with various vision conditions.
Useful for accessibility testing.

**Vision Types:**
${VISION_TYPES.map(t => `- ${t}: ${VISION_DESCRIPTIONS[t]}`).join('\n')}

**Note:** Chrome will show a "debugging" banner while simulation is active.
This affects the visual rendering only, not the underlying content.

Args:
  - type: Vision deficiency type to simulate
  - tabId: Target tab (default: active tab)

Examples:
  - Red-green colorblindness: type="deuteranopia"
  - Clear simulation: type="none"`,
    EmulateVisionSchema.shape,
    async (params: EmulateVisionInput) => {
      try {
        const result = await emulateVision({
          tabId: params.tabId,
          type: params.type
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Vision Emulation Failed\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result, null, 2);
        } else {
          const lines: string[] = [];
          if (params.type === 'none') {
            lines.push("# Vision Simulation Cleared");
            lines.push("");
            lines.push("Page returned to normal color rendering.");
          } else {
            lines.push("# Vision Deficiency Simulation Active");
            lines.push("");
            lines.push(`**Type:** ${params.type}`);
            lines.push(`**Description:** ${VISION_DESCRIPTIONS[params.type]}`);
            lines.push("");
            lines.push("---");
            lines.push("Use `type=\"none\"` or `tabz_emulate_clear` to reset.");
          }
          resultText = lines.join("\n");
        }

        return { content: [{ type: "text", text: resultText }] };
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
