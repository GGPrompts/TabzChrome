/**
 * Chrome Alarms API integration
 * Handles WebSocket reconnection and session health checks
 */

import {
  ws, wsReconnectAttempts, incrementWsReconnectAttempts,
  MAX_RECONNECT_ATTEMPTS, ALARM_WS_RECONNECT, ALARM_SESSION_HEALTH
} from './state'
import { connectWebSocket, sendToWebSocket, setScheduleReconnect } from './websocket'

/**
 * Schedule WebSocket reconnection with exponential backoff
 */
export function scheduleReconnect(): void {
  if (wsReconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('Max reconnect attempts reached, stopping auto-reconnect')
    return
  }

  // Exponential backoff: 0.5s, 1s, 2s, 4s, 8s, ... up to 30s
  const attempts = incrementWsReconnectAttempts()
  const delaySeconds = Math.min(30, Math.pow(2, attempts - 1) * 0.5)

  console.log(`Scheduling WebSocket reconnect in ${delaySeconds}s (attempt ${attempts}/${MAX_RECONNECT_ATTEMPTS})`)

  // Use alarms API - survives service worker going idle
  chrome.alarms.create(ALARM_WS_RECONNECT, {
    delayInMinutes: delaySeconds / 60
  })
}

/**
 * Initialize periodic health check alarm
 */
export async function initializeAlarms(): Promise<void> {
  // Clear any existing alarms first
  await chrome.alarms.clear(ALARM_SESSION_HEALTH)

  // Create session health check alarm (every 5 minutes)
  chrome.alarms.create(ALARM_SESSION_HEALTH, {
    delayInMinutes: 1, // First check after 1 minute
    periodInMinutes: 5 // Then every 5 minutes
  })

  console.log('Session health check alarm initialized (every 5 minutes)')
}

/**
 * Setup alarm event listener
 */
export function setupAlarmListener(): void {
  chrome.alarms.onAlarm.addListener((alarm) => {
    console.log('Alarm fired:', alarm.name)

    if (alarm.name === ALARM_WS_RECONNECT) {
      console.log('WebSocket reconnect alarm triggered')
      connectWebSocket()
    } else if (alarm.name === ALARM_SESSION_HEALTH) {
      console.log('Session health check alarm triggered')
      // Request terminal list to verify sessions are still alive
      if (ws?.readyState === WebSocket.OPEN) {
        console.log('[Badge] Requesting list-terminals (source: health-check-alarm)')
        sendToWebSocket({ type: 'list-terminals' })
      } else {
        console.log('WebSocket not connected during health check, attempting reconnect')
        connectWebSocket()
      }
    }
  })
}

// Wire up the scheduleReconnect function to websocket module
setScheduleReconnect(scheduleReconnect)
