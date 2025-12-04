/**
 * Curated Terminal Themes for TabzChrome
 *
 * Each theme has dark and light variants with:
 * - Color palette optimized for Claude Code output
 * - Matching background gradient
 *
 * ANSI color usage in Claude Code:
 * - Red: Errors, critical issues
 * - Green: Success, tool completions
 * - Yellow: Warnings, important notes
 * - Blue: File paths, links, references
 * - Magenta: Tool names, function calls
 * - Cyan: Headers, section dividers
 * - brightBlack: Metadata, timestamps, diffs
 */

export interface ThemeColors {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

export interface ThemeVariant {
  colors: ThemeColors
  backgroundGradient: string
}

export interface Theme {
  name: string
  description: string
  dark: ThemeVariant
  light: ThemeVariant
}

export const themes: Record<string, Theme> = {
  'high-contrast': {
    name: 'High Contrast',
    description: 'Maximum readability with vibrant, distinct colors',
    dark: {
      colors: {
        background: 'transparent',
        foreground: '#e0e0e0',
        cursor: '#00d4ff',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#1a1a1a',
        red: '#ff4757',           // Errors - bright, attention-grabbing
        green: '#3cb371',         // Success - medium sea green (readable as diff background)
        yellow: '#ffd93d',        // Warnings - warm yellow
        blue: '#57c7ff',          // Paths/links - sky blue
        magenta: '#ff6ac1',       // Tool names - hot pink
        cyan: '#6bcf7f',          // Headers - teal
        white: '#e0e0e0',
        brightBlack: '#e07020',   // Orange - works on both dark bg and light blockquotes
        brightRed: '#ff5c7c',
        brightGreen: '#50c878',   // Emerald - softer for diff backgrounds
        brightYellow: '#ffeb3b',
        brightBlue: '#82dbff',
        brightMagenta: '#ff8fd7',
        brightCyan: '#9eff9e',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #0a0a0f 0%, #1a1b26 100%)',
    },
    light: {
      colors: {
        background: 'transparent',
        foreground: '#1a1a2e',
        cursor: '#0077b6',
        selectionBackground: 'rgba(0, 119, 182, 0.2)',
        black: '#f8f9fa',
        red: '#c41a16',
        green: '#007400',
        yellow: '#7a5d00',
        blue: '#0451a5',
        magenta: '#a626a4',
        cyan: '#0598bc',
        white: '#1a1a2e',
        brightBlack: '#4a5568',   // Darker gray for light bg readability
        brightRed: '#e01b1b',
        brightGreen: '#008a00',
        brightYellow: '#8f6d00',
        brightBlue: '#0366d6',
        brightMagenta: '#bc36c4',
        brightCyan: '#06a8cc',
        brightWhite: '#0d0d0d',
      },
      backgroundGradient: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
    },
  },

  'dracula': {
    name: 'Dracula',
    description: 'Classic Dracula theme with purple accents',
    dark: {
      colors: {
        background: 'transparent',
        foreground: '#f8f8f2',
        cursor: '#ff79c6',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#21222c',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#8be9fd',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#f8f8f2',
        brightBlack: '#cc7030',   // Orange - works on both dark bg and light blockquotes
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#a4ffff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #1a1b26 0%, #282a36 50%, #1a1b26 100%)',
    },
    light: {
      colors: {
        background: 'transparent',
        foreground: '#282a36',
        cursor: '#c850a0',
        selectionBackground: 'rgba(200, 80, 160, 0.2)',
        black: '#faf8fc',
        red: '#d63031',
        green: '#00a86b',
        yellow: '#9c7b00',
        blue: '#0984e3',
        magenta: '#c850a0',
        cyan: '#00a8a8',
        white: '#282a36',
        brightBlack: '#7c4dbd',   // Darker purple for light bg
        brightRed: '#e84343',
        brightGreen: '#00c07a',
        brightYellow: '#b58f00',
        brightBlue: '#2196f3',
        brightMagenta: '#da62b8',
        brightCyan: '#00baba',
        brightWhite: '#1a1a2e',
      },
      backgroundGradient: 'linear-gradient(135deg, #f5f3f7 0%, #ebe8f0 50%, #f5f3f7 100%)',
    },
  },

  'ocean': {
    name: 'Ocean',
    description: 'Gentle ocean-inspired colors, easy on the eyes',
    dark: {
      colors: {
        background: 'transparent',
        foreground: '#cad3f5',
        cursor: '#91d7e3',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#1e2030',
        red: '#ed8796',
        green: '#a6da95',
        yellow: '#eed49f',
        blue: '#8aadf4',
        magenta: '#c6a0f6',
        cyan: '#91d7e3',
        white: '#cad3f5',
        brightBlack: '#d08040',   // Orange - works on both dark bg and light blockquotes
        brightRed: '#ee99a0',
        brightGreen: '#b8e8a3',
        brightYellow: '#f5e0ac',
        brightBlue: '#a3c7f7',
        brightMagenta: '#d5b3f9',
        brightCyan: '#a8e5f0',
        brightWhite: '#f0f4f9',
      },
      backgroundGradient: 'linear-gradient(135deg, #12162a 0%, #1e2644 50%, #0f1320 100%)',
    },
    light: {
      colors: {
        background: 'transparent',
        foreground: '#1e2030',
        cursor: '#0891b2',
        selectionBackground: 'rgba(8, 145, 178, 0.2)',
        black: '#f0f9ff',
        red: '#be123c',
        green: '#059669',
        yellow: '#a16207',
        blue: '#0369a1',
        magenta: '#9333ea',
        cyan: '#0891b2',
        white: '#1e2030',
        brightBlack: '#5b21b6',   // Darker purple for light bg
        brightRed: '#dc2626',
        brightGreen: '#10b981',
        brightYellow: '#ca8a04',
        brightBlue: '#0ea5e9',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#0c0f1a',
      },
      backgroundGradient: 'linear-gradient(135deg, #e8f4fc 0%, #d0e8f5 50%, #e8f4fc 100%)',
    },
  },

  'neon': {
    name: 'Neon',
    description: 'Ultra-vibrant neon colors that pop',
    dark: {
      colors: {
        background: 'transparent',
        foreground: '#00ffff',
        cursor: '#ff00ff',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#0a0014',
        red: '#ff0055',
        green: '#00ff88',
        yellow: '#ffee00',
        blue: '#00aaff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#f0f0ff',
        brightBlack: '#ff8c00',   // Bright orange - fits neon theme, works on both bgs
        brightRed: '#ff4488',
        brightGreen: '#44ffaa',
        brightYellow: '#ffff44',
        brightBlue: '#44ccff',
        brightMagenta: '#ff44ff',
        brightCyan: '#44ffff',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #0a0014 0%, #1a0033 50%, #0a001e 100%)',
    },
    light: {
      colors: {
        background: 'transparent',
        foreground: '#1a0033',
        cursor: '#c026d3',
        selectionBackground: 'rgba(192, 38, 211, 0.2)',
        black: '#fdf4ff',
        red: '#db2777',
        green: '#059669',
        yellow: '#d97706',
        blue: '#0284c7',
        magenta: '#c026d3',
        cyan: '#0891b2',
        white: '#1a0033',
        brightBlack: '#c2410c',   // Darker orange for light bg
        brightRed: '#ec4899',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#0ea5e9',
        brightMagenta: '#d946ef',
        brightCyan: '#06b6d4',
        brightWhite: '#0f0020',
      },
      backgroundGradient: 'linear-gradient(135deg, #fdf4ff 0%, #f5d0fe 50%, #fdf4ff 100%)',
    },
  },

  'amber': {
    name: 'Amber',
    description: 'Warm retro amber with modern accents',
    dark: {
      colors: {
        background: 'transparent',
        foreground: '#ffb86c',
        cursor: '#ffcc95',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#1a1308',
        red: '#ff6b35',
        green: '#a3e635',
        yellow: '#fde047',
        blue: '#60a5fa',
        magenta: '#f472b6',
        cyan: '#22d3ee',
        white: '#ffb86c',
        brightBlack: '#e88030',   // Orange - fits amber theme, works on both bgs
        brightRed: '#ff8c5a',
        brightGreen: '#bef264',
        brightYellow: '#fef08a',
        brightBlue: '#93c5fd',
        brightMagenta: '#f9a8d4',
        brightCyan: '#67e8f9',
        brightWhite: '#ffd7a3',
      },
      backgroundGradient: 'linear-gradient(135deg, #1a1308 0%, #2d1810 50%, #0f0a04 100%)',
    },
    light: {
      colors: {
        background: 'transparent',
        foreground: '#78350f',
        cursor: '#b45309',
        selectionBackground: 'rgba(180, 83, 9, 0.2)',
        black: '#fffbeb',
        red: '#c2410c',
        green: '#4d7c0f',
        yellow: '#a16207',
        blue: '#1d4ed8',
        magenta: '#be185d',
        cyan: '#0e7490',
        white: '#78350f',
        brightBlack: '#78350f',   // Darker brown for light bg
        brightRed: '#ea580c',
        brightGreen: '#65a30d',
        brightYellow: '#ca8a04',
        brightBlue: '#2563eb',
        brightMagenta: '#db2777',
        brightCyan: '#0891b2',
        brightWhite: '#451a03',
      },
      backgroundGradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%)',
    },
  },

  'matrix': {
    name: 'Matrix',
    description: 'Classic green terminal aesthetic',
    dark: {
      colors: {
        background: 'transparent',
        foreground: '#00ff00',
        cursor: '#00ff00',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#0a0f0a',
        red: '#ff6b6b',
        green: '#00ff00',
        yellow: '#d0d0d0',        // Muted - keeps green focus
        blue: '#a8a8a8',
        magenta: '#c0c0c0',
        cyan: '#00ff00',          // Green accent
        white: '#d0d0d0',
        brightBlack: '#d09030',   // Orange-gold - works on both dark bg and light blockquotes
        brightRed: '#ff8c8c',
        brightGreen: '#33ff33',
        brightYellow: '#e8e8e8',
        brightBlue: '#c0c0c0',
        brightMagenta: '#d8d8d8',
        brightCyan: '#33ff33',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #000f00 0%, #001a00 50%, #000a00 100%)',
    },
    light: {
      colors: {
        background: 'transparent',
        foreground: '#166534',
        cursor: '#15803d',
        selectionBackground: 'rgba(22, 163, 74, 0.2)',
        black: '#f0fdf4',
        red: '#dc2626',
        green: '#15803d',
        yellow: '#4b5563',
        blue: '#6b7280',
        magenta: '#71717a',
        cyan: '#15803d',
        white: '#166534',
        brightBlack: '#166534',   // Darker green for light bg
        brightRed: '#ef4444',
        brightGreen: '#16a34a',
        brightYellow: '#374151',
        brightBlue: '#4b5563',
        brightMagenta: '#52525b',
        brightCyan: '#16a34a',
        brightWhite: '#052e16',
      },
      backgroundGradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #f0fdf4 100%)',
    },
  },
}

// Theme names for UI dropdowns
export const themeNames = Object.keys(themes) as Array<keyof typeof themes>

// Get theme colors for xterm.js
export function getThemeColors(themeName: string, isDark: boolean): ThemeColors {
  const theme = themes[themeName] || themes['high-contrast']
  return isDark ? theme.dark.colors : theme.light.colors
}

// Get background gradient CSS
export function getBackgroundGradient(themeName: string, isDark: boolean): string {
  const theme = themes[themeName] || themes['high-contrast']
  return isDark ? theme.dark.backgroundGradient : theme.light.backgroundGradient
}

// Get full theme variant
export function getThemeVariant(themeName: string, isDark: boolean): ThemeVariant {
  const theme = themes[themeName] || themes['high-contrast']
  return isDark ? theme.dark : theme.light
}
