import React, { useState, type ReactNode, type ComponentType } from 'react'

interface AnimatedMenuItemProps {
  icon: ComponentType<{ size?: number; isHovered?: boolean; className?: string }>
  children: ReactNode
  onClick?: () => void
  className?: string
  iconSize?: number
  iconClassName?: string
}

/**
 * Menu item wrapper that passes hover state to animated icons.
 * When hovering anywhere on the button, the icon animates.
 */
export function AnimatedMenuItem({
  icon: Icon,
  children,
  onClick,
  className = '',
  iconSize = 16,
  iconClassName = '',
}: AnimatedMenuItemProps) {
  const [isHovered, setIsHovered] = useState(false)

  return (
    <button
      className={className}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Icon size={iconSize} isHovered={isHovered} className={iconClassName} />
      {children}
    </button>
  )
}
