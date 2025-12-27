import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTerminal3DMouseFix } from '../../../extension/3d/useTerminal3DMouseFix'

describe('useTerminal3DMouseFix', () => {
  let container: HTMLDivElement
  let xtermViewport: HTMLDivElement

  beforeEach(() => {
    // Create container with xterm viewport for testing
    container = document.createElement('div')
    container.style.width = '1200px'
    container.style.height = '800px'

    xtermViewport = document.createElement('div')
    xtermViewport.className = 'xterm-viewport'
    container.appendChild(xtermViewport)

    document.body.appendChild(container)

    // Mock getBoundingClientRect to simulate transforms
    vi.spyOn(container, 'getBoundingClientRect')
  })

  afterEach(() => {
    document.body.removeChild(container)
    vi.restoreAllMocks()
  })

  describe('initialization', () => {
    it('should not add listeners when disabled', () => {
      const addEventListenerSpy = vi.spyOn(container, 'addEventListener')

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, false))

      expect(addEventListenerSpy).not.toHaveBeenCalled()
    })

    it('should not add listeners when container ref is null', () => {
      const ref = { current: null }
      // Should not throw
      expect(() => {
        renderHook(() => useTerminal3DMouseFix(ref, true))
      }).not.toThrow()
    })

    it('should add event listeners when enabled', () => {
      const addEventListenerSpy = vi.spyOn(container, 'addEventListener')

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      // Should add listeners for mouse events and wheel
      const eventTypes = addEventListenerSpy.mock.calls.map(call => call[0])
      expect(eventTypes).toContain('mousedown')
      expect(eventTypes).toContain('mouseup')
      expect(eventTypes).toContain('mousemove')
      expect(eventTypes).toContain('click')
      expect(eventTypes).toContain('dblclick')
      expect(eventTypes).toContain('contextmenu')
      expect(eventTypes).toContain('wheel')
    })

    it('should use capture phase for all listeners', () => {
      const addEventListenerSpy = vi.spyOn(container, 'addEventListener')

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      // All listeners should have capture: true
      addEventListenerSpy.mock.calls.forEach(call => {
        const options = call[2] as AddEventListenerOptions
        expect(options.capture).toBe(true)
      })
    })
  })

  describe('cleanup', () => {
    it('should remove event listeners on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(container, 'removeEventListener')

      const ref = { current: container }
      const { unmount } = renderHook(() => useTerminal3DMouseFix(ref, true))

      unmount()

      const eventTypes = removeEventListenerSpy.mock.calls.map(call => call[0])
      expect(eventTypes).toContain('mousedown')
      expect(eventTypes).toContain('wheel')
    })
  })

  describe('mouse event transformation', () => {
    it('should not transform events when no CSS transform is applied', () => {
      // Mock getBoundingClientRect to return same size as offset dimensions
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 1200,
        height: 800,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      // Mock offsetWidth/offsetHeight
      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      // Dispatch a mouse event
      const mouseEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      // Should not dispatch transformed event (no transform needed)
      expect(dispatchEventSpy).not.toHaveBeenCalled()
    })

    it('should transform coordinates when CSS transform is applied (zoomed)', () => {
      // Simulate a 2x zoom: visual size is double the layout size
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 2400,  // Visual width (after transform)
        height: 1600, // Visual height (after transform)
        left: 0,
        top: 0,
        right: 2400,
        bottom: 1600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      // Layout dimensions (before transform)
      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      // Click at visual position (200, 200) which should map to layout position (100, 100)
      const mouseEvent = new MouseEvent('click', {
        clientX: 200,
        clientY: 200,
        bubbles: true,
      })

      // Prevent default handling so we can test
      const stopImmediatePropagationSpy = vi.spyOn(mouseEvent, 'stopImmediatePropagation')

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      // Should dispatch transformed event
      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)
      expect(stopImmediatePropagationSpy).toHaveBeenCalled()

      // Check transformed coordinates
      const transformedEvent = dispatchEventSpy.mock.calls[0][0] as MouseEvent
      expect(transformedEvent.type).toBe('click')
      // Visual position 200 / ratio 2 = layout position 100
      expect(transformedEvent.clientX).toBe(100)
      expect(transformedEvent.clientY).toBe(100)
    })

    it('should transform coordinates when CSS transform shrinks the view', () => {
      // Simulate a 0.5x zoom: visual size is half the layout size
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 600,   // Visual width (after transform)
        height: 400,  // Visual height (after transform)
        left: 100,
        top: 50,
        right: 700,
        bottom: 450,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      // Click at visual position (relative to container: 150, 100)
      // clientX = 100 (left) + 150 = 250
      // clientY = 50 (top) + 100 = 150
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: 250,
        clientY: 150,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)

      const transformedEvent = dispatchEventSpy.mock.calls[0][0] as MouseEvent
      // Visual position relative to container: 150, 100
      // Ratio: 600/1200 = 0.5
      // Layout position = 150 / 0.5 = 300, 100 / 0.5 = 200
      // New clientX = 100 (left) + 300 = 400
      // New clientY = 50 (top) + 200 = 250
      expect(transformedEvent.clientX).toBe(400)
      expect(transformedEvent.clientY).toBe(250)
    })

    it('should preserve all mouse event properties in transformed event', () => {
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 2400,
        height: 1600,
        left: 0,
        top: 0,
        right: 2400,
        bottom: 1600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const mouseEvent = new MouseEvent('mousedown', {
        clientX: 200,
        clientY: 200,
        screenX: 300,
        screenY: 300,
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        button: 2,
        buttons: 2,
        bubbles: true,
        cancelable: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      const transformedEvent = dispatchEventSpy.mock.calls[0][0] as MouseEvent
      expect(transformedEvent.screenX).toBe(300)
      expect(transformedEvent.screenY).toBe(300)
      expect(transformedEvent.ctrlKey).toBe(true)
      expect(transformedEvent.shiftKey).toBe(true)
      expect(transformedEvent.altKey).toBe(false)
      expect(transformedEvent.metaKey).toBe(false)
      expect(transformedEvent.button).toBe(2)
      expect(transformedEvent.buttons).toBe(2)
    })
  })

  describe('wheel event transformation', () => {
    it('should transform wheel events with delta values preserved', () => {
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 2400,
        height: 1600,
        left: 0,
        top: 0,
        right: 2400,
        bottom: 1600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const wheelEvent = new WheelEvent('wheel', {
        clientX: 200,
        clientY: 200,
        deltaX: 10,
        deltaY: 100,
        deltaZ: 0,
        deltaMode: 0, // WheelEvent.DOM_DELTA_PIXEL
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(wheelEvent)
      })

      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)

      const transformedEvent = dispatchEventSpy.mock.calls[0][0] as WheelEvent
      expect(transformedEvent.type).toBe('wheel')
      expect(transformedEvent.deltaX).toBe(10)
      expect(transformedEvent.deltaY).toBe(100)
      expect(transformedEvent.deltaZ).toBe(0)
      expect(transformedEvent.deltaMode).toBe(0)
    })

    it('should not transform wheel events when no CSS transform', () => {
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 1200,
        height: 800,
        left: 0,
        top: 0,
        right: 1200,
        bottom: 800,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const wheelEvent = new WheelEvent('wheel', {
        clientX: 100,
        clientY: 100,
        deltaY: 50,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(wheelEvent)
      })

      // No transform needed, so no dispatch
      expect(dispatchEventSpy).not.toHaveBeenCalled()
    })
  })

  describe('xterm viewport finding', () => {
    it('should find xterm-viewport class', () => {
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 2400,
        height: 1600,
        left: 0,
        top: 0,
        right: 2400,
        bottom: 1600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const mouseEvent = new MouseEvent('click', {
        clientX: 200,
        clientY: 200,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      expect(dispatchEventSpy).toHaveBeenCalled()
    })

    it('should find xterm-screen class as fallback', () => {
      // Remove xterm-viewport and add xterm-screen
      xtermViewport.className = 'xterm-screen'

      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 2400,
        height: 1600,
        left: 0,
        top: 0,
        right: 2400,
        bottom: 1600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const mouseEvent = new MouseEvent('click', {
        clientX: 200,
        clientY: 200,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      expect(dispatchEventSpy).toHaveBeenCalled()
    })

    it('should find xterm class as last fallback', () => {
      // Set class to just xterm
      xtermViewport.className = 'xterm'

      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 2400,
        height: 1600,
        left: 0,
        top: 0,
        right: 2400,
        bottom: 1600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const mouseEvent = new MouseEvent('click', {
        clientX: 200,
        clientY: 200,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      expect(dispatchEventSpy).toHaveBeenCalled()
    })
  })

  describe('event deduplication', () => {
    it('should not reprocess already processed events', () => {
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 2400,
        height: 1600,
        left: 0,
        top: 0,
        right: 2400,
        bottom: 1600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      // Same event dispatched twice (simulating event bubbling back)
      const mouseEvent = new MouseEvent('click', {
        clientX: 200,
        clientY: 200,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
        // Dispatch same event again
        container.dispatchEvent(mouseEvent)
      })

      // Should only transform and dispatch once
      expect(dispatchEventSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('transform threshold', () => {
    it('should not transform when ratio difference is less than 1%', () => {
      // Visual slightly different from layout (0.5% difference)
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 1206,  // 0.5% larger than 1200
        height: 804,  // 0.5% larger than 800
        left: 0,
        top: 0,
        right: 1206,
        bottom: 804,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const mouseEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      // Should not transform (below 1% threshold)
      expect(dispatchEventSpy).not.toHaveBeenCalled()
    })

    it('should transform when ratio difference exceeds 1%', () => {
      // Visual 2% larger than layout
      vi.mocked(container.getBoundingClientRect).mockReturnValue({
        width: 1224,  // 2% larger than 1200
        height: 816,  // 2% larger than 800
        left: 0,
        top: 0,
        right: 1224,
        bottom: 816,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      })

      Object.defineProperty(container, 'offsetWidth', { value: 1200, configurable: true })
      Object.defineProperty(container, 'offsetHeight', { value: 800, configurable: true })

      const ref = { current: container }
      renderHook(() => useTerminal3DMouseFix(ref, true))

      const dispatchEventSpy = vi.spyOn(xtermViewport, 'dispatchEvent')

      const mouseEvent = new MouseEvent('click', {
        clientX: 100,
        clientY: 100,
        bubbles: true,
      })

      act(() => {
        container.dispatchEvent(mouseEvent)
      })

      // Should transform (above 1% threshold)
      expect(dispatchEventSpy).toHaveBeenCalled()
    })
  })
})
