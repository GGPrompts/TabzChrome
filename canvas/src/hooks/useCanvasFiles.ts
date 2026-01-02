import { useState, useEffect, useCallback } from 'react'

export type FileType = 'code' | 'markdown' | 'image' | 'text'

export interface CanvasFile {
  id: string
  name: string
  content: string
  fileType: FileType
  language?: string
  position: { x: number; y: number }
  size: { width: number; height: number }
}

interface UseCanvasFilesResult {
  files: CanvasFile[]
  addFile: (file: Omit<CanvasFile, 'id'>) => void
  updateFile: (id: string, updates: Partial<CanvasFile>) => void
  removeFile: (id: string) => void
}

const STORAGE_KEY = 'canvas-files'

// Generate unique ID
const generateId = () => `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

/**
 * Hook for managing files dropped onto the canvas with localStorage persistence
 */
export function useCanvasFiles(): UseCanvasFilesResult {
  const [files, setFiles] = useState<CanvasFile[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  // Persist files to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(files))
  }, [files])

  const addFile = useCallback((file: Omit<CanvasFile, 'id'>) => {
    const newFile: CanvasFile = {
      id: generateId(),
      ...file,
    }
    setFiles(prev => [...prev, newFile])
  }, [])

  const updateFile = useCallback((id: string, updates: Partial<CanvasFile>) => {
    setFiles(prev =>
      prev.map(f => (f.id === id ? { ...f, ...updates } : f))
    )
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }, [])

  return {
    files,
    addFile,
    updateFile,
    removeFile,
  }
}
