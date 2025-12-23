/**
 * Browser MCP - Screenshot handlers
 * Take screenshots of viewport, elements, or full page
 */

import { sendToWebSocket } from '../websocket'
import { windowsToWslPath } from '../utils'

/**
 * Take a screenshot using chrome.tabs.captureVisibleTab
 * Captures the visible viewport of the active tab
 * For full page, uses scroll+stitch approach via content script
 */
export async function handleBrowserScreenshot(message: {
  requestId: string
  tabId?: number
  selector?: string
  fullPage?: boolean
}): Promise<void> {
  try {
    // Get target tab
    const tabs = message.tabId
      ? [await chrome.tabs.get(message.tabId)]
      : await chrome.tabs.query({ active: true, lastFocusedWindow: true })

    const targetTab = tabs[0]
    if (!targetTab?.id) {
      throw new Error('No active tab found')
    }

    // Check if tab URL is capturable (not chrome://, chrome-extension://, etc.)
    if (targetTab.url?.startsWith('chrome://') || targetTab.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture chrome:// or extension pages. Navigate to a regular webpage first.')
    }

    let dataUrl: string

    if (message.fullPage) {
      // Full page screenshot: scroll and stitch
      dataUrl = await captureFullPageScreenshot(targetTab.id)
    } else if (message.selector) {
      // Element screenshot: capture viewport and crop to element
      dataUrl = await captureElementScreenshot(targetTab.id, message.selector)
    } else {
      // Simple viewport screenshot
      dataUrl = await chrome.tabs.captureVisibleTab(targetTab.windowId!, { format: 'png' })
    }

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = message.fullPage
      ? `screenshot-full-${timestamp}.png`
      : `screenshot-${timestamp}.png`

    // Download using data URL directly (URL.createObjectURL not available in service workers)
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
      filePath?: string
      windowsPath?: string
      wslPath?: string
      error?: string
    }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, error: 'Download timed out' })
      }, 30000)

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
              wslPath: windowsToWslPath(winPath)
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
      type: 'browser-screenshot-result',
      requestId: message.requestId,
      ...downloadResult
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-screenshot-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Capture element screenshot by capturing viewport and cropping via canvas in content script
 */
async function captureElementScreenshot(tabId: number, selector: string): Promise<string> {
  // First, scroll element into view and get its bounds
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) {
        return { error: `Element not found: ${sel}` }
      }

      // Scroll element into view
      el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })

      // Wait a bit for scroll to complete and get bounds
      const rect = el.getBoundingClientRect()
      return {
        x: Math.round(rect.x * window.devicePixelRatio),
        y: Math.round(rect.y * window.devicePixelRatio),
        width: Math.round(rect.width * window.devicePixelRatio),
        height: Math.round(rect.height * window.devicePixelRatio),
        devicePixelRatio: window.devicePixelRatio
      }
    },
    args: [selector]
  })

  const boundsResult = results[0]?.result as {
    error?: string
    x?: number
    y?: number
    width?: number
    height?: number
    devicePixelRatio?: number
  }

  if (boundsResult?.error) {
    throw new Error(boundsResult.error)
  }

  if (!boundsResult?.width || !boundsResult?.height) {
    throw new Error('Could not determine element bounds')
  }

  // Small delay to ensure scroll has completed
  await new Promise(resolve => setTimeout(resolve, 100))

  // Get the tab's window for capture
  const tab = await chrome.tabs.get(tabId)
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'png' })

  // Crop the image using OffscreenCanvas (available in service workers)
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const imageBitmap = await createImageBitmap(blob)

  const canvas = new OffscreenCanvas(boundsResult.width!, boundsResult.height!)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context')
  }

  // Draw the cropped region
  ctx.drawImage(
    imageBitmap,
    boundsResult.x!, boundsResult.y!, boundsResult.width!, boundsResult.height!,
    0, 0, boundsResult.width!, boundsResult.height!
  )

  // Convert back to data URL
  const croppedBlob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(croppedBlob)
  })
}

/**
 * Capture full page screenshot by scrolling and stitching
 * Uses chrome.tabs.captureVisibleTab for each viewport segment
 */
async function captureFullPageScreenshot(tabId: number): Promise<string> {
  // Get page dimensions
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      // Store original scroll position
      const originalScrollY = window.scrollY

      // Get full page dimensions
      const body = document.body
      const html = document.documentElement
      const fullHeight = Math.max(
        body.scrollHeight, body.offsetHeight,
        html.clientHeight, html.scrollHeight, html.offsetHeight
      )
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      return {
        fullHeight,
        viewportHeight,
        viewportWidth,
        originalScrollY,
        devicePixelRatio: window.devicePixelRatio
      }
    }
  })

  const pageInfo = results[0]?.result as {
    fullHeight: number
    viewportHeight: number
    viewportWidth: number
    originalScrollY: number
    devicePixelRatio: number
  }

  if (!pageInfo) {
    throw new Error('Could not get page dimensions')
  }

  const { fullHeight, viewportHeight, viewportWidth, originalScrollY, devicePixelRatio } = pageInfo

  // Calculate number of captures needed
  const numCaptures = Math.ceil(fullHeight / viewportHeight)
  const captures: { dataUrl: string; y: number; height: number }[] = []

  // Get the tab's window for capture
  const tab = await chrome.tabs.get(tabId)

  // Capture each viewport segment
  for (let i = 0; i < numCaptures; i++) {
    const scrollY = i * viewportHeight
    const isLastCapture = i === numCaptures - 1
    const captureHeight = isLastCapture
      ? fullHeight - scrollY
      : viewportHeight

    // Scroll to position
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (y: number) => window.scrollTo(0, y),
      args: [scrollY]
    })

    // Wait for scroll and rendering
    await new Promise(resolve => setTimeout(resolve, 150))

    // Capture visible tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId!, { format: 'png' })

    captures.push({
      dataUrl,
      y: scrollY * devicePixelRatio,
      height: captureHeight * devicePixelRatio
    })
  }

  // Restore original scroll position
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (y: number) => window.scrollTo(0, y),
    args: [originalScrollY]
  })

  // Stitch images together using OffscreenCanvas
  const finalWidth = viewportWidth * devicePixelRatio
  const finalHeight = fullHeight * devicePixelRatio

  const canvas = new OffscreenCanvas(finalWidth, finalHeight)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context')
  }

  // Draw each capture
  for (const capture of captures) {
    const response = await fetch(capture.dataUrl)
    const blob = await response.blob()
    const imageBitmap = await createImageBitmap(blob)

    // For the last capture, we need to handle partial viewport
    const sourceHeight = Math.min(imageBitmap.height, capture.height)
    ctx.drawImage(
      imageBitmap,
      0, 0, imageBitmap.width, sourceHeight,
      0, capture.y, imageBitmap.width, sourceHeight
    )
  }

  // Convert to data URL
  const finalBlob = await canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(finalBlob)
  })
}
