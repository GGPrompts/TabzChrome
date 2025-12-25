/**
 * Cyber Grid Animations
 * Synthwave, Tron, pulse, and scan line effects
 */

import type { AnimatedBackground, AnimationState, AnimatedBackgroundColors } from '../animated-backgrounds'
import { hexToRgba } from '../animated-backgrounds'

interface GridState extends AnimationState {
  offset: number
  pulsePhase: number
  scanY: number
  type: 'synthwave' | 'tron' | 'pulse' | 'scanlines'
}

function initGrid(width: number, height: number, type: GridState['type']): GridState {
  return {
    offset: 0,
    pulsePhase: 0,
    scanY: 0,
    type,
  }
}

function renderSynthwaveGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: GridState
): void {
  const adjustedTime = time * speed * 0.001
  const horizonY = height * 0.45

  // Background gradient (dark to horizon glow)
  const bgGradient = ctx.createLinearGradient(0, 0, 0, height)
  bgGradient.addColorStop(0, colors.background)
  bgGradient.addColorStop(0.4, colors.background)
  bgGradient.addColorStop(0.45, hexToRgba(colors.secondary, 0.3))
  bgGradient.addColorStop(0.5, colors.background)
  bgGradient.addColorStop(1, colors.background)
  ctx.fillStyle = bgGradient
  ctx.fillRect(0, 0, width, height)

  // Sun/moon at horizon
  const sunRadius = width * 0.12
  const sunX = width / 2
  const sunY = horizonY

  // Sun glow
  const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 2)
  sunGlow.addColorStop(0, hexToRgba(colors.accent || colors.primary, 0.4))
  sunGlow.addColorStop(0.5, hexToRgba(colors.primary, 0.1))
  sunGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = sunGlow
  ctx.fillRect(sunX - sunRadius * 2, sunY - sunRadius * 2, sunRadius * 4, sunRadius * 2)

  // Sun body (striped)
  ctx.save()
  ctx.beginPath()
  ctx.arc(sunX, sunY, sunRadius, Math.PI, 0)
  ctx.clip()

  const sunFill = ctx.createLinearGradient(sunX, sunY - sunRadius, sunX, sunY)
  sunFill.addColorStop(0, colors.accent || colors.primary)
  sunFill.addColorStop(1, colors.primary)
  ctx.fillStyle = sunFill
  ctx.fillRect(sunX - sunRadius, sunY - sunRadius, sunRadius * 2, sunRadius)

  // Horizontal stripes through sun
  ctx.fillStyle = colors.background
  for (let i = 0; i < 6; i++) {
    const stripeY = sunY - sunRadius + i * (sunRadius / 3) + (adjustedTime % 1) * (sunRadius / 6)
    ctx.fillRect(sunX - sunRadius, stripeY, sunRadius * 2, 3)
  }
  ctx.restore()

  // Grid lines
  ctx.strokeStyle = hexToRgba(colors.primary, 0.3)
  ctx.lineWidth = 1

  // Horizontal grid lines (perspective)
  const lineCount = 20
  const gridOffset = (adjustedTime * 50) % (height * 0.3 / lineCount)

  for (let i = 0; i < lineCount; i++) {
    const progress = i / lineCount
    const perspectiveY = horizonY + (height - horizonY) * (progress + gridOffset / (height * 0.3))
    if (perspectiveY > height) continue

    // Lines get more transparent near horizon
    ctx.strokeStyle = hexToRgba(colors.primary, 0.15 + progress * 0.2)
    ctx.beginPath()
    ctx.moveTo(0, perspectiveY)
    ctx.lineTo(width, perspectiveY)
    ctx.stroke()
  }

  // Vertical grid lines (converging to horizon center)
  const verticalLines = 30
  for (let i = -verticalLines / 2; i <= verticalLines / 2; i++) {
    const topX = width / 2 + i * 5
    const bottomX = width / 2 + i * (width / verticalLines) * 1.5

    ctx.strokeStyle = hexToRgba(colors.primary, 0.2)
    ctx.beginPath()
    ctx.moveTo(topX, horizonY)
    ctx.lineTo(bottomX, height)
    ctx.stroke()
  }

  // Horizon glow line
  const horizonGradient = ctx.createLinearGradient(0, horizonY - 5, 0, horizonY + 5)
  horizonGradient.addColorStop(0, 'transparent')
  horizonGradient.addColorStop(0.5, hexToRgba(colors.primary, 0.6))
  horizonGradient.addColorStop(1, 'transparent')
  ctx.fillStyle = horizonGradient
  ctx.fillRect(0, horizonY - 5, width, 10)
}

function renderTronGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: GridState
): void {
  const adjustedTime = time * speed * 0.001
  const gridSize = 40

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  // Animated offset for scrolling effect
  const offsetX = (adjustedTime * 20) % gridSize
  const offsetY = (adjustedTime * 10) % gridSize

  // Draw grid with glow
  ctx.lineWidth = 1

  // Vertical lines
  for (let x = -offsetX; x < width + gridSize; x += gridSize) {
    // Glow layer
    ctx.strokeStyle = hexToRgba(colors.primary, 0.1)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()

    // Bright center
    ctx.strokeStyle = hexToRgba(colors.primary, 0.25)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  // Horizontal lines
  for (let y = -offsetY; y < height + gridSize; y += gridSize) {
    // Glow layer
    ctx.strokeStyle = hexToRgba(colors.primary, 0.1)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()

    // Bright center
    ctx.strokeStyle = hexToRgba(colors.primary, 0.25)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  // Random bright intersection pulses
  const pulseCount = 3
  for (let i = 0; i < pulseCount; i++) {
    const pulsePhase = (adjustedTime * 0.5 + i * 1.3) % 3
    if (pulsePhase < 1) {
      const px = Math.floor((Math.sin(i * 7.3) * 0.5 + 0.5) * width / gridSize) * gridSize - offsetX
      const py = Math.floor((Math.cos(i * 5.7) * 0.5 + 0.5) * height / gridSize) * gridSize - offsetY

      const pulseGlow = ctx.createRadialGradient(px, py, 0, px, py, 30)
      pulseGlow.addColorStop(0, hexToRgba(colors.accent || colors.primary, 0.5 * (1 - pulsePhase)))
      pulseGlow.addColorStop(1, 'transparent')
      ctx.fillStyle = pulseGlow
      ctx.fillRect(px - 30, py - 30, 60, 60)
    }
  }
}

function renderPulseGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: GridState
): void {
  const adjustedTime = time * speed * 0.001
  const centerX = width / 2
  const centerY = height / 2
  const maxRadius = Math.sqrt(centerX * centerX + centerY * centerY)

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  // Concentric pulses
  const pulseInterval = 80
  const pulseSpeed = 100
  const pulseOffset = (adjustedTime * pulseSpeed) % pulseInterval

  ctx.lineWidth = 2

  for (let r = pulseOffset; r < maxRadius + pulseInterval; r += pulseInterval) {
    const progress = r / maxRadius
    const alpha = Math.max(0, 0.3 - progress * 0.3)

    // Glow
    ctx.strokeStyle = hexToRgba(colors.primary, alpha * 0.5)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
    ctx.stroke()

    // Core
    ctx.strokeStyle = hexToRgba(colors.primary, alpha)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  // Center glow
  const centerGlow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 50)
  centerGlow.addColorStop(0, hexToRgba(colors.accent || colors.primary, 0.3))
  centerGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = centerGlow
  ctx.fillRect(centerX - 50, centerY - 50, 100, 100)
}

function renderScanLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: GridState
): void {
  const adjustedTime = time * speed * 0.002

  // Clear
  ctx.fillStyle = colors.background
  ctx.fillRect(0, 0, width, height)

  // Static horizontal scan lines
  ctx.fillStyle = hexToRgba(colors.primary, 0.03)
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1)
  }

  // Moving scan bar
  const scanY = (adjustedTime * 100) % (height + 40) - 20
  const scanGradient = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20)
  scanGradient.addColorStop(0, 'transparent')
  scanGradient.addColorStop(0.4, hexToRgba(colors.primary, 0.2))
  scanGradient.addColorStop(0.5, hexToRgba(colors.accent || colors.primary, 0.4))
  scanGradient.addColorStop(0.6, hexToRgba(colors.primary, 0.2))
  scanGradient.addColorStop(1, 'transparent')
  ctx.fillStyle = scanGradient
  ctx.fillRect(0, scanY - 20, width, 40)

  // Random noise/flicker
  if (Math.random() < 0.02) {
    ctx.fillStyle = hexToRgba(colors.primary, Math.random() * 0.05)
    ctx.fillRect(0, 0, width, height)
  }

  // Occasional horizontal glitch lines
  if (Math.random() < 0.01) {
    const glitchY = Math.random() * height
    ctx.fillStyle = hexToRgba(colors.accent || colors.primary, 0.3)
    ctx.fillRect(0, glitchY, width, 2)
  }
}

// Synthwave sunset grid
export const synthwaveGrid: AnimatedBackground = {
  id: 'synthwave-grid',
  name: 'Synthwave Grid',
  category: 'grid',
  colors: {
    dark: {
      primary: '#ff00ff',
      secondary: '#00ffff',
      accent: '#ffaa00',
      background: '#0a0010',
    },
    light: {
      primary: '#cc00cc',
      secondary: '#00cccc',
      accent: '#cc8800',
      background: '#150520',
    },
  },
  defaultSpeed: 1,
  description: '80s synthwave sunset with perspective grid',
  init: (w, h) => initGrid(w, h, 'synthwave'),
  render: renderSynthwaveGrid,
}

// Tron-style blue grid
export const tronGrid: AnimatedBackground = {
  id: 'tron-grid',
  name: 'Tron Grid',
  category: 'grid',
  colors: {
    dark: {
      primary: '#00aaff',
      secondary: '#0066aa',
      accent: '#88ddff',
      background: '#000508',
    },
    light: {
      primary: '#0088cc',
      secondary: '#005588',
      accent: '#66bbdd',
      background: '#050a10',
    },
  },
  defaultSpeed: 0.8,
  description: 'Tron-style blue glowing grid',
  init: (w, h) => initGrid(w, h, 'tron'),
  render: renderTronGrid,
}

// Expanding pulse rings
export const pulseGrid: AnimatedBackground = {
  id: 'pulse-grid',
  name: 'Pulse Rings',
  category: 'grid',
  colors: {
    dark: {
      primary: '#00ff88',
      secondary: '#008844',
      accent: '#88ffbb',
      background: '#000805',
    },
    light: {
      primary: '#00cc66',
      secondary: '#006633',
      accent: '#66cc99',
      background: '#050f0a',
    },
  },
  defaultSpeed: 1,
  description: 'Concentric pulse rings expanding outward',
  init: (w, h) => initGrid(w, h, 'pulse'),
  render: renderPulseGrid,
}

// CRT scan lines
export const scanLines: AnimatedBackground = {
  id: 'scan-lines',
  name: 'Scan Lines',
  category: 'grid',
  colors: {
    dark: {
      primary: '#33ff33',
      secondary: '#00aa00',
      accent: '#88ff88',
      background: '#000500',
    },
    light: {
      primary: '#22cc22',
      secondary: '#008800',
      accent: '#66cc66',
      background: '#050a05',
    },
  },
  defaultSpeed: 1,
  description: 'Retro CRT monitor scan lines',
  init: (w, h) => initGrid(w, h, 'scanlines'),
  render: renderScanLines,
}
