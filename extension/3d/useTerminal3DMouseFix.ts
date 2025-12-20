import { useEffect, useRef, RefObject } from 'react'

/**
 * useTerminal3DMouseFix - Fixes mouse coordinates for terminals in 3D space
 *
 * When terminals are rendered via drei's <Html> component with `transform` prop,
 * CSS transforms are applied that break xterm.js mouse coordinate calculations.
 *
 * This hook intercepts mouse events and transforms coordinates from visual space
 * to layout space using simple ratio-based calculation.
 */
export function useTerminal3DMouseFix(containerRef: RefObject<HTMLDivElement>, enabled = true) {
  const processedEvents = useRef(new WeakSet())

  useEffect(() => {
    if (!enabled || !containerRef.current) {
      return
    }

    const container = containerRef.current

    const findXtermViewport = () => {
      return container.querySelector('.xterm-viewport') ||
             container.querySelector('.xterm-screen') ||
             container.querySelector('.xterm')
    }

    const mouseTransformHandler = (e: MouseEvent) => {
      // Skip if already processed (prevents infinite recursion)
      if (processedEvents.current.has(e)) {
        return
      }
      processedEvents.current.add(e)

      // Get the container's bounding rect and offset dimensions
      const rect = container.getBoundingClientRect()
      const offsetWidth = container.offsetWidth
      const offsetHeight = container.offsetHeight

      // Calculate visual-to-layout ratio
      // When drei's <Html> applies transforms, rect (visual) differs from offset (layout)
      const visualToLayoutRatioX = rect.width / offsetWidth
      const visualToLayoutRatioY = rect.height / offsetHeight

      // Only transform if there's a meaningful difference (>1% zoom)
      const hasTransform = Math.abs(visualToLayoutRatioX - 1) > 0.01 ||
                          Math.abs(visualToLayoutRatioY - 1) > 0.01

      if (!hasTransform) {
        // No transformation needed, let event pass through
        return
      }

      // Stop the original event from reaching xterm
      e.stopImmediatePropagation()

      // Calculate visual position relative to container
      const visualX = e.clientX - rect.left
      const visualY = e.clientY - rect.top

      // Transform to layout coordinates
      const layoutX = visualX / visualToLayoutRatioX
      const layoutY = visualY / visualToLayoutRatioY

      // Calculate new client coordinates
      const newClientX = rect.left + layoutX
      const newClientY = rect.top + layoutY

      // Create transformed event with corrected coordinates
      const transformedEvent = new MouseEvent(e.type, {
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        view: e.view,
        detail: e.detail,
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: newClientX,
        clientY: newClientY,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        button: e.button,
        buttons: e.buttons,
        relatedTarget: e.relatedTarget,
      })

      // Mark transformed event so we don't process it again
      processedEvents.current.add(transformedEvent)

      // Dispatch to xterm's internal viewport element
      const xtermViewport = findXtermViewport()
      if (xtermViewport) {
        xtermViewport.dispatchEvent(transformedEvent)
      }
    }

    // Handle wheel events separately (different constructor)
    const wheelTransformHandler = (e: WheelEvent) => {
      if (processedEvents.current.has(e)) {
        return
      }
      processedEvents.current.add(e)

      const rect = container.getBoundingClientRect()
      const offsetWidth = container.offsetWidth
      const offsetHeight = container.offsetHeight

      const visualToLayoutRatioX = rect.width / offsetWidth
      const visualToLayoutRatioY = rect.height / offsetHeight

      const hasTransform = Math.abs(visualToLayoutRatioX - 1) > 0.01 ||
                          Math.abs(visualToLayoutRatioY - 1) > 0.01

      if (!hasTransform) {
        return
      }

      e.stopImmediatePropagation()

      const visualX = e.clientX - rect.left
      const visualY = e.clientY - rect.top
      const layoutX = visualX / visualToLayoutRatioX
      const layoutY = visualY / visualToLayoutRatioY
      const newClientX = rect.left + layoutX
      const newClientY = rect.top + layoutY

      const transformedEvent = new WheelEvent(e.type, {
        bubbles: e.bubbles,
        cancelable: e.cancelable,
        view: e.view,
        detail: e.detail,
        screenX: e.screenX,
        screenY: e.screenY,
        clientX: newClientX,
        clientY: newClientY,
        ctrlKey: e.ctrlKey,
        altKey: e.altKey,
        shiftKey: e.shiftKey,
        metaKey: e.metaKey,
        button: e.button,
        buttons: e.buttons,
        relatedTarget: e.relatedTarget,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaZ: e.deltaZ,
        deltaMode: e.deltaMode,
      })

      processedEvents.current.add(transformedEvent)

      const xtermViewport = findXtermViewport()
      if (xtermViewport) {
        xtermViewport.dispatchEvent(transformedEvent)
      }
    }

    // Event types to intercept
    const mouseEventTypes = ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu'] as const

    // Add listeners in capture phase (intercept before xterm sees them)
    mouseEventTypes.forEach(eventType => {
      container.addEventListener(eventType, mouseTransformHandler as EventListener, { capture: true })
    })
    container.addEventListener('wheel', wheelTransformHandler, { capture: true })

    // Cleanup
    return () => {
      mouseEventTypes.forEach(eventType => {
        container.removeEventListener(eventType, mouseTransformHandler as EventListener, { capture: true })
      })
      container.removeEventListener('wheel', wheelTransformHandler, { capture: true })
    }
  }, [containerRef, enabled])
}

export default useTerminal3DMouseFix
