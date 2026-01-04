import { useCallback } from 'react'
import { useChromeSetting } from './useChromeSetting'
import {
  NotificationSettings,
  NotificationEventType,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '../components/settings/types'

export interface ShowNotificationOptions {
  title: string
  message: string
  /** Keep notification visible until dismissed (default: false) */
  requireInteraction?: boolean
  /** Stable ID to prevent duplicates or allow updates (auto-generated if omitted) */
  notificationId?: string
  /** Priority 0-2, higher = more prominent (default: 1) */
  priority?: 0 | 1 | 2
  /** Use progress bar style (0-100) - great for context percentage */
  progress?: number
}

export interface UseDesktopNotificationsReturn {
  /** Current notification settings */
  notificationSettings: NotificationSettings
  /** True once settings have loaded from Chrome storage */
  settingsLoaded: boolean
  /** Check if currently within quiet hours */
  isQuietHours: () => boolean
  /** Show a desktop notification if enabled and not in quiet hours */
  showNotification: (
    eventType: NotificationEventType,
    options: ShowNotificationOptions
  ) => void
}

/**
 * Hook for showing desktop notifications with quiet hours support.
 *
 * Loads settings from Chrome storage, respects per-event toggles,
 * and suppresses notifications during configured quiet hours.
 *
 * @example
 * ```tsx
 * const { showNotification, isQuietHours } = useDesktopNotifications()
 *
 * // Show notification (automatically checks enabled + quiet hours)
 * showNotification('backendDisconnect', {
 *   title: 'Connection Lost',
 *   message: 'Backend WebSocket disconnected',
 *   requireInteraction: true
 * })
 * ```
 */
export function useDesktopNotifications(): UseDesktopNotificationsReturn {
  const [notificationSettings, , settingsLoaded] = useChromeSetting<NotificationSettings>(
    'notificationSettings',
    DEFAULT_NOTIFICATION_SETTINGS
  )

  /**
   * Check if currently within quiet hours.
   * Handles overnight ranges (e.g., 10 PM to 8 AM).
   */
  const isQuietHours = useCallback((): boolean => {
    if (!notificationSettings.quietHours.enabled) return false

    const now = new Date()
    const currentHour = now.getHours()
    const { startHour, endHour } = notificationSettings.quietHours

    if (startHour < endHour) {
      // Simple case: e.g., 9 AM to 5 PM
      return currentHour >= startHour && currentHour < endHour
    } else {
      // Overnight case: e.g., 10 PM to 8 AM
      return currentHour >= startHour || currentHour < endHour
    }
  }, [notificationSettings.quietHours])

  /**
   * Show a desktop notification if:
   * 1. Master toggle is enabled
   * 2. Specific event type is enabled
   * 3. Not currently in quiet hours
   */
  const showNotification = useCallback(
    (eventType: NotificationEventType, options: ShowNotificationOptions): void => {
      // Check master toggle
      if (!notificationSettings.enabled) {
        return
      }

      // Check per-event toggle
      if (!notificationSettings.events[eventType]) {
        return
      }

      // Check quiet hours
      if (isQuietHours()) {
        return
      }

      // Generate notification ID if not provided
      const notificationId = options.notificationId || `tabz-${eventType}-${Date.now()}`

      // Use Chrome notifications API if available
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        const useProgress = options.progress !== undefined
        chrome.notifications.create(notificationId, {
          type: useProgress ? 'progress' : 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: options.title,
          message: options.message,
          priority: options.priority ?? 1,
          requireInteraction: options.requireInteraction ?? false,
          ...(useProgress && { progress: Math.min(100, Math.max(0, options.progress!)) }),
        })
      } else if (typeof window !== 'undefined' && 'Notification' in window) {
        // Fallback for dev environment or non-extension contexts
        if (Notification.permission === 'granted') {
          new Notification(options.title, {
            body: options.message,
            tag: notificationId,
            requireInteraction: options.requireInteraction ?? false,
          })
        }
      }
    },
    [notificationSettings.enabled, notificationSettings.events, isQuietHours]
  )

  return {
    notificationSettings,
    settingsLoaded,
    isQuietHours,
    showNotification,
  }
}
