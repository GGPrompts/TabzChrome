import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { FileTree } from '../components/files/FileTree'
import { FilteredFileList } from '../components/files/FilteredFileList'
import { PluginList } from '../components/files/PluginList'
import { PromptyViewer } from '../components/files/PromptyViewer'
import { isPromptyFile } from '../utils/promptyUtils'
import { Send, Square, MoreVertical, Loader2, Music, Image, Video, Folder } from 'lucide-react'
// Animated icons
import { XIcon, CopyIcon, FolderOpenIcon, SettingsIcon } from '../../components/icons'
import { FileActionsMenu } from '../components/files/FileActionsMenu'
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory'
import { useFileViewerSettings } from '../hooks/useFileViewerSettings'
import { getFileTypeAndLanguage } from '../utils/fileTypeUtils'
import { useFilesContext } from '../contexts/FilesContext'
import { FileFilter } from '../utils/claudeFileTypes'
import { getIconColorClass, getFileIcon, formatRelativeTime } from '../components/files/fileViewerUtils'
import { ImageViewer } from '../components/files/ImageViewer'
import { VideoViewer } from '../components/files/VideoViewer'
import { CsvViewer } from '../components/files/CsvViewer'
import { MarkdownViewer } from '../components/files/MarkdownViewer'
import { type FilePickerDefaults, DEFAULT_FILE_PICKER_DEFAULTS } from '../../components/settings/types'

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
  { value: 'plugins', label: 'Plugins', icon: '🔌' },
  { value: 'favorites', label: '', icon: '⭐' },
]

interface FilesSectionProps {
  onQuickOpen?: () => void
}

export default function FilesSection({ onQuickOpen }: FilesSectionProps = {}) {
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
    favorites,
  } = useFilesContext()

  const [showSettingsDropdown, setShowSettingsDropdown] = useState(false)
  const [imageZoom, setImageZoom] = useState<'fit' | number>('fit')
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // File picker defaults
  const [filePickerDefaults, setFilePickerDefaults] = useState<FilePickerDefaults>(DEFAULT_FILE_PICKER_DEFAULTS)

  // Send to Chat state
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')

  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // File actions menu state (for toolbar dropdown and tab context menu)
  const [fileActionsMenu, setFileActionsMenu] = useState<{
    show: boolean
    x: number
    y: number
    fileId: string | null
  }>({ show: false, x: 0, y: 0, fileId: null })

  // Share working directory with rest of dashboard (working dir dropdown is in sidebar now)
  const { globalWorkingDir, isLoaded: workingDirLoaded } = useWorkingDirectory()

  // File viewer settings (font size, family, max depth)
  const { settings: viewerSettings, setFontSize, setFontFamily, setMaxDepth } = useFileViewerSettings()

  // Load filtered files when filter changes
  useEffect(() => {
    if (activeFilter !== 'all' && globalWorkingDir) {
      loadFilteredFiles(activeFilter, globalWorkingDir)
    }
  }, [activeFilter, globalWorkingDir, loadFilteredFiles])

  // Load file picker defaults from storage
  useEffect(() => {
    chrome.storage.local.get(['filePickerDefaults'], (result) => {
      if (result.filePickerDefaults) {
        setFilePickerDefaults({ ...DEFAULT_FILE_PICKER_DEFAULTS, ...result.filePickerDefaults })
      }
    })
  }, [])

  // Save file picker defaults
  const updateFilePickerDefault = useCallback((key: keyof FilePickerDefaults, value: string) => {
    const newDefaults = { ...filePickerDefaults, [key]: value }
    setFilePickerDefaults(newDefaults)
    chrome.storage.local.set({ filePickerDefaults: newDefaults })
  }, [filePickerDefaults])

  // Close settings dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettingsDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeFile = openFiles.find(f => f.id === activeFileId)

  // Send content to sidebar chat input
  const sendToChat = useCallback(() => {
    if (!activeFile?.content) return

    setSendStatus('sending')

    // Send QUEUE_COMMAND to background, which broadcasts to sidepanel
    chrome.runtime?.sendMessage({
      type: 'QUEUE_COMMAND',
      command: activeFile.content,
    })

    setSendStatus('sent')
    setTimeout(() => setSendStatus('idle'), 2000)
  }, [activeFile])

  // Paste content directly to active terminal
  const pasteToTerminal = useCallback(() => {
    if (!activeFile?.content) return

    // Send PASTE_COMMAND to background, which pastes to active terminal
    chrome.runtime?.sendMessage({
      type: 'PASTE_COMMAND',
      command: activeFile.content,
    })
  }, [activeFile])

  // Stop any playing audio
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setIsPlaying(false)
  }, [])

  // Read content aloud using TTS (short text plays, long text downloads as MP3)
  const readAloud = useCallback(async () => {
    if (!activeFile?.content) return

    // Stop any currently playing audio
    stopAudio()

    const SHORT_TEXT_THRESHOLD = 1000

    try {
      // Load audio settings from Chrome storage
      const result = await chrome.storage.local.get(['audioSettings'])
      const audioSettings = (result.audioSettings || {}) as { voice?: string; rate?: string; pitch?: string; volume?: number }

      const TTS_VOICE_VALUES = [
        'en-US-AndrewNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural',
        'en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-ChristopherNeural', 'en-US-AvaNeural',
        'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-AU-NatashaNeural', 'en-AU-WilliamNeural'
      ]
      let voice = audioSettings.voice || 'en-US-AndrewNeural'
      if (voice === 'random') {
        voice = TTS_VOICE_VALUES[Math.floor(Math.random() * TTS_VOICE_VALUES.length)]
      }

      const rate = audioSettings.rate || '+0%'
      const pitch = audioSettings.pitch || '+0Hz'
      const volume = audioSettings.volume ?? 0.7

      if (activeFile.content.length <= SHORT_TEXT_THRESHOLD) {
        // Short text: play immediately via speak endpoint (broadcasts to sidepanel)
        await fetch('http://localhost:8129/api/audio/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: activeFile.content, voice, rate, pitch, volume })
        })
      } else {
        // Long text: generate MP3 and play it locally (show loading state)
        setIsGeneratingAudio(true)
        try {
          const response = await fetch('http://localhost:8129/api/audio/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: activeFile.content, voice, rate, pitch })
          })
          const data = await response.json()
          setIsGeneratingAudio(false)
          if (data.success && data.url) {
            setIsPlaying(true)
            const audio = new Audio(data.url)
            audio.volume = volume
            audio.onended = () => {
              setIsPlaying(false)
              audioRef.current = null
            }
            audio.onerror = () => {
              setIsPlaying(false)
              audioRef.current = null
            }
            audioRef.current = audio
            audio.play()
          }
        } catch (err) {
          setIsGeneratingAudio(false)
          throw err
        }
      }
    } catch (err) {
      console.error('Failed to call TTS endpoint:', err)
      setIsPlaying(false)
      setIsGeneratingAudio(false)
    }
  }, [activeFile, stopAudio])

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

  const openInEditor = async (file?: typeof activeFile) => {
    const targetFile = file || activeFile
    if (!targetFile) return
    const dir = targetFile.path.split('/').slice(0, -1).join('/')

    // Use Chrome messaging to spawn terminal with editor (respects $EDITOR, falls back to nano)
    chrome.runtime?.sendMessage({
      type: 'SPAWN_TERMINAL',
      name: `Edit: ${targetFile.name}`,
      command: `\${EDITOR:-nano} "${targetFile.path}"`,
      workingDir: dir,
    })
  }

  // File actions menu handlers
  const closeFileActionsMenu = useCallback(() => {
    setFileActionsMenu(prev => ({ ...prev, show: false }))
  }, [])

  const handleTabContextMenu = useCallback((e: React.MouseEvent, fileId: string) => {
    e.preventDefault()
    setFileActionsMenu({ show: true, x: e.clientX, y: e.clientY, fileId })
  }, [])

  const openFileActionsDropdown = useCallback((e: React.MouseEvent) => {
    if (!activeFile) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setFileActionsMenu({ show: true, x: rect.left, y: rect.bottom + 4, fileId: activeFile.id })
  }, [activeFile])

  // Get the file for the actions menu (could be from tab context menu or active file)
  const menuFile = fileActionsMenu.fileId ? openFiles.find(f => f.id === fileActionsMenu.fileId) : null

  return (
    <div className="flex flex-col h-full">
      {/* Header with Filters and Settings */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card/50">
        <h2 className="text-lg font-semibold font-mono text-primary flex items-center gap-2">
          <FolderOpenIcon size={20} />
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
              {option.value === 'favorites' && favorites.size > 0 && (
                <span className="ml-1 text-xs text-muted-foreground">{favorites.size}</span>
              )}
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
            <SettingsIcon size={16} />
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

              {/* File Tree Depth */}
              <div className="pt-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Tree Depth</label>
                  <span className="text-sm text-muted-foreground">{viewerSettings.maxDepth} levels</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="1"
                  value={viewerSettings.maxDepth}
                  onChange={(e) => setMaxDepth(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lower values load faster
                </p>
              </div>

              {/* File Picker Default Paths */}
              <div className="pt-3 border-t border-border">
                <label className="text-sm font-medium block mb-2">Browse Defaults</label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Music className="w-3.5 h-3.5 text-pink-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={filePickerDefaults.audio || ''}
                      onChange={(e) => updateFilePickerDefault('audio', e.target.value)}
                      placeholder="~/sfx"
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Image className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={filePickerDefaults.images || ''}
                      onChange={(e) => updateFilePickerDefault('images', e.target.value)}
                      placeholder="~/Pictures"
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Video className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={filePickerDefaults.videos || ''}
                      onChange={(e) => updateFilePickerDefault('videos', e.target.value)}
                      placeholder="~/Videos"
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Folder className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                    <input
                      type="text"
                      value={filePickerDefaults.general || ''}
                      onChange={(e) => updateFilePickerDefault('general', e.target.value)}
                      placeholder="~"
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs font-mono focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Start paths for file picker dialogs
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* File Tree / Filtered List / Plugin List - Left Side */}
        <div className="w-72 border-r border-border flex-shrink-0 overflow-hidden">
          {activeFilter === 'all' ? (
            <FileTree onFileSelect={openFile} basePath={globalWorkingDir} maxDepth={viewerSettings.maxDepth} waitForLoad={!workingDirLoaded} onQuickOpen={onQuickOpen} />
          ) : activeFilter === 'plugins' ? (
            <PluginList />
          ) : (
            <FilteredFileList
              filter={activeFilter}
              filteredFiles={filteredFiles}
              loading={filteredFilesLoading}
              onFileSelect={openFile}
              onQuickOpen={onQuickOpen}
              onRefresh={() => loadFilteredFiles(activeFilter, globalWorkingDir)}
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
                onContextMenu={(e) => handleTabContextMenu(e, file.id)}
                title={file.pinned ? file.path : `${file.path}\n(preview - double-click to pin)`}
              >
                <FileIcon className={`w-4 h-4 ${iconColor}`} />
                <span className={`text-sm truncate max-w-32 ${!file.pinned ? 'italic opacity-75' : ''}`}>
                  {file.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); closeFile(file.id) }}
                  className="hover:bg-muted rounded p-0.5"
                >
                  <XIcon size={12} />
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
            <ImageViewer
              file={activeFile}
              imageZoom={imageZoom}
              setImageZoom={setImageZoom}
              imageDimensions={imageDimensions}
              setImageDimensions={setImageDimensions}
              onOpenActions={openFileActionsDropdown}
            />
          ) : activeFile.fileType === 'video' ? (
            <VideoViewer
              file={activeFile}
              onOpenActions={openFileActionsDropdown}
            />
          ) : activeFile.fileType === 'csv' ? (
            <CsvViewer
              file={activeFile}
              viewerSettings={viewerSettings}
              onCopy={copyContent}
              onOpenActions={openFileActionsDropdown}
            />
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
              <div className="flex items-center gap-1 p-2 border-b border-border bg-card/50">
                <button onClick={copyContent} className="p-1.5 hover:bg-muted rounded" title="Copy file content">
                  <CopyIcon size={16} />
                </button>
                <button
                  onClick={sendToChat}
                  className={`p-1.5 hover:bg-muted rounded ${sendStatus === 'sent' ? 'text-green-400' : ''}`}
                  title="Send to sidebar chat"
                >
                  <Send className="w-4 h-4" />
                </button>
                {/* Audio status indicator (shows when generating or playing) */}
                {isGeneratingAudio ? (
                  <span className="flex items-center gap-1 px-2 py-1 text-sm text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                ) : isPlaying ? (
                  <button
                    onClick={stopAudio}
                    className="p-1.5 hover:bg-muted rounded text-red-400"
                    title="Stop audio"
                  >
                    <Square className="w-4 h-4" />
                  </button>
                ) : null}
                <button
                  onClick={openFileActionsDropdown}
                  className="p-1.5 hover:bg-muted rounded"
                  title="More actions"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                  {activeFile.lineCount !== undefined && (
                    <span>{activeFile.lineCount} lines</span>
                  )}
                  {activeFile.modified && (
                    <span title={new Date(activeFile.modified).toLocaleString()}>
                      {formatRelativeTime(activeFile.modified)}
                    </span>
                  )}
                  <span className="truncate max-w-[200px]" title={activeFile.path}>{activeFile.path}</span>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-auto">
                {isMarkdown ? (
                  <MarkdownViewer
                    file={activeFile}
                    viewerSettings={viewerSettings}
                    onOpenFile={openFile}
                  />
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

      {/* File Actions Menu (for toolbar dropdown and tab context menu) */}
      {menuFile && (
        <FileActionsMenu
          show={fileActionsMenu.show}
          x={fileActionsMenu.x}
          y={fileActionsMenu.y}
          fileName={menuFile.name}
          filePath={menuFile.path}
          isPinned={menuFile.pinned}
          isFavorite={isFavorite(menuFile.path)}
          isPlaying={isPlaying}
          isGeneratingAudio={isGeneratingAudio}
          onClose={closeFileActionsMenu}
          onCopyPath={() => navigator.clipboard.writeText(menuFile.path)}
          onCopyAtPath={() => navigator.clipboard.writeText(`@${menuFile.path}`)}
          onToggleFavorite={() => toggleFavorite(menuFile.path)}
          onPin={() => pinFile(menuFile.id)}
          onOpenInEditor={() => openInEditor(menuFile)}
          onSendToChat={() => {
            // Set active file first if it's from tab context menu
            if (menuFile.id !== activeFileId) {
              setActiveFileId(menuFile.id)
            }
            sendToChat()
          }}
          onPasteToTerminal={() => {
            if (menuFile.id !== activeFileId) {
              setActiveFileId(menuFile.id)
            }
            pasteToTerminal()
          }}
          onReadAloud={() => {
            if (menuFile.id !== activeFileId) {
              setActiveFileId(menuFile.id)
            }
            readAloud()
          }}
          onStopAudio={stopAudio}
        />
      )}
    </div>
  )
}
