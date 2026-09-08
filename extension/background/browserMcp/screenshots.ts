/** Browser MCP screenshots bound to one admitted tab document. */

import { sendToWebSocket } from '../websocket'
import { windowsToWslPath } from '../utils'
import { withDebugger, sendDebuggerCommand } from './debugger'
import { resolveAgentTab, getAgentGroupLabel } from './tabGroups'
import { assertAgentReadableTab } from './pageGuard'
import { resolvePageRef, stalePageRefMessage } from './pageRefs'
import {
  assertDocumentReadable,
  assertDocumentReadCurrent,
  markDocumentReadUncertain,
  protectedDocumentTarget,
  runWithDocumentAdmission,
  type DocumentProtectionToken
} from './documentProtection'
import {
  captureDeadline,
  captureScheduler,
  CaptureDeadlineError,
  type CaptureTransaction
} from './captureScheduler'
import {
  buildScreenshotPath,
  SCREENSHOT_FOLDER_KEY,
  SCREENSHOT_PER_CONNECTION_KEY,
  type ScreenshotKind
} from './screenshotPaths'
import {
  prepareScreenshotPage,
  restoreScreenshotPage,
  scrollScreenshotPage,
  hideScreenshotFixedElements,
  type ScreenshotPageInfo
} from './screenshotPageScripts'

const INLINE_IMAGE_THRESHOLD_BYTES = 1_500_000
const VIEWPORT_CAPTURE_TIMEOUT_MS = 30_000
const FULL_PAGE_CAPTURE_TIMEOUT_MS = 60_000

export interface InlineImageData {
  imageData: string
  mimeType: string
  width: number
  height: number
  bytes: number
  imageReencoded: boolean
}

async function decodeImage(dataUrl: string): Promise<ImageBitmap> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return createImageBitmap(blob)
}

/** Redraw a bitmap at an exact pixel size. */
function drawResized(bitmap: ImageBitmap, width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Could not create canvas context for CSS-pixel scaling')
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, width, height)
  return canvas
}

/**
 * Fit a target-bound CDP capture to a known CSS size. Chrome can return
 * device-sized or CSS-sized bitmaps, so resize in either direction when the
 * decoded image does not match the CSS dimensions.
 */
async function fitCaptureToCssSize(dataUrl: string, cssWidth: number, cssHeight: number): Promise<string | OffscreenCanvas> {
  const width = Math.max(1, Math.round(cssWidth))
  const height = Math.max(1, Math.round(cssHeight))
  const bitmap = await decodeImage(dataUrl)
  try {
    // One pixel of slack: a capture already at CSS size can round either way.
    if (Math.abs(bitmap.width - width) <= 1 && Math.abs(bitmap.height - height) <= 1) {
      return dataUrl
    }
    return drawResized(bitmap, width, height)
  } finally {
    bitmap.close()
  }
}

interface PreparedInlineImageData extends InlineImageData {
  downloadDataUrl?: string
}

/**
 * Prepare captured image data for an MCP response.
 * PNG captures larger than about 1.5 MB are encoded as JPEG at quality 80.
 */
export async function prepareInlineImageData(imageSource: string | Blob | OffscreenCanvas): Promise<PreparedInlineImageData> {
  const isRawCanvas = typeof imageSource !== 'string' && imageSource instanceof OffscreenCanvas
  const sourceBlob = isRawCanvas
    ? await imageSource.convertToBlob({ type: 'image/png' })
    : typeof imageSource === 'string'
      ? await (await fetch(imageSource)).blob()
      : imageSource
  const imageBitmap = isRawCanvas ? undefined : await createImageBitmap(sourceBlob)
  const width = isRawCanvas ? imageSource.width : imageBitmap!.width
  const height = isRawCanvas ? imageSource.height : imageBitmap!.height

  try {
    let inlineBlob = sourceBlob
    let mimeType = sourceBlob.type || 'image/png'
    let imageReencoded = false

    if (sourceBlob.size > INLINE_IMAGE_THRESHOLD_BYTES) {
      const canvas = new OffscreenCanvas(width, height)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Could not create canvas context for inline image encoding')
      }

      ctx.drawImage(isRawCanvas ? imageSource : imageBitmap!, 0, 0)
      inlineBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 })
      mimeType = 'image/jpeg'
      imageReencoded = true
    }

    const encodedDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(inlineBlob)
    })
    const commaIndex = encodedDataUrl.indexOf(',')
    if (commaIndex === -1) {
      throw new Error('Could not encode inline image data')
    }

    return {
      imageData: encodedDataUrl.slice(commaIndex + 1),
      mimeType,
      width,
      height,
      bytes: inlineBlob.size,
      imageReencoded,
      // Kept internal to the screenshot download path. It is not included in
      // the browser-screenshot-result payload.
      ...(isRawCanvas ? {
        downloadDataUrl: sourceBlob === inlineBlob
          ? encodedDataUrl
          : await blobToDataUrl(sourceBlob)
      } : {})
    }
  } finally {
    imageBitmap?.close()
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export interface ScreenshotClip {
  x0: number
  y0: number
  x1: number
  y1: number
}

interface ScreenshotTabContext {
  tabId: number
  tabTitle?: string
  tabUrl?: string
}

/** Page identity for the tab resolveAgentTab actually selected for capture. */
function screenshotTabContext(tab: chrome.tabs.Tab): ScreenshotTabContext {
  const context: ScreenshotTabContext = { tabId: tab.id! }
  if (tab.title !== undefined) context.tabTitle = tab.title
  const url = tab.url ?? tab.pendingUrl
  if (url !== undefined) context.tabUrl = url
  return context
}

/**
 * A rejected screenshot-folder setting is logged once per service-worker
 * lifetime: it is the same warning on every capture otherwise.
 */
let loggedScreenshotFolderWarning: string | undefined

/**
 * Read the save-location settings the MCP Settings page writes. Read at
 * capture time and never cached, so changing the folder takes effect on the
 * next screenshot with no reload. Storage failures fall back to the defaults
 * rather than failing the capture.
 */
async function readScreenshotPathSettings(): Promise<{ folder?: unknown; perConnection?: boolean }> {
  try {
    const stored = await chrome.storage.local.get([
      SCREENSHOT_FOLDER_KEY,
      SCREENSHOT_PER_CONNECTION_KEY
    ])
    const perConnection = stored?.[SCREENSHOT_PER_CONNECTION_KEY]
    return {
      folder: stored?.[SCREENSHOT_FOLDER_KEY],
      perConnection: typeof perConnection === 'boolean' ? perConnection : undefined
    }
  } catch {
    return {}
  }
}

/** Which default file name this capture gets. */
function screenshotKind(message: { fullPage?: boolean; clip?: unknown; ref?: string; selector?: string }): ScreenshotKind {
  if (message.fullPage) return 'full'
  if (message.clip) return 'zoom'
  if (message.ref || message.selector) return 'element'
  return 'viewport'
}

/**
 * Resolve where this capture is saved: the configured folder, the
 * per-connection subfolder when the toggle is on, and any per-call
 * outputPath, which is itself relative to the configured folder.
 */
async function resolveScreenshotFilename(message: {
  agent?: string
  outputPath?: string
  fullPage?: boolean
  clip?: unknown
  ref?: string
  selector?: string
}): Promise<string> {
  const settings = await readScreenshotPathSettings()
  let label: string | undefined
  if (settings.perConnection === true) {
    try {
      label = await getAgentGroupLabel(message.agent)
    } catch {
      // No group yet, or it vanished: the short connection id names the folder.
    }
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const { filename, invalidReason } = buildScreenshotPath({
    folder: settings.folder,
    perConnection: settings.perConnection,
    connectionLabel: label,
    connectionId: message.agent,
    kind: screenshotKind(message),
    timestamp,
    outputPath: message.outputPath
  })

  if (invalidReason && invalidReason !== loggedScreenshotFolderWarning) {
    loggedScreenshotFolderWarning = invalidReason
    console.warn(`[screenshots] ${invalidReason}`)
  }

  return filename
}


export interface ScreenshotMessage {
  requestId: string
  tabId?: number
  ref?: string
  selector?: string
  fullPage?: boolean
  outputPath?: string
  inlineOnly?: boolean
  clip?: ScreenshotClip
  agent?: string
  requestTimeoutMs?: number
}

interface CaptureContext {
  tabId: number
  token: DocumentProtectionToken
  agent?: string
  expiresAt: number
}

function assertCaptureDeadline(deadline: number): void {
  if (Date.now() >= deadline) throw new CaptureDeadlineError()
}

async function assertCaptureContext(context: CaptureContext): Promise<chrome.tabs.Tab> {
  assertCaptureDeadline(context.expiresAt)
  const tab = await resolveAgentTab(context.agent, context.tabId)
  if (!tab?.id || tab.id !== context.tabId) throw new Error('The screenshot tab is no longer owned by this caller')
  await assertAgentReadableTab('tabz_screenshot', tab)
  await assertDocumentReadCurrent(context.tabId, context.token, {
    guard: () => assertCaptureDeadline(context.expiresAt),
    documentId: context.token.documentId
  })
  return tab
}

async function executeInCaptureDocument<T, Args extends unknown[]>(
  context: CaptureContext,
  func: (...args: Args) => T,
  args: Args
): Promise<T> {
  assertCaptureDeadline(context.expiresAt)
  const results = await beforeCaptureDeadline(chrome.scripting.executeScript({
    target: protectedDocumentTarget(context.token),
    func,
    args
  }), context, 'Screenshot page read remained pending after its deadline')
  const injection = results[0]
  if (!injection?.documentId) {
    await markDocumentReadUncertain(context.tabId, context.token).catch(() => undefined)
    throw new Error('Screenshot page probe returned no document identity')
  }
  await assertDocumentReadCurrent(context.tabId, context.token, {
    documentId: injection.documentId,
    guard: () => assertCaptureDeadline(context.expiresAt)
  })
  if (!injection) throw new Error('Screenshot page probe returned no result')
  return injection.result as T
}

async function beforeCaptureDeadline<T>(
  promise: Promise<T>,
  context: CaptureContext,
  message: string
): Promise<T> {
  assertCaptureDeadline(context.expiresAt)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void markDocumentReadUncertain(context.tabId, context.token)
            .catch(() => undefined)
            .finally(() => reject(new CaptureDeadlineError()))
        }, Math.max(0, context.expiresAt - Date.now()))
      })
    ])
  } catch (error) {
    if (error instanceof CaptureDeadlineError) {
      throw new Error(message)
    }
    throw error
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/** Cleanup must still run after the request deadline, but remains bound to the
 * exact admitted document so it can never mutate a replacement page. */
async function restoreCaptureDocument(
  context: CaptureContext,
  scrollerToken: string,
  originalScrollTop: number
): Promise<void> {
  const results = await chrome.scripting.executeScript({
    target: protectedDocumentTarget(context.token),
    func: restoreScreenshotPage,
    args: [scrollerToken, originalScrollTop]
  })
  await assertDocumentReadCurrent(context.tabId, context.token, {
    documentId: results[0]?.documentId
  })
}

interface LayoutMetrics {
  cssContentSize?: { x: number; y: number; width: number; height: number }
  contentSize?: { x: number; y: number; width: number; height: number }
}

interface CaptureScreenshotResult { data: string }

async function capturePng(
  target: chrome.debugger.Debuggee,
  transaction: CaptureTransaction,
  context: CaptureContext,
  params: Record<string, unknown> = {}
): Promise<string> {
  const result = await transaction.captureTargeted(context.tabId, () => beforeCaptureDeadline(
    sendDebuggerCommand<CaptureScreenshotResult>(
      target,
      'Page.captureScreenshot',
      { format: 'png', ...params },
      Math.max(1, transaction.remainingMs())
    ),
    context,
    'Screenshot capture remained pending after its deadline'
  ))
  if (!result?.data) throw new Error('Chrome returned no screenshot data')
  return `data:image/png;base64,${result.data}`
}

async function captureViewportCssPixels(
  context: CaptureContext,
  transaction: CaptureTransaction,
  target: chrome.debugger.Debuggee
): Promise<string | OffscreenCanvas> {
  const viewport = await executeInCaptureDocument(context, () => ({
    width: window.innerWidth,
    height: window.innerHeight
  }), [])
  await assertCaptureContext(context)
  const dataUrl = await capturePng(target, transaction, context)
  return fitCaptureToCssSize(dataUrl, viewport.width, viewport.height)
}

async function captureElementScreenshot(
  context: CaptureContext,
  transaction: CaptureTransaction,
  target: chrome.debugger.Debuggee,
  selector: string
): Promise<OffscreenCanvas> {
  const bounds = await executeInCaptureDocument(context, (value: string) => {
    const element = document.querySelector(value)
    if (!element) return { error: `Element not found: ${value}` }
    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' })
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return { error: 'Element has no visible bounds' }
    return {
      x: Math.round(rect.x), y: Math.round(rect.y),
      width: Math.round(rect.width), height: Math.round(rect.height),
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight
    }
  }, [selector])
  if (bounds.error) throw new Error(bounds.error)
  if (!bounds.width || !bounds.height || !bounds.viewportWidth || !bounds.viewportHeight) {
    throw new Error('Could not determine element bounds')
  }
  await transaction.wait(100)
  await assertCaptureContext(context)
  const dataUrl = await capturePng(target, transaction, context)
  const bitmap = await decodeImage(dataUrl)
  const scaleX = bitmap.width / bounds.viewportWidth
  const scaleY = bitmap.height / bounds.viewportHeight
  const canvas = new OffscreenCanvas(bounds.width, bounds.height)
  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) { bitmap.close(); throw new Error('Could not create canvas context') }
  canvasContext.imageSmoothingEnabled = true
  canvasContext.imageSmoothingQuality = 'high'
  canvasContext.drawImage(
    bitmap,
    Math.round(bounds.x * scaleX), Math.round(bounds.y * scaleY),
    Math.max(1, Math.round(bounds.width * scaleX)), Math.max(1, Math.round(bounds.height * scaleY)),
    0, 0, bounds.width, bounds.height
  )
  bitmap.close()
  return canvas
}

async function captureRegionScreenshot(
  context: CaptureContext,
  transaction: CaptureTransaction,
  target: chrome.debugger.Debuggee,
  clip: ScreenshotClip
): Promise<OffscreenCanvas> {
  const region = await executeInCaptureDocument(context, (x0: number, y0: number, x1: number, y1: number) => {
    const left = Math.max(0, Math.min(x0, x1))
    const top = Math.max(0, Math.min(y0, y1))
    const right = Math.min(window.innerWidth, Math.max(x0, x1))
    const bottom = Math.min(window.innerHeight, Math.max(y0, y1))
    return {
      x: Math.round(left), y: Math.round(top),
      width: Math.round(right - left), height: Math.round(bottom - top),
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight
    }
  }, [clip.x0, clip.y0, clip.x1, clip.y1])
  if (region.width <= 0 || region.height <= 0) {
    throw new Error(`Zoom region is empty after clamping to the viewport: (${clip.x0}, ${clip.y0}) to (${clip.x1}, ${clip.y1})`)
  }
  await assertCaptureContext(context)
  const dataUrl = await capturePng(target, transaction, context)
  const bitmap = await decodeImage(dataUrl)
  const scaleX = bitmap.width / region.viewportWidth
  const scaleY = bitmap.height / region.viewportHeight
  const zoomScale = Math.max(1, Math.min(4, Math.floor(800 / Math.max(region.width, region.height))))
  const canvas = new OffscreenCanvas(region.width * zoomScale, region.height * zoomScale)
  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) { bitmap.close(); throw new Error('Could not create canvas context') }
  canvasContext.imageSmoothingEnabled = zoomScale === 1
  canvasContext.drawImage(
    bitmap,
    Math.round(region.x * scaleX), Math.round(region.y * scaleY),
    Math.max(1, Math.round(region.width * scaleX)), Math.max(1, Math.round(region.height * scaleY)),
    0, 0, region.width * zoomScale, region.height * zoomScale
  )
  bitmap.close()
  return canvas
}

async function captureFullPageViaCdp(
  context: CaptureContext,
  transaction: CaptureTransaction,
  target: chrome.debugger.Debuggee
): Promise<string | OffscreenCanvas> {
  transaction.throwIfExpired()
  const metrics = await beforeCaptureDeadline(sendDebuggerCommand<LayoutMetrics>(
    target, 'Page.getLayoutMetrics', undefined, Math.max(1, transaction.remainingMs())
  ), context, 'Full-page layout read remained pending after its deadline')
  const size = metrics.cssContentSize ?? metrics.contentSize
  if (!size?.width || !size?.height) throw new Error('Could not determine full-page bounds')
  await assertCaptureContext(context)
  const dataUrl = await capturePng(target, transaction, context, {
    captureBeyondViewport: true,
    clip: { x: size.x ?? 0, y: size.y ?? 0, width: size.width, height: size.height, scale: 1 }
  })
  return fitCaptureToCssSize(dataUrl, size.width, size.height)
}

async function captureFullPageFallback(
  context: CaptureContext,
  transaction: CaptureTransaction,
  target: chrome.debugger.Debuggee
): Promise<OffscreenCanvas> {
  const scrollerToken = `tabz${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  // Read the original scroll position before the marking pass. If that second
  // injection runs but its response is lost, cleanup still has enough state to
  // remove markers and restore the nested scroller.
  const originalPageInfo = await executeInCaptureDocument(context, prepareScreenshotPage, [])
  let pageInfo: ScreenshotPageInfo | undefined
  const captures: Array<{ dataUrl: string; y: number }> = []
  let captureError: unknown
  try {
    pageInfo = await executeInCaptureDocument(context, prepareScreenshotPage, [scrollerToken])
    if (!pageInfo?.viewportWidth || !pageInfo.viewportHeight || !pageInfo.fullHeight) {
      throw new Error('Could not get page dimensions')
    }
    const maxScrollTop = Math.max(0, pageInfo.fullHeight - pageInfo.viewportHeight)
    const scrollPositions: number[] = []
    for (let top = 0; top < maxScrollTop; top += pageInfo.viewportHeight) scrollPositions.push(top)
    if (scrollPositions.length === 0 || scrollPositions[scrollPositions.length - 1] !== maxScrollTop) scrollPositions.push(maxScrollTop)
    for (let index = 0; index < scrollPositions.length; index += 1) {
      transaction.throwIfExpired()
      if (index === 1) await executeInCaptureDocument(context, hideScreenshotFixedElements, [scrollerToken])
      const actualTop = await executeInCaptureDocument(context, scrollScreenshotPage, [scrollerToken, scrollPositions[index]])
      await transaction.wait(200)
      await assertCaptureContext(context)
      captures.push({ dataUrl: await capturePng(target, transaction, context), y: actualTop })
    }
  } catch (error) {
    captureError = error
    throw error
  } finally {
    try {
      await restoreCaptureDocument(context, scrollerToken, originalPageInfo.originalScrollTop)
    } catch (restoreError) {
      if (!captureError) throw restoreError
    }
  }

  if (!pageInfo) throw new Error('Could not get page dimensions')
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(pageInfo.viewportWidth)), Math.max(1, Math.round(pageInfo.fullHeight)))
  const canvasContext = canvas.getContext('2d')
  if (!canvasContext) throw new Error('Could not create canvas context')
  canvasContext.imageSmoothingEnabled = true
  canvasContext.imageSmoothingQuality = 'high'
  let drawnThrough = 0
  for (const capture of captures) {
    const bitmap = await decodeImage(capture.dataUrl)
    const scaleX = bitmap.width / pageInfo.viewportWidth
    const scaleY = bitmap.height / pageInfo.viewportHeight
    const destinationY = Math.max(drawnThrough, capture.y)
    const sourceY = Math.max(0, destinationY - capture.y)
    const sourceHeight = Math.min(bitmap.height / scaleY - sourceY, pageInfo.fullHeight - destinationY)
    if (sourceHeight > 0) {
      const destinationWidth = Math.min(pageInfo.viewportWidth, bitmap.width / scaleX)
      canvasContext.drawImage(bitmap, 0, sourceY * scaleY, destinationWidth * scaleX, sourceHeight * scaleY,
        0, destinationY, destinationWidth, sourceHeight)
      drawnThrough = destinationY + sourceHeight
    }
    bitmap.close()
  }
  return canvas
}

async function captureDocumentImage(
  context: CaptureContext,
  transaction: CaptureTransaction,
  request: Pick<ScreenshotMessage, 'fullPage' | 'clip' | 'ref' | 'selector'>
): Promise<string | OffscreenCanvas> {
  await assertCaptureContext(context)
  const selector = request.ref
    ? resolvePageRef(context.tabId, request.ref, { agent: context.agent, documentId: context.token.documentId })
    : request.selector
  return withDebugger(context.tabId, async target => {
    transaction.throwIfExpired()
    let image: string | OffscreenCanvas
    if (request.fullPage) {
      try {
        image = await captureFullPageViaCdp(context, transaction, target)
      } catch {
        transaction.throwIfExpired()
        image = await captureFullPageFallback(context, transaction, target)
      }
    } else if (request.clip) {
      image = await captureRegionScreenshot(context, transaction, target, request.clip)
    } else if (selector) {
      image = await captureElementScreenshot(context, transaction, target, selector)
    } else {
      image = await captureViewportCssPixels(context, transaction, target)
    }
    await assertCaptureContext(context)
    return image
  }, { guard: transaction.throwIfExpired })
}

/**
 * Capture an inline viewport while the caller holds this tab's document
 * admission. This helper deliberately never acquires the admission lock.
 */
export async function captureViewportInline(
  tabId: number,
  options: { agent?: string; token: DocumentProtectionToken; expiresAt: number }
): Promise<InlineImageData> {
  const context: CaptureContext = { tabId, ...options }
  const source = await captureScheduler.run(options.expiresAt, transaction =>
    captureDocumentImage(context, transaction, {}))
  assertCaptureDeadline(options.expiresAt)
  const { downloadDataUrl: _downloadDataUrl, ...inline } = await prepareInlineImageData(source)
  assertCaptureDeadline(options.expiresAt)
  await assertCaptureContext(context)
  return inline
}

async function performBrowserScreenshot(message: ScreenshotMessage): Promise<Record<string, unknown>> {
  const expiresAt = captureDeadline(
    message.requestTimeoutMs,
    message.fullPage ? FULL_PAGE_CAPTURE_TIMEOUT_MS : VIEWPORT_CAPTURE_TIMEOUT_MS
  )
  let resolvedTabId = message.tabId
  let tabContext: ScreenshotTabContext | undefined
  try {
    assertCaptureDeadline(expiresAt)
    const initiallyResolved = await resolveAgentTab(message.agent, message.tabId)
    if (!initiallyResolved?.id) throw new Error('No active tab found')
    const tabId = initiallyResolved.id
    resolvedTabId = tabId

    const captured = await runWithDocumentAdmission(tabId, async () => {
      const currentTab = await resolveAgentTab(message.agent, tabId)
      if (!currentTab?.id || currentTab.id !== tabId) throw new Error('The screenshot tab is no longer owned by this caller')
      await assertAgentReadableTab('tabz_screenshot', currentTab)
      const token = await assertDocumentReadable(tabId, 'tabz_screenshot', {
        guard: () => assertCaptureDeadline(expiresAt), expiresAt
      })
      const context: CaptureContext = { tabId, token, agent: message.agent, expiresAt }
      const imageSource = await captureScheduler.run(expiresAt, transaction =>
        captureDocumentImage(context, transaction, message))
      const verifiedTab = await assertCaptureContext(context)
      return { imageSource, tabContext: screenshotTabContext(verifiedTab) }
    })
    let imageSource = captured.imageSource
    tabContext = captured.tabContext
    assertCaptureDeadline(expiresAt)

    if (message.inlineOnly) {
      const { downloadDataUrl: _downloadDataUrl, ...inline } = await prepareInlineImageData(imageSource)
      assertCaptureDeadline(expiresAt)
      return { success: true, ...tabContext, ...inline }
    }

    let inline: Partial<InlineImageData> = {}
    let warning: string | undefined
    try {
      const { downloadDataUrl, ...prepared } = await prepareInlineImageData(imageSource)
      assertCaptureDeadline(expiresAt)
      inline = prepared
      if (imageSource instanceof OffscreenCanvas) imageSource = downloadDataUrl!
    } catch (error) {
      warning = `Inline image data skipped: ${(error as Error).message}`
    }
    const dataUrl = typeof imageSource === 'string'
      ? imageSource
      : await blobToDataUrl(await imageSource.convertToBlob({ type: 'image/png' }))
    assertCaptureDeadline(expiresAt)
    const filename = await resolveScreenshotFilename(message)
    assertCaptureDeadline(expiresAt)
    const result = await downloadScreenshot(dataUrl, filename, expiresAt)
    return { ...tabContext, ...result, ...inline, ...(warning ? { warning } : {}) }
  } catch (error) {
    return {
      success: false,
      ...tabContext,
      error: message.ref && resolvedTabId !== undefined && (error as Error).message.includes('Element not found')
        ? stalePageRefMessage(message.ref, resolvedTabId)
        : error instanceof Error ? error.message : String(error)
    }
  }
}

async function downloadScreenshot(dataUrl: string, filename: string, expiresAt: number): Promise<{
  success: boolean; filePath?: string; windowsPath?: string; wslPath?: string; error?: string
}> {
  const downloadId = await new Promise<number>((resolve, reject) => {
    assertCaptureDeadline(expiresAt)
    chrome.downloads.download({ url: dataUrl, filename, conflictAction: 'uniquify' }, id => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else if (id === undefined) reject(new Error('Download failed to start'))
      else resolve(id)
    })
  })
  return new Promise(resolve => {
    let settled = false
    let poll: ReturnType<typeof setTimeout> | undefined
    const finish = (result: { success: boolean; filePath?: string; windowsPath?: string; wslPath?: string; error?: string }) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (poll !== undefined) clearTimeout(poll)
      resolve(result)
    }
    const timeout = setTimeout(() => finish({ success: false, error: 'Download timed out' }),
      Math.max(1, Math.min(30_000, expiresAt - Date.now())))
    const check = () => chrome.downloads.search({ id: downloadId }, results => {
      if (settled) return
      const download = results[0]
      if (!download) finish({ success: false, error: 'Download not found' })
      else if (download.state === 'complete') {
        const windowsPath = download.filename
        finish({ success: true, filePath: windowsToWslPath(windowsPath), windowsPath, wslPath: windowsToWslPath(windowsPath) })
      } else if (download.state === 'interrupted') {
        finish({ success: false, error: download.error || 'Download interrupted' })
      } else if (Date.now() >= expiresAt) {
        finish({ success: false, error: 'Download timed out' })
      } else poll = setTimeout(check, Math.min(200, Math.max(1, expiresAt - Date.now())))
    })
    poll = setTimeout(check, Math.min(100, Math.max(1, expiresAt - Date.now())))
  })
}

export async function handleBrowserScreenshot(message: ScreenshotMessage): Promise<void> {
  const result = await performBrowserScreenshot(message)
  sendToWebSocket({ type: 'browser-screenshot-result', requestId: message.requestId, ...result })
}
