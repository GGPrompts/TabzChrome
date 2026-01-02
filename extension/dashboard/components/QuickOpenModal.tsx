import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  File,
  FileText,
  FileCode,
  FileJson,
  Image,
  Video,
  Music,
  Table,
  Search,
  Command,
} from 'lucide-react'
import { useFilesContext } from '../contexts/FilesContext'
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

interface FlatFile {
  name: string
  path: string
  relativePath: string
  score: number
}

// Get icon for file based on extension
function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'scss', 'html', 'vue', 'rs', 'go']
  const docExts = ['md', 'txt', 'doc', 'docx', 'pdf', 'rtf']
  const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp']
  const jsonExts = ['json', 'jsonc', 'json5']
  const videoExts = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv', 'm4v']
  const audioExts = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'wma']

  if (codeExts.includes(ext)) return <FileCode className="w-4 h-4 text-green-400" />
  if (docExts.includes(ext)) return <FileText className="w-4 h-4 text-blue-400" />
  if (imageExts.includes(ext)) return <Image className="w-4 h-4 text-yellow-400" />
  if (jsonExts.includes(ext)) return <FileJson className="w-4 h-4 text-orange-400" />
  if (videoExts.includes(ext)) return <Video className="w-4 h-4 text-purple-400" />
  if (audioExts.includes(ext)) return <Music className="w-4 h-4 text-pink-400" />
  if (ext === 'csv') return <Table className="w-4 h-4 text-emerald-400" />
  return <File className="w-4 h-4 text-muted-foreground" />
}

// Flatten file tree into list of files
function flattenTree(node: FileNode, basePath: string): FlatFile[] {
  const files: FlatFile[] = []

  function walk(n: FileNode) {
    if (n.type === 'file') {
      // Calculate relative path from basePath
      let relativePath = n.path
      if (n.path.startsWith(basePath)) {
        relativePath = n.path.slice(basePath.length)
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1)
      }
      files.push({
        name: n.name,
        path: n.path,
        relativePath,
        score: 0,
      })
    } else if (n.children) {
      n.children.forEach(walk)
    }
  }

  walk(node)
  return files
}

// Simple fuzzy matching with scoring
function fuzzyMatch(query: string, text: string): number {
  if (!query) return 1 // Empty query matches everything

  const queryLower = query.toLowerCase()
  const textLower = text.toLowerCase()

  // Exact match gets highest score
  if (textLower === queryLower) return 100

  // Starts with query
  if (textLower.startsWith(queryLower)) return 80

  // Contains query
  if (textLower.includes(queryLower)) return 60

  // Fuzzy character matching (all chars must appear in order)
  let queryIndex = 0
  let consecutiveBonus = 0
  let lastMatchIndex = -2
  let score = 0

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      // Bonus for consecutive matches
      if (i === lastMatchIndex + 1) {
        consecutiveBonus += 5
      }
      // Bonus for matching at word boundaries
      if (i === 0 || textLower[i - 1] === '/' || textLower[i - 1] === '-' || textLower[i - 1] === '_' || textLower[i - 1] === '.') {
        score += 10
      }
      lastMatchIndex = i
      queryIndex++
      score += 3
    }
  }

  // All characters must match
  if (queryIndex !== queryLower.length) return 0

  return score + consecutiveBonus
}

interface QuickOpenModalProps {
  isOpen: boolean
  onClose: () => void
  onFileOpen?: () => void  // Called when a file is opened (for navigation)
}

export function QuickOpenModal({ isOpen, onClose, onFileOpen }: QuickOpenModalProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [allFiles, setAllFiles] = useState<FlatFile[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { openFile, fileTree, fileTreePath } = useFilesContext()
  const { globalWorkingDir } = useWorkingDirectory()

  const API_BASE = 'http://localhost:8129'

  // Fetch file tree if not available
  useEffect(() => {
    if (!isOpen) return

    async function fetchFiles() {
      // Use existing tree if path matches
      if (fileTree && fileTreePath === globalWorkingDir) {
        setAllFiles(flattenTree(fileTree, globalWorkingDir))
        return
      }

      setLoading(true)
      try {
        const response = await fetch(
          `${API_BASE}/api/files/tree?${new URLSearchParams({
            path: globalWorkingDir || '~',
            depth: '10', // Deeper scan for quick open
            showHidden: 'false',
          })}`
        )
        if (response.ok) {
          const data = await response.json()
          setAllFiles(flattenTree(data, data.path || globalWorkingDir))
        }
      } catch (err) {
        console.error('Failed to fetch file tree for quick open:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchFiles()
  }, [isOpen, globalWorkingDir, fileTree, fileTreePath])

  // Filter and score files based on query
  const filteredFiles = useMemo(() => {
    if (!query.trim()) {
      // Show recent/common files when no query (just show first 50)
      return allFiles.slice(0, 50)
    }

    const scored = allFiles
      .map(file => ({
        ...file,
        // Score both filename and relative path
        score: Math.max(
          fuzzyMatch(query, file.name) * 1.5, // Boost filename matches
          fuzzyMatch(query, file.relativePath)
        ),
      }))
      .filter(file => file.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50) // Limit results

    return scored
  }, [allFiles, query])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredFiles.length > 0) {
      const selectedItem = listRef.current.children[selectedIndex] as HTMLElement
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, filteredFiles.length])

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev =>
          prev < filteredFiles.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : 0)
        break
      case 'Enter':
        e.preventDefault()
        if (filteredFiles[selectedIndex]) {
          openFile(filteredFiles[selectedIndex].path, true)
          onFileOpen?.()
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
    }
  }, [filteredFiles, selectedIndex, openFile, onClose, onFileOpen])

  // Handle item click
  const handleItemClick = useCallback((file: FlatFile) => {
    openFile(file.path, true)
    onFileOpen?.()
    onClose()
  }, [openFile, onClose, onFileOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] z-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="w-5 h-5 text-muted-foreground flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files by name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border font-mono">↑↓</kbd>
            <span>navigate</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded border border-border font-mono ml-2">↵</kbd>
            <span>open</span>
          </div>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto"
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Search className="w-8 h-8 mb-2 opacity-30" />
              <p>No files found</p>
              {query && (
                <p className="text-xs mt-1">Try a different search term</p>
              )}
            </div>
          ) : (
            filteredFiles.map((file, index) => (
              <div
                key={file.path}
                className={`
                  flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                  ${index === selectedIndex ? 'bg-primary/20 text-primary' : 'hover:bg-muted/50'}
                `}
                onClick={() => handleItemClick(file)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {getFileIcon(file.name)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{file.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{file.relativePath}</div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Command className="w-3 h-3" />
            <span>+P to open</span>
          </div>
          <span>{filteredFiles.length} files</span>
        </div>
      </div>
    </div>
  )
}
