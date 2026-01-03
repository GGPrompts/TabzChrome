'use client'

import { motion, useAnimation, type Variants } from 'motion/react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { cn } from '../../lib/utils'

export interface AnimatedIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

const bellVariants: Variants = {
  normal: { rotate: 0 },
  animate: {
    rotate: [0, -15, 15, -10, 10, -5, 5, 0],
    transition: { duration: 0.6 }
  }
}

const clapperVariants: Variants = {
  normal: { x: 0 },
  animate: {
    x: [0, -1, 1, -0.5, 0.5, 0],
    transition: { duration: 0.4, delay: 0.1 }
  }
}

interface BellIconProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const BellIcon = forwardRef<AnimatedIconHandle, BellIconProps>(
  ({ className, size = 20, isHovered, ...props }, ref) => {
    const controls = useAnimation()
    const isControlledRef = useRef(false)

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
          <motion.g
            variants={bellVariants}
            initial="normal"
            animate={controls}
            style={{ transformOrigin: '12px 4px' }}
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          </motion.g>
          <motion.path
            d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
            variants={clapperVariants}
            initial="normal"
            animate={controls}
          />
        </svg>
      </div>
    )
  }
)

BellIcon.displayName = 'BellIcon'

export { BellIcon }
