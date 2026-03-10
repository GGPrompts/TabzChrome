/**
 * Browser MCP - Download handlers
 * Download files, get download list, cancel downloads, capture images, save pages
 */

import { sendToWebSocket } from '../websocket'
import { windowsToWslPath, waitForDownload } from '../utils'

// Voice options for random selection (matches TTS_VOICES in extension settings)
// Using non-multilingual voices to prevent auto-language detection
const TTS_VOICE_VALUES = [
  'en-US-AndrewNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural',
  'en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-ChristopherNeural', 'en-US-AvaNeural',
  'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-AU-NatashaNeural', 'en-AU-WilliamNeural'
]

// Per-event audio configuration type
interface AudioEventConfig {
  voice?: string
  rate?: string
  pitch?: string
  phraseTemplate?: string
}

// Default phrase template for MCP downloads
const DEFAULT_MCP_DOWNLOAD_PHRASE = 'Downloaded {filename}'

/**
 * Render a template string with context values
 */
function renderTemplate(template: string, context: { filename?: string; profile?: string }): string {
  let result = template
  if (context.filename) {
    result = result.replace(/\{filename\}/g, context.filename)
  }
  if (context.profile) {
    result = result.replace(/\{profile\}/g, context.profile)
  }
  // Remove any unreplaced variables
  result = result.replace(/\{[^}]+\}/g, '')
  return result.replace(/\s+/g, ' ').trim()
}

/**
 * Announce download completion via TTS
 * Uses the audio settings from Chrome storage, including per-event mcpDownloadsConfig
 */
async function announceDownload(filename: string): Promise<void> {
  try {
    // Load audio settings from Chrome storage
    const result = await chrome.storage.local.get(['audioSettings', 'audioGlobalMute'])
    const audioSettings = (result.audioSettings || {}) as {
      enabled?: boolean
      voice?: string
      rate?: string
      pitch?: string
      volume?: number
      events?: {
        mcpDownloads?: boolean
        mcpDownloadsConfig?: AudioEventConfig
      }
    }
    const audioGlobalMute = result.audioGlobalMute === true

    // Check if audio is enabled and mcpDownloads event is enabled
    if (!audioSettings.enabled || audioGlobalMute) return
    if (audioSettings.events?.mcpDownloads === false) return

    // Get event-specific config (overrides global settings)
    const eventConfig = audioSettings.events?.mcpDownloadsConfig

    // Handle voice: event config > global setting > default
    let voice = eventConfig?.voice || audioSettings.voice || 'en-US-AndrewNeural'
    if (voice === 'random') {
      voice = TTS_VOICE_VALUES[Math.floor(Math.random() * TTS_VOICE_VALUES.length)]
    }

    // Handle rate/pitch: event config > global setting > default
    const rate = eventConfig?.rate || audioSettings.rate || '+0%'
    const pitch = eventConfig?.pitch || audioSettings.pitch || '+0Hz'

    // Extract just the filename (without path)
    const shortFilename = filename.split(/[/\\]/).pop() || filename

    // Get phrase template (custom or default)
    const phraseTemplate = eventConfig?.phraseTemplate || DEFAULT_MCP_DOWNLOAD_PHRASE
    const phrase = renderTemplate(phraseTemplate, { filename: shortFilename })

    // Call TTS API using speak endpoint (plays audio directly)
    const response = await fetch('http://localhost:8129/api/audio/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: phrase,
        voice,
        rate,
        pitch,
        volume: audioSettings.volume ?? 0.7
      })
    })
    const data = await response.json()
    if (!data.success) {
      console.log('[Download TTS] Failed:', data.error)
    }
  } catch (err) {
    // Silently ignore TTS errors - shouldn't affect download functionality
    console.log('[Download TTS] Error:', (err as Error).message)
  }
}

/**
 * Handle download file request from backend (MCP server)
 */
export async function handleBrowserDownloadFile(message: {
  requestId: string
  url: string
  filename?: string
  conflictAction?: 'uniquify' | 'overwrite' | 'prompt'
}): Promise<void> {
  try {
    const downloadOptions: chrome.downloads.DownloadOptions = {
      url: message.url,
      conflictAction: message.conflictAction || 'uniquify'
    }

    if (message.filename) {
      downloadOptions.filename = message.filename
    }

    // Start the download
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download(downloadOptions, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (id === undefined) {
          reject(new Error('Download failed to start'))
        } else {
          resolve(id)
        }
      })
    })

    // Wait for download to complete
    const result = await waitForDownload(downloadId)

    // Announce download completion via TTS (if enabled)
    if (result.success && result.filename) {
      announceDownload(result.filename)
    }

    sendToWebSocket({
      type: 'browser-download-result',
      requestId: message.requestId,
      ...result
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-download-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Handle get downloads request from backend (MCP server)
 */
export async function handleBrowserGetDownloads(message: {
  requestId: string
  limit?: number
  state?: 'in_progress' | 'complete' | 'interrupted' | 'all'
}): Promise<void> {
  try {
    const query: chrome.downloads.DownloadQuery = {
      limit: message.limit || 20,
      orderBy: ['-startTime']
    }

    if (message.state && message.state !== 'all') {
      query.state = message.state
    }

    const downloads = await new Promise<chrome.downloads.DownloadItem[]>((resolve) => {
      chrome.downloads.search(query, resolve)
    })

    const formattedDownloads = downloads.map((d) => ({
      id: d.id,
      url: d.url,
      filename: d.filename.split(/[/\\]/).pop() || d.filename,
      state: d.state,
      bytesReceived: d.bytesReceived,
      totalBytes: d.totalBytes,
      startTime: d.startTime,
      endTime: d.endTime,
      error: d.error,
      mime: d.mime,
      windowsPath: d.filename,
      wslPath: windowsToWslPath(d.filename)
    }))

    sendToWebSocket({
      type: 'browser-downloads-list',
      requestId: message.requestId,
      downloads: formattedDownloads,
      total: formattedDownloads.length
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-downloads-list',
      requestId: message.requestId,
      downloads: [],
      total: 0,
      error: (err as Error).message
    })
  }
}

/**
 * Handle cancel download request from backend (MCP server)
 */
export async function handleBrowserCancelDownload(message: {
  requestId: string
  downloadId: number
}): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      chrome.downloads.cancel(message.downloadId, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve()
        }
      })
    })

    sendToWebSocket({
      type: 'browser-cancel-download-result',
      requestId: message.requestId,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-cancel-download-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Handle capture image request from backend (MCP server)
 * Uses canvas capture - works for blob URLs (AI-generated images) without CDP
 */
export async function handleBrowserCaptureImage(message: {
  requestId: string
  selector?: string
  tabId?: number
  outputPath?: string
}): Promise<void> {
  try {
    // Get target tab
    const tabs = message.tabId
      ? [{ id: message.tabId }]
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    const targetTab = tabs[0]
    if (!targetTab?.id) {
      throw new Error('No active tab found')
    }

    // Execute canvas capture in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (selector: string) => {
        // Find the image element
        let imgEl: HTMLImageElement | null = null

        if (selector) {
          const el = document.querySelector(selector)
          if (el?.tagName === 'IMG') {
            imgEl = el as HTMLImageElement
          } else if (el) {
            // Try to find an img inside the selected element
            imgEl = el.querySelector('img')
          }
        }

        // Fallback: find first significant image on page
        if (!imgEl) {
          const imgs = Array.from(document.querySelectorAll('img'))
          // Find largest image (likely the main content)
          imgEl = imgs.reduce((best, img) => {
            const area = img.naturalWidth * img.naturalHeight
            const bestArea = best ? best.naturalWidth * best.naturalHeight : 0
            return area > bestArea ? img : best
          }, null as HTMLImageElement | null)
        }

        if (!imgEl) {
          return { error: 'No image found on page' }
        }

        // Check if image is loaded
        if (!imgEl.complete || imgEl.naturalWidth === 0) {
          return { error: 'Image not fully loaded' }
        }

        // Capture via canvas
        try {
          const canvas = document.createElement('canvas')
          canvas.width = imgEl.naturalWidth || imgEl.width
          canvas.height = imgEl.naturalHeight || imgEl.height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            return { error: 'Could not create canvas context' }
          }
          ctx.drawImage(imgEl, 0, 0)

          // Export as PNG data URL
          const dataUrl = canvas.toDataURL('image/png')
          return {
            dataUrl,
            width: canvas.width,
            height: canvas.height,
            src: imgEl.src.substring(0, 200) // Truncate for logging
          }
        } catch (e) {
          // Tainted canvas (cross-origin image)
          return { error: `Canvas capture failed: ${(e as Error).message}. Image may be cross-origin.` }
        }
      },
      args: [message.selector || '']
    })

    const result = results[0]?.result as {
      dataUrl?: string
      width?: number
      height?: number
      src?: string
      error?: string
    }

    if (result?.error) {
      throw new Error(result.error)
    }

    if (!result?.dataUrl) {
      throw new Error('No image data captured')
    }

    // Convert data URL to blob and download
    const base64Data = result.dataUrl.replace(/^data:image\/\w+;base64,/, '')
    const byteCharacters = atob(base64Data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: 'image/png' })
    const blobUrl = URL.createObjectURL(blob)

    // Generate filename with optional custom path
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    let filename: string
    if (message.outputPath) {
      // Use custom path (can include subdirectories)
      filename = message.outputPath
    } else {
      // Default: organize into tabz/images/ subdirectory
      filename = `tabz/images/captured-image-${timestamp}.png`
    }

    // Download the blob
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download({
        url: blobUrl,
        filename: filename,
        conflictAction: 'uniquify'
      }, (id) => {
        URL.revokeObjectURL(blobUrl) // Clean up blob URL
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (id === undefined) {
          reject(new Error('Download failed to start'))
        } else {
          resolve(id)
        }
      })
    })

    // Wait for download to complete
    const downloadResult = await new Promise<{
      success: boolean
      filePath?: string
      windowsPath?: string
      wslPath?: string
      width?: number
      height?: number
      error?: string
    }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Download timed out' })
      }, 10000)

      const checkDownload = () => {
        chrome.downloads.search({ id: downloadId }, (results) => {
          if (results.length === 0) {
            clearTimeout(timeout)
            resolve({ success: false, error: 'Download not found' })
            return
          }

          const download = results[0]
          if (download.state === 'complete') {
            clearTimeout(timeout)
            const winPath = download.filename
            resolve({
              success: true,
              filePath: windowsToWslPath(winPath),
              windowsPath: winPath,
              wslPath: windowsToWslPath(winPath),
              width: result.width,
              height: result.height
            })
          } else if (download.state === 'interrupted') {
            clearTimeout(timeout)
            resolve({ success: false, error: download.error || 'Download interrupted' })
          } else {
            setTimeout(checkDownload, 200)
          }
        })
      }
      setTimeout(checkDownload, 100)
    })

    // Announce download completion via TTS (if enabled)
    if (downloadResult.success && downloadResult.filePath) {
      announceDownload(downloadResult.filePath)
    }

    sendToWebSocket({
      type: 'browser-capture-image-result',
      requestId: message.requestId,
      ...downloadResult
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-capture-image-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Convert a Blob to a download URL.
 * Tries URL.createObjectURL first (supported in Chrome 116+ service workers),
 * falls back to base64 data URL for older versions.
 * Returns { url, cleanup } where cleanup revokes the object URL if used.
 */
async function blobToDownloadUrl(blob: Blob, mimeType: string): Promise<{ url: string; cleanup: () => void }> {
  // Try URL.createObjectURL (works in Chrome 116+ service workers, no size limits)
  try {
    if (typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob)
      return { url, cleanup: () => URL.revokeObjectURL(url) }
    }
  } catch {
    // Fall through to data URL approach
  }

  // Fallback: convert to base64 data URL using chunked approach
  // (avoids O(n^2) string concatenation and stack overflow for large files)
  const arrayBuffer = await blob.arrayBuffer()
  const uint8Array = new Uint8Array(arrayBuffer)
  const chunkSize = 8192
  const chunks: string[] = []
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, i + chunkSize)
    chunks.push(String.fromCharCode(...chunk))
  }
  const base64 = btoa(chunks.join(''))
  const url = `data:${mimeType};base64,${base64}`
  return { url, cleanup: () => {} }
}

/**
 * Handle save page request from backend (MCP server)
 * Uses pageCapture API to save page as MHTML
 */
export async function handleBrowserSavePage(message: {
  requestId: string
  tabId?: number
  filename?: string
}): Promise<void> {
  try {
    // Get target tab
    const tabs = message.tabId
      ? [{ id: message.tabId }]
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    const targetTab = tabs[0]
    if (!targetTab?.id) {
      throw new Error('No active tab found')
    }

    // Get full tab info for URL and status checks
    const tabInfo = await chrome.tabs.get(targetTab.id)

    // Check if tab URL is capturable (not chrome://, chrome-extension://, etc.)
    if (tabInfo.url?.startsWith('chrome://') || tabInfo.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture chrome:// or extension pages. Navigate to a regular webpage first.')
    }

    // Wait for tab to finish loading (saveAsMHTML fails on loading tabs)
    if (tabInfo.status !== 'complete') {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener)
          reject(new Error('Tab did not finish loading within 15 seconds'))
        }, 15000)

        const listener = (updatedTabId: number, changeInfo: { status?: string }) => {
          if (updatedTabId === targetTab.id && changeInfo.status === 'complete') {
            clearTimeout(timeout)
            chrome.tabs.onUpdated.removeListener(listener)
            resolve()
          }
        }
        chrome.tabs.onUpdated.addListener(listener)
      })
    }

    // Capture the page as MHTML using Promise-based API (MV3)
    let mhtmlBlob: Blob | undefined
    try {
      mhtmlBlob = await chrome.pageCapture.saveAsMHTML({ tabId: targetTab.id })
    } catch (captureErr) {
      // Provide a more descriptive error than the raw Chrome error
      const msg = (captureErr as Error).message || 'Unknown error'
      throw new Error(`MHTML capture failed for tab ${targetTab.id} (${tabInfo.url}): ${msg}`)
    }

    if (!mhtmlBlob || mhtmlBlob.size === 0) {
      throw new Error('MHTML capture returned empty data. The tab may have navigated or been closed during capture.')
    }

    // Generate filename from page title or custom name
    const pageTitle = tabInfo.title || 'page'
    const sanitizedTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '-').substring(0, 100)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const baseFilename = message.filename
      ? message.filename.replace(/\.mhtml$/i, '')
      : `${sanitizedTitle}-${timestamp}`
    const filename = `${baseFilename}.mhtml`

    // Convert blob to a downloadable URL
    const { url: downloadUrl, cleanup } = await blobToDownloadUrl(mhtmlBlob, 'multipart/related')

    // Download the MHTML file
    let downloadId: number
    try {
      downloadId = await new Promise<number>((resolve, reject) => {
        chrome.downloads.download({
          url: downloadUrl,
          filename: filename,
          conflictAction: 'uniquify'
        }, (id) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message))
          } else if (id === undefined) {
            reject(new Error('Download failed to start'))
          } else {
            resolve(id)
          }
        })
      })
    } finally {
      // Clean up blob URL after download starts (Chrome holds a reference)
      // Use a small delay to ensure Chrome has read the blob
      setTimeout(cleanup, 5000)
    }

    // Wait for download to complete (reuse shared utility)
    const result = await waitForDownload(downloadId, 30000)

    const downloadResult = {
      ...result,
      mimeType: 'multipart/related' as const
    }

    // Announce download completion via TTS (if enabled)
    if (downloadResult.success && downloadResult.filename) {
      announceDownload(downloadResult.filename)
    }

    sendToWebSocket({
      type: 'browser-save-page-result',
      requestId: message.requestId,
      ...downloadResult
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-save-page-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
