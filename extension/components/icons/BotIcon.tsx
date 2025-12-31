'use client'

import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useImperativeHandle, useRef, useEffect } from 'react'
import { motion, useAnimation } from 'motion/react'

import { cn } from '../../lib/utils'

export interface BotIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface BotIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  /** When true, continuously loops the animation */
  animate?: boolean
}

const BotIcon = forwardRef<BotIconHandle, BotIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 20, animate: animateProp = false, ...props }, ref) => {
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
        if (!isControlledRef.current && !animateProp) {
          controls.start('animate')
        } else {
          onMouseEnter?.(e)
        }
      },
      [controls, onMouseEnter, animateProp]
    )

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current && !animateProp) {
          controls.start('normal')
        } else {
          onMouseLeave?.(e)
        }
      },
      [controls, onMouseLeave, animateProp]
    )

    // Animation config - loop infinitely when animateProp is true
    const eyeAnimation = animateProp
      ? {
          y1: [13, 14, 13],
          y2: [15, 14, 15],
          transition: {
            duration: 0.5,
            ease: 'easeInOut' as const,
            repeat: Infinity,
            repeatDelay: 0.3,
          },
        }
      : undefined

    return (
      <div
        className={cn('select-none', className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />

          <motion.line
            x1={15}
            x2={15}
            initial={{ y1: 13, y2: 15 }}
            animate={animateProp ? eyeAnimation : controls}
            variants={animateProp ? undefined : {
              normal: { y1: 13, y2: 15 },
              animate: {
                y1: [13, 14, 13],
                y2: [15, 14, 15],
                transition: {
                  duration: 0.5,
                  ease: 'easeInOut',
                  delay: 0.2,
                },
              },
            }}
          />

          <motion.line
            x1={9}
            x2={9}
            initial={{ y1: 13, y2: 15 }}
            animate={animateProp ? eyeAnimation : controls}
            variants={animateProp ? undefined : {
              normal: { y1: 13, y2: 15 },
              animate: {
                y1: [13, 14, 13],
                y2: [15, 14, 15],
                transition: {
                  duration: 0.5,
                  ease: 'easeInOut',
                  delay: 0.2,
                },
              },
            }}
          />
        </svg>
      </div>
    )
  }
)

BotIcon.displayName = 'BotIcon'

export { BotIcon }
