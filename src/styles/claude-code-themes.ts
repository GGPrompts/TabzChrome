/**
 * Specialized Color Palettes for Claude Code
 *
 * Claude Code uses ANSI colors for:
 * - Green: Success messages, tool completions
 * - Yellow: Warnings, important notes
 * - Red: Errors, critical issues
 * - Cyan: Headers, section dividers
 * - Magenta: Tool names, function calls
 * - Blue: File paths, links, references
 * - Bright variants: Emphasized versions
 * - Dim: Metadata, timestamps, less important info
 */

export interface ClaudeCodePalette {
  name: string;
  description: string;

  // Core colors
  foreground: string;      // Main text color
  background: string;      // Terminal background (can be transparent)
  cursor: string;          // Cursor color
  selection: string;       // Selection highlight

  // ANSI Colors - optimized for Claude Code usage
  black: string;           // Rarely used
  red: string;             // Errors, critical messages
  green: string;           // Success, completions, positive feedback
  yellow: string;          // Warnings, important notices
  blue: string;            // File paths, links, code references
  magenta: string;         // Tool names, function names
  cyan: string;            // Headers, section dividers
  white: string;           // General text

  // Bright ANSI Colors - for emphasis
  brightBlack: string;     // Dim text (gray)
  brightRed: string;       // Critical errors
  brightGreen: string;     // Highlighted success
  brightYellow: string;    // Urgent warnings
  brightBlue: string;      // Emphasized links
  brightMagenta: string;   // Highlighted tool names
  brightCyan: string;      // Prominent headers
  brightWhite: string;     // Pure white for max contrast
}

export const claudeCodePalettes: Record<string, ClaudeCodePalette> = {
  // ========================================
  // High Contrast Themes (Best Readability)
  // ========================================

  "claude-high-contrast": {
    name: "Claude High Contrast",
    description: "Maximum readability with vibrant, distinct colors for each element type",

    foreground: "#e0e0e0",
    background: "rgba(10, 10, 15, 0.95)",
    cursor: "#00d4ff",
    selection: "rgba(0, 212, 255, 0.3)",

    // Optimized for Claude Code's output patterns
    black: "#1a1a1a",
    red: "#ff4757",           // Errors - bright, attention-grabbing
    green: "#5af78e",         // Success - vibrant green
    yellow: "#ffd93d",        // Warnings - warm yellow
    blue: "#57c7ff",          // Paths/links - sky blue
    magenta: "#ff6ac1",       // Tool names - hot pink
    cyan: "#6bcf7f",          // Headers - teal
    white: "#e0e0e0",

    brightBlack: "#c9a66b",   // Metadata/timestamps - soft gold for readability
    brightRed: "#ff5c7c",     // Critical - even brighter red
    brightGreen: "#7dff94",   // Highlighted success - neon green
    brightYellow: "#ffeb3b",  // Urgent warnings - bright yellow
    brightBlue: "#82dbff",    // Emphasized links - lighter blue
    brightMagenta: "#ff8fd7", // Highlighted tools - lighter pink
    brightCyan: "#9eff9e",    // Prominent headers - bright teal
    brightWhite: "#ffffff",
  },

  "claude-dracula": {
    name: "Claude Dracula",
    description: "Dracula-inspired with optimized colors for Claude Code",

    foreground: "#f8f8f2",
    background: "rgba(40, 42, 54, 0.95)",
    cursor: "#ff79c6",
    selection: "rgba(255, 121, 198, 0.25)",

    black: "#21222c",
    red: "#ff5555",           // Errors - Dracula red
    green: "#50fa7b",         // Success - Dracula green
    yellow: "#f1fa8c",        // Warnings - Dracula yellow
    blue: "#8be9fd",          // Paths - Dracula cyan
    magenta: "#ff79c6",       // Tools - Dracula pink
    cyan: "#8be9fd",          // Headers - Dracula cyan
    white: "#f8f8f2",

    brightBlack: "#bd93f9",   // Metadata/timestamps - Dracula purple for readability
    brightRed: "#ff6e6e",
    brightGreen: "#69ff94",
    brightYellow: "#ffffa5",
    brightBlue: "#a4ffff",
    brightMagenta: "#ff92df",
    brightCyan: "#a4ffff",
    brightWhite: "#ffffff",
  },

  // ========================================
  // Soft/Pastel Themes (Easy on Eyes)
  // ========================================

  "claude-soft-ocean": {
    name: "Claude Soft Ocean",
    description: "Gentle ocean-inspired colors, easy on the eyes for long sessions",

    foreground: "#cad3f5",
    background: "rgba(18, 22, 38, 0.95)",
    cursor: "#91d7e3",
    selection: "rgba(145, 215, 227, 0.25)",

    black: "#1e2030",
    red: "#ed8796",           // Soft red - gentle errors
    green: "#a6da95",         // Soft green - calm success
    yellow: "#eed49f",        // Soft yellow - gentle warnings
    blue: "#8aadf4",          // Soft blue - links
    magenta: "#c6a0f6",       // Lavender - tool names
    cyan: "#91d7e3",          // Soft cyan - headers
    white: "#cad3f5",

    brightBlack: "#c9b8e0",   // Metadata/timestamps - soft lavender for readability
    brightRed: "#ee99a0",
    brightGreen: "#b8e8a3",
    brightYellow: "#f5e0ac",
    brightBlue: "#a3c7f7",
    brightMagenta: "#d5b3f9",
    brightCyan: "#a8e5f0",
    brightWhite: "#f0f4f9",
  },

  // ========================================
  // Neon/Cyberpunk Themes (Maximum Pop)
  // ========================================

  "claude-neon": {
    name: "Claude Neon",
    description: "Ultra-vibrant neon colors that make every element stand out",

    foreground: "#00ffff",
    background: "rgba(10, 0, 20, 0.95)",
    cursor: "#ff00ff",
    selection: "rgba(255, 0, 255, 0.3)",

    black: "#0a0014",
    red: "#ff0055",           // Neon red - explosive errors
    green: "#00ff88",         // Neon green - electrified success
    yellow: "#ffee00",        // Neon yellow - glowing warnings
    blue: "#00aaff",          // Neon blue - glowing links
    magenta: "#ff00ff",       // Neon magenta - tool names pop
    cyan: "#00ffff",          // Neon cyan - header glow
    white: "#f0f0ff",

    brightBlack: "#ffa640",   // Metadata/timestamps - neon orange for high visibility
    brightRed: "#ff4488",
    brightGreen: "#44ffaa",
    brightYellow: "#ffff44",
    brightBlue: "#44ccff",
    brightMagenta: "#ff44ff",
    brightCyan: "#44ffff",
    brightWhite: "#ffffff",
  },

  // ========================================
  // Amber/Retro Themes (Classic Terminal)
  // ========================================

  "claude-amber-modern": {
    name: "Claude Amber Modern",
    description: "Modern take on classic amber terminals with accent colors",

    foreground: "#ffb86c",
    background: "rgba(25, 20, 10, 0.95)",
    cursor: "#ffcc95",
    selection: "rgba(255, 184, 108, 0.25)",

    black: "#1a1308",
    red: "#ff6b35",           // Warm red - errors
    green: "#a3e635",         // Lime green - success
    yellow: "#fde047",        // Bright yellow - warnings
    blue: "#60a5fa",          // Sky blue - links
    magenta: "#f472b6",       // Pink - tool names
    cyan: "#22d3ee",          // Cyan - headers
    white: "#ffb86c",         // Amber white

    brightBlack: "#d4a574",   // Metadata/timestamps - light amber/tan for readability
    brightRed: "#ff8c5a",
    brightGreen: "#bef264",
    brightYellow: "#fef08a",
    brightBlue: "#93c5fd",
    brightMagenta: "#f9a8d4",
    brightCyan: "#67e8f9",
    brightWhite: "#ffd7a3",
  },

  // ========================================
  // Monochrome with Accents
  // ========================================

  "claude-mono-green": {
    name: "Claude Mono Green",
    description: "Mostly monochrome with green accents for key elements",

    foreground: "#d0d0d0",
    background: "rgba(15, 20, 15, 0.95)",
    cursor: "#5af78e",
    selection: "rgba(90, 247, 142, 0.2)",

    black: "#1a1a1a",
    red: "#ff6b6b",           // Muted red - errors
    green: "#5af78e",         // Bright green - THE accent color
    yellow: "#d0d0d0",        // Same as foreground
    blue: "#a8a8a8",          // Light gray
    magenta: "#c0c0c0",       // Lighter gray
    cyan: "#5af78e",          // Green accent
    white: "#d0d0d0",

    brightBlack: "#7dff94",   // Metadata/timestamps - bright green accent (matches theme)
    brightRed: "#ff8c8c",
    brightGreen: "#7dff94",   // Brighter green
    brightYellow: "#e8e8e8",
    brightBlue: "#c0c0c0",
    brightMagenta: "#d8d8d8",
    brightCyan: "#7dff94",    // Bright green
    brightWhite: "#ffffff",
  },
};

// Helper to convert palette to xterm theme format
export function paletteToXtermTheme(palette: ClaudeCodePalette) {
  return {
    background: palette.background,
    foreground: palette.foreground,
    cursor: palette.cursor,
    cursorAccent: palette.black,
    selectionBackground: palette.selection,
    selectionForeground: palette.foreground,

    black: palette.black,
    red: palette.red,
    green: palette.green,
    yellow: palette.yellow,
    blue: palette.blue,
    magenta: palette.magenta,
    cyan: palette.cyan,
    white: palette.white,

    brightBlack: palette.brightBlack,
    brightRed: palette.brightRed,
    brightGreen: palette.brightGreen,
    brightYellow: palette.brightYellow,
    brightBlue: palette.brightBlue,
    brightMagenta: palette.brightMagenta,
    brightCyan: palette.brightCyan,
    brightWhite: palette.brightWhite,
  };
}

// Visual effects presets for Claude Code
export const claudeCodeEffects = {
  "subtle-glow": {
    css: `text-shadow: 0 0 3px currentColor;`,
    glowColor: "#00d4ff",
  },

  "neon-glow": {
    css: `text-shadow: 0 0 5px currentColor, 0 0 10px currentColor;`,
    glowColor: "#ff00ff",
  },

  "soft-focus": {
    css: `text-shadow: 0 0 8px rgba(255, 255, 255, 0.1);`,
    glowColor: "#8aadf4",
  },

  "none": {
    css: ``,
    glowColor: undefined,
  },
};
