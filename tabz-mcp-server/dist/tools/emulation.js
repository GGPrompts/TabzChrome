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
import { registerTabzTool } from "../register.js";
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
};
const DEVICE_NAMES = Object.keys(DEVICE_PRESETS);
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
};
const NETWORK_PRESET_NAMES = Object.keys(NETWORK_PRESETS);
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
];
const VISION_DESCRIPTIONS = {
    none: 'Normal vision',
    blurredVision: 'Blurred vision simulation',
    reducedContrast: 'Reduced contrast sensitivity',
    achromatopsia: 'Total color blindness (monochromacy)',
    deuteranopia: 'Red-green color blindness (green-blind, ~6% of males)',
    protanopia: 'Red-green color blindness (red-blind, ~2% of males)',
    tritanopia: 'Blue-yellow color blindness (~0.01% of population)'
};
async function emulateDevice(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/emulate/device`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to emulate device");
    }
}
async function emulateClear(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/emulate/clear`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to clear emulation");
    }
}
async function emulateGeolocation(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/emulate/geolocation`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to emulate geolocation");
    }
}
async function emulateNetwork(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/emulate/network`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to emulate network");
    }
}
async function emulateMedia(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/emulate/media`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to emulate media");
    }
}
async function emulateVision(options) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/emulate/vision`, options, { timeout: 15000 });
        return response.data;
    }
    catch (error) {
        throw handleApiError(error, "Failed to emulate vision deficiency");
    }
}
// =====================================
// Input Schemas
// =====================================
const EmulateDeviceSchema = z.object({
    device: z.enum(['custom', ...DEVICE_NAMES])
        .optional()
        .describe("Device preset, or 'custom' with width and height."),
    width: z.number()
        .int()
        .min(1)
        .max(4096)
        .optional(),
    height: z.number()
        .int()
        .min(1)
        .max(4096)
        .optional(),
    deviceScaleFactor: z.number()
        .min(0.5)
        .max(4)
        .default(1)
        .describe("Device pixel ratio; 2-3 is retina."),
    mobile: z.boolean()
        .default(true)
        .describe("Touch events and a mobile user agent."),
    tabId: z.number()
        .int()
        .optional(),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
const EmulateClearSchema = z.object({
    tabId: z.number()
        .int()
        .optional(),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
const EmulateGeolocationSchema = z.object({
    latitude: z.number()
        .min(-90)
        .max(90)
        .optional()
        .describe("Latitude in degrees."),
    longitude: z.number()
        .min(-180)
        .max(180)
        .optional()
        .describe("Longitude in degrees."),
    accuracy: z.number()
        .min(0)
        .default(100)
        .describe("Accuracy in metres."),
    clear: z.boolean()
        .optional()
        .describe("Clear the override instead."),
    tabId: z.number()
        .int()
        .optional(),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
const EmulateNetworkSchema = z.object({
    preset: z.enum(NETWORK_PRESET_NAMES)
        .optional()
        .describe("Throttling preset, instead of the custom fields."),
    offline: z.boolean()
        .optional()
        .describe("Custom: go offline."),
    downloadThroughput: z.number()
        .optional()
        .describe("Custom: bytes/sec down, -1 to disable."),
    uploadThroughput: z.number()
        .optional()
        .describe("Custom: bytes/sec up, -1 to disable."),
    latency: z.number()
        .optional()
        .describe("Custom: added latency in ms."),
    tabId: z.number()
        .int()
        .optional(),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
const EmulateMediaSchema = z.object({
    media: z.enum(['screen', 'print', ''])
        .optional()
        .describe("CSS media type; '' resets it."),
    colorScheme: z.enum(['light', 'dark', 'no-preference'])
        .optional()
        .describe("prefers-color-scheme."),
    reducedMotion: z.enum(['reduce', 'no-preference'])
        .optional()
        .describe("prefers-reduced-motion."),
    forcedColors: z.enum(['active', 'none'])
        .optional()
        .describe("forced-colors, for high contrast."),
    tabId: z.number()
        .int()
        .optional(),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
const EmulateVisionSchema = z.object({
    type: z.enum(VISION_TYPES),
    tabId: z.number()
        .int()
        .optional(),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
// =====================================
// Tool Registration
// =====================================
/**
 * Register emulation tools with the MCP server
 */
export function registerEmulationTools(server) {
    // Emulate Device
    registerTabzTool(server, "tabz_emulate_device", "Emulate a mobile or tablet viewport through the debugger; reset with tabz_emulate_clear.", EmulateDeviceSchema, async (params) => {
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
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
                const lines = [];
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
    // Clear Emulation
    registerTabzTool(server, "tabz_emulate_clear", "Clear every emulation override for a tab (viewport, geolocation, network, media, vision).", EmulateClearSchema, async (params) => {
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
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
                const lines = [];
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
    // Emulate Geolocation
    registerTabzTool(server, "tabz_emulate_geolocation", "Override coordinates and report actual Location permission; clear drops the override. Cannot grant permission.", EmulateGeolocationSchema, async (params) => {
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
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
                const lines = [];
                if (params.clear) {
                    lines.push("# Geolocation Override Cleared");
                    lines.push("");
                    lines.push("The coordinate override is removed. Location requests still depend on site permission and device availability.");
                }
                else {
                    const permissionState = result.permissionState ?? "unknown";
                    lines.push(result.permissionGranted === true
                        ? "# Geolocation Override Active"
                        : permissionState === "prompt" || permissionState === "denied"
                            ? "# Geolocation Override Set, Site Permission Not Granted"
                            : "# Geolocation Override Set, Site Permission Unknown");
                    lines.push("");
                    lines.push(`**Latitude:** ${result.latitude}`);
                    lines.push(`**Longitude:** ${result.longitude}`);
                    lines.push(`**Accuracy:** ${result.accuracy}m`);
                    lines.push(`**Location permission:** ${permissionState}`);
                    lines.push("");
                    lines.push(result.permissionNote
                        ?? "The backend did not return a permission observation, so page access to the overridden coordinates is not confirmed.");
                    lines.push("");
                    lines.push("---");
                    lines.push("Use `tabz_emulate_geolocation` with `clear=true` to reset.");
                }
                resultText = lines.join("\n");
            }
            return { content: [{ type: "text", text: resultText }] };
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
    // Emulate Network
    registerTabzTool(server, "tabz_emulate_network", "Throttle the tab's network, by preset or by custom throughput and latency.", EmulateNetworkSchema, async (params) => {
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
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
                const lines = [];
                lines.push("# Network Throttling Active");
                lines.push("");
                lines.push(`**Preset:** ${result.preset}`);
                if (result.conditions) {
                    const c = result.conditions;
                    lines.push(`**Offline:** ${c.offline ? 'Yes' : 'No'}`);
                    if (!c.offline) {
                        const formatSpeed = (bps) => bps < 0 ? 'Unlimited' : bps >= 1000000 ? `${(bps / 1000000).toFixed(1)} MB/s` : `${(bps / 1000).toFixed(0)} KB/s`;
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
    // Emulate Media
    registerTabzTool(server, "tabz_emulate_media", "Emulate the CSS media type and features: print, color-scheme, reduced-motion, forced-colors.", EmulateMediaSchema, async (params) => {
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
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
                const lines = [];
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
    // Emulate Vision Deficiency
    registerTabzTool(server, "tabz_emulate_vision", "Simulate a vision deficiency for accessibility testing.", EmulateVisionSchema, async (params) => {
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
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(result, null, 2);
            }
            else {
                const lines = [];
                if (params.type === 'none') {
                    lines.push("# Vision Simulation Cleared");
                    lines.push("");
                    lines.push("Page returned to normal color rendering.");
                }
                else {
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
//# sourceMappingURL=emulation.js.map