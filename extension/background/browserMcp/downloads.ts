/**
 * Browser MCP - Download handlers
 * Download files, get download list, cancel downloads, capture images, save pages
 */

import { sendToWebSocket } from '../websocket'
import { windowsToWslPath, waitForDownload } from '../utils'

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

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = message.outputPath
      ? message.outputPath.split(/[/\\]/).pop() || `captured-image-${timestamp}.png`
      : `captured-image-${timestamp}.png`

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

    // Check if tab URL is capturable (not chrome://, chrome-extension://, etc.)
    const tabInfo = await chrome.tabs.get(targetTab.id)
    if (tabInfo.url?.startsWith('chrome://') || tabInfo.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture chrome:// or extension pages. Navigate to a regular webpage first.')
    }

    // Capture the page as MHTML
    const mhtmlBlob = await new Promise<Blob>((resolve, reject) => {
      chrome.pageCapture.saveAsMHTML({ tabId: targetTab.id! }, (blob) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else if (!blob) {
          reject(new Error('Failed to capture page - no data returned'))
        } else {
          resolve(blob)
        }
      })
    })

    // Generate filename from page title or custom name
    const pageTitle = tabInfo.title || 'page'
    const sanitizedTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '-').substring(0, 100)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
    const baseFilename = message.filename
      ? message.filename.replace(/\.mhtml$/i, '')
      : `${sanitizedTitle}-${timestamp}`
    const filename = `${baseFilename}.mhtml`

    // Convert blob to data URL (service workers don't support URL.createObjectURL)
    const arrayBuffer = await mhtmlBlob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    const base64 = btoa(binary)
    const dataUrl = `data:multipart/related;base64,${base64}`

    // Download the MHTML file
    const downloadId = await new Promise<number>((resolve, reject) => {
      chrome.downloads.download({
        url: dataUrl,
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

    // Wait for download to complete
    const downloadResult = await new Promise<{
      success: boolean
      filename?: string
      windowsPath?: string
      wslPath?: string
      fileSize?: number
      mimeType?: string
      error?: string
    }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Download timed out' })
      }, 30000) // 30s timeout for MHTML (can be large)

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
              filename: winPath.split(/[/\\]/).pop() || filename,
              windowsPath: winPath,
              wslPath: windowsToWslPath(winPath),
              fileSize: download.fileSize,
              mimeType: 'multipart/related'
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
