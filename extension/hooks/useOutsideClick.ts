import { useEffect } from 'react'

/**
 * Hook to close a dropdown/popover when clicking outside of it.
 *
 * Uses a small delay (default 100ms) before adding the click listener
 * to prevent the opening click from immediately closing the dropdown.
 *
 * @param isOpen - Whether the dropdown/popover is currently open
 * @param onClose - Callback to close the dropdown/popover
 * @param delay - Delay in ms before adding click listener (default: 100)
 *
 * @example
 * ```tsx
 * const [showDropdown, setShowDropdown] = useState(false)
 *
 * useOutsideClick(showDropdown, () => setShowDropdown(false))
 *
 * return (
 *   <div onClick={(e) => e.stopPropagation()}>
 *     {showDropdown && <Dropdown />}
 *   </div>
 * )
 * ```
 */
export function useOutsideClick(
  isOpen: boolean,
  onClose: () => void,
  delay: number = 100
): void {
  useEffect(() => {
    if (!isOpen) return

    const handleClick = () => onClose()

    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick)
    }, delay)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('click', handleClick)
    }
  }, [isOpen, onClose, delay])
}
