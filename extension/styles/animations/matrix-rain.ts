/**
 * Matrix Rain Animation
 * Classic falling code effect with various color themes
 */

import type { AnimatedBackground, AnimationState, AnimatedBackgroundColors } from '../animated-backgrounds'
import { hexToRgba } from '../animated-backgrounds'

// Characters to use (katakana-like + numbers + symbols)
const MATRIX_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789@#$%^&*()+=<>?'

interface MatrixColumn {
  x: number
  y: number
  speed: number
  chars: string[]
  length: number
  opacity: number
}

interface MatrixState extends AnimationState {
  columns: MatrixColumn[]
  charWidth: number
  lastUpdate: number
}

function initMatrix(width: number, height: number): MatrixState {
  const charWidth = 14
  const columnCount = Math.ceil(width / charWidth)
  const columns: MatrixColumn[] = []

  for (let i = 0; i < columnCount; i++) {
    columns.push(createColumn(i * charWidth, height))
  }

  return {
    columns,
    charWidth,
    lastUpdate: 0,
  }
}

function createColumn(x: number, height: number): MatrixColumn {
  const length = Math.floor(Math.random() * 15) + 5
  const chars: string[] = []
  for (let i = 0; i < length; i++) {
    chars.push(MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)])
  }
  return {
    x,
    y: Math.random() * -height,
    speed: Math.random() * 2 + 1,
    chars,
    length,
    opacity: Math.random() * 0.3 + 0.1,
  }
}

function renderMatrix(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  colors: AnimatedBackgroundColors,
  speed: number,
  deltaTime: number,
  time: number,
  state: AnimationState
): void {
  const { columns, charWidth } = state as MatrixState
  const charHeight = 16
  const adjustedSpeed = speed * deltaTime * 0.05

  // Semi-transparent background for trail effect
  ctx.fillStyle = hexToRgba(colors.background, 0.1)
  ctx.fillRect(0, 0, width, height)

  ctx.font = `${charHeight}px monospace`
  ctx.textAlign = 'center'

  for (const column of columns) {
    // Update position
    column.y += column.speed * adjustedSpeed

    // Draw characters
    for (let i = 0; i < column.chars.length; i++) {
      const y = column.y + i * charHeight

      if (y < 0 || y > height) continue

      // First char is brightest
      const charOpacity = i === 0
        ? column.opacity + 0.3
        : column.opacity * (1 - i / column.chars.length)

      // Primary color for most, accent for leading char
      const color = i === 0 ? colors.accent || colors.primary : colors.primary
      ctx.fillStyle = hexToRgba(color, charOpacity)
      ctx.fillText(column.chars[i], column.x + charWidth / 2, y)

      // Occasionally change character
      if (Math.random() < 0.01) {
        column.chars[i] = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
      }
    }

    // Reset column when off screen
    if (column.y > height + column.length * charHeight) {
      Object.assign(column, createColumn(column.x, height))
    }
  }
}

// Base matrix animation
const baseMatrix = {
  category: 'matrix' as const,
  defaultSpeed: 1,
  init: initMatrix,
  render: renderMatrix,
}

export const matrixRain: AnimatedBackground = {
  ...baseMatrix,
  id: 'matrix-rain',
  name: 'Matrix Rain',
  colors: {
    dark: {
      primary: '#00ff00',
      secondary: '#008800',
      accent: '#ffffff',
      background: '#000000',
    },
    light: {
      primary: '#00aa00',
      secondary: '#006600',
      accent: '#00ff00',
      background: '#0a0a0a',
    },
  },
  description: 'Classic green falling code rain',
}

export const matrixRainGreen: AnimatedBackground = {
  ...baseMatrix,
  id: 'matrix-rain-green',
  name: 'Matrix Emerald',
  colors: {
    dark: {
      primary: '#00ff88',
      secondary: '#00aa55',
      accent: '#aaffdd',
      background: '#000a05',
    },
    light: {
      primary: '#00cc66',
      secondary: '#008844',
      accent: '#00ff88',
      background: '#051a10',
    },
  },
  description: 'Emerald green matrix effect',
}

export const matrixRainPurple: AnimatedBackground = {
  ...baseMatrix,
  id: 'matrix-rain-purple',
  name: 'Matrix Violet',
  colors: {
    dark: {
      primary: '#aa00ff',
      secondary: '#6600aa',
      accent: '#ff00ff',
      background: '#05000a',
    },
    light: {
      primary: '#8800cc',
      secondary: '#550088',
      accent: '#aa00ff',
      background: '#0a0510',
    },
  },
  description: 'Purple cyberpunk matrix',
}

export const matrixRainGold: AnimatedBackground = {
  ...baseMatrix,
  id: 'matrix-rain-gold',
  name: 'Matrix Gold',
  colors: {
    dark: {
      primary: '#ffaa00',
      secondary: '#aa7700',
      accent: '#ffdd88',
      background: '#0a0500',
    },
    light: {
      primary: '#cc8800',
      secondary: '#886600',
      accent: '#ffaa00',
      background: '#100a05',
    },
  },
  description: 'Golden amber matrix rain',
}
