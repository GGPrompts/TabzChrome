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
  backgroundGradient: string  // Default gradient suggestion (can be overridden in profile)
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
        background: 'rgba(0, 0, 0, 0)',  // Fully transparent to show CSS gradient
        foreground: '#e0e0e0',
        cursor: '#00d4ff',
        selectionBackground: 'rgba(0, 212, 255, 0.3)',
        black: '#000000',  // Pure black for maximum contrast with WebGL
        red: '#ff4757',           // Errors - bright, attention-grabbing
        green: '#5af78e',         // Success - vibrant green
        yellow: '#ffd93d',        // Warnings - warm yellow
        blue: '#57c7ff',          // Paths/links - sky blue
        magenta: '#ff6ac1',       // Tool names - hot pink
        cyan: '#6bcf7f',          // Headers - teal
        white: '#e0e0e0',
        brightBlack: '#c9a66b',   // Soft gold - readable timestamps on dark bg and light blockquotes
        brightRed: '#ff5c7c',
        brightGreen: '#7dff94',   // Neon green for highlighted success
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
        background: 'rgba(248, 249, 250, 1)',  // Opaque for light mode readability
        foreground: '#1a1a2e',
        cursor: '#0077b6',
        selectionBackground: 'rgba(0, 119, 182, 0.2)',
        black: '#f8f9fa',  // Match gradient start (solid for WebGL)
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
        background: 'rgba(0, 0, 0, 0)',  // Fully transparent to show CSS gradient
        foreground: '#f8f8f2',
        cursor: '#ff79c6',
        selectionBackground: 'rgba(255, 121, 198, 0.25)',
        black: '#1a1b26',  // Match gradient start (not transparent - WebGL can't handle it)
        red: '#ff5555',           // Dracula red
        green: '#50fa7b',         // Dracula green
        yellow: '#f1fa8c',        // Dracula yellow
        blue: '#8be9fd',          // Dracula cyan for paths
        magenta: '#ff79c6',       // Dracula pink for tools
        cyan: '#8be9fd',          // Dracula cyan for headers
        white: '#f8f8f2',
        brightBlack: '#bd93f9',   // Dracula purple - readable timestamps matching theme
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
        background: 'rgba(245, 243, 247, 1)',  // Opaque for light mode readability
        foreground: '#282a36',
        cursor: '#c850a0',
        selectionBackground: 'rgba(200, 80, 160, 0.2)',
        black: '#f5f3f7',  // Match gradient start (solid for WebGL)
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
        background: 'rgba(0, 0, 0, 0)',  // Fully transparent to show CSS gradient
        foreground: '#cad3f5',
        cursor: '#91d7e3',
        selectionBackground: 'rgba(145, 215, 227, 0.25)',
        black: '#12162a',  // Match gradient start (not transparent - WebGL can't handle it)
        red: '#ed8796',           // Soft red - gentle errors
        green: '#a6da95',         // Soft green - calm success
        yellow: '#eed49f',        // Soft yellow - gentle warnings
        blue: '#8aadf4',          // Soft blue - links
        magenta: '#c6a0f6',       // Lavender - tool names
        cyan: '#91d7e3',          // Soft cyan - headers
        white: '#cad3f5',
        brightBlack: '#c9b8e0',   // Soft lavender - readable timestamps matching ocean aesthetic
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
        background: 'rgba(232, 244, 252, 1)',  // Opaque for light mode readability
        foreground: '#1e2030',
        cursor: '#0891b2',
        selectionBackground: 'rgba(8, 145, 178, 0.2)',
        black: '#e8f4fc',  // Match gradient start (solid for WebGL)
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
        background: 'rgba(0, 0, 0, 0)',  // Fully transparent to show CSS gradient
        foreground: '#00ffff',
        cursor: '#ff00ff',
        selectionBackground: 'rgba(255, 0, 255, 0.3)',
        black: '#0a0014',  // Match gradient start (not transparent - WebGL can't handle it)
        red: '#ff0055',           // Neon red - explosive errors
        green: '#00ff88',         // Neon green - electrified success
        yellow: '#ffee00',        // Neon yellow - glowing warnings
        blue: '#00aaff',          // Neon blue - glowing links
        magenta: '#ff00ff',       // Neon magenta - tool names pop
        cyan: '#00ffff',          // Neon cyan - header glow
        white: '#f0f0ff',
        brightBlack: '#ffa640',   // Neon orange - high visibility timestamps
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
        background: 'rgba(253, 244, 255, 1)',  // Opaque for light mode readability
        foreground: '#1a0033',
        cursor: '#c026d3',
        selectionBackground: 'rgba(192, 38, 211, 0.2)',
        black: '#fdf4ff',  // Match gradient start for light mode
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
        background: 'rgba(0, 0, 0, 0)',  // Fully transparent to show CSS gradient
        foreground: '#ffb86c',
        cursor: '#ffcc95',
        selectionBackground: 'rgba(255, 184, 108, 0.25)',
        black: '#1a1308',  // Match gradient start (not transparent - WebGL can't handle it)
        red: '#ff6b35',           // Warm red - errors
        green: '#a3e635',         // Lime green - success
        yellow: '#fde047',        // Bright yellow - warnings
        blue: '#60a5fa',          // Sky blue - links
        magenta: '#f472b6',       // Pink - tool names
        cyan: '#22d3ee',          // Cyan - headers
        white: '#ffb86c',         // Amber white
        brightBlack: '#d4a574',   // Light amber/tan - readable timestamps matching amber aesthetic
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
        background: 'rgba(255, 251, 235, 1)',  // Opaque for light mode readability
        foreground: '#78350f',
        cursor: '#b45309',
        selectionBackground: 'rgba(180, 83, 9, 0.2)',
        black: '#fffbeb',  // Match gradient start for light mode
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
        background: 'rgba(0, 0, 0, 0)',  // Fully transparent to show CSS gradient
        foreground: '#5af78e',    // Bright matrix green for main text
        cursor: '#7dff94',
        selectionBackground: 'rgba(90, 247, 142, 0.25)',
        black: '#000f00',  // Match gradient start (not transparent - WebGL can't handle it)
        red: '#ff4757',           // Bright red - errors still need to pop
        green: '#5af78e',         // Bright green - THE matrix color
        yellow: '#c0ff00',        // Lime/chartreuse - warnings visible against green
        blue: '#00d4ff',          // Cyan - paths/links stand out
        magenta: '#ff6ac1',       // Hot pink - tool names pop against green
        cyan: '#7dff94',          // Bright green - headers
        white: '#5af78e',         // Matrix green (not gray)
        brightBlack: '#39ff14',   // Neon green - readable timestamps
        brightRed: '#ff5c7c',
        brightGreen: '#7dff94',   // Brighter green
        brightYellow: '#d4ff00',
        brightBlue: '#00e5ff',
        brightMagenta: '#ff8fd7',
        brightCyan: '#9eff9e',
        brightWhite: '#b0ffb0',   // Light green tint
      },
      backgroundGradient: 'linear-gradient(135deg, #000f00 0%, #001a00 50%, #000a00 100%)',
    },
    light: {
      colors: {
        background: 'rgba(240, 253, 244, 1)',  // Opaque for light mode readability
        foreground: '#166534',
        cursor: '#15803d',
        selectionBackground: 'rgba(22, 163, 74, 0.2)',
        black: '#f0fdf4',  // Match gradient start for light mode
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

  // === Aesthetic/Effect Themes (from original Tabz) ===

  'cyberpunk': {
    name: 'Cyberpunk',
    description: 'Neon cyan and magenta with glow effects',
    dark: {
      colors: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#00ffff',
        cursor: '#ff00ff',
        selectionBackground: 'rgba(255, 0, 255, 0.3)',
        black: '#000000',
        red: '#ff0055',
        green: '#00ff88',
        yellow: '#ffee00',
        blue: '#00aaff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#ffffff',
        brightBlack: '#ffa640',
        brightRed: '#ff5588',
        brightGreen: '#55ffaa',
        brightYellow: '#ffff55',
        brightBlue: '#55ccff',
        brightMagenta: '#ff55ff',
        brightCyan: '#55ffff',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #0a0014 0%, #1a0033 50%, #0a001e 100%)',
    },
    light: {
      colors: {
        background: 'rgba(253, 244, 255, 1)',
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
        brightBlack: '#c2410c',
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

  'vaporwave': {
    name: 'Vaporwave',
    description: 'Retro pink and cyan aesthetic',
    dark: {
      colors: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#ff71ce',
        cursor: '#01cdfe',
        selectionBackground: 'rgba(255, 113, 206, 0.3)',
        black: '#000000',
        red: '#ff006e',
        green: '#05ffa1',
        yellow: '#ffff00',
        blue: '#01cdfe',
        magenta: '#ff71ce',
        cyan: '#01cdfe',
        white: '#fffb96',
        brightBlack: '#c9a0dc',
        brightRed: '#ff4499',
        brightGreen: '#39ffc6',
        brightYellow: '#ffff66',
        brightBlue: '#4de8ff',
        brightMagenta: '#ff99e1',
        brightCyan: '#4de8ff',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #1a0033 0%, #330066 30%, #4d0066 70%, #1a0033 100%)',
    },
    light: {
      colors: {
        background: 'rgba(255, 240, 250, 1)',
        foreground: '#4a0033',
        cursor: '#0891b2',
        selectionBackground: 'rgba(236, 72, 153, 0.2)',
        black: '#fff0fa',
        red: '#be185d',
        green: '#059669',
        yellow: '#ca8a04',
        blue: '#0284c7',
        magenta: '#c026d3',
        cyan: '#0891b2',
        white: '#4a0033',
        brightBlack: '#9333ea',
        brightRed: '#ec4899',
        brightGreen: '#10b981',
        brightYellow: '#eab308',
        brightBlue: '#0ea5e9',
        brightMagenta: '#d946ef',
        brightCyan: '#06b6d4',
        brightWhite: '#2a0020',
      },
      backgroundGradient: 'linear-gradient(135deg, #fff0fa 0%, #fce7f3 50%, #fff0fa 100%)',
    },
  },

  'synthwave': {
    name: 'Synthwave',
    description: 'Retro 80s sunset vibes',
    dark: {
      colors: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#f92aad',
        cursor: '#fdca40',
        selectionBackground: 'rgba(249, 42, 173, 0.3)',
        black: '#242038',
        red: '#f92aad',
        green: '#3cff00',
        yellow: '#fdca40',
        blue: '#2892d7',
        magenta: '#a736d9',
        cyan: '#16b2d5',
        white: '#f7f7f7',
        brightBlack: '#bd93f9',
        brightRed: '#ff5ac4',
        brightGreen: '#6dff3d',
        brightYellow: '#ffdc6d',
        brightBlue: '#4db5ff',
        brightMagenta: '#c15dff',
        brightCyan: '#3dd5ff',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #190a14 0%, #2d1429 30%, #4d1a3d 60%, #2d1429 100%)',
    },
    light: {
      colors: {
        background: 'rgba(255, 245, 250, 1)',
        foreground: '#4a1942',
        cursor: '#b45309',
        selectionBackground: 'rgba(219, 39, 119, 0.2)',
        black: '#fff5fa',
        red: '#db2777',
        green: '#15803d',
        yellow: '#a16207',
        blue: '#1d4ed8',
        magenta: '#9333ea',
        cyan: '#0e7490',
        white: '#4a1942',
        brightBlack: '#7c3aed',
        brightRed: '#ec4899',
        brightGreen: '#22c55e',
        brightYellow: '#ca8a04',
        brightBlue: '#2563eb',
        brightMagenta: '#a855f7',
        brightCyan: '#0891b2',
        brightWhite: '#2a0020',
      },
      backgroundGradient: 'linear-gradient(135deg, #fff5fa 0%, #fce7f3 50%, #fff5fa 100%)',
    },
  },

  'aurora': {
    name: 'Aurora',
    description: 'Northern lights inspired colors',
    dark: {
      colors: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#e0f7fa',
        cursor: '#80deea',
        selectionBackground: 'rgba(128, 222, 234, 0.3)',
        black: '#000000',
        red: '#ff5252',
        green: '#69f0ae',
        yellow: '#ffd740',
        blue: '#448aff',
        magenta: '#e040fb',
        cyan: '#18ffff',
        white: '#e0f7fa',
        brightBlack: '#9ed8e8',
        brightRed: '#ff8a80',
        brightGreen: '#b9f6ca',
        brightYellow: '#ffe57f',
        brightBlue: '#82b1ff',
        brightMagenta: '#ea80fc',
        brightCyan: '#84ffff',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #001420 0%, #002d3d 30%, #004d5c 60%, #002d3d 100%)',
    },
    light: {
      colors: {
        background: 'rgba(240, 253, 255, 1)',
        foreground: '#134e4a',
        cursor: '#0891b2',
        selectionBackground: 'rgba(6, 182, 212, 0.2)',
        black: '#f0fdff',
        red: '#dc2626',
        green: '#059669',
        yellow: '#d97706',
        blue: '#2563eb',
        magenta: '#9333ea',
        cyan: '#0891b2',
        white: '#134e4a',
        brightBlack: '#0e7490',
        brightRed: '#ef4444',
        brightGreen: '#10b981',
        brightYellow: '#f59e0b',
        brightBlue: '#3b82f6',
        brightMagenta: '#a855f7',
        brightCyan: '#06b6d4',
        brightWhite: '#042f2e',
      },
      backgroundGradient: 'linear-gradient(135deg, #f0fdff 0%, #cffafe 50%, #f0fdff 100%)',
    },
  },

  'holographic': {
    name: 'Holographic',
    description: 'Iridescent green-teal shimmer',
    dark: {
      colors: {
        background: 'rgba(0, 0, 0, 0)',
        foreground: '#00ff88',
        cursor: '#00ff88',
        selectionBackground: 'rgba(0, 255, 136, 0.3)',
        black: '#000000',
        red: '#ff6b9d',
        green: '#00ff88',
        yellow: '#88ff00',
        blue: '#00ff44',
        magenta: '#00ff99',
        cyan: '#00ffaa',
        white: '#e0ffe0',
        brightBlack: '#a4ffdd',
        brightRed: '#ff9dbc',
        brightGreen: '#44ffaa',
        brightYellow: '#aaff44',
        brightBlue: '#44ff88',
        brightMagenta: '#44ffbb',
        brightCyan: '#44ffcc',
        brightWhite: '#ffffff',
      },
      backgroundGradient: 'linear-gradient(135deg, #001a10 0%, #002d20 50%, #001a10 100%)',
    },
    light: {
      colors: {
        background: 'rgba(240, 255, 250, 1)',
        foreground: '#064e3b',
        cursor: '#059669',
        selectionBackground: 'rgba(16, 185, 129, 0.2)',
        black: '#f0fff8',
        red: '#e11d48',
        green: '#059669',
        yellow: '#65a30d',
        blue: '#0d9488',
        magenta: '#10b981',
        cyan: '#14b8a6',
        white: '#064e3b',
        brightBlack: '#047857',
        brightRed: '#f43f5e',
        brightGreen: '#10b981',
        brightYellow: '#84cc16',
        brightBlue: '#14b8a6',
        brightMagenta: '#34d399',
        brightCyan: '#2dd4bf',
        brightWhite: '#022c22',
      },
      backgroundGradient: 'linear-gradient(135deg, #f0fff8 0%, #d1fae5 50%, #f0fff8 100%)',
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
