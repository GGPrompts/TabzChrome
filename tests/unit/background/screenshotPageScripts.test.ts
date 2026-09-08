import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hideScreenshotFixedElements,
  prepareScreenshotPage,
  restoreScreenshotPage,
  scrollScreenshotPage
} from '../../../extension/background/browserMcp/screenshotPageScripts'

function setDimension(element: Element, property: 'clientHeight' | 'scrollHeight' | 'offsetHeight', value: number) {
  Object.defineProperty(element, property, { configurable: true, value })
}

describe('screenshot page scripts', () => {
  beforeEach(() => {
    document.head.replaceChildren()
    document.body.replaceChildren()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    window.scrollTo = vi.fn((x: number | ScrollToOptions, y?: number) => {
      Object.defineProperty(window, 'scrollY', {
        configurable: true,
        value: typeof x === 'number' ? y ?? 0 : x.top ?? window.scrollY
      })
    })
    setDimension(document.documentElement, 'clientHeight', 800)
    setDimension(document.documentElement, 'scrollHeight', 800)
    setDimension(document.documentElement, 'offsetHeight', 800)
    setDimension(document.body, 'scrollHeight', 800)
    setDimension(document.body, 'offsetHeight', 800)
  })

  it('selects the tallest scrollable descendant when the document does not scroll', () => {
    const shorter = document.createElement('section')
    shorter.style.overflowY = 'auto'
    setDimension(shorter, 'clientHeight', 600)
    setDimension(shorter, 'scrollHeight', 1800)

    const tallest = document.createElement('main')
    tallest.style.overflowY = 'scroll'
    tallest.scrollTop = 125
    setDimension(tallest, 'clientHeight', 700)
    setDimension(tallest, 'scrollHeight', 3200)

    document.body.append(shorter, tallest)

    const result = prepareScreenshotPage('selection-test')

    expect(result).toMatchObject({
      fullHeight: 3200,
      viewportHeight: 800,
      viewportWidth: 1200,
      originalScrollTop: 125,
      scroller: 'element'
    })
    expect(shorter.hasAttribute('data-tabz-screenshot-scroller')).toBe(false)
    expect(tallest.getAttribute('data-tabz-screenshot-scroller')).toBe('selection-test')

    expect(scrollScreenshotPage('selection-test', 900)).toBe(900)
    expect(tallest.scrollTop).toBe(900)
    restoreScreenshotPage('selection-test', 125)
    expect(tallest.scrollTop).toBe(125)
    expect(tallest.hasAttribute('data-tabz-screenshot-scroller')).toBe(false)
  })

  it('keeps the document scroller when the document extends beyond the viewport', () => {
    setDimension(document.documentElement, 'scrollHeight', 2400)
    const inner = document.createElement('main')
    inner.style.overflowY = 'auto'
    setDimension(inner, 'clientHeight', 700)
    setDimension(inner, 'scrollHeight', 4000)
    document.body.append(inner)

    const result = prepareScreenshotPage('document-test')

    expect(result).toMatchObject({ fullHeight: 2400, scroller: 'document' })
    expect(inner.hasAttribute('data-tabz-screenshot-scroller')).toBe(false)
    expect(scrollScreenshotPage('document-test', 900)).toBe(900)
    restoreScreenshotPage('document-test', 0)
    expect(window.scrollY).toBe(0)
  })

  it('hides fixed and sticky elements and restores them without changing inline visibility', () => {
    const fixed = document.createElement('header')
    fixed.style.position = 'fixed'
    fixed.style.visibility = 'visible'
    const sticky = document.createElement('nav')
    sticky.style.position = 'sticky'
    const ordinary = document.createElement('main')
    ordinary.style.position = 'relative'
    document.body.append(fixed, sticky, ordinary)

    ordinary.setAttribute('data-tabz-screenshot-scroller', 'fixed-test')

    expect(hideScreenshotFixedElements('fixed-test')).toBe(2)
    expect(fixed.getAttribute('data-tabz-screenshot-fixed-hidden')).toBe('fixed-test')
    expect(sticky.getAttribute('data-tabz-screenshot-fixed-hidden')).toBe('fixed-test')
    expect(ordinary.hasAttribute('data-tabz-screenshot-fixed-hidden')).toBe(false)
    expect(document.getElementById('tabz-screenshot-fixed-style-fixed-test')?.textContent)
      .toContain('visibility: hidden !important')
    expect(fixed.style.visibility).toBe('visible')

    restoreScreenshotPage('fixed-test', 0)
    expect(document.querySelectorAll('[data-tabz-screenshot-fixed-hidden]')).toHaveLength(0)
    expect(document.getElementById('tabz-screenshot-fixed-style-fixed-test')).toBeNull()
    expect(fixed.style.visibility).toBe('visible')
  })

  it('tags fixed and sticky candidates during prepare so the hide pass does not sweep again', () => {
    const fixed = document.createElement('header')
    fixed.style.position = 'fixed'
    setDimension(fixed, 'clientHeight', 60)
    const ordinary = document.createElement('main')
    ordinary.style.position = 'relative'
    setDimension(ordinary, 'clientHeight', 400)
    document.body.append(fixed, ordinary)

    prepareScreenshotPage('candidate-test')

    expect(fixed.getAttribute('data-tabz-screenshot-fixed-candidate')).toBe('candidate-test')
    expect(ordinary.hasAttribute('data-tabz-screenshot-fixed-candidate')).toBe(false)

    const computedStyle = vi.spyOn(window, 'getComputedStyle')
    try {
      expect(hideScreenshotFixedElements('candidate-test')).toBe(1)
      expect(computedStyle).not.toHaveBeenCalled()
    } finally {
      computedStyle.mockRestore()
    }
    expect(fixed.getAttribute('data-tabz-screenshot-fixed-hidden')).toBe('candidate-test')

    restoreScreenshotPage('candidate-test', 0)
    expect(fixed.hasAttribute('data-tabz-screenshot-fixed-candidate')).toBe(false)
    expect(fixed.hasAttribute('data-tabz-screenshot-fixed-hidden')).toBe(false)
  })

  it('caps the prepare sweep so a huge DOM cannot stall the capture', () => {
    // Every element needs a laid out height or the sweep skips it before
    // getComputedStyle, which is the other half of the bound being tested.
    const clientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 10 })
    // A stubbed style keeps the 5000 node sweep fast under coverage
    // instrumentation; the bound under test is the call count, not jsdom's
    // real style resolution.
    const computedStyle = vi
      .spyOn(window, 'getComputedStyle')
      .mockReturnValue({ position: 'static' } as CSSStyleDeclaration)

    try {
      const fragment = document.createDocumentFragment()
      for (let i = 0; i < 5100; i++) {
        fragment.append(document.createElement('div'))
      }
      document.body.append(fragment)

      prepareScreenshotPage('cap-test')

      // One call for the document scroller plus the 5000 node sweep cap.
      expect(computedStyle).toHaveBeenCalledTimes(5001)
    } finally {
      computedStyle.mockRestore()
      if (clientHeight) {
        Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeight)
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight')
      }
    }
  })
})
