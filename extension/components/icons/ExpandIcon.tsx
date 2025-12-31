'use client'

import type { Transition } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { motion, useAnimation } from 'motion/react'

import { cn } from '../../lib/utils'

export interface ExpandIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface ExpandIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const DEFAULT_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 250,
  damping: 25,
}

const ExpandIcon = forwardRef<ExpandIconHandle, ExpandIconProps>(
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
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <motion.path
            d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '2px', translateY: '2px' },
            }}
            animate={controls}
          />
          <motion.path
            d="M3 16.2V21m0 0h4.8M3 21l6-6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '-2px', translateY: '2px' },
            }}
            animate={controls}
          />
          <motion.path
            d="M21 7.8V3m0 0h-4.8M21 3l-6 6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '2px', translateY: '-2px' },
            }}
            animate={controls}
          />
          <motion.path
            d="M3 7.8V3m0 0h4.8M3 3l6 6"
            transition={DEFAULT_TRANSITION}
            variants={{
              normal: { translateX: '0%', translateY: '0%' },
              animate: { translateX: '-2px', translateY: '-2px' },
            }}
            animate={controls}
          />
        </svg>
      </div>
    )
  }
)

ExpandIcon.displayName = 'ExpandIcon'

export { ExpandIcon }
