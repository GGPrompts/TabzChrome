'use client'

import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { motion, useAnimation } from 'motion/react'

import { cn } from '../../lib/utils'

export interface RefreshCwIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface RefreshCwIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const RefreshCwIcon = forwardRef<RefreshCwIconHandle, RefreshCwIconProps>(
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
          transition={{ type: 'spring', stiffness: 250, damping: 25 }}
          variants={{
            normal: { rotate: '0deg' },
            animate: { rotate: '50deg' },
          }}
          animate={controls}
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 16H3v5" />
        </motion.svg>
      </div>
    )
  }
)

RefreshCwIcon.displayName = 'RefreshCwIcon'

export { RefreshCwIcon }
