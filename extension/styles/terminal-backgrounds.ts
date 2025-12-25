/**
 * Terminal Background Gradients
 * Separate from text color themes for mix-and-match customization
 *
 * Architecture:
 * - Panel Color: Base solid color (shown when transparency = 0)
 * - Gradient: CSS gradient overlay (shown when transparency > 0)
 * - Transparency: 0-100% controls gradient visibility
 *
 * Each gradient has a dark version (default) and a lightGradient (softer, muted - not white)
 */

export interface BackgroundGradient {
  name: string
  gradient: string       // CSS gradient or solid color (dark mode)
  lightGradient: string  // Lighter variant (not white - just softer version)
  preview: string[]      // Colors for preview dots
  description?: string
}

export const backgroundGradients: Record<string, BackgroundGradient> = {
  // === Neutral/Black ===
  'dark-neutral': {
    name: 'Dark Neutral',
    gradient: 'linear-gradient(135deg, #0a0a0f 0%, #1a1b26 100%)',
    lightGradient: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
    preview: ['#0a0a0f', '#1a1b26'],
    description: 'Subtle dark gradient, works with any text theme',
  },

  'pure-black': {
    name: 'Pure Black',
    gradient: '#000000',
    lightGradient: '#ffffff',
    preview: ['#000000'],
    description: 'Solid black for maximum contrast',
  },

  'carbon': {
    name: 'Carbon',
    gradient: 'linear-gradient(135deg, #000000 0%, #111111 50%, #1a1a1a 100%)',
    lightGradient: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 50%, #eeeeee 100%)',
    preview: ['#000000', '#111111', '#1a1a1a'],
    description: 'Sleek carbon fiber gradient with subtle depth',
  },

  // === Purple ===
  'dracula-purple': {
    name: 'Dracula Purple',
    gradient: 'linear-gradient(135deg, #1a1b26 0%, #282a36 50%, #1a1b26 100%)',
    lightGradient: 'linear-gradient(135deg, #f5f3f7 0%, #ebe8f0 50%, #f5f3f7 100%)',
    preview: ['#1a1b26', '#282a36'],
    description: 'Dracula theme inspired gradient',
  },

  'deep-purple': {
    name: 'Deep Purple',
    gradient: 'linear-gradient(135deg, #14141e 0%, #1e1428 100%)',
    lightGradient: 'linear-gradient(135deg, #f8f5fa 0%, #f0e8f5 100%)',
    preview: ['#14141e', '#1e1428'],
    description: 'Rich purple gradient',
  },

  // === Blue ===
  'ocean-depths': {
    name: 'Ocean Depths',
    gradient: 'linear-gradient(135deg, #001a33 0%, #003d5c 50%, #001f3d 100%)',
    lightGradient: 'linear-gradient(135deg, #e8f4fc 0%, #d0e8f5 50%, #e8f4fc 100%)',
    preview: ['#001a33', '#003d5c', '#001f3d'],
    description: 'Deep blue ocean gradient',
  },

  'midnight-blue': {
    name: 'Midnight Blue',
    gradient: 'linear-gradient(135deg, #0a0d1a 0%, #14213d 50%, #0a0f1f 100%)',
    lightGradient: 'linear-gradient(135deg, #f0f4fa 0%, #e0e8f5 50%, #f0f4fa 100%)',
    preview: ['#0a0d1a', '#14213d', '#0a0f1f'],
    description: 'Navy blue midnight gradient',
  },

  // === Green ===
  'matrix-depths': {
    name: 'Matrix Depths',
    gradient: 'linear-gradient(135deg, #001a00 0%, #000d00 50%, #000500 100%)',
    lightGradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 50%, #f0fdf4 100%)',
    preview: ['#001a00', '#000d00', '#000500'],
    description: 'Deep green gradient for matrix/terminal aesthetics',
  },

  'terminal-green': {
    name: 'Terminal Green',
    gradient: 'linear-gradient(135deg, #000f00 0%, #001a00 50%, #000a00 100%)',
    lightGradient: 'linear-gradient(135deg, #f0fff0 0%, #e0f5e0 50%, #f0fff0 100%)',
    preview: ['#000f00', '#001a00', '#000a00'],
    description: 'Classic terminal green background',
  },

  'forest-night': {
    name: 'Forest Night',
    gradient: 'linear-gradient(135deg, #0d1f0d 0%, #1a331a 50%, #0a1a0a 100%)',
    lightGradient: 'linear-gradient(135deg, #f0faf0 0%, #e0f0e0 50%, #f0faf0 100%)',
    preview: ['#0d1f0d', '#1a331a', '#0a1a0a'],
    description: 'Dark green forest gradient',
  },

  // === Warm/Amber ===
  'amber-warmth': {
    name: 'Amber Warmth',
    gradient: 'linear-gradient(135deg, #2d1810 0%, #1a1308 50%, #0a0603 100%)',
    lightGradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 50%, #fffbeb 100%)',
    preview: ['#2d1810', '#1a1308', '#0a0603'],
    description: 'Warm amber gradient, pairs with amber/retro themes',
  },

  'monokai-brown': {
    name: 'Monokai Brown',
    gradient: 'linear-gradient(135deg, #1a1612 0%, #272822 50%, #1a1612 100%)',
    lightGradient: 'linear-gradient(135deg, #faf8f5 0%, #f5f3f0 50%, #faf8f5 100%)',
    preview: ['#1a1612', '#272822'],
    description: 'Monokai theme inspired gradient',
  },

  // === Neon/Cyberpunk ===
  'cyberpunk-neon': {
    name: 'Cyberpunk Neon',
    gradient: 'linear-gradient(135deg, #14001e 0%, #2d0033 50%, #1a0026 100%)',
    lightGradient: 'linear-gradient(135deg, #fdf4ff 0%, #f5d0fe 50%, #fdf4ff 100%)',
    preview: ['#14001e', '#2d0033', '#1a0026'],
    description: 'Purple-pink gradient for cyberpunk vibes',
  },

  'vaporwave-dream': {
    name: 'Vaporwave Dream',
    gradient: 'linear-gradient(135deg, #1a0033 0%, #330066 30%, #4d0066 70%, #1a0033 100%)',
    lightGradient: 'linear-gradient(135deg, #faf0ff 0%, #f0e0ff 30%, #e8d0ff 70%, #faf0ff 100%)',
    preview: ['#1a0033', '#330066', '#4d0066'],
    description: 'Purple gradient with vaporwave aesthetic',
  },

  // === Sunset/Warm ===
  'sunset-fade': {
    name: 'Sunset Fade',
    gradient: 'linear-gradient(135deg, #1a0a0f 0%, #330d1a 30%, #4d1a2b 60%, #1a0a0f 100%)',
    lightGradient: 'linear-gradient(135deg, #fff5f5 0%, #ffe4e6 30%, #fecdd3 60%, #fff5f5 100%)',
    preview: ['#1a0a0f', '#330d1a', '#4d1a2b'],
    description: 'Deep red-purple sunset gradient',
  },

  'synthwave-sunset': {
    name: 'Synthwave Sunset',
    gradient: 'linear-gradient(135deg, #190a14 0%, #2d1429 30%, #4d1a3d 60%, #2d1429 100%)',
    lightGradient: 'linear-gradient(135deg, #fff0fa 0%, #fce7f3 30%, #fbcfe8 60%, #fce7f3 100%)',
    preview: ['#190a14', '#2d1429', '#4d1a3d'],
    description: 'Synthwave sunset gradient',
  },

  // === Special Effects ===
  'aurora-borealis': {
    name: 'Aurora Borealis',
    gradient: 'linear-gradient(135deg, #001420 0%, #002d3d 30%, #004d5c 60%, #002d3d 100%)',
    lightGradient: 'linear-gradient(135deg, #f0fdff 0%, #e0f7fa 30%, #cffafe 60%, #e0f7fa 100%)',
    preview: ['#001420', '#002d3d', '#004d5c'],
    description: 'Northern lights inspired gradient',
  },

  'neon-city': {
    name: 'Neon City',
    gradient: 'radial-gradient(ellipse at top, #1a0033 0%, #0a0a1f 50%, #000000 100%)',
    lightGradient: 'radial-gradient(ellipse at top, #f5e0ff 0%, #f0f0ff 50%, #ffffff 100%)',
    preview: ['#1a0033', '#0a0a1f', '#000000'],
    description: 'Radial gradient for neon city vibes',
  },

  // === Theme-Matched ===
  'github-dark': {
    name: 'GitHub Dark',
    gradient: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
    lightGradient: 'linear-gradient(135deg, #ffffff 0%, #f6f8fa 50%, #ffffff 100%)',
    preview: ['#0d1117', '#161b22'],
    description: 'GitHub dark theme gradient',
  },

  'solarized-dark': {
    name: 'Solarized Dark',
    gradient: 'linear-gradient(135deg, #002b36 0%, #073642 50%, #002b36 100%)',
    lightGradient: 'linear-gradient(135deg, #fdf6e3 0%, #eee8d5 50%, #fdf6e3 100%)',
    preview: ['#002b36', '#073642'],
    description: 'Solarized dark theme gradient',
  },

  // === Utility ===
  'transparent': {
    name: 'Transparent',
    gradient: 'transparent',
    lightGradient: 'transparent',
    preview: ['rgba(128,128,128,0.2)'],
    description: 'Fully transparent, shows panel color only',
  },
}

// Gradient names for UI dropdowns
export const gradientNames = Object.keys(backgroundGradients)

// Get gradient by key with fallback
export function getGradient(key?: string): BackgroundGradient {
  if (!key) return backgroundGradients['dark-neutral']
  return backgroundGradients[key] || backgroundGradients['dark-neutral']
}

// Get CSS value for background gradient (supports light/dark mode)
export function getGradientCSS(key?: string, isDark = true): string {
  const bg = getGradient(key)
  return isDark ? bg.gradient : bg.lightGradient
}

// Panel color presets for quick selection
export const PANEL_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Near Black', value: '#0a0a0f' },
  { name: 'Charcoal', value: '#1a1a1a' },
  { name: 'Dark Gray', value: '#2d2d2d' },
  { name: 'Gray', value: '#4a4a4a' },
  // Accent colors
  { name: 'Navy', value: '#0a0d1a' },
  { name: 'Forest', value: '#0a1a0a' },
  { name: 'Wine', value: '#1a0a0f' },
  { name: 'Purple', value: '#14001e' },
] as const

export const DEFAULT_PANEL_COLOR = '#000000'
export const DEFAULT_TRANSPARENCY = 100  // Full gradient by default

// Light mode equivalents for panel colors
const LIGHT_PANEL_MAP: Record<string, string> = {
  '#000000': '#ffffff',
  '#0a0a0f': '#f8f9fa',
  '#1a1a1a': '#f0f0f0',
  '#2d2d2d': '#e5e5e5',
  '#4a4a4a': '#d4d4d4',
  '#0a0d1a': '#e8f4fc',
  '#0a1a0a': '#f0fdf4',
  '#1a0a0f': '#fff5f5',
  '#14001e': '#fdf4ff',
}

// Get appropriate panel color for current mode
export function getPanelColor(panelColor: string, isDark: boolean): string {
  if (isDark) return panelColor
  return LIGHT_PANEL_MAP[panelColor] || '#ffffff'
}
