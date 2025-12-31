'use client'

import type { Transition, Variants } from 'motion/react'
import type { HTMLAttributes } from 'react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { motion, useAnimation } from 'motion/react'

import { cn } from '../../lib/utils'

export interface DeleteIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface DeleteIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
  isHovered?: boolean
}

const LID_VARIANTS: Variants = {
  normal: { y: 0, rotate: 0 },
  animate: { y: -2, rotate: -5 },
}

const SPRING_TRANSITION: Transition = {
  type: 'spring',
  stiffness: 500,
  damping: 30,
}

const DeleteIcon = forwardRef<DeleteIconHandle, DeleteIconProps>(
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
          {/* Lid - animates up and tilts */}
          <motion.g
            variants={LID_VARIANTS}
            animate={controls}
            transition={SPRING_TRANSITION}
            style={{ originX: '50%', originY: '100%' }}
          >
            <path d="M3 6h18" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </motion.g>
          {/* Body - static */}
          <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
          <line x1="10" x2="10" y1="11" y2="17" />
          <line x1="14" x2="14" y1="11" y2="17" />
        </svg>
      </div>
    )
  }
)

DeleteIcon.displayName = 'DeleteIcon'

export { DeleteIcon }
