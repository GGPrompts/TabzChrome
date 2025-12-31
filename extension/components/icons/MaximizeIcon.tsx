'use client'

import type { Transition } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { motion, useAnimation } from 'motion/react'

import { cn } from '../../lib/utils'

export interface MaximizeIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 25,
}

interface MaximizeIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const MaximizeIcon = forwardRef<MaximizeIconHandle, MaximizeIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 20, isHovered, ...props }, ref) => {
    const controls = useAnimation()
    const isControlledRef = useRef(false)

    useEffect(() => {
      if (isHovered !== undefined) {
        isControlledRef.current = true
        controls.start(isHovered ? 'animate' : 'normal')
      }
    }, [isHovered, controls])

    useImperativeHandle(ref, () => {
      isControlledRef.current = true
      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      }
    })

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current && isHovered === undefined) {
          controls.start('animate')
        }
        onMouseEnter?.(e)
      },
      [controls, onMouseEnter, isHovered]
    )

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (!isControlledRef.current && isHovered === undefined) {
          controls.start('normal')
        }
        onMouseLeave?.(e)
      },
      [controls, onMouseLeave, isHovered]
    )

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
        >
          <motion.path
            d="M8 3H5a2 2 0 0 0-2 2v3"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '-2px', translateY: '-2px' },
            }}
            animate={controls}
          />

          <motion.path
            d="M21 8V5a2 2 0 0 0-2-2h-3"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '2px', translateY: '-2px' },
            }}
            animate={controls}
          />

          <motion.path
            d="M3 16v3a2 2 0 0 0 2 2h3"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '-2px', translateY: '2px' },
            }}
            animate={controls}
          />

          <motion.path
            d="M16 21h3a2 2 0 0 0 2-2v-3"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '2px', translateY: '2px' },
            }}
            animate={controls}
          />
        </svg>
      </div>
    )
  }
)

MaximizeIcon.displayName = 'MaximizeIcon'

export { MaximizeIcon }
