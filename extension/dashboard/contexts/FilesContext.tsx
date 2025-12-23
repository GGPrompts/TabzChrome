import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { getFileTypeAndLanguage, FileType } from '../utils/fileTypeUtils'
import { FileFilter, ClaudeFileType } from '../utils/claudeFileTypes'

const API_BASE = "http://localhost:8129"

// Types
interface FileNode {
  name: string
  path: string
  type: "file" | "directory"
  size?: number
  modified?: string
  children?: FileNode[]
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
  modified?: string
}

interface FilteredTree {
  name: string
  icon: string
  basePath: string
  tree: TreeNode
}

interface FilteredFilesResponse {
  trees: FilteredTree[]
  groups?: any[] // Legacy format for backwards compatibility
}

interface OpenFile {
  id: string
  path: string
  name: string
  content: string | null
  fileType: FileType
  mediaDataUri?: string
  loading: boolean
  error?: string
  pinned: boolean  // Pinned tabs stay open, unpinned is preview (gets replaced)
}

interface FilesContextType {
  // File tree state
  fileTree: FileNode | null
  setFileTree: (tree: FileNode | null) => void
  fileTreePath: string | null  // Track which path the tree was loaded for
  setFileTreePath: (path: string | null) => void

  // Open files state
  openFiles: OpenFile[]
  setOpenFiles: React.Dispatch<React.SetStateAction<OpenFile[]>>
  activeFileId: string | null
  setActiveFileId: (id: string | null) => void

  // Filter state
  activeFilter: FileFilter
  setActiveFilter: (filter: FileFilter) => void
  filteredFiles: FilteredFilesResponse | null
  filteredFilesLoading: boolean
  loadFilteredFiles: (filter: FileFilter, workingDir: string) => Promise<void>

  // Favorites
  favorites: Set<string>
  toggleFavorite: (path: string) => void
  isFavorite: (path: string) => boolean

  // Actions
  openFile: (path: string, pin?: boolean) => Promise<void>
  closeFile: (id: string) => void
  pinFile: (id: string) => void
}

const FilesContext = createContext<FilesContextType | null>(null)

export function FilesProvider({ children }: { children: ReactNode }) {
  // File tree cache - persist path to localStorage for reload persistence
  const [fileTree, setFileTree] = useState<FileNode | null>(null)
  const [fileTreePath, setFileTreePathState] = useState<string | null>(() => {
    const stored = localStorage.getItem('tabz-files-tree-path')
    // Don't restore stale home directory paths - they cause race conditions
    // Only restore actual project paths
    if (stored === '~' || stored === '/home/matt' || stored?.endsWith('/matt')) {
      localStorage.removeItem('tabz-files-tree-path')
      return null
    }
    return stored
  })

  // Wrapper to also save to localStorage
  const setFileTreePath = (path: string | null) => {
    setFileTreePathState(path)
    if (path) {
      localStorage.setItem('tabz-files-tree-path', path)
    } else {
      localStorage.removeItem('tabz-files-tree-path')
    }
  }

  // Open files state
  const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)

  // Filter state - persist to localStorage
  const [activeFilter, setActiveFilterState] = useState<FileFilter>(() => {
    return (localStorage.getItem('tabz-files-filter') as FileFilter) || 'all'
  })
  const [filteredFiles, setFilteredFiles] = useState<FilteredFilesResponse | null>(null)
  const [filteredFilesLoading, setFilteredFilesLoading] = useState(false)

  // Favorites state - persist to localStorage (declared before loadFilteredFiles which uses it)
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const stored = localStorage.getItem('tabz-file-favorites')
    if (stored) {
      try {
        return new Set(JSON.parse(stored))
      } catch {
        return new Set()
      }
    }
    return new Set()
  })

  const toggleFavorite = useCallback((path: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev)
      if (newFavorites.has(path)) {
        newFavorites.delete(path)
      } else {
        newFavorites.add(path)
      }
      localStorage.setItem('tabz-file-favorites', JSON.stringify(Array.from(newFavorites)))
      return newFavorites
    })
  }, [])

  const isFavorite = useCallback((path: string) => {
    return favorites.has(path)
  }, [favorites])

  const setActiveFilter = (filter: FileFilter) => {
    setActiveFilterState(filter)
    localStorage.setItem('tabz-files-filter', filter)
  }

  const loadFilteredFiles = useCallback(async (filter: FileFilter, workingDir: string) => {
    if (filter === 'all') {
      setFilteredFiles(null)
      return
    }

    // Handle favorites filter - fetch folder contents for favorited folders
    if (filter === 'favorites') {
      const favArray = Array.from(favorites)
      if (favArray.length === 0) {
        setFilteredFiles({ trees: [], groups: [] })
        return
      }

      setFilteredFilesLoading(true)
      try {
        // Fetch info for each favorited path to determine if file or folder
        const favoriteTrees: FilteredTree[] = []
        const favoriteFiles: { name: string; path: string; type: string | null }[] = []

        await Promise.all(favArray.map(async (path) => {
          try {
            // Try to fetch as a tree (will fail for files)
            const response = await fetch(
              `${API_BASE}/api/files/tree?${new URLSearchParams({
                path,
                depth: '3', // Show 3 levels deep for favorited folders
                showHidden: 'false',
              })}`
            )

            if (response.ok) {
              const data = await response.json()
              // If it has children, it's a folder
              if (data && data.type === 'directory') {
                favoriteTrees.push({
                  name: data.name,
                  icon: '📁',
                  basePath: data.path,
                  tree: data as TreeNode
                })
              } else {
                // Single file
                favoriteFiles.push({
                  name: path.split('/').pop() || path,
                  path,
                  type: null
                })
              }
            } else {
              // API error - treat as file
              favoriteFiles.push({
                name: path.split('/').pop() || path,
                path,
                type: null
              })
            }
          } catch {
            // Network error - still show in list
            favoriteFiles.push({
              name: path.split('/').pop() || path,
              path,
              type: null
            })
          }
        }))

        // Build response with both trees (folders) and groups (files)
        setFilteredFiles({
          trees: favoriteTrees,
          groups: favoriteFiles.length > 0 ? [{
            name: 'Favorite Files',
            icon: '⭐',
            files: favoriteFiles
          }] : []
        })
      } catch (err) {
        console.error('Failed to load favorites:', err)
        // Fallback to simple list
        setFilteredFiles({
          trees: [],
          groups: [{
            name: 'Favorites',
            icon: '⭐',
            files: favArray.map(path => ({
              name: path.split('/').pop() || path,
              path,
              type: null
            }))
          }]
        })
      } finally {
        setFilteredFilesLoading(false)
      }
      return
    }

    setFilteredFilesLoading(true)
    try {
      const response = await fetch(
        `${API_BASE}/api/files/list?${new URLSearchParams({
          filter,
          workingDir,
        })}`
      )
      if (!response.ok) {
        throw new Error('Failed to load filtered files')
      }
      const data = await response.json()
      setFilteredFiles(data)
    } catch (err) {
      console.error('Failed to load filtered files:', err)
      setFilteredFiles(null)
    } finally {
      setFilteredFilesLoading(false)
    }
  }, [favorites])

  const openFile = useCallback(async (path: string, pin: boolean = false) => {
    // Check if already open
    const existing = openFiles.find(f => f.path === path)
    if (existing) {
      setActiveFileId(existing.id)
      // If explicitly pinning, pin it
      if (pin && !existing.pinned) {
        setOpenFiles(prev => prev.map(f => f.id === existing.id ? { ...f, pinned: true } : f))
      }
      return
    }

    const id = `file-${Date.now()}`
    const name = path.split('/').pop() || path
    const { type: fileType } = getFileTypeAndLanguage(path)

    // Find existing unpinned preview to replace
    const existingPreview = openFiles.find(f => !f.pinned)

    // Add file in loading state (unpinned by default, unless explicitly pinning)
    const newFile: OpenFile = { id, path, name, content: null, fileType, loading: true, pinned: pin }

    if (existingPreview && !pin) {
      // Replace the existing preview
      setOpenFiles(prev => prev.map(f => f.id === existingPreview.id ? newFile : f))
    } else {
      // Add new file
      setOpenFiles(prev => [...prev, newFile])
    }
    setActiveFileId(id)

    try {
      if (fileType === 'image') {
        const res = await fetch(`${API_BASE}/api/files/image?path=${encodeURIComponent(path)}`)
        const data = await res.json()
        if (data.dataUri) {
          setOpenFiles(prev => prev.map(f => f.id === id ? { ...f, mediaDataUri: data.dataUri, loading: false } : f))
        } else {
          throw new Error('No image data')
        }
      } else if (fileType === 'video') {
        const res = await fetch(`${API_BASE}/api/files/video?path=${encodeURIComponent(path)}`)
        const data = await res.json()
        if (data.error) {
          throw new Error(data.error)
        }
        if (data.dataUri) {
          setOpenFiles(prev => prev.map(f => f.id === id ? { ...f, mediaDataUri: data.dataUri, loading: false } : f))
        } else {
          throw new Error('No video data')
        }
      } else {
        const res = await fetch(`${API_BASE}/api/files/content?path=${encodeURIComponent(path)}`)
        const data = await res.json()
        setOpenFiles(prev => prev.map(f => f.id === id ? { ...f, content: data.content, loading: false } : f))
      }
    } catch (err: any) {
      setOpenFiles(prev => prev.map(f => f.id === id ? { ...f, error: err.message, loading: false } : f))
    }
  }, [openFiles])

  const pinFile = useCallback((id: string) => {
    setOpenFiles(prev => prev.map(f => f.id === id ? { ...f, pinned: true } : f))
  }, [])

  const closeFile = useCallback((id: string) => {
    setOpenFiles(prev => {
      const remaining = prev.filter(f => f.id !== id)
      // Update active file if we closed the active one
      if (activeFileId === id) {
        setActiveFileId(remaining.length > 0 ? remaining[remaining.length - 1].id : null)
      }
      return remaining
    })
  }, [activeFileId])

  return (
    <FilesContext.Provider value={{
      fileTree,
      setFileTree,
      fileTreePath,
      setFileTreePath,
      openFiles,
      setOpenFiles,
      activeFileId,
      setActiveFileId,
      activeFilter,
      setActiveFilter,
      filteredFiles,
      filteredFilesLoading,
      loadFilteredFiles,
      favorites,
      toggleFavorite,
      isFavorite,
      openFile,
      closeFile,
      pinFile,
    }}>
      {children}
    </FilesContext.Provider>
  )
}

export function useFilesContext() {
  const context = useContext(FilesContext)
  if (!context) {
    throw new Error('useFilesContext must be used within a FilesProvider')
  }
  return context
}
