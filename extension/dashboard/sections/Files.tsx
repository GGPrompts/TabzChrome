import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileTree } from '../components/files/FileTree'
import { FilteredFileList } from '../components/files/FilteredFileList'
import { PromptyViewer } from '../components/files/PromptyViewer'
import { isPromptyFile } from '../utils/promptyUtils'
import { X, Copy, ExternalLink, Code, Image as ImageIcon, FileText, FileJson, Settings, ZoomIn, ZoomOut, Maximize, Download, Video, Table, Star, Pin, Send, Terminal, ChevronDown, AtSign, FolderOpen } from 'lucide-react'
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory'
import { useFileViewerSettings } from '../hooks/useFileViewerSettings'
import { getFileTypeAndLanguage, FileType } from '../utils/fileTypeUtils'
import { useFilesContext } from '../contexts/FilesContext'
import { FileFilter, isPromptFile } from '../utils/claudeFileTypes'
import { sendMessage } from '../../shared/messaging'

interface TerminalInfo {
  id: string
  name: string
  sessionName?: string
  isClaudeSession?: boolean
}

// Get icon color class based on file type (matches FileTree.tsx colors)
const getIconColorClass = (fileType: FileType): string => {
  switch (fileType) {
    case 'image': return 'text-yellow-400'
    case 'video': return 'text-purple-400'
    case 'csv': return 'text-emerald-400'
    case 'markdown': return 'text-blue-400'
    case 'json': return 'text-orange-400'
    case 'code': return 'text-green-400'
    default: return ''
  }
}

// Get icon component based on file type
const getFileIcon = (fileType: FileType) => {
  switch (fileType) {
    case 'image': return ImageIcon
    case 'video': return Video
    case 'csv': return Table
    case 'markdown': return FileText
    case 'json': return FileJson
    default: return Code
  }
}

// Simple CSV parser
const parseCSV = (content: string): { headers: string[], rows: string[][] } => {
  const lines = content.trim().split('\n')
  if (lines.length === 0) return { headers: [], rows: [] }

  // Simple CSV parsing (handles basic cases, not full RFC 4180)
  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)

  return { headers, rows }
}

// Filter button component
function FilterButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-sm rounded-md transition-colors ${
        active
          ? 'bg-primary/20 text-primary border border-primary/30'
          : 'hover:bg-muted text-muted-foreground border border-transparent'
      }`}
    >
      {children}
    </button>
  )
}

const filterOptions: { value: FileFilter; label: string; icon?: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'prompts', label: 'Prompts', icon: '📝' },
  { value: 'claude', label: 'Claude', icon: '🤖' },
  { value: 'favorites', label: '', icon: '⭐' },
]

export default function FilesSection() {
  // Use context for persistent state across tab switches
  const {
    openFiles,
    activeFileId,
    setActiveFileId,
    openFile,
    closeFile,
    pinFile,
    activeFilter,
    setActiveFilter,
    filteredFiles,
    filteredFilesLoading,
    loadFilteredFiles,
    toggleFavorite,
    isFavorite,
  } = useFilesContext()

  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false)
  const [imageZoom, setImageZoom] = useState<'fit' | number>('fit')
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Send to Terminal state
  const [showSendDropdown, setShowSendDropdown] = useState(false)
  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const sendDropdownRef = useRef<HTMLDivElement>(null)

  // Share working directory with rest of dashboard (working dir dropdown is in sidebar now)
  const { globalWorkingDir, isLoaded: workingDirLoaded } = useWorkingDirectory()

  // File viewer settings (font size, family, max depth)
  const { settings: viewerSettings, setFontSize, setFontFamily } = useFileViewerSettings()

  // Load filtered files when filter changes
  useEffect(() => {
    if (activeFilter !== 'all' && globalWorkingDir) {
      loadFilteredFiles(activeFilter, globalWorkingDir)
    }
  }, [activeFilter, globalWorkingDir, loadFilteredFiles])

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsDropdown(false)
      }
      if (sendDropdownRef.current && !sendDropdownRef.current.contains(e.target as Node)) {
        setShowSendDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeFile = openFiles.find(f => f.id === activeFileId)

  // Fetch available terminals when dropdown opens
  const fetchTerminals = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8129/api/agents')
      if (!response.ok) return
      const data = await response.json()
      const terminalList: TerminalInfo[] = (data.data || []).map((t: any) => ({
        id: t.id,
        name: t.name || t.id,
        sessionName: t.sessionName,
        isClaudeSession: t.name?.toLowerCase().includes('claude') || t.id?.includes('claude')
      }))
      setTerminals(terminalList)
    } catch (err) {
      console.error('Failed to fetch terminals:', err)
    }
  }, [])

  // Send content to a terminal
  const sendToTerminal = useCallback(async (terminal: TerminalInfo, sendEnter: boolean = false) => {
    if (!activeFile?.content) return

    setSendStatus('sending')
    try {
      if (terminal.sessionName) {
        // Use TMUX_SESSION_SEND for tmux-based terminals (better for Claude)
        await sendMessage({
          type: 'TMUX_SESSION_SEND',
          sessionName: terminal.sessionName,
          text: activeFile.content,
          sendEnter
        })
      } else {
        // Fall back to TERMINAL_INPUT for non-tmux terminals
        await sendMessage({
          type: 'TERMINAL_INPUT',
          terminalId: terminal.id,
          data: activeFile.content
        })
      }
      setSendStatus('sent')
      setShowSendDropdown(false)
      // Reset status after a moment
      setTimeout(() => setSendStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to send to terminal:', err)
      setSendStatus('idle')
    }
  }, [activeFile])

  const copyContent = async () => {
    if (activeFile?.content) {
      await navigator.clipboard.writeText(activeFile.content)
    }
  }

  const copyPath = async () => {
    if (activeFile?.path) {
      await navigator.clipboard.writeText(`@${activeFile.path}`)
    }
  }

  const openInEditor = async () => {
    if (!activeFile) return
    const dir = activeFile.path.split('/').slice(0, -1).join('/')

    // Use Chrome messaging to spawn terminal with editor (respects $EDITOR, falls back to nano)
    chrome.runtime?.sendMessage({
      type: 'SPAWN_TERMINAL',
      name: `Edit: ${activeFile.name}`,
      command: `\${EDITOR:-nano} "${activeFile.path}"`,
      workingDir: dir,
    })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header with Filters and Settings */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card/50">
        <h2 className="text-lg font-semibold font-mono text-primary flex items-center gap-2">
          <FolderOpen className="w-5 h-5" />
          Files
        </h2>

        {/* Filter toggles */}
        <div className="flex items-center gap-1">
          {filterOptions.map((option) => (
            <FilterButton
              key={option.value}
              active={activeFilter === option.value}
              onClick={() => setActiveFilter(option.value)}
            >
              {option.icon && <span className="mr-1">{option.icon}</span>}
              {option.label}
            </FilterButton>
          ))}
        </div>

        <span className="text-sm text-muted-foreground font-mono ml-auto mr-2 truncate max-w-[300px]" title={globalWorkingDir}>
          {globalWorkingDir}
        </span>

        {/* Settings Dropdown */}
        <div className="relative" ref={settingsRef}>
          <button
            onClick={() => setShowSettingsDropdown(!showSettingsDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background border border-border hover:border-primary/50 transition-colors text-sm"
            title="Font settings"
          >
            <Settings className="w-4 h-4" />
            <span className="text-muted-foreground">{viewerSettings.fontSize}px</span>
          </button>

          {showSettingsDropdown && (
            <div className="absolute top-full right-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-50 p-4 space-y-4">
              {/* Font Size */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Font Size</label>
                  <span className="text-sm text-muted-foreground">{viewerSettings.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={viewerSettings.fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
              </div>

              {/* Font Family */}
              <div>
                <label className="text-sm font-medium block mb-2">Font</label>
                <select
                  value={viewerSettings.fontFamily}
                  onChange={(e) => setFontFamily(e.target.value)}
                  className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-sm"
                  style={{ fontFamily: viewerSettings.fontFamily }}
                >
                  <option value="JetBrains Mono">JetBrains Mono</option>
                  <option value="Fira Code">Fira Code</option>
                  <option value="Cascadia Code">Cascadia Code</option>
                  <option value="monospace">System Monospace</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* File Tree / Filtered List - Left Side */}
        <div className="w-72 border-r border-border flex-shrink-0 overflow-hidden">
          {activeFilter === 'all' ? (
            <FileTree onFileSelect={openFile} basePath={globalWorkingDir} maxDepth={viewerSettings.maxDepth} waitForLoad={!workingDirLoaded} />
          ) : (
            <FilteredFileList
              filter={activeFilter}
              filteredFiles={filteredFiles}
              loading={filteredFilesLoading}
              onFileSelect={openFile}
            />
          )}
        </div>

        {/* File Viewer - Right Side */}
        <div className="flex-1 flex flex-col min-w-0">
        {/* Tab Bar */}
        {openFiles.length > 0 && (
          <div className="flex items-center border-b border-border bg-card/50 overflow-x-auto">
            {openFiles.map(file => {
              const FileIcon = getFileIcon(file.fileType)
              const iconColor = getIconColorClass(file.fileType)
              return (
              <div
                key={file.id}
                className={`flex items-center gap-2 px-3 py-2 border-r border-border cursor-pointer hover:bg-muted/50 ${
                  activeFileId === file.id ? 'bg-muted text-foreground' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveFileId(file.id)}
                onDoubleClick={() => pinFile(file.id)}
                title={file.pinned ? file.name : `${file.name} (preview - double-click to pin)`}
              >
                <FileIcon className={`w-4 h-4 ${iconColor}`} />
                <span className={`text-sm truncate max-w-32 ${!file.pinned ? 'italic opacity-75' : ''}`}>
                  {file.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeFile(file.id) }}
                  className="hover:bg-muted rounded p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )})}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {!activeFile ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Select a file to view
            </div>
          ) : activeFile.loading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Loading...
            </div>
          ) : activeFile.error ? (
            <div className="flex items-center justify-center h-full text-red-400">
              {activeFile.error}
            </div>
          ) : activeFile.fileType === 'image' ? (
            <div className="h-full flex flex-col">
              {/* Image Toolbar */}
              <div className="flex items-center gap-2 p-2 border-b border-border bg-card/50">
                <div className="flex items-center gap-1 border-r border-border pr-2">
                  <button
                    onClick={() => setImageZoom('fit')}
                    className={`flex items-center gap-1 px-2 py-1 text-sm rounded ${imageZoom === 'fit' ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
                    title="Fit to view"
                  >
                    <Maximize className="w-4 h-4" /> Fit
                  </button>
                  <button
                    onClick={() => setImageZoom(100)}
                    className={`flex items-center gap-1 px-2 py-1 text-sm rounded ${imageZoom === 100 ? 'bg-primary/20 text-primary' : 'hover:bg-muted'}`}
                    title="Actual size"
                  >
                    100%
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setImageZoom(prev => Math.max(25, (typeof prev === 'number' ? prev : 100) - 25))}
                    className="p-1.5 hover:bg-muted rounded"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-muted-foreground w-12 text-center">
                    {imageZoom === 'fit' ? 'Fit' : `${imageZoom}%`}
                  </span>
                  <button
                    onClick={() => setImageZoom(prev => Math.min(400, (typeof prev === 'number' ? prev : 100) + 25))}
                    className="p-1.5 hover:bg-muted rounded"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-4 h-4" />
                  </button>
                </div>
                <a
                  href={activeFile.mediaDataUri}
                  download={activeFile.name}
                  className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ml-2"
                  title="Download image"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
                <button
                  onClick={() => toggleFavorite(activeFile.path)}
                  className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${isFavorite(activeFile.path) ? 'text-yellow-400' : ''}`}
                  title={isFavorite(activeFile.path) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className={`w-4 h-4 ${isFavorite(activeFile.path) ? 'fill-current' : ''}`} />
                </button>
                {!activeFile.pinned && (
                  <button
                    onClick={() => pinFile(activeFile.id)}
                    className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded text-primary"
                    title="Pin this file (keep tab open)"
                  >
                    <Pin className="w-4 h-4" /> Pin
                  </button>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {imageDimensions && `${imageDimensions.width} × ${imageDimensions.height}`}
                  {activeFile.path && <span className="ml-2">{activeFile.path}</span>}
                </span>
              </div>
              {/* Image Display */}
              <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#1a1a1a]">
                <img
                  src={activeFile.mediaDataUri}
                  alt={activeFile.name}
                  onLoad={(e) => {
                    const img = e.target as HTMLImageElement
                    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
                  }}
                  style={imageZoom === 'fit' ? {
                    maxWidth: '100%',
                    maxHeight: '100%',
                    objectFit: 'contain'
                  } : {
                    width: `${(imageDimensions?.width || 100) * (imageZoom / 100)}px`,
                    height: 'auto'
                  }}
                />
              </div>
            </div>
          ) : activeFile.fileType === 'video' ? (
            <div className="h-full flex flex-col">
              {/* Video Toolbar */}
              <div className="flex items-center gap-2 p-2 border-b border-border bg-card/50">
                <a
                  href={activeFile.mediaDataUri}
                  download={activeFile.name}
                  className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded"
                  title="Download video"
                >
                  <Download className="w-4 h-4" /> Download
                </a>
                <button
                  onClick={() => toggleFavorite(activeFile.path)}
                  className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${isFavorite(activeFile.path) ? 'text-yellow-400' : ''}`}
                  title={isFavorite(activeFile.path) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className={`w-4 h-4 ${isFavorite(activeFile.path) ? 'fill-current' : ''}`} />
                </button>
                {!activeFile.pinned && (
                  <button
                    onClick={() => pinFile(activeFile.id)}
                    className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded text-primary"
                    title="Pin this file (keep tab open)"
                  >
                    <Pin className="w-4 h-4" /> Pin
                  </button>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{activeFile.path}</span>
              </div>
              {/* Video Player */}
              <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-[#1a1a1a]">
                <video
                  src={activeFile.mediaDataUri}
                  controls
                  className="max-w-full max-h-full"
                  style={{ maxHeight: 'calc(100vh - 200px)' }}
                >
                  Your browser does not support video playback.
                </video>
              </div>
            </div>
          ) : activeFile.fileType === 'csv' ? (
            <div className="h-full flex flex-col">
              {/* CSV Toolbar */}
              <div className="flex items-center gap-2 p-2 border-b border-border bg-card/50">
                <button onClick={copyContent} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded" title="Copy file content">
                  <Copy className="w-4 h-4" /> Copy
                </button>
                <button onClick={copyPath} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded" title="Copy @path to clipboard">
                  <AtSign className="w-4 h-4" /> Path
                </button>
                <button
                  onClick={() => toggleFavorite(activeFile.path)}
                  className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${isFavorite(activeFile.path) ? 'text-yellow-400' : ''}`}
                  title={isFavorite(activeFile.path) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className={`w-4 h-4 ${isFavorite(activeFile.path) ? 'fill-current' : ''}`} />
                </button>
                {!activeFile.pinned && (
                  <button
                    onClick={() => pinFile(activeFile.id)}
                    className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded text-primary"
                    title="Pin this file (keep tab open)"
                  >
                    <Pin className="w-4 h-4" /> Pin
                  </button>
                )}
                <button onClick={openInEditor} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded">
                  <ExternalLink className="w-4 h-4" /> Open in Editor
                </button>
                <span className="ml-auto text-xs text-muted-foreground">{activeFile.path}</span>
              </div>
              {/* CSV Table */}
              <div className="flex-1 overflow-auto p-4">
                {(() => {
                  const { headers, rows } = parseCSV(activeFile.content || '')
                  return (
                    <table className="w-full border-collapse text-sm" style={{ fontFamily: `${viewerSettings.fontFamily}, monospace`, fontSize: `${viewerSettings.fontSize}px` }}>
                      <thead>
                        <tr className="bg-muted/50 sticky top-0">
                          {headers.map((header, i) => (
                            <th key={i} className="border border-border px-3 py-2 text-left font-semibold whitespace-nowrap">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-muted/30">
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="border border-border px-3 py-1.5 whitespace-nowrap">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            </div>
          ) : isPromptyFile(activeFile.path) ? (
            <PromptyViewer
              content={activeFile.content || ''}
              path={activeFile.path}
              name={activeFile.name}
              fontSize={viewerSettings.fontSize}
              fontFamily={viewerSettings.fontFamily}
              pinned={activeFile.pinned}
              isFavorite={isFavorite(activeFile.path)}
              onToggleFavorite={() => toggleFavorite(activeFile.path)}
              onPin={() => pinFile(activeFile.id)}
              onOpenInEditor={openInEditor}
            />
          ) : (() => {
            const { type, language } = getFileTypeAndLanguage(activeFile.path)
            const isMarkdown = type === 'markdown'

            return (
            <div className="h-full flex flex-col">
              {/* Toolbar */}
              <div className="flex items-center gap-2 p-2 border-b border-border bg-card/50">
                <button onClick={copyContent} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded" title="Copy file content">
                  <Copy className="w-4 h-4" /> Copy
                </button>
                <button onClick={copyPath} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded" title="Copy @path to clipboard">
                  <AtSign className="w-4 h-4" /> Path
                </button>
                <button
                  onClick={() => toggleFavorite(activeFile.path)}
                  className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${isFavorite(activeFile.path) ? 'text-yellow-400' : ''}`}
                  title={isFavorite(activeFile.path) ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star className={`w-4 h-4 ${isFavorite(activeFile.path) ? 'fill-current' : ''}`} />
                </button>
                {!activeFile.pinned && (
                  <button
                    onClick={() => pinFile(activeFile.id)}
                    className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded text-primary"
                    title="Pin this file (keep tab open)"
                  >
                    <Pin className="w-4 h-4" /> Pin
                  </button>
                )}
                <button onClick={openInEditor} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded">
                  <ExternalLink className="w-4 h-4" /> Open in Editor
                </button>
                {/* Send to Terminal dropdown */}
                <div className="relative" ref={sendDropdownRef}>
                  <button
                    onClick={() => {
                      if (!showSendDropdown) fetchTerminals()
                      setShowSendDropdown(!showSendDropdown)
                    }}
                    className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${
                      sendStatus === 'sent' ? 'text-green-400' : ''
                    }`}
                    title="Send content to terminal"
                  >
                    <Send className="w-4 h-4" />
                    {sendStatus === 'sent' ? 'Sent!' : 'Send'}
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {showSendDropdown && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                      {terminals.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No terminals found</div>
                      ) : (
                        <>
                          <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border mb-1">
                            Send to terminal
                          </div>
                          {terminals.map(t => (
                            <div key={t.id} className="px-2">
                              <button
                                onClick={() => sendToTerminal(t, false)}
                                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded text-left"
                              >
                                <Terminal className={`w-4 h-4 ${t.isClaudeSession ? 'text-orange-400' : ''}`} />
                                <span className="truncate flex-1">{t.name}</span>
                                {t.isClaudeSession && <span className="text-xs text-orange-400">🤖</span>}
                              </button>
                              {t.isClaudeSession && (
                                <button
                                  onClick={() => sendToTerminal(t, true)}
                                  className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted rounded text-left text-muted-foreground ml-6"
                                  title="Send and press Enter to submit"
                                >
                                  <Send className="w-3 h-3" /> Send + Enter (submit)
                                </button>
                              )}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </div>
                <span className="ml-auto text-xs text-muted-foreground">{activeFile.path}</span>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-auto">
                {isMarkdown ? (
                  <div
                    className="file-viewer-markdown"
                    style={{
                      fontSize: `${viewerSettings.fontSize}px`,
                      fontFamily: `${viewerSettings.fontFamily}, monospace`,
                    }}
                  >
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a({ href, children, ...props }: any) {
                          // Check if it's a relative file link (not http/https/mailto/etc)
                          const isRelativeFile = href && !href.match(/^(https?:|mailto:|#|\/\/)/)

                          if (isRelativeFile && activeFile) {
                            // Resolve relative path based on current file's directory
                            const currentDir = activeFile.path.split('/').slice(0, -1).join('/')
                            const resolvedPath = href.startsWith('/')
                              ? href
                              : `${currentDir}/${href}`.replace(/\/\.\//g, '/') // handle ./

                            return (
                              <a
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault()
                                  openFile(resolvedPath)
                                }}
                                className="text-primary hover:underline cursor-pointer"
                                title={`Open: ${resolvedPath}`}
                                {...props}
                              >
                                {children}
                              </a>
                            )
                          }

                          // External links - open in new tab
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                              {...props}
                            >
                              {children}
                            </a>
                          )
                        },
                        code({ className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '')
                          const codeString = String(children).replace(/\n$/, '')

                          // Inline code
                          if (!match && !className) {
                            return <code className={className} {...props}>{children}</code>
                          }

                          // Code block with syntax highlighting
                          return (
                            <SyntaxHighlighter
                              language={match?.[1] || 'text'}
                              style={vscDarkPlus}
                              customStyle={{
                                margin: 0,
                                padding: '1rem',
                                background: 'rgba(0, 0, 0, 0.4)',
                                borderRadius: '8px',
                                fontSize: `${viewerSettings.fontSize}px`,
                                fontFamily: `${viewerSettings.fontFamily}, monospace`,
                              }}
                              codeTagProps={{
                                style: {
                                  fontSize: `${viewerSettings.fontSize}px`,
                                  fontFamily: `${viewerSettings.fontFamily}, monospace`,
                                }
                              }}
                            >
                              {codeString}
                            </SyntaxHighlighter>
                          )
                        }
                      }}
                    >
                      {activeFile.content || ''}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <SyntaxHighlighter
                    language={language || 'text'}
                    style={vscDarkPlus}
                    showLineNumbers
                    wrapLines
                    lineNumberStyle={{
                      minWidth: '3em',
                      paddingRight: '1em',
                      color: 'rgba(255,255,255,0.3)',
                      userSelect: 'none',
                      fontSize: `${viewerSettings.fontSize}px`,
                    }}
                    customStyle={{
                      margin: 0,
                      padding: '1rem',
                      background: 'transparent',
                      fontSize: `${viewerSettings.fontSize}px`,
                      fontFamily: `${viewerSettings.fontFamily}, monospace`,
                    }}
                    codeTagProps={{
                      style: {
                        fontSize: `${viewerSettings.fontSize}px`,
                        fontFamily: `${viewerSettings.fontFamily}, monospace`,
                      }
                    }}
                  >
                    {activeFile.content || ''}
                  </SyntaxHighlighter>
                )}
              </div>
            </div>
            )
          })()}
        </div>
      </div>
      </div>
    </div>
  )
}
