// Terminal Background Gradients
// Separate from text color themes for mix-and-match customization

export interface BackgroundGradient {
  name: string;
  gradient: string; // CSS gradient or solid color
  preview: string[]; // Colors for preview dots
  description?: string;
}

export const backgroundGradients: Record<string, BackgroundGradient> = {
  'dark-neutral': {
    name: 'Dark Neutral',
    gradient: 'linear-gradient(135deg, #0a0a0f 0%, #1a1b26 100%)',
    preview: ['#0a0a0f', '#1a1b26'],
    description: 'Subtle dark gradient, works with any text theme',
  },

  'pure-black': {
    name: 'Pure Black',
    gradient: 'rgba(0, 0, 0, 0.95)',
    preview: ['#000000'],
    description: 'Solid black for maximum contrast',
  },

  'carbon': {
    name: 'Carbon',
    gradient: 'linear-gradient(135deg, #000000 0%, #111111 50%, #1a1a1a 100%)',
    preview: ['#000000', '#111111', '#1a1a1a'],
    description: 'Sleek carbon fiber gradient with subtle depth',
  },

  'amber-warmth': {
    name: 'Amber Warmth',
    gradient: 'linear-gradient(135deg, #2d1810 0%, #1a1308 50%, #0a0603 100%)',
    preview: ['#2d1810', '#1a1308', '#0a0603'],
    description: 'Warm amber gradient, pairs with amber/retro themes',
  },

  'matrix-depths': {
    name: 'Matrix Depths',
    gradient: 'linear-gradient(135deg, #001a00 0%, #000d00 50%, #000500 100%)',
    preview: ['#001a00', '#000d00', '#000500'],
    description: 'Deep green gradient for matrix/terminal aesthetics',
  },

  'cyberpunk-neon': {
    name: 'Cyberpunk Neon',
    gradient: 'linear-gradient(135deg, #14001e 0%, #2d0033 50%, #1a0026 100%)',
    preview: ['#14001e', '#2d0033', '#1a0026'],
    description: 'Purple-pink gradient for cyberpunk vibes',
  },

  'vaporwave-dream': {
    name: 'Vaporwave Dream',
    gradient: 'linear-gradient(135deg, #1a0033 0%, #330066 30%, #4d0066 70%, #1a0033 100%)',
    preview: ['#1a0033', '#330066', '#4d0066'],
    description: 'Purple gradient with vaporwave aesthetic',
  },

  'ocean-depths': {
    name: 'Ocean Depths',
    gradient: 'linear-gradient(135deg, #001a33 0%, #003d5c 50%, #001f3d 100%)',
    preview: ['#001a33', '#003d5c', '#001f3d'],
    description: 'Deep blue ocean gradient',
  },

  'forest-night': {
    name: 'Forest Night',
    gradient: 'linear-gradient(135deg, #0d1f0d 0%, #1a331a 50%, #0a1a0a 100%)',
    preview: ['#0d1f0d', '#1a331a', '#0a1a0a'],
    description: 'Dark green forest gradient',
  },

  'sunset-fade': {
    name: 'Sunset Fade',
    gradient: 'linear-gradient(135deg, #1a0a0f 0%, #330d1a 30%, #4d1a2b 60%, #1a0a0f 100%)',
    preview: ['#1a0a0f', '#330d1a', '#4d1a2b'],
    description: 'Deep red-purple sunset gradient',
  },

  'midnight-blue': {
    name: 'Midnight Blue',
    gradient: 'linear-gradient(135deg, #0a0d1a 0%, #14213d 50%, #0a0f1f 100%)',
    preview: ['#0a0d1a', '#14213d', '#0a0f1f'],
    description: 'Navy blue midnight gradient',
  },

  'dracula-purple': {
    name: 'Dracula Purple',
    gradient: 'linear-gradient(135deg, #1a1b26 0%, #282a36 50%, #1a1b26 100%)',
    preview: ['#1a1b26', '#282a36'],
    description: 'Dracula theme inspired gradient',
  },

  'deep-purple': {
    name: 'Deep Purple',
    gradient: 'linear-gradient(135deg, #14141e 0%, #1e1428 100%)',
    preview: ['#14141e', '#1e1428'],
    description: 'Rich purple gradient from Opustrator settings modal',
  },

  'monokai-brown': {
    name: 'Monokai Brown',
    gradient: 'linear-gradient(135deg, #1a1612 0%, #272822 50%, #1a1612 100%)',
    preview: ['#1a1612', '#272822'],
    description: 'Monokai theme inspired gradient',
  },

  'github-dark': {
    name: 'GitHub Dark',
    gradient: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #0d1117 100%)',
    preview: ['#0d1117', '#161b22'],
    description: 'GitHub dark theme gradient',
  },

  'solarized-dark': {
    name: 'Solarized Dark',
    gradient: 'linear-gradient(135deg, #002b36 0%, #073642 50%, #002b36 100%)',
    preview: ['#002b36', '#073642'],
    description: 'Solarized dark theme gradient',
  },

  'aurora-borealis': {
    name: 'Aurora Borealis',
    gradient: 'linear-gradient(135deg, #001420 0%, #002d3d 30%, #004d5c 60%, #002d3d 100%)',
    preview: ['#001420', '#002d3d', '#004d5c'],
    description: 'Northern lights inspired gradient',
  },

  'synthwave-sunset': {
    name: 'Synthwave Sunset',
    gradient: 'linear-gradient(135deg, #190a14 0%, #2d1429 30%, #4d1a3d 60%, #2d1429 100%)',
    preview: ['#190a14', '#2d1429', '#4d1a3d'],
    description: 'Synthwave sunset gradient',
  },

  'neon-city': {
    name: 'Neon City',
    gradient: 'radial-gradient(ellipse at top, #1a0033 0%, #0a0a1f 50%, #000000 100%)',
    preview: ['#1a0033', '#0a0a1f', '#000000'],
    description: 'Radial gradient for neon city vibes',
  },

  'terminal-green': {
    name: 'Terminal Green',
    gradient: 'linear-gradient(135deg, #000f00 0%, #001a00 50%, #000a00 100%)',
    preview: ['#000f00', '#001a00', '#000a00'],
    description: 'Classic terminal green background',
  },

  'transparent': {
    name: 'Transparent',
    gradient: 'transparent',
    preview: ['rgba(255,255,255,0.1)'],
    description: 'Fully transparent, shows app background',
  },
};

// Get background by key with fallback
export function getBackgroundGradient(key?: string): BackgroundGradient {
  if (!key) return backgroundGradients['dark-neutral'];
  return backgroundGradients[key] || backgroundGradients['dark-neutral'];
}

// Get CSS value for background
export function getBackgroundCSS(key?: string): string {
  const bg = getBackgroundGradient(key);
  return bg.gradient;
}
