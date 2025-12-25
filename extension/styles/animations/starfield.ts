/**
 * Starfield Animations
 * Space warp, drifting stars, twinkling, and nebula effects
 */

import type { AnimatedBackground, AnimationState, AnimatedBackgroundColors } from '../animated-backgrounds'
import { hexToRgba } from '../animated-backgrounds'

interface Star {
  x: number
  y: number
  z: number         // Depth (0-1, closer = 1)
  size: number
  brightness: number
  twinklePhase: number
  twinkleSpeed: number
  color?: string    // For colored stars
}

interface Nebula {
  x: number
  y: number
  radius: number
  color: string
  alpha: number
}

interface StarfieldState extends AnimationState {
  stars: Star[]
  nebulae: Nebula[]
  type: 'warp' | 'drift' | 'twinkle' | 'nebula'
  centerX: number
  centerY: number
}

function createStar(width: number, height: number, type: StarfieldState['type'], colors: AnimatedBackgroundColors): Star {
  const star: Star = {
    x: Math.random() * width,
    y: Math.random() * height,
    z: Math.random(),
    size: Math.random() * 2 + 0.5,
    brightness: Math.random() * 0.5 + 0.3,
    twinklePhase: Math.random() * Math.PI * 2,
    twinkleSpeed: Math.random() * 0.05 + 0.02,
  }

  if (type === 'warp') {
    // Warp starts from center
    star.x = width / 2 + (Math.random() - 0.5) * 100
    star.y = height / 2 + (Math.random() - 0.5) * 100
    star.z = Math.random() * 0.5 + 0.5 // Start further away
  }

  // Some stars have color tint
  if (Math.random() < 0.1) {
    star.color = Math.random() < 0.5 ? colors.accent : colors.secondary
  }

  return star
}

function createNebula(width: number, height: number, color: string): Nebula {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    radius: Math.random() * 150 + 50,
    color,
    alpha: Math.random() * 0.1 + 0.05,
  }
}

function initStarfield(width: number, height: number, type: StarfieldState['type'], colors: AnimatedBackgroundColors): StarfieldState {
  const starCount = type === 'nebula' ? 60 : 100
  const stars: Star[] = []
  const nebulae: Nebula[] = []

  for (let i = 0; i < starCount; i++) {
    stars.push(createStar(width, height, type, colors))
  }

  if (type === 'nebula') {
    for (let i = 0; i < 5; i++) {
      nebulae.push(createNebula(width, height, i % 2 === 0 ? colors.primary : colors.secondary))
    }
  }

  return {
    stars,
    nebulae,
    type,
    centerX: width / 2,
    centerY: height / 2,
  }
}

function renderWarp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AnimationState
): void {
  const { stars, centerX, centerY } = state as StarfieldState
  const adjustedSpeed = speed * deltaTime * 0.00005

  // Trail effect - semi-transparent clear
  ctx.fillStyle = hexToRgba(colors.background, 0.15)
  ctx.fillRect(0, 0, width, height)

  for (const star of stars) {
    // Move star toward viewer (z decreases)
    star.z -= adjustedSpeed * (2 - star.z)

    // Project 3D position to 2D
    const scale = 1 / star.z
    const projectedX = centerX + (star.x - centerX) * scale
    const projectedY = centerY + (star.y - centerY) * scale

    // Reset star when it passes the viewer
    if (star.z < 0.01 || projectedX < -50 || projectedX > width + 50 || projectedY < -50 || projectedY > height + 50) {
      star.x = centerX + (Math.random() - 0.5) * 100
      star.y = centerY + (Math.random() - 0.5) * 100
      star.z = 1
    }

    // Star gets bigger and brighter as it approaches
    const currentSize = star.size * scale * 0.5
    const currentBrightness = Math.min(1, star.brightness * scale * 0.3)

    // Draw star with trail
    const prevScale = 1 / (star.z + adjustedSpeed * 5)
    const prevX = centerX + (star.x - centerX) * prevScale
    const prevY = centerY + (star.y - centerY) * prevScale

    // Trail line
    ctx.strokeStyle = hexToRgba(star.color || colors.primary, currentBrightness * 0.5)
    ctx.lineWidth = Math.max(0.5, currentSize * 0.5)
    ctx.beginPath()
    ctx.moveTo(prevX, prevY)
    ctx.lineTo(projectedX, projectedY)
    ctx.stroke()

    // Star point
    ctx.fillStyle = hexToRgba(star.color || colors.primary, currentBrightness)
    ctx.beginPath()
    ctx.arc(projectedX, projectedY, Math.max(0.5, currentSize), 0, Math.PI * 2)
    ctx.fill()
  }
}

function renderDrift(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AnimationState
): void {
  const { stars } = state as StarfieldState
  const adjustedSpeed = speed * deltaTime * 0.01

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  for (const star of stars) {
    // Parallax drift - farther stars move slower
    const driftSpeed = adjustedSpeed * (0.5 + star.z * 0.5)
    star.x -= driftSpeed

    // Slight vertical drift
    star.y += Math.sin(star.twinklePhase) * 0.1 * adjustedSpeed
    star.twinklePhase += star.twinkleSpeed

    // Wrap around
    if (star.x < -5) {
      star.x = width + 5
      star.y = Math.random() * height
    }

    // Size based on depth
    const currentSize = star.size * (0.5 + star.z * 0.5)
    const currentBrightness = star.brightness * (0.5 + star.z * 0.5)

    // Draw star
    ctx.fillStyle = hexToRgba(star.color || colors.primary, currentBrightness)
    ctx.beginPath()
    ctx.arc(star.x, star.y, currentSize, 0, Math.PI * 2)
    ctx.fill()
  }
}

function renderTwinkle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AnimationState
): void {
  const { stars } = state as StarfieldState
  const adjustedSpeed = speed * deltaTime * 0.001

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  for (const star of stars) {
    // Update twinkle phase
    star.twinklePhase += star.twinkleSpeed * adjustedSpeed

    // Twinkle brightness (smooth sine wave with occasional flash)
    const twinkle = Math.sin(star.twinklePhase) * 0.5 + 0.5
    const flash = Math.sin(star.twinklePhase * 7) > 0.95 ? 0.3 : 0
    const currentBrightness = star.brightness * (0.3 + twinkle * 0.7) + flash

    // Draw star with soft glow
    const glowSize = star.size * 3
    const glow = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, glowSize)
    glow.addColorStop(0, hexToRgba(star.color || colors.primary, currentBrightness))
    glow.addColorStop(0.3, hexToRgba(star.color || colors.primary, currentBrightness * 0.3))
    glow.addColorStop(1, 'transparent')

    ctx.fillStyle = glow
    ctx.fillRect(star.x - glowSize, star.y - glowSize, glowSize * 2, glowSize * 2)

    // Core
    ctx.fillStyle = hexToRgba(colors.accent || '#ffffff', currentBrightness)
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size * 0.5, 0, Math.PI * 2)
    ctx.fill()
  }
}

function renderNebula(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AnimationState
): void {
  const { stars, nebulae } = state as StarfieldState
  const adjustedSpeed = speed * deltaTime * 0.0005

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  // Draw nebulae first (background)
  for (const nebula of nebulae) {
    // Slow drift
    nebula.x += Math.sin(time * 0.0001 + nebula.radius) * 0.1
    nebula.y += Math.cos(time * 0.00015 + nebula.radius) * 0.05

    // Pulsing
    const pulse = Math.sin(time * 0.0005 + nebula.radius) * 0.02 + 1

    const gradient = ctx.createRadialGradient(
      nebula.x, nebula.y, 0,
      nebula.x, nebula.y, nebula.radius * pulse
    )
    gradient.addColorStop(0, hexToRgba(nebula.color, nebula.alpha * 1.5))
    gradient.addColorStop(0.5, hexToRgba(nebula.color, nebula.alpha))
    gradient.addColorStop(1, 'transparent')

    ctx.fillStyle = gradient
    ctx.fillRect(
      nebula.x - nebula.radius * pulse,
      nebula.y - nebula.radius * pulse,
      nebula.radius * 2 * pulse,
      nebula.radius * 2 * pulse
    )
  }

  // Draw stars on top
  for (const star of stars) {
    star.twinklePhase += star.twinkleSpeed * adjustedSpeed
    const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.7

    ctx.fillStyle = hexToRgba(star.color || colors.accent || '#ffffff', star.brightness * twinkle)
    ctx.beginPath()
    ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Star warp (flying through space)
export const starfieldWarp: AnimatedBackground = {
  id: 'starfield-warp',
  name: 'Star Warp',
  category: 'starfield',
  colors: {
    dark: {
      primary: '#ffffff',
      secondary: '#88aaff',
      accent: '#ffcc88',
      background: '#000005',
    },
    light: {
      primary: '#dddddd',
      secondary: '#6688cc',
      accent: '#ccaa66',
      background: '#05050a',
    },
  },
  defaultSpeed: 1,
  description: 'Warp speed star streaks',
  init: (w, h) => initStarfield(w, h, 'warp', starfieldWarp.colors.dark),
  render: renderWarp,
}

// Slow sideways drift
export const starfieldDrift: AnimatedBackground = {
  id: 'starfield-drift',
  name: 'Star Drift',
  category: 'starfield',
  colors: {
    dark: {
      primary: '#aaaaff',
      secondary: '#ffaaaa',
      accent: '#ffffaa',
      background: '#000008',
    },
    light: {
      primary: '#8888cc',
      secondary: '#cc8888',
      accent: '#cccc88',
      background: '#05050d',
    },
  },
  defaultSpeed: 1,
  description: 'Gentle parallax star drift',
  init: (w, h) => initStarfield(w, h, 'drift', starfieldDrift.colors.dark),
  render: renderDrift,
}

// Stationary twinkling stars
export const starfieldTwinkle: AnimatedBackground = {
  id: 'starfield-twinkle',
  name: 'Twinkle Stars',
  category: 'starfield',
  colors: {
    dark: {
      primary: '#ffffff',
      secondary: '#aaddff',
      accent: '#ffffff',
      background: '#000003',
    },
    light: {
      primary: '#cccccc',
      secondary: '#88aacc',
      accent: '#dddddd',
      background: '#030308',
    },
  },
  defaultSpeed: 1,
  description: 'Stationary twinkling stars',
  init: (w, h) => initStarfield(w, h, 'twinkle', starfieldTwinkle.colors.dark),
  render: renderTwinkle,
}

// Stars with nebula clouds
export const nebulaDrift: AnimatedBackground = {
  id: 'nebula-drift',
  name: 'Nebula Drift',
  category: 'starfield',
  colors: {
    dark: {
      primary: '#ff6688',
      secondary: '#6688ff',
      accent: '#ffffff',
      background: '#020005',
    },
    light: {
      primary: '#cc5566',
      secondary: '#5566cc',
      accent: '#dddddd',
      background: '#07050a',
    },
  },
  defaultSpeed: 1,
  description: 'Stars with colorful nebula clouds',
  init: (w, h) => initStarfield(w, h, 'nebula', nebulaDrift.colors.dark),
  render: renderNebula,
}
