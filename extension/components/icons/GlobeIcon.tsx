'use client'

import { motion, useAnimation, type Variants } from 'motion/react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '../../lib/utils'

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

const pathVariants: Variants = {
  normal: { pathLength: 1, opacity: 1 },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { duration: 0.4 }
  }
}

interface GlobeIconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const GlobeIcon = forwardRef<AnimatedIconHandle, GlobeIconProps>(
  ({ className, size = 20, isHovered, ...props }, ref) => {
    const controls = useAnimation()
    const isControlledRef = useRef(false)

    // Handle external hover state
    useEffect(() => {
      if (isHovered !== undefined) {
        isControlledRef.current = true
        controls.start(isHovered ? 'animate' : 'normal')
      }
    }, [isHovered, controls])

    useImperativeHandle(ref, () => ({
      startAnimation: () => {
        isControlledRef.current = true
        controls.start('animate')
      },
      stopAnimation: () => {
        isControlledRef.current = false
        controls.start('normal')
      }
    }))

    const handleMouseEnter = useCallback(() => {
      if (!isControlledRef.current && isHovered === undefined) {
        controls.start('animate')
      }
    }, [controls, isHovered])

    const handleMouseLeave = useCallback(() => {
      if (!isControlledRef.current && isHovered === undefined) {
        controls.start('normal')
      }
    }, [controls, isHovered])

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
          <motion.circle
            cx="12"
            cy="12"
            r="10"
            variants={pathVariants}
            initial="normal"
            animate={controls}
          />
          <motion.path
            d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"
            variants={pathVariants}
            initial="normal"
            animate={controls}
          />
          <path d="M2 12h20" />
        </svg>
      </div>
    )
  }
)

GlobeIcon.displayName = 'GlobeIcon'

export { GlobeIcon }
