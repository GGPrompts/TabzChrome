/**
 * Animated Terminal Backgrounds
 * Canvas-based animations that render behind terminal content
 *
 * Design principles:
 * - Subtle: Low opacity so text remains readable
 * - Performant: 60fps with minimal allocations
 * - Battery-friendly: Pausable, uses requestAnimationFrame
 */

export interface AnimatedBackgroundColors {
  primary: string
  secondary: string
  accent?: string
  background: string
}

export interface AnimatedBackground {
  id: string
  name: string
  category: 'matrix' | 'particles' | 'aurora' | 'grid' | 'starfield' | 'waves'
  colors: {
    dark: AnimatedBackgroundColors
    light: AnimatedBackgroundColors
  }
  defaultSpeed: number  // 0.5 = half speed, 1 = normal, 2 = double
  description: string
  // Render function called each frame
  render: AnimationRenderFn
  // Initialize animation state
  init: AnimationInitFn
}

export type AnimationState = Record<string, unknown>

export type AnimationRenderFn = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AnimationState
) => void

export type AnimationInitFn = (width: number, height: number) => AnimationState

// Import all animations
import { matrixRain, matrixRainGreen, matrixRainPurple, matrixRainGold } from './animations/matrix-rain'
import { floatingParticles, sparkleField, fireflies, snowfall } from './animations/particle-field'
import { auroraClassic, auroraPurple, auroraFire, auroraCyberpunk } from './animations/aurora-waves'
import { synthwaveGrid, tronGrid, pulseGrid, scanLines } from './animations/cyber-grid'
import { starfieldWarp, starfieldDrift, starfieldTwinkle, nebulaDrift } from './animations/starfield'

// Registry of all animated backgrounds
export const animatedBackgrounds: Record<string, AnimatedBackground> = {
  // Matrix category
  'matrix-rain': matrixRain,
  'matrix-rain-green': matrixRainGreen,
  'matrix-rain-purple': matrixRainPurple,
  'matrix-rain-gold': matrixRainGold,

  // Particles category
  'floating-particles': floatingParticles,
  'sparkle-field': sparkleField,
  'fireflies': fireflies,
  'snowfall': snowfall,

  // Aurora category
  'aurora-classic': auroraClassic,
  'aurora-purple': auroraPurple,
  'aurora-fire': auroraFire,
  'aurora-cyberpunk': auroraCyberpunk,

  // Grid category
  'synthwave-grid': synthwaveGrid,
  'tron-grid': tronGrid,
  'pulse-grid': pulseGrid,
  'scan-lines': scanLines,

  // Starfield category
  'starfield-warp': starfieldWarp,
  'starfield-drift': starfieldDrift,
  'starfield-twinkle': starfieldTwinkle,
  'nebula-drift': nebulaDrift,
}

// Get list of animation names for UI
export const animatedBackgroundNames = Object.keys(animatedBackgrounds)

// Get animation by key with fallback
export function getAnimatedBackground(key?: string): AnimatedBackground | undefined {
  if (!key) return undefined
  return animatedBackgrounds[key]
}

// Get animations by category
export function getAnimationsByCategory(category: AnimatedBackground['category']): AnimatedBackground[] {
  return Object.values(animatedBackgrounds).filter(bg => bg.category === category)
}

// Categories for UI grouping
export const animationCategories = [
  { id: 'matrix', name: 'Matrix', icon: '▓' },
  { id: 'particles', name: 'Particles', icon: '✦' },
  { id: 'aurora', name: 'Aurora', icon: '◠' },
  { id: 'grid', name: 'Cyber Grid', icon: '▦' },
  { id: 'starfield', name: 'Starfield', icon: '★' },
] as const

// Helper to parse hex color to rgba
export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Helper for smooth animation interpolation
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

// Easing functions
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
