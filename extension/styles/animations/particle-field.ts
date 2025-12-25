/**
 * Particle Field Animations
 * Floating particles, sparkles, fireflies, and snowfall
 */

import type { AnimatedBackground, AnimationState, AnimatedBackgroundColors } from '../animated-backgrounds'
import { hexToRgba } from '../animated-backgrounds'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  alpha: number
  targetAlpha: number
  phase: number      // For pulsing/twinkling
  phaseSpeed: number
  hue?: number       // For color variation
}

interface ParticleState extends AnimationState {
  particles: Particle[]
  type: 'floating' | 'sparkle' | 'firefly' | 'snow'
}

function createParticle(width: number, height: number, type: ParticleState['type']): Particle {
  const base: Particle = {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    size: Math.random() * 2 + 1,
    alpha: Math.random() * 0.3 + 0.1,
    targetAlpha: Math.random() * 0.3 + 0.1,
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: Math.random() * 0.02 + 0.01,
  }

  switch (type) {
    case 'sparkle':
      base.phaseSpeed = Math.random() * 0.1 + 0.05
      base.size = Math.random() * 1.5 + 0.5
      break
    case 'firefly':
      base.size = Math.random() * 3 + 2
      base.phaseSpeed = Math.random() * 0.03 + 0.01
      base.hue = Math.random() * 60 - 30 // Yellow-green variation
      break
    case 'snow':
      base.vy = Math.random() * 0.5 + 0.3
      base.vx = (Math.random() - 0.5) * 0.2
      base.size = Math.random() * 2 + 1
      base.alpha = Math.random() * 0.4 + 0.2
      break
  }

  return base
}

function initParticles(width: number, height: number, count: number, type: ParticleState['type']): ParticleState {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    particles.push(createParticle(width, height, type))
  }
  return { particles, type }
}

function renderParticles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AnimationState
): void {
  const { particles, type } = state as ParticleState
  const adjustedSpeed = speed * deltaTime * 0.016

  // Clear with background
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  for (const p of particles) {
    // Update position
    p.x += p.vx * adjustedSpeed
    p.y += p.vy * adjustedSpeed
    p.phase += p.phaseSpeed * adjustedSpeed

    // Wrap around edges
    if (p.x < -10) p.x = width + 10
    if (p.x > width + 10) p.x = -10
    if (p.y < -10) {
      if (type === 'snow') {
        p.y = height + 10
        p.x = Math.random() * width
      } else {
        p.y = height + 10
      }
    }
    if (p.y > height + 10) {
      if (type === 'snow') {
        p.y = -10
        p.x = Math.random() * width
      } else {
        p.y = -10
      }
    }

    // Calculate current alpha based on type
    let currentAlpha = p.alpha

    switch (type) {
      case 'sparkle':
        // Sharp twinkle
        currentAlpha = p.alpha * (0.3 + Math.abs(Math.sin(p.phase)) * 0.7)
        break
      case 'firefly':
        // Slow pulse with occasional bright flash
        const pulse = Math.sin(p.phase) * 0.5 + 0.5
        const flash = Math.random() < 0.001 ? 1 : 0
        currentAlpha = p.alpha * (pulse * 0.7 + 0.3) + flash * 0.5
        break
      case 'snow':
        // Slight shimmer
        currentAlpha = p.alpha * (0.8 + Math.sin(p.phase) * 0.2)
        break
      default:
        // Gentle fade
        currentAlpha = p.alpha * (0.7 + Math.sin(p.phase) * 0.3)
    }

    // Draw particle
    ctx.beginPath()

    if (type === 'firefly') {
      // Glow effect for fireflies
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3)
      gradient.addColorStop(0, hexToRgba(colors.accent || colors.primary, currentAlpha))
      gradient.addColorStop(0.4, hexToRgba(colors.primary, currentAlpha * 0.5))
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
    } else if (type === 'sparkle') {
      // Cross shape for sparkles
      ctx.fillStyle = hexToRgba(colors.primary, currentAlpha)
      const s = p.size
      ctx.fillRect(p.x - s / 2, p.y - s * 2, s, s * 4)
      ctx.fillRect(p.x - s * 2, p.y - s / 2, s * 4, s)
    } else {
      // Simple circle
      ctx.fillStyle = hexToRgba(colors.primary, currentAlpha)
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    }

    ctx.fill()
  }
}

// Floating particles - slow drift
export const floatingParticles: AnimatedBackground = {
  id: 'floating-particles',
  name: 'Floating Particles',
  category: 'particles',
  colors: {
    dark: {
      primary: '#4488ff',
      secondary: '#2244aa',
      accent: '#88aaff',
      background: '#000005',
    },
    light: {
      primary: '#3366cc',
      secondary: '#224488',
      accent: '#4488ff',
      background: '#050510',
    },
  },
  defaultSpeed: 1,
  description: 'Gentle floating blue particles',
  init: (w, h) => initParticles(w, h, 50, 'floating'),
  render: renderParticles,
}

// Sparkle field - twinkling stars
export const sparkleField: AnimatedBackground = {
  id: 'sparkle-field',
  name: 'Sparkle Field',
  category: 'particles',
  colors: {
    dark: {
      primary: '#ffffff',
      secondary: '#aaaaaa',
      accent: '#ffffaa',
      background: '#000000',
    },
    light: {
      primary: '#dddddd',
      secondary: '#888888',
      accent: '#ffffcc',
      background: '#0a0a0a',
    },
  },
  defaultSpeed: 1,
  description: 'Twinkling star-like sparkles',
  init: (w, h) => initParticles(w, h, 80, 'sparkle'),
  render: renderParticles,
}

// Fireflies - glowing pulsing particles
export const fireflies: AnimatedBackground = {
  id: 'fireflies',
  name: 'Fireflies',
  category: 'particles',
  colors: {
    dark: {
      primary: '#88ff00',
      secondary: '#44aa00',
      accent: '#ccff66',
      background: '#000500',
    },
    light: {
      primary: '#66cc00',
      secondary: '#448800',
      accent: '#88ff00',
      background: '#050a00',
    },
  },
  defaultSpeed: 0.7,
  description: 'Glowing firefly particles',
  init: (w, h) => initParticles(w, h, 25, 'firefly'),
  render: renderParticles,
}

// Snowfall - falling snow particles
export const snowfall: AnimatedBackground = {
  id: 'snowfall',
  name: 'Snowfall',
  category: 'particles',
  colors: {
    dark: {
      primary: '#ffffff',
      secondary: '#cccccc',
      accent: '#eeeeff',
      background: '#000510',
    },
    light: {
      primary: '#eeeeee',
      secondary: '#aaaaaa',
      accent: '#ffffff',
      background: '#0a0f15',
    },
  },
  defaultSpeed: 1,
  description: 'Gentle falling snow',
  init: (w, h) => initParticles(w, h, 60, 'snow'),
  render: renderParticles,
}
