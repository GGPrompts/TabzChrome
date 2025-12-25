/**
 * Terminal Background Gradients
 * Separate from text color themes for mix-and-match customization
 *
 * Architecture:
 * - Panel Color: Base solid color (shown when transparency = 0)
 * - Gradient: CSS gradient overlay (shown when transparency > 0)
 * - Transparency: 0-100% controls gradient visibility
 */

export interface BackgroundGradient {
  name: string
  gradient: string       // CSS gradient or solid color
  preview: string[]      // Colors for preview dots
  description?: string
  category: 'dark' | 'light' | 'both'  // Suggested usage
}

export const backgroundGradients: Record<string, BackgroundGradient> = {
  // === Dark Gradients ===
  'dark-neutral': {
    name: 'Dark Neutral',
    gradient: 'linear-gradient(135deg, #0a0a0f 0%, #1a1b26 100%)',
    preview: ['#0a0a0f', '#1a1b26'],
    description: 'Subtle dark gradient, works with any text theme',
    category: 'dark',
  },

  'pure-black': {
    name: 'Pure Black',
    gradient: '#000000',
    preview: ['#000000'],
    description: 'Solid black for maximum contrast',
    category: 'dark',
  },

  'carbon': {
    name: 'Carbon',
    gradient: 'linear-gradient(135deg, #000000 0%, #111111 50%, #1a1a1a 100%)',
    preview: ['#000000', '#111111', '#1a1a1a'],
    description: 'Sleek carbon fiber gradient with subtle depth',
    category: 'dark',
  },

  'dracula-purple': {
    name: 'Dracula Purple',
    gradient: 'linear-gradient(135deg, #1a1b26 0%, #282a36 50%, #1a1b26 100%)',
    preview: ['#1a1b26', '#282a36'],
    description: 'Dracula theme inspired gradient',
    category: 'dark',
  },

  'deep-purple': {
    name: 'Deep Purple',
    gradient: 'linear-gradient(135deg, #14141e 0%, #1e1428 100%)',
    preview: ['#14141e', '#1e1428'],
    description: 'Rich purple gradient',
    category: 'dark',
  },

  'ocean-depths': {
    name: 'Ocean Depths',
    gradient: 'linear-gradient(135deg, #001a33 0%, #003d5c 50%, #001f3d 100%)',
    preview: ['#001a33', '#003d5c', '#001f3d'],
    description: 'Deep blue ocean gradient',
    category: 'dark',
  },

  'midnight-blue': {
    name: 'Midnight Blue',
    gradient: 'linear-gradient(135deg, #0a0d1a 0%, #14213d 50%, #0a0f1f 100%)',
    preview: ['#0a0d1a', '#14213d', '#0a0f1f'],
    description: 'Navy blue midnight gradient',
    category: 'dark',
  },

  'matrix-depths': {
    name: 'Matrix Depths',
    gradient: 'linear-gradient(135deg, #001a00 0%, #000d00 50%, #000500 100%)',
    preview: ['#001a00', '#000d00', '#000500'],
    description: 'Deep green gradient for matrix/terminal aesthetics',
    category: 'dark',
  },

  'terminal-green': {
    name: 'Terminal Green',
    gradient: 'linear-gradient(135deg, #000f00 0%, #001a00 50%, #000a00 100%)',
    preview: ['#000f00', '#001a00', '#000a00'],
    description: 'Classic terminal green background',
    category: 'dark',
  },

  'forest-night': {
    name: 'Forest Night',
    gradient: 'linear-gradient(135deg, #0d1f0d 0%, #1a331a 50%, #0a1a0a 100%)',
    preview: ['#0d1f0d', '#1a331a', '#0a1a0a'],
    description: 'Dark green forest gradient',
    category: 'dark',
  },

  'amber-warmth': {
    name: 'Amber Warmth',
    gradient: 'linear-gradient(135deg, #2d1810 0%, #1a1308 50%, #0a0603 100%)',
    preview: ['#2d1810', '#1a1308', '#0a0603'],
    description: 'Warm amber gradient, pairs with amber/retro themes',
    category: 'dark',
  },

  'monokai-brown': {
    name: 'Monokai Brown',
    gradient: 'linear-gradient(135deg, #1a1612 0%, #272822 50%, #1a1612 100%)',
    preview: ['#1a1612', '#272822'],
    description: 'Monokai theme inspired gradient',
    category: 'dark',
  },

  'cyberpunk-neon': {
    name: 'Cyberpunk Neon',
    gradient: 'linear-gradient(135deg, #14001e 0%, #2d0033 50%, #1a0026 100%)',
    preview: ['#14001e', '#2d0033', '#1a0026'],
    description: 'Purple-pink gradient for cyberpunk vibes',
    category: 'dark',
  },

  'vaporwave-dream': {
    name: 'Vaporwave Dream',
    gradient: 'linear-gradient(135deg, #1a0033 0%, #330066 30%, #4d0066 70%, #1a0033 100%)',
    preview: ['#1a0033', '#330066', '#4d0066'],
    description: 'Purple gradient with vaporwave aesthetic',
    category: 'dark',
  },

  'sunset-fade': {
    name: 'Sunset Fade',
    gradient: 'linear-gradient(135deg, #1a0a0f 0%, #330d1a 30%, #4d1a2b 60%, #1a0a0f 100%)',
    preview: ['#1a0a0f', '#330d1a', '#4d1a2b'],
    description: 'Deep red-purple sunset gradient',
    category: 'dark',
  },

  'synthwave-sunset': {
    name: 'Synthwave Sunset',
    gradient: 'linear-gradient(135deg, #190a14 0%, #2d1429 30%, #4d1a3d 60%, #2d1429 100%)',
    preview: ['#190a14', '#2d1429', '#4d1a3d'],
    description: 'Synthwave sunset gradient',
    category: 'dark',
  },

  'aurora-borealis': {
    name: 'Aurora Borealis',
    gradient: 'linear-gradient(135deg, #001420 0%, #002d3d 30%, #004d5c 60%, #002d3d 100%)',
    preview: ['#001420', '#002d3d', '#004d5c'],
    description: 'Northern lights inspired gradient',
    category: 'dark',
  },

  'neon-city': {
    name: 'Neon City',
    gradient: 'radial-gradient(ellipse at top, #1a0033 0%, #0a0a1f 50%, #000000 100%)',
    preview: ['#1a0033', '#0a0a1f', '#000000'],
    description: 'Radial gradient for neon city vibes',
    category: 'dark',
  },

  'github-dark': {
    name: 'GitHub Dark',
    gradient: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
    preview: ['#0d1117', '#161b22'],
    description: 'GitHub dark theme gradient',
    category: 'dark',
  },

  'solarized-dark': {
    name: 'Solarized Dark',
    gradient: 'linear-gradient(135deg, #002b36 0%, #073642 50%, #002b36 100%)',
    preview: ['#002b36', '#073642'],
    description: 'Solarized dark theme gradient',
    category: 'dark',
  },

  // === Light Gradients ===
  'light-neutral': {
    name: 'Light Neutral',
    gradient: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
    preview: ['#f8f9fa', '#e9ecef'],
    description: 'Subtle light gradient for light mode',
    category: 'light',
  },

  'pure-white': {
    name: 'Pure White',
    gradient: '#ffffff',
    preview: ['#ffffff'],
    description: 'Solid white for maximum brightness',
    category: 'light',
  },

  'soft-cream': {
    name: 'Soft Cream',
    gradient: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
    preview: ['#fffbeb', '#fef3c7'],
    description: 'Warm cream for comfortable reading',
    category: 'light',
  },

  'ocean-mist': {
    name: 'Ocean Mist',
    gradient: 'linear-gradient(135deg, #e8f4fc 0%, #d0e8f5 100%)',
    preview: ['#e8f4fc', '#d0e8f5'],
    description: 'Gentle blue for ocean theme light mode',
    category: 'light',
  },

  'mint-fresh': {
    name: 'Mint Fresh',
    gradient: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
    preview: ['#f0fdf4', '#dcfce7'],
    description: 'Fresh green tint for matrix light mode',
    category: 'light',
  },

  'lavender-haze': {
    name: 'Lavender Haze',
    gradient: 'linear-gradient(135deg, #f5f3f7 0%, #ebe8f0 100%)',
    preview: ['#f5f3f7', '#ebe8f0'],
    description: 'Soft purple for dracula light mode',
    category: 'light',
  },

  'rose-blush': {
    name: 'Rose Blush',
    gradient: 'linear-gradient(135deg, #fdf4ff 0%, #f5d0fe 100%)',
    preview: ['#fdf4ff', '#f5d0fe'],
    description: 'Gentle pink gradient',
    category: 'light',
  },

  'paper': {
    name: 'Paper',
    gradient: 'linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%)',
    preview: ['#fafafa', '#f5f5f5'],
    description: 'Clean paper-like background',
    category: 'light',
  },

  // === Special ===
  'transparent': {
    name: 'Transparent',
    gradient: 'transparent',
    preview: ['rgba(128,128,128,0.2)'],
    description: 'Fully transparent, shows panel color only',
    category: 'both',
  },
}

// Gradient names for UI dropdowns
export const gradientNames = Object.keys(backgroundGradients)

// Get gradient by key with fallback
export function getGradient(key?: string): BackgroundGradient {
  if (!key) return backgroundGradients['dark-neutral']
  return backgroundGradients[key] || backgroundGradients['dark-neutral']
}

// Get CSS value for background gradient
export function getGradientCSS(key?: string): string {
  const bg = getGradient(key)
  return bg.gradient
}

// Filter gradients by category
export function getGradientsByCategory(category: 'dark' | 'light' | 'both'): string[] {
  return Object.entries(backgroundGradients)
    .filter(([, g]) => g.category === category || g.category === 'both')
    .map(([key]) => key)
}

// Panel color presets for quick selection
export const PANEL_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Near Black', value: '#0a0a0f' },
  { name: 'Charcoal', value: '#1a1a1a' },
  { name: 'Dark Gray', value: '#2d2d2d' },
  { name: 'Gray', value: '#4a4a4a' },
  { name: 'White', value: '#ffffff' },
  { name: 'Off White', value: '#f8f9fa' },
  { name: 'Cream', value: '#fffbeb' },
  { name: 'Light Gray', value: '#e5e5e5' },
  // Accent colors
  { name: 'Navy', value: '#0a0d1a' },
  { name: 'Forest', value: '#0a1a0a' },
  { name: 'Wine', value: '#1a0a0f' },
  { name: 'Purple', value: '#14001e' },
] as const

export const DEFAULT_PANEL_COLOR = '#000000'
export const DEFAULT_TRANSPARENCY = 100  // Full gradient by default
