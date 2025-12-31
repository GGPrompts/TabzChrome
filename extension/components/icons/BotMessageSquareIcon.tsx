'use client'

import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect } from 'react'
import { motion, useAnimation } from 'motion/react'

import { cn } from '../../lib/utils'

export interface BotMessageSquareIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface BotMessageSquareIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  /** When true, continuously loops the animation */
  animate?: boolean
}

const BotMessageSquareIcon = forwardRef<
  BotMessageSquareIconHandle,
  BotMessageSquareIconProps
>(({ className, onMouseEnter, onMouseLeave, size = 20, animate: animateProp = false, ...props }, ref) => {
  const controls = useAnimation()
  const isControlledRef = useRef(false)

  // Handle animate prop for continuous looping
  useEffect(() => {
    if (animateProp) {
      isControlledRef.current = true
      controls.start('animate')
    } else if (isControlledRef.current && !animateProp) {
      controls.start('normal')
    }
  }, [animateProp, controls])

  useImperativeHandle(ref, () => {
    isControlledRef.current = true
    return {
      startAnimation: () => controls.start('animate'),
      stopAnimation: () => controls.start('normal'),
    }
  })

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlledRef.current && !animateProp) controls.start('animate')
      else onMouseEnter?.(e)
    },
    [controls, onMouseEnter, animateProp]
  )

  const handleMouseLeave = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isControlledRef.current && !animateProp) controls.start('normal')
      else onMouseLeave?.(e)
    },
    [controls, onMouseLeave, animateProp]
  )

  // Repeat count based on animate prop
  const repeatCount = animateProp ? Infinity : 0

  return (
    <div
      className={cn('select-none inline-flex items-center justify-center', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      <motion.svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial="normal"
        animate={controls}
        variants={{
          normal: { rotate: 0, y: 0, scale: 1 },
          animate: {
            rotate: [0, -3, 3, 0, 0],
            y: [0, 1.5, -1.5, 0],
            scale: [1, 1.03, 1],
            transition: {
              duration: 1,
              ease: 'easeInOut',
              repeat: repeatCount,
              repeatDelay: 0.5,
            },
          },
        }}
      >
        <path d="M12 6V2H8" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <motion.path
          d="M20 16a2 2 0 0 1-2 2H8.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 4 20.286V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"
          variants={{
            normal: { scale: 1, originX: 0.5, originY: 0.5 },
            animate: {
              scale: [1, 1.04, 1],
              transition: {
                duration: 0.6,
                ease: 'easeInOut',
                repeat: repeatCount,
                repeatDelay: 0.9,
              },
            },
          }}
        />
        <motion.path
          d="M9 11v2"
          variants={{
            normal: { scaleY: 1, originY: 0.5 },
            animate: {
              scaleY: [1, 0.1, 1],
              transition: {
                duration: 0.4,
                ease: 'easeInOut',
                delay: 0.1,
                repeat: repeatCount,
                repeatDelay: 1.1,
              },
            },
          }}
        />
        <motion.path
          d="M15 11v2"
          variants={{
            normal: { scaleY: 1, originY: 0.5 },
            animate: {
              scaleY: [1, 0.1, 1],
              transition: {
                duration: 0.4,
                ease: 'easeInOut',
                delay: 0.2,
                repeat: repeatCount,
                repeatDelay: 1.1,
              },
            },
          }}
        />
        <motion.circle
          cx="10"
          cy="18"
          r="0.5"
          variants={{
            normal: { opacity: 0 },
            animate: {
              opacity: [0.3, 1, 0.3],
              transition: { repeat: Infinity, duration: 1.2, delay: 0 },
            },
          }}
        />
        <motion.circle
          cx="12"
          cy="18"
          r="0.5"
          variants={{
            normal: { opacity: 0 },
            animate: {
              opacity: [0.3, 1, 0.3],
              transition: { repeat: Infinity, duration: 1.2, delay: 0.3 },
            },
          }}
        />
        <motion.circle
          cx="14"
          cy="18"
          r="0.5"
          variants={{
            normal: { opacity: 0 },
            animate: {
              opacity: [0.3, 1, 0.3],
              transition: { repeat: Infinity, duration: 1.2, delay: 0.6 },
            },
          }}
        />
      </motion.svg>
    </div>
  )
})

BotMessageSquareIcon.displayName = 'BotMessageSquareIcon'

export { BotMessageSquareIcon }
