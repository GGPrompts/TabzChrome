/**
 * Browser MCP - Notification handlers
 * Show, update, clear, and list Chrome notifications
 */

import { sendToWebSocket } from '../websocket'

/**
 * Cache of notification metadata.
 * Chrome's notifications.getAll() only returns IDs, not titles/messages,
 * so we store metadata when notifications are created/updated.
 */
const notificationCache = new Map<string, {
  title: string
  message: string
  type: string
  createdAt: number
}>()

/**
 * Get the default icon URL for notifications
 */
function getDefaultIconUrl(): string {
  return chrome.runtime.getURL('icons/icon48.png')
}

/**
 * Show a notification
 */
export async function handleBrowserNotificationShow(message: {
  requestId: string
  title: string
  message: string
  notificationType?: 'basic' | 'image' | 'list' | 'progress'
  iconUrl?: string
  imageUrl?: string
  items?: Array<{ title: string; message: string }>
  progress?: number
  buttons?: Array<{ title: string; iconUrl?: string }>
  priority?: number
  notificationId?: string
  requireInteraction?: boolean
}): Promise<void> {
  try {
    const notificationType = message.notificationType || 'basic'

    // Build notification options - using 'any' to bypass strict Chrome typing
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: any = {
      type: notificationType,
      iconUrl: message.iconUrl || getDefaultIconUrl(),
      title: message.title,
      message: message.message,
      priority: message.priority ?? 0,
      requireInteraction: message.requireInteraction ?? false
    }

    // Add type-specific options
    if (notificationType === 'image' && message.imageUrl) {
      options.imageUrl = message.imageUrl
    }

    if (notificationType === 'list' && message.items) {
      options.items = message.items
    }

    if (notificationType === 'progress' && typeof message.progress === 'number') {
      options.progress = message.progress
    }

    if (message.buttons && message.buttons.length > 0) {
      options.buttons = message.buttons.slice(0, 2).map((btn: { title: string; iconUrl?: string }) => ({
        title: btn.title,
        iconUrl: btn.iconUrl
      }))
    }

    // Create notification with optional custom ID
    // Always pass ID as first arg (empty string for auto-generate)
    const notificationId = await new Promise<string>((resolve, reject) => {
      chrome.notifications.create(message.notificationId || '', options, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Unknown notification error'))
        } else {
          resolve(id)
        }
      })
    })

    // Cache metadata for list handler
    notificationCache.set(notificationId, {
      title: message.title,
      message: message.message,
      type: notificationType,
      createdAt: Date.now()
    })

    sendToWebSocket({
      type: 'browser-notification-show-result',
      requestId: message.requestId,
      success: true,
      notificationId
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-notification-show-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message || String(err)
    })
  }
}

/**
 * Update an existing notification
 */
export async function handleBrowserNotificationUpdate(message: {
  requestId: string
  notificationId: string
  title?: string
  message?: string
  progress?: number
  notificationType?: 'basic' | 'image' | 'list' | 'progress'
}): Promise<void> {
  try {
    // Build update options - only include fields that are provided
    const notificationType = message.notificationType || 'basic'
    const options: chrome.notifications.NotificationOptions = {
      // Type is required for update - default to basic if changing type or not specified
      type: notificationType,
      iconUrl: getDefaultIconUrl()
    }

    if (message.title !== undefined) {
      options.title = message.title
    }

    if (message.message !== undefined) {
      options.message = message.message
    }

    if (notificationType === 'progress' && typeof message.progress === 'number') {
      options.progress = message.progress
    }

    const wasUpdated = await new Promise<boolean>((resolve, reject) => {
      chrome.notifications.update(message.notificationId, options, (updated) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Unknown error'))
        } else {
          resolve(updated)
        }
      })
    })

    // Update cached metadata if notification was found
    if (wasUpdated) {
      const cached = notificationCache.get(message.notificationId)
      if (cached) {
        if (message.title !== undefined) cached.title = message.title
        if (message.message !== undefined) cached.message = message.message
        if (message.notificationType) cached.type = message.notificationType
      }
    }

    sendToWebSocket({
      type: 'browser-notification-update-result',
      requestId: message.requestId,
      success: true,
      wasUpdated
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-notification-update-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Clear a notification
 */
export async function handleBrowserNotificationClear(message: {
  requestId: string
  notificationId: string
}): Promise<void> {
  try {
    const wasCleared = await new Promise<boolean>((resolve, reject) => {
      chrome.notifications.clear(message.notificationId, (cleared) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Unknown error'))
        } else {
          resolve(cleared)
        }
      })
    })

    // Remove from cache
    if (wasCleared) {
      notificationCache.delete(message.notificationId)
    }

    sendToWebSocket({
      type: 'browser-notification-clear-result',
      requestId: message.requestId,
      success: true,
      wasCleared
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-notification-clear-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * List all active notifications
 */
export async function handleBrowserNotificationList(message: {
  requestId: string
}): Promise<void> {
  try {
    // chrome.notifications.getAll returns Record<string, true> for active notifications
    const notifications = await new Promise<Record<string, boolean>>((resolve, reject) => {
      chrome.notifications.getAll((notifs) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Unknown error'))
        } else {
          resolve(notifs)
        }
      })
    })

    const notificationIds = Object.keys(notifications)

    // Prune cache entries for notifications that no longer exist
    for (const cachedId of notificationCache.keys()) {
      if (!notifications[cachedId]) {
        notificationCache.delete(cachedId)
      }
    }

    // Build metadata object from cache
    const notificationDetails: Record<string, { type: string; title: string; message: string }> = {}
    for (const id of notificationIds) {
      const cached = notificationCache.get(id)
      if (cached) {
        notificationDetails[id] = {
          type: cached.type,
          title: cached.title,
          message: cached.message
        }
      } else {
        // Notification created before cache existed (e.g. before extension reload)
        notificationDetails[id] = {
          type: 'unknown',
          title: '(metadata unavailable)',
          message: '(created before cache was active)'
        }
      }
    }

    sendToWebSocket({
      type: 'browser-notification-list-result',
      requestId: message.requestId,
      success: true,
      notificationIds,
      notifications: notificationDetails,
      count: notificationIds.length
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-notification-list-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
