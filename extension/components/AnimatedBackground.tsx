/**
 * AnimatedBackground Component
 * Renders canvas-based animated backgrounds behind terminal content
 */

import React, { useRef, useEffect, useCallback } from 'react'
import {
  getAnimatedBackground,
  type AnimatedBackground as AnimatedBackgroundType,
  type AnimationState,
  type AnimatedBackgroundColors,
} from '../styles/animated-backgrounds'

interface AnimatedBackgroundProps {
  animationKey: string
  isDark?: boolean
  speed?: number
  paused?: boolean
  opacity?: number
  className?: string
}

export function AnimatedBackground({
  animationKey,
  isDark = true,
  speed = 1,
  paused = false,
  opacity = 1,
  className = '',
}: AnimatedBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const stateRef = useRef<AnimationState | null>(null)
  const lastTimeRef = useRef<number>(0)
  const animationDataRef = useRef<AnimatedBackgroundType | null>(null)

  // Get animation configuration
  const animation = getAnimatedBackground(animationKey)

  // Initialize animation state
  const initAnimation = useCallback((width: number, height: number) => {
    if (!animation) return null
    return animation.init(width, height)
  }, [animation])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !animation || paused) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Store animation reference for cleanup
    animationDataRef.current = animation

    // Handle resize
    const resizeCanvas = () => {
      const parent = canvas.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1

      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      ctx.scale(dpr, dpr)

      // Reinitialize state on resize
      stateRef.current = initAnimation(rect.width, rect.height)
    }

    resizeCanvas()

    // Observe parent size changes
    const resizeObserver = new ResizeObserver(resizeCanvas)
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement)
    }

    // Get colors based on theme
    const colors: AnimatedBackgroundColors = isDark
      ? animation.colors.dark
      : animation.colors.light

    // Animation frame
    const animate = (time: number) => {
      if (!stateRef.current || !animationDataRef.current) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      const deltaTime = time - lastTimeRef.current
      lastTimeRef.current = time

      // Get actual canvas size (not scaled)
      const parent = canvas.parentElement
      if (!parent) {
        animationRef.current = requestAnimationFrame(animate)
        return
      }

      const rect = parent.getBoundingClientRect()

      // Clear and render
      ctx.save()
      ctx.globalAlpha = opacity

      animationDataRef.current.render(
        ctx,
        rect.width,
        rect.height,
        colors,
        speed,
        deltaTime,
        time,
        stateRef.current
      )

      ctx.restore()

      animationRef.current = requestAnimationFrame(animate)
    }

    // Start animation
    lastTimeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(animate)

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      resizeObserver.disconnect()
    }
  }, [animation, isDark, speed, paused, opacity, initAnimation])

  // Reinitialize when animation changes
  useEffect(() => {
    if (!animation) return

    const canvas = canvasRef.current
    if (!canvas?.parentElement) return

    const rect = canvas.parentElement.getBoundingClientRect()
    stateRef.current = initAnimation(rect.width, rect.height)
    animationDataRef.current = animation
  }, [animationKey, animation, initAnimation])

  if (!animation) {
    return null
  }

  return (
    <canvas
      ref={canvasRef}
      className={`animated-background ${className}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  )
}

// Memoized version to prevent unnecessary re-renders
export const MemoizedAnimatedBackground = React.memo(AnimatedBackground)
