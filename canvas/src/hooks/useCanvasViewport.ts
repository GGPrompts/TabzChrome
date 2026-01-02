import { useState, useEffect, useCallback } from 'react'

interface Viewport {
  pan: { x: number; y: number }
  zoom: number
}

const STORAGE_KEY_PAN = 'canvas-pan'
const STORAGE_KEY_ZOOM = 'canvas-zoom'

/**
 * Hook for managing canvas viewport state (pan/zoom) with localStorage persistence
 */
export function useCanvasViewport() {
  const [pan, setPanState] = useState<{ x: number; y: number }>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PAN)
      return stored ? JSON.parse(stored) : { x: 0, y: 0 }
    } catch {
      return { x: 0, y: 0 }
    }
  })

  const [zoom, setZoomState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_ZOOM)
      return stored ? Number(stored) : 1
    } catch {
      return 1
    }
  })

  // Persist pan to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PAN, JSON.stringify(pan))
  }, [pan])

  // Persist zoom to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_ZOOM, String(zoom))
  }, [zoom])

  // Wrapper to clamp zoom between 0.25 and 2
  const setZoom = useCallback((newZoom: number | ((prev: number) => number)) => {
    setZoomState((prev) => {
      const value = typeof newZoom === 'function' ? newZoom(prev) : newZoom
      return Math.min(Math.max(value, 0.25), 2)
    })
  }, [])

  const setPan = useCallback((newPan: { x: number; y: number }) => {
    setPanState(newPan)
  }, [])

  const resetView = useCallback(() => {
    setPanState({ x: 0, y: 0 })
    setZoomState(1)
  }, [])

  return {
    pan,
    setPan,
    zoom,
    setZoom,
    resetView,
  }
}

export type { Viewport }
