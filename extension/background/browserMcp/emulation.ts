/**
 * Browser MCP - Chrome Debugger Emulation handlers
 * Device emulation, network throttling, geolocation, media, and vision deficiency simulation
 *
 * Note: CDP emulation settings persist only while the debugger is attached.
 * These handlers keep the debugger attached after applying settings.
 * Use tabz_emulate_clear to reset everything and detach.
 */

import { sendToWebSocket } from '../websocket'
import { resolveAgentTab } from './tabGroups'
import { assertAgentReadableTab } from './pageGuard'
import {
  attachWithBusyRetry,
  isDeepCaptureTabAttached,
  isEmulatedTabAttached,
  isPersistentDebuggerAttached,
  markEmulatedTabAttached,
  markEmulatedTabDetached,
  runExclusivePerTab,
  sendDebuggerCommand
} from './debugger'

export { isEmulatedTabAttached } from './debugger'

chrome.debugger?.onDetach?.addListener((source) => {
  if (typeof source.tabId === 'number') markEmulatedTabDetached(source.tabId)
})

async function resolveEmulationTarget(tool: string, agent: string | undefined, tabId?: number): Promise<number | undefined> {
  const tab = await resolveAgentTab(agent, tabId)
  if (!tab?.id) return undefined
  await assertAgentReadableTab(tool, tab)
  return tabId ?? tab.id
}

// ============================================
// Device Presets
// ============================================

interface DeviceMetrics {
  width: number
  height: number
  deviceScaleFactor: number
  mobile: boolean
  userAgent?: string
}

const DEVICE_PRESETS: Record<string, DeviceMetrics> = {
  iPhone_14: { width: 390, height: 844, deviceScaleFactor: 3, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1' },
  iPhone_14_Pro_Max: { width: 430, height: 932, deviceScaleFactor: 3, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1' },
  iPhone_SE: { width: 375, height: 667, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1' },
  Pixel_7: { width: 412, height: 915, deviceScaleFactor: 2.625, mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36' },
  Pixel_7_Pro: { width: 412, height: 892, deviceScaleFactor: 3.5, mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36' },
  iPad: { width: 768, height: 1024, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1' },
  iPad_Pro: { width: 1024, height: 1366, deviceScaleFactor: 2, mobile: true, userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1' },
  Galaxy_S23: { width: 360, height: 780, deviceScaleFactor: 3, mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36' },
  Galaxy_Fold: { width: 280, height: 653, deviceScaleFactor: 3, mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-F926B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Mobile Safari/537.36' },
}

// ============================================
// Network Presets
// ============================================

interface NetworkConditions {
  offline: boolean
  downloadThroughput: number // bytes/sec, -1 for disabled
  uploadThroughput: number // bytes/sec, -1 for disabled
  latency: number // ms
}

const NETWORK_PRESETS: Record<string, NetworkConditions> = {
  offline: { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0 },
  slow_3g: { offline: false, downloadThroughput: 50000, uploadThroughput: 50000, latency: 2000 },
  fast_3g: { offline: false, downloadThroughput: 180000, uploadThroughput: 84375, latency: 562 },
  '4g': { offline: false, downloadThroughput: 4000000, uploadThroughput: 3000000, latency: 20 },
  wifi: { offline: false, downloadThroughput: 30000000, uploadThroughput: 15000000, latency: 2 },
  no_throttle: { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 },
}

function isUnknownCdpMethodError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase()
  return message.includes("wasn't found") || message.includes('was not found')
    || message.includes('method not found') || message.includes('not implemented')
    || message.includes('-32601')
}

export async function applyNetworkConditions(
  target: chrome.debugger.Debuggee,
  conditions: NetworkConditions
): Promise<'by-rule' | 'legacy'> {
  let ruleApplied = false
  try {
    await sendDebuggerCommand(target, 'Network.emulateNetworkConditionsByRule', {
      offline: conditions.offline,
      matchedNetworkConditions: [{
        urlPattern: '',
        latency: conditions.latency,
        downloadThroughput: conditions.downloadThroughput,
        uploadThroughput: conditions.uploadThroughput
      }]
    })
    ruleApplied = true
    await sendDebuggerCommand(target, 'Network.overrideNetworkState', conditions)
    return 'by-rule'
  } catch (err) {
    if (ruleApplied) {
      try {
        await sendDebuggerCommand(target, 'Network.emulateNetworkConditionsByRule', {
          offline: false,
          matchedNetworkConditions: []
        })
      } catch { /* best effort */ }
    }
    if (!isUnknownCdpMethodError(err)) throw err
    await sendDebuggerCommand(target, 'Network.emulateNetworkConditions', conditions)
    return 'legacy'
  }
}

const NO_THROTTLING: NetworkConditions = {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1
}

export async function clearNetworkConditions(target: chrome.debugger.Debuggee): Promise<'by-rule' | 'legacy'> {
  try {
    await sendDebuggerCommand(target, 'Network.emulateNetworkConditionsByRule', {
      offline: false,
      matchedNetworkConditions: []
    })
    await sendDebuggerCommand(target, 'Network.overrideNetworkState', NO_THROTTLING)
    return 'by-rule'
  } catch (err) {
    if (!isUnknownCdpMethodError(err)) throw err
    await sendDebuggerCommand(target, 'Network.emulateNetworkConditions', NO_THROTTLING)
    return 'legacy'
  }
}

// ============================================
// Debugger Helpers
// ============================================

interface EmulationAcquisition {
  claimedOwner: boolean
  attachedHere: boolean
}

async function ensureDebuggerAttached(tabId: number): Promise<EmulationAcquisition> {
  if (isEmulatedTabAttached(tabId)) return { claimedOwner: false, attachedHere: false }
  const target: chrome.debugger.Debuggee = { tabId }
  const attachedHere = !isPersistentDebuggerAttached(tabId)
  if (attachedHere) await attachWithBusyRetry(target, tabId)
  markEmulatedTabAttached(tabId)
  return { claimedOwner: true, attachedHere }
}

async function withEmulationDebugger<T>(tabId: number, fn: (target: chrome.debugger.Debuggee) => Promise<T>): Promise<T> {
  return runExclusivePerTab(tabId, async () => {
    const acquisition = await ensureDebuggerAttached(tabId)
    try {
      return await fn({ tabId })
    } catch (err) {
      // A failed first command must not leave a newly claimed persistent owner.
      if (acquisition.claimedOwner) {
        markEmulatedTabDetached(tabId)
        if (acquisition.attachedHere && !isDeepCaptureTabAttached(tabId)) {
          try { await chrome.debugger.detach({ tabId }) } catch { /* best effort */ }
        }
      }
      throw err
    }
  })
}

/**
 * Detach debugger from a tab (ignore errors)
 */
async function detachDebugger(tabId: number): Promise<void> {
  const target: chrome.debugger.Debuggee = { tabId }
  try {
    if (!isDeepCaptureTabAttached(tabId)) await chrome.debugger.detach(target)
  } catch {
    // Ignore errors - debugger may not be attached
  } finally {
    markEmulatedTabDetached(tabId)
  }
}

// ============================================
// Device Emulation Handler
// ============================================

/**
 * Emulate device viewport and metrics
 */
export async function handleBrowserEmulateDevice(message: {
  requestId: string
  tabId?: number
  agent?: string
  device?: string
  width?: number
  height?: number
  deviceScaleFactor?: number
  mobile?: boolean
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = await resolveEmulationTarget('tabz_emulate_device', message.agent, message.tabId)
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-emulate-device-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    // Determine device metrics
    let metrics: DeviceMetrics

    if (message.device && message.device !== 'custom') {
      // Use preset
      const preset = DEVICE_PRESETS[message.device]
      if (!preset) {
        sendToWebSocket({
          type: 'browser-emulate-device-result',
          requestId: message.requestId,
          success: false,
          error: `Unknown device preset: ${message.device}. Available: ${Object.keys(DEVICE_PRESETS).join(', ')}`
        })
        return
      }
      metrics = { ...preset }
    } else {
      // Use custom dimensions
      if (!message.width || !message.height) {
        sendToWebSocket({
          type: 'browser-emulate-device-result',
          requestId: message.requestId,
          success: false,
          error: "Custom device requires 'width' and 'height' parameters"
        })
        return
      }
      metrics = {
        width: message.width,
        height: message.height,
        deviceScaleFactor: message.deviceScaleFactor || 1,
        mobile: message.mobile !== undefined ? message.mobile : true
      }
    }

    await withEmulationDebugger(targetTabId, async target => {
      await sendDebuggerCommand(target, 'Emulation.setDeviceMetricsOverride', {
        width: metrics.width,
        height: metrics.height,
        deviceScaleFactor: metrics.deviceScaleFactor,
        mobile: metrics.mobile,
        screenWidth: metrics.width,
        screenHeight: metrics.height
      })
      try {
        await sendDebuggerCommand(target, 'Emulation.setTouchEmulationEnabled', {
          enabled: metrics.mobile,
          maxTouchPoints: metrics.mobile ? 5 : 1
        })
      } catch { /* metrics still applied */ }
      if (metrics.userAgent) {
        try { await sendDebuggerCommand(target, 'Emulation.setUserAgentOverride', { userAgent: metrics.userAgent }) } catch { /* non-fatal */ }
      }
    })

    sendToWebSocket({
      type: 'browser-emulate-device-result',
      requestId: message.requestId,
      success: true,
      device: message.device || 'custom',
      metrics,
      message: `Emulating ${message.device || 'custom'} (${metrics.width}x${metrics.height}). Use tabz_emulate_clear to reset.`
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-emulate-device-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// Clear Emulation Handler
// ============================================

/**
 * Clear all emulation overrides and detach debugger
 */
export async function handleBrowserEmulateClear(message: {
  requestId: string
  tabId?: number
  agent?: string
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = await resolveEmulationTarget('tabz_emulate_clear', message.agent, message.tabId)
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-emulate-clear-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    try {
      await chrome.tabs.get(targetTabId)
    } catch {
      sendToWebSocket({ type: 'browser-emulate-clear-result', requestId: message.requestId, success: false, error: `Tab ${targetTabId} not found` })
      return
    }
    const cleared: string[] = []

    await runExclusivePerTab(targetTabId, async () => {
      const target: chrome.debugger.Debuggee = { tabId: targetTabId }
      // Try to clear each emulation type (some may fail if not set)
      try {
        await sendDebuggerCommand(target, 'Emulation.clearDeviceMetricsOverride')
        cleared.push('device')
      } catch { /* ignore */ }

      try {
        await sendDebuggerCommand(target, 'Emulation.clearGeolocationOverride')
        cleared.push('geolocation')
      } catch { /* ignore */ }

      try {
        await sendDebuggerCommand(target, 'Emulation.setEmulatedMedia', { media: '', features: [] })
        cleared.push('media')
      } catch { /* ignore */ }

      try {
        await sendDebuggerCommand(target, 'Emulation.setEmulatedVisionDeficiency', { type: 'none' })
        cleared.push('vision')
      } catch { /* ignore */ }

      try {
        await clearNetworkConditions(target)
        cleared.push('network')
      } catch { /* ignore */ }
      try {
        await sendDebuggerCommand(target, 'Emulation.setTouchEmulationEnabled', { enabled: false })
        cleared.push('touch')
      } catch { /* ignore */ }
      await detachDebugger(targetTabId)
    })

    sendToWebSocket({
      type: 'browser-emulate-clear-result',
      requestId: message.requestId,
      success: true,
      cleared,
      message: isDeepCaptureTabAttached(targetTabId)
        ? 'All emulation cleared; debugger remains attached for deep capture'
        : 'All emulation cleared and debugger detached'
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-emulate-clear-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// Geolocation Handler
// ============================================

export type GeolocationPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown'

async function readGeolocationPermissionState(
  target: chrome.debugger.Debuggee
): Promise<GeolocationPermissionState> {
  try {
    const evaluated = await sendDebuggerCommand<{
      result?: { value?: unknown }
      exceptionDetails?: unknown
    }>(target, 'Runtime.evaluate', {
      expression: "navigator.permissions.query({ name: 'geolocation' }).then((status) => status.state)",
      awaitPromise: true,
      returnByValue: true
    })
    if (evaluated?.exceptionDetails) return 'unknown'
    const state = evaluated?.result?.value
    return state === 'granted' || state === 'prompt' || state === 'denied'
      ? state
      : 'unknown'
  } catch {
    return 'unknown'
  }
}

async function readTabOriginLabel(tabId: number): Promise<string> {
  try {
    const tab = await chrome.tabs.get(tabId)
    return tab.url ? new URL(tab.url).origin : 'this tab'
  } catch {
    return 'this tab'
  }
}

function describeGeolocationPermission(
  state: GeolocationPermissionState,
  originLabel: string
): string {
  if (state === 'granted') {
    return `Location permission is currently granted for ${originLabel}. The coordinate override is set; a page location request was not tested.`
  }
  const lead = state === 'denied'
    ? `Location is currently BLOCKED for ${originLabel}; the observed permission state is denied.`
    : state === 'prompt'
      ? `Location is NOT granted for ${originLabel} yet, so the page may show Chrome's permission prompt or report PERMISSION_DENIED.`
      : `The Location permission state for ${originLabel} could not be read, so page access to the overridden coordinates is not confirmed.`
  return `${lead} This tool cannot grant Location permission. Grant it yourself using Chrome's site controls or chrome://settings/content/location, then run the check again.`
}

/**
 * Override coordinates and separately report the page's Location permission.
 */
export async function handleBrowserEmulateGeolocation(message: {
  requestId: string
  tabId?: number
  agent?: string
  latitude?: number
  longitude?: number
  accuracy?: number
  clear?: boolean
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = await resolveEmulationTarget('tabz_emulate_geolocation', message.agent, message.tabId)
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-emulate-geolocation-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    if (!message.clear && (message.latitude === undefined || message.longitude === undefined)) {
      sendToWebSocket({ type: 'browser-emulate-geolocation-result', requestId: message.requestId, success: false, error: "Geolocation requires 'latitude' and 'longitude' parameters" })
      return
    }
    const result = await withEmulationDebugger(targetTabId, async target => {
      if (message.clear) {
        await sendDebuggerCommand(target, 'Emulation.clearGeolocationOverride')
        return { success: true, message: 'Geolocation override cleared' }
      }
      const accuracy = message.accuracy ?? 100
      await sendDebuggerCommand(target, 'Emulation.setGeolocationOverride', {
        latitude: message.latitude,
        longitude: message.longitude,
        accuracy
      })
      const permissionState = await readGeolocationPermissionState(target)
      return {
        success: true,
        latitude: message.latitude,
        longitude: message.longitude,
        accuracy,
        permissionGranted: permissionState === 'granted',
        permissionState,
        permissionNote: describeGeolocationPermission(
          permissionState,
          await readTabOriginLabel(targetTabId)
        ),
        message: `Geolocation set to ${message.latitude}, ${message.longitude}`
      }
    })
    sendToWebSocket({
      type: 'browser-emulate-geolocation-result',
      requestId: message.requestId,
      ...result
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-emulate-geolocation-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// Network Throttling Handler
// ============================================

/**
 * Emulate network conditions
 */
export async function handleBrowserEmulateNetwork(message: {
  requestId: string
  tabId?: number
  agent?: string
  preset?: string
  offline?: boolean
  downloadThroughput?: number
  uploadThroughput?: number
  latency?: number
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = await resolveEmulationTarget('tabz_emulate_network', message.agent, message.tabId)
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-emulate-network-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    // Determine network conditions
    let conditions: NetworkConditions

    if (message.preset) {
      const preset = NETWORK_PRESETS[message.preset]
      if (!preset) {
        sendToWebSocket({
          type: 'browser-emulate-network-result',
          requestId: message.requestId,
          success: false,
          error: `Unknown network preset: ${message.preset}. Available: ${Object.keys(NETWORK_PRESETS).join(', ')}`
        })
        return
      }
      conditions = { ...preset }
    } else {
      // Custom conditions
      conditions = {
        offline: message.offline || false,
        downloadThroughput: message.downloadThroughput ?? -1,
        uploadThroughput: message.uploadThroughput ?? -1,
        latency: message.latency || 0
      }
    }

    await withEmulationDebugger(targetTabId, async target => {
      if (!isDeepCaptureTabAttached(targetTabId)) await sendDebuggerCommand(target, 'Network.enable')
      await applyNetworkConditions(target, conditions)
    })

    sendToWebSocket({
      type: 'browser-emulate-network-result',
      requestId: message.requestId,
      success: true,
      preset: message.preset || 'custom',
      conditions,
      message: `Network emulation set to ${message.preset || 'custom'}. Use tabz_emulate_clear to reset.`
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-emulate-network-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// Media Emulation Handler
// ============================================

/**
 * Emulate media type and features
 */
export async function handleBrowserEmulateMedia(message: {
  requestId: string
  tabId?: number
  agent?: string
  media?: 'screen' | 'print' | ''
  colorScheme?: 'light' | 'dark' | 'no-preference'
  reducedMotion?: 'reduce' | 'no-preference'
  forcedColors?: 'active' | 'none'
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = await resolveEmulationTarget('tabz_emulate_media', message.agent, message.tabId)
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-emulate-media-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    // Build features array
    const features: Array<{ name: string; value: string }> = []
    if (message.colorScheme) {
      features.push({ name: 'prefers-color-scheme', value: message.colorScheme })
    }
    if (message.reducedMotion) {
      features.push({ name: 'prefers-reduced-motion', value: message.reducedMotion })
    }
    if (message.forcedColors) {
      features.push({ name: 'forced-colors', value: message.forcedColors })
    }

    await withEmulationDebugger(targetTabId, async target => {
      await sendDebuggerCommand(target, 'Emulation.setEmulatedMedia', { media: message.media || '', features })
    })

    const applied: string[] = []
    if (message.media) applied.push(`media: ${message.media}`)
    if (message.colorScheme) applied.push(`color-scheme: ${message.colorScheme}`)
    if (message.reducedMotion) applied.push(`reduced-motion: ${message.reducedMotion}`)
    if (message.forcedColors) applied.push(`forced-colors: ${message.forcedColors}`)

    sendToWebSocket({
      type: 'browser-emulate-media-result',
      requestId: message.requestId,
      success: true,
      media: message.media,
      colorScheme: message.colorScheme,
      reducedMotion: message.reducedMotion,
      forcedColors: message.forcedColors,
      features,
      message: applied.length > 0
        ? `Media emulation applied: ${applied.join(', ')}`
        : 'Media emulation cleared'
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-emulate-media-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

// ============================================
// Vision Deficiency Handler
// ============================================

type VisionDeficiencyType =
  | 'none'
  | 'blurredVision'
  | 'reducedContrast'
  | 'achromatopsia'
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia'

/**
 * Simulate vision deficiency
 */
export async function handleBrowserEmulateVision(message: {
  requestId: string
  tabId?: number
  agent?: string
  visionType: VisionDeficiencyType
}): Promise<void> {
  try {
    // Get target tab
    const targetTabId = await resolveEmulationTarget('tabz_emulate_vision', message.agent, message.tabId)
    if (!targetTabId) {
      sendToWebSocket({
        type: 'browser-emulate-vision-result',
        requestId: message.requestId,
        success: false,
        error: 'No active tab found'
      })
      return
    }

    const validTypes: VisionDeficiencyType[] = [
      'none', 'blurredVision', 'reducedContrast',
      'achromatopsia', 'deuteranopia', 'protanopia', 'tritanopia'
    ]

    if (!validTypes.includes(message.visionType)) {
      sendToWebSocket({
        type: 'browser-emulate-vision-result',
        requestId: message.requestId,
        success: false,
        error: `Invalid vision type: ${message.visionType}. Valid: ${validTypes.join(', ')}`
      })
      return
    }

    await withEmulationDebugger(targetTabId, async target => {
      await sendDebuggerCommand(target, 'Emulation.setEmulatedVisionDeficiency', { type: message.visionType })
    })

    const descriptions: Record<VisionDeficiencyType, string> = {
      none: 'Normal vision',
      blurredVision: 'Blurred vision simulation',
      reducedContrast: 'Reduced contrast sensitivity',
      achromatopsia: 'Total color blindness (monochromacy)',
      deuteranopia: 'Red-green color blindness (green-blind)',
      protanopia: 'Red-green color blindness (red-blind)',
      tritanopia: 'Blue-yellow color blindness'
    }

    sendToWebSocket({
      type: 'browser-emulate-vision-result',
      requestId: message.requestId,
      success: true,
      visionType: message.visionType,
      message: message.visionType === 'none'
        ? 'Vision deficiency simulation cleared'
        : `Simulating: ${descriptions[message.visionType]}`
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-emulate-vision-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
