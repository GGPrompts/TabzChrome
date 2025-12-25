/**
 * Aurora Waves Animation
 * Flowing northern lights effect with gentle wave motion
 */

import type { AnimatedBackground, AnimationState, AnimatedBackgroundColors } from '../animated-backgrounds'
import { hexToRgba } from '../animated-backgrounds'

interface AuroraState extends AnimationState {
  waves: AuroraWave[]
  time: number
}

interface AuroraWave {
  baseY: number      // Vertical position (0-1)
  amplitude: number  // Wave height
  frequency: number  // Wave frequency
  speed: number      // Horizontal movement speed
  phase: number      // Current phase offset
  thickness: number  // Band thickness
  opacity: number    // Max opacity
}

function initAurora(width: number, height: number): AuroraState {
  // Create 4-5 overlapping wave bands
  const waves: AuroraWave[] = []
  const waveCount = 4 + Math.floor(Math.random() * 2)

  for (let i = 0; i < waveCount; i++) {
    waves.push({
      baseY: 0.15 + (i / waveCount) * 0.4,
      amplitude: 0.05 + Math.random() * 0.08,
      frequency: 0.5 + Math.random() * 1,
      speed: 0.1 + Math.random() * 0.2,
      phase: Math.random() * Math.PI * 2,
      thickness: 0.08 + Math.random() * 0.12,
      opacity: 0.1 + Math.random() * 0.15,
    })
  }

  return { waves, time: 0 }
}

function renderAurora(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AuroraState
): void {
  const { waves } = state
  const adjustedTime = time * speed * 0.0003

  // Clear with background
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  // Draw each wave band
  for (let w = 0; w < waves.length; w++) {
    const wave = waves[w]
    const waveTime = adjustedTime * wave.speed + wave.phase

    // Create gradient for this wave
    const baseY = wave.baseY * height
    const gradient = ctx.createLinearGradient(0, baseY - wave.thickness * height, 0, baseY + wave.thickness * height)

    // Alternate between primary and secondary colors
    const color = w % 2 === 0 ? colors.primary : colors.secondary
    gradient.addColorStop(0, 'transparent')
    gradient.addColorStop(0.3, hexToRgba(color, wave.opacity * 0.5))
    gradient.addColorStop(0.5, hexToRgba(color, wave.opacity))
    gradient.addColorStop(0.7, hexToRgba(color, wave.opacity * 0.5))
    gradient.addColorStop(1, 'transparent')

    // Draw the wave shape
    ctx.beginPath()
    ctx.moveTo(0, height)

    // Bottom edge
    for (let x = 0; x <= width; x += 5) {
      const normalX = x / width
      const waveY = baseY + Math.sin(normalX * Math.PI * 2 * wave.frequency + waveTime) * wave.amplitude * height
      const secondaryWave = Math.sin(normalX * Math.PI * 4 + waveTime * 1.5) * wave.amplitude * height * 0.3
      ctx.lineTo(x, waveY + secondaryWave + wave.thickness * height)
    }

    // Top edge (reverse)
    for (let x = width; x >= 0; x -= 5) {
      const normalX = x / width
      const waveY = baseY + Math.sin(normalX * Math.PI * 2 * wave.frequency + waveTime) * wave.amplitude * height
      const secondaryWave = Math.sin(normalX * Math.PI * 4 + waveTime * 1.5) * wave.amplitude * height * 0.3
      ctx.lineTo(x, waveY + secondaryWave - wave.thickness * height)
    }

    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()
  }

  // Add subtle vertical streaks for realism
  for (let i = 0; i < 8; i++) {
    const x = (Math.sin(adjustedTime * 0.5 + i * 1.7) * 0.5 + 0.5) * width
    const streakGradient = ctx.createLinearGradient(x, 0, x, height * 0.6)
    streakGradient.addColorStop(0, hexToRgba(colors.accent || colors.primary, 0.03))
    streakGradient.addColorStop(0.5, hexToRgba(colors.primary, 0.08))
    streakGradient.addColorStop(1, 'transparent')

    ctx.fillStyle = streakGradient
    ctx.fillRect(x - 20, 0, 40, height * 0.6)
  }
}

const baseAurora = {
  category: 'aurora' as const,
  defaultSpeed: 1,
  init: initAurora,
  render: renderAurora,
}

// Classic green/blue aurora
export const auroraClassic: AnimatedBackground = {
  ...baseAurora,
  id: 'aurora-classic',
  name: 'Aurora Classic',
  colors: {
    dark: {
      primary: '#00ff88',
      secondary: '#0088ff',
      accent: '#88ffcc',
      background: '#000508',
    },
    light: {
      primary: '#00cc66',
      secondary: '#0066cc',
      accent: '#66ccaa',
      background: '#050a10',
    },
  },
  description: 'Classic green-blue northern lights',
}

// Purple/pink aurora
export const auroraPurple: AnimatedBackground = {
  ...baseAurora,
  id: 'aurora-purple',
  name: 'Aurora Violet',
  colors: {
    dark: {
      primary: '#aa00ff',
      secondary: '#ff00aa',
      accent: '#dd88ff',
      background: '#050008',
    },
    light: {
      primary: '#8800cc',
      secondary: '#cc0088',
      accent: '#aa66cc',
      background: '#0a0510',
    },
  },
  description: 'Purple and magenta aurora',
}

// Orange/red fire aurora
export const auroraFire: AnimatedBackground = {
  ...baseAurora,
  id: 'aurora-fire',
  name: 'Aurora Fire',
  colors: {
    dark: {
      primary: '#ff6600',
      secondary: '#ff0044',
      accent: '#ffaa00',
      background: '#080300',
    },
    light: {
      primary: '#cc5500',
      secondary: '#cc0033',
      accent: '#cc8800',
      background: '#100805',
    },
  },
  description: 'Fiery orange and red aurora',
}

// Cyan/magenta cyberpunk
export const auroraCyberpunk: AnimatedBackground = {
  ...baseAurora,
  id: 'aurora-cyberpunk',
  name: 'Aurora Neon',
  colors: {
    dark: {
      primary: '#00ffff',
      secondary: '#ff00ff',
      accent: '#ffffff',
      background: '#000510',
    },
    light: {
      primary: '#00cccc',
      secondary: '#cc00cc',
      accent: '#dddddd',
      background: '#050a15',
    },
  },
  description: 'Neon cyan and magenta waves',
}
