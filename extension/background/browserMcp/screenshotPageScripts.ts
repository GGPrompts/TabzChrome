export interface ScreenshotPageInfo {
  fullHeight: number
  viewportHeight: number
  viewportWidth: number
  originalScrollTop: number
  devicePixelRatio: number
  scroller: 'document' | 'element'
}

/**
 * Inspect the page and optionally mark the element that should be scrolled by
 * the stitching fallback. This function is passed directly to
 * chrome.scripting.executeScript, so it must remain self-contained.
 */
export function prepareScreenshotPage(scrollerToken?: string): ScreenshotPageInfo {
  const body = document.body
  const html = document.documentElement
  const viewportHeight = window.innerHeight
  const documentHeight = Math.max(
    body?.scrollHeight ?? 0,
    body?.offsetHeight ?? 0,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight
  )
  const documentScroller = document.scrollingElement ?? html
  const documentOverflowY = window.getComputedStyle(documentScroller).overflowY
  const documentCanScroll = documentHeight > viewportHeight + 1
    && documentOverflowY !== 'hidden'
    && documentOverflowY !== 'clip'

  // One bounded sweep does both jobs: it picks the scroller the stitching
  // fallback will drive, and it tags the fixed and sticky layers so
  // hideScreenshotFixedElements never has to walk the document a second time.
  // getComputedStyle is the expensive part, so elements with no laid-out height
  // are skipped before it is called (they can neither scroll nor show up in a
  // capture) and the sweep stops after 5000 styled nodes, which keeps a very
  // large DOM from spending seconds here.
  const sweepLimit = 5000
  const candidateAttribute = 'data-tabz-screenshot-fixed-candidate'
  let elementScroller: HTMLElement | null = null

  if (!documentCanScroll || scrollerToken) {
    let tallestHeight = 0
    let styledCount = 0
    const elements = document.querySelectorAll<HTMLElement>('body, body *')
    for (const element of elements) {
      if (styledCount >= sweepLimit) break
      if (element.clientHeight <= 0) continue
      styledCount += 1
      const style = window.getComputedStyle(element)

      if (!documentCanScroll) {
        const canScrollVertically = /^(auto|scroll|overlay)$/.test(style.overflowY)
          && element.scrollHeight > element.clientHeight + 1
        if (canScrollVertically && element.scrollHeight > tallestHeight) {
          elementScroller = element
          tallestHeight = element.scrollHeight
        }
      }

      if (scrollerToken && (style.position === 'fixed' || style.position === 'sticky')) {
        element.setAttribute(candidateAttribute, scrollerToken)
      }
    }
  }

  if (elementScroller && scrollerToken) {
    elementScroller.setAttribute('data-tabz-screenshot-scroller', scrollerToken)
  }

  return {
    fullHeight: elementScroller?.scrollHeight ?? (documentCanScroll ? documentHeight : viewportHeight),
    viewportHeight,
    viewportWidth: window.innerWidth,
    originalScrollTop: elementScroller?.scrollTop ?? window.scrollY,
    devicePixelRatio: window.devicePixelRatio,
    scroller: elementScroller ? 'element' : 'document'
  }
}

/**
 * Scroll the page target selected by prepareScreenshotPage. This function is
 * injected into the page and therefore cannot depend on module-level values.
 */
export function scrollScreenshotPage(scrollerToken: string, scrollTop: number): number {
  const scroller = Array.from(
    document.querySelectorAll<HTMLElement>('[data-tabz-screenshot-scroller]')
  ).find(element => element.getAttribute('data-tabz-screenshot-scroller') === scrollerToken)

  if (scroller) {
    scroller.scrollTop = scrollTop
    return scroller.scrollTop
  }

  window.scrollTo(0, scrollTop)
  return window.scrollY
}

/**
 * Hide fixed and sticky layers without changing their inline styles. A unique
 * token lets cleanup remove only the markers created by this capture.
 */
export function hideScreenshotFixedElements(scrollerToken: string): number {
  const markerAttribute = 'data-tabz-screenshot-fixed-hidden'
  const candidateAttribute = 'data-tabz-screenshot-fixed-candidate'
  const styleId = `tabz-screenshot-fixed-style-${scrollerToken}`

  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `[${markerAttribute}="${scrollerToken}"] { visibility: hidden !important; }`
    ;(document.head ?? document.documentElement).appendChild(style)
  }

  // prepareScreenshotPage already tagged the fixed and sticky layers during its
  // own bounded sweep, so the normal path is one attribute selector. The sweep
  // below only runs when nothing was tagged (prepare ran without a token, or
  // the page rebuilt itself since), and it carries the same node cap.
  let candidates = Array.from(
    document.querySelectorAll<HTMLElement>(`[${candidateAttribute}="${scrollerToken}"]`)
  )

  if (candidates.length === 0) {
    const sweepLimit = 5000
    let styledCount = 0
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      if (styledCount >= sweepLimit) break
      styledCount += 1
      const position = window.getComputedStyle(element).position
      if (position === 'fixed' || position === 'sticky') {
        candidates.push(element)
      }
    }
  }

  let hiddenCount = 0
  for (const element of candidates) {
    if (element.hasAttribute(markerAttribute)) continue
    element.setAttribute(markerAttribute, scrollerToken)
    hiddenCount += 1
  }
  return hiddenCount
}

/** Restore page state after the stitching fallback, including on failure. */
export function restoreScreenshotPage(scrollerToken: string, originalScrollTop: number): void {
  const scroller = Array.from(
    document.querySelectorAll<HTMLElement>('[data-tabz-screenshot-scroller]')
  ).find(element => element.getAttribute('data-tabz-screenshot-scroller') === scrollerToken)

  if (scroller) {
    scroller.scrollTop = originalScrollTop
    scroller.removeAttribute('data-tabz-screenshot-scroller')
  } else {
    window.scrollTo(0, originalScrollTop)
  }

  for (const attribute of ['data-tabz-screenshot-fixed-hidden', 'data-tabz-screenshot-fixed-candidate']) {
    for (const element of document.querySelectorAll<HTMLElement>(`[${attribute}]`)) {
      if (element.getAttribute(attribute) === scrollerToken) {
        element.removeAttribute(attribute)
      }
    }
  }
  document.getElementById(`tabz-screenshot-fixed-style-${scrollerToken}`)?.remove()
}
