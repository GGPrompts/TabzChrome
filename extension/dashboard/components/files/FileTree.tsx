import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Search,
  FileText,
  Image,
  FileJson,
  FileCode,
  Minimize2,
  Video,
  Table,
  Settings,
  Zap,
  Bot,
  Terminal,
  Plug,
  Music,
  // New icons for AI-relevant files
  Container,  // Docker
  GitBranch,  // .gitignore, .git
  Lock,       // .env files
  Key,        // secrets
  Brain,      // Obsidian (using Brain as closest match)
  Star,       // Favorites
  // New icons for developer tool folders
  Github,     // .github folder
  Code2,      // .vscode folder
  Library,    // node_modules
  BookOpen,   // docs, README
  FolderCode, // src, source
  FlaskConical, // test, tests
  Package,    // build, dist, package.json
  Globe,      // public, static, assets
  Scroll,     // scripts, LICENSE
  Hammer,     // Makefile
  Gem,        // Gemfile
} from "lucide-react"
// Animated icons
import { HomeIcon, RefreshCwIcon, EyeIcon, EyeOffIcon, ExpandIcon, ChevronDownIcon } from "../../../components/icons"
import { useFilesContext } from "../../contexts/FilesContext"
import { getClaudeFileType, claudeFileColors, ClaudeFileType, getScriptInfo } from "../../utils/claudeFileTypes"
import { FileTreeContextMenu } from "./FileTreeContextMenu"
import { sendMessage } from "../../../shared/messaging"

interface FileNode {
  name: string
  path: string
  type: "file" | "directory"
  size?: number
  modified?: string
  children?: FileNode[]
  isObsidianVault?: boolean  // True if this folder contains .obsidian
}

interface FileTreeProps {
  onFileSelect?: (path: string) => void
  basePath?: string
  showHidden?: boolean
  maxDepth?: number
  waitForLoad?: boolean  // Don't fetch until this becomes false
}

const API_BASE = "http://localhost:8129"

export function FileTree({ onFileSelect, basePath = "~", showHidden: showHiddenProp = false, maxDepth = 5, waitForLoad = false }: FileTreeProps) {
  // Use context for caching file tree across tab switches
  const { fileTree, setFileTree, fileTreePath, setFileTreePath, toggleFavorite, isFavorite, openFile, pinFile } = useFilesContext()

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const treeContainerRef = useRef<HTMLDivElement>(null)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    node: FileNode | null
  }>({ show: false, x: 0, y: 0, node: null })
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [folderFilter, setFolderFilter] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [currentPath, setCurrentPath] = useState(basePath)
  const [showHidden, setShowHidden] = useState(showHiddenProp)
  // Track which basePath we initialized with (not just boolean)
  const [initializedWithPath, setInitializedWithPath] = useState<string | null>(null)

  // Sync currentPath when basePath changes (after working directory loads)
  // Re-run when basePath changes to a real project path
  useEffect(() => {
    if (waitForLoad) {
      return // Still waiting for working directory to load
    }

    const isBasePathHome = basePath === "~" || basePath === "/home/matt"
    const wasInitializedWithHome = initializedWithPath === "~" || initializedWithPath === "/home/matt"

    // Case 1: First initialization
    if (initializedWithPath === null) {
      setCurrentPath(basePath)
      setInitializedWithPath(basePath)
      return
    }

    // Case 2: basePath changed from home to a real project - update!
    if (wasInitializedWithHome && !isBasePathHome && basePath !== initializedWithPath) {
      setCurrentPath(basePath)
      setInitializedWithPath(basePath)
      // Clear cached tree since we're switching to a new project
      if (fileTree && fileTreePath && !fileTreePath.startsWith(basePath)) {
        setFileTree(null)
        setFileTreePath(null)
      }
      return
    }

    // Case 3: basePath changed to a different project
    if (!isBasePathHome && basePath !== initializedWithPath) {
      setCurrentPath(basePath)
      setInitializedWithPath(basePath)
      return
    }
  }, [basePath, waitForLoad, initializedWithPath, fileTree, fileTreePath, setFileTree, setFileTreePath])

  // Fetch file tree (with caching via context)
  const fetchFileTree = useCallback(async (path?: string, forceRefresh = false) => {
    const targetPath = path || currentPath

    // Don't use cache if target is home directory - always fetch fresh
    // This prevents stale ~ cache from blocking real project loads
    const isTargetHome = targetPath === "~" || targetPath === "/home/matt"

    // Use cached tree if available and path matches what we want
    if (!forceRefresh && !isTargetHome && fileTree && fileTree.path) {
      // Strict matching: cached tree must be for the same path (expanded)
      const targetMatchesCached =
        fileTree.path === targetPath ||  // Exact match (both expanded paths)
        fileTreePath === targetPath      // Request path matches stored path

      if (targetMatchesCached) {
        // Just expand root if needed
        if (expandedFolders.size === 0) {
          setExpandedFolders(new Set([fileTree.path]))
        }
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${API_BASE}/api/files/tree?${new URLSearchParams({
          path: targetPath,
          depth: maxDepth.toString(),
          showHidden: showHidden.toString(),
        })}`
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to load file tree")
      }

      const data = await response.json()
      setFileTree(data)
      // Store the API's resolved path (expanded ~) for consistent comparisons
      setFileTreePath(data.path)

      // Expand root folder
      if (data) {
        setExpandedFolders(new Set([data.path]))
      }
    } catch (err: any) {
      setError(err.message || "Failed to load files")
    } finally {
      setLoading(false)
    }
  }, [currentPath, showHidden, maxDepth, fileTree, fileTreePath, expandedFolders.size, setFileTree, setFileTreePath])

  // Fetch when basePath changes (from working directory) or settings change
  // Wait for working directory to load before fetching
  useEffect(() => {
    // Don't fetch if we're waiting for working dir to load
    if (waitForLoad) {
      return
    }
    // Don't fetch if currentPath is still "~" but basePath has a real project path
    // This prevents a race condition where fetch runs before currentPath syncs
    if (currentPath === "~" && basePath !== "~" && basePath !== "/home/matt") {
      return
    }
    fetchFileTree()
  }, [currentPath, showHidden, maxDepth, waitForLoad, basePath])

  // Get icon for Claude file types
  const getClaudeIcon = (claudeType: ClaudeFileType) => {
    switch (claudeType) {
      case 'claude-config': return Bot  // CLAUDE.md gets robot icon
      case 'prompt': return FileText
      case 'skill': return Zap
      case 'agent': return Bot
      case 'hook': return Terminal
      case 'mcp': return Plug
      case 'command': return FileCode
      case 'plugin': return FileJson
      // AI-relevant file types
      case 'obsidian-vault': return Brain
      case 'docker': return Container
      case 'gitignore': return GitBranch
      case 'env': return Lock
      case 'secrets': return Key
      // Developer tool folders
      case 'ai-tool': return Bot       // Other AI assistants like .codex, .copilot
      case 'git-folder': return GitBranch
      case 'github': return Github
      case 'vscode': return Code2
      case 'devcontainer': return Container
      case 'node-modules': return Library
      case 'docs': return BookOpen
      case 'source': return FolderCode
      case 'test': return FlaskConical
      case 'build': return Package
      case 'assets': return Globe
      case 'config': return Settings
      case 'scripts': return Scroll
      // Special files
      case 'readme': return BookOpen
      case 'license': return Scroll
      case 'makefile': return Hammer
      case 'package-json': return Package
      case 'typescript-config': return FileCode
      case 'go-mod': return FileCode
      case 'cargo': return FileCode
      case 'requirements': return FileText
      case 'gemfile': return Gem
      default: return null
    }
  }

  // Get file icon based on extension and Claude file type
  const getFileIcon = (fileName: string, filePath: string) => {
    // First check for Claude file types (they get priority coloring)
    const claudeType = getClaudeFileType(fileName, filePath)
    if (claudeType) {
      const ClaudeIcon = getClaudeIcon(claudeType)
      if (ClaudeIcon) {
        const colorClass = claudeFileColors[claudeType]?.tailwind || ''
        return <ClaudeIcon className={`w-4 h-4 ${colorClass}`} />
      }
    }

    // Fall back to extension-based icons
    const ext = fileName.split(".").pop()?.toLowerCase()
    const codeExts = ["js", "jsx", "ts", "tsx", "py", "java", "cpp", "c", "h", "css", "scss", "html", "vue", "rs", "go"]
    const docExts = ["md", "txt", "doc", "docx", "pdf", "rtf"]
    const imageExts = ["png", "jpg", "jpeg", "gif", "svg", "ico", "webp", "bmp"]
    const jsonExts = ["json", "jsonc", "json5"]
    const videoExts = ["mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv", "m4v"]
    const audioExts = ["mp3", "wav", "flac", "aac", "m4a", "wma"]

    if (codeExts.includes(ext || "")) return <FileCode className="w-4 h-4 text-green-400" />
    if (docExts.includes(ext || "")) return <FileText className="w-4 h-4 text-blue-400" />
    if (imageExts.includes(ext || "")) return <Image className="w-4 h-4 text-yellow-400" />
    if (jsonExts.includes(ext || "")) return <FileJson className="w-4 h-4 text-orange-400" />
    if (videoExts.includes(ext || "")) return <Video className="w-4 h-4 text-purple-400" />
    if (audioExts.includes(ext || "")) return <Music className="w-4 h-4 text-pink-400" />
    if (ext === "csv") return <Table className="w-4 h-4 text-emerald-400" />
    return <File className="w-4 h-4" />
  }

  // Get folder icon with Claude coloring
  const getFolderIcon = (folderName: string, folderPath: string, isExpanded: boolean, isObsidianVault?: boolean) => {
    // Obsidian vault gets brain icon (folder containing .obsidian)
    if (isObsidianVault) {
      return <Brain className="w-4 h-4 text-violet-400" />
    }

    const claudeType = getClaudeFileType(folderName, folderPath)
    if (claudeType) {
      const colorClass = claudeFileColors[claudeType]?.tailwind || 'text-yellow-400'
      return isExpanded
        ? <FolderOpen className={`w-4 h-4 ${colorClass}`} />
        : <Folder className={`w-4 h-4 ${colorClass}`} />
    }
    // Default folder color
    return isExpanded
      ? <FolderOpen className="w-4 h-4 text-yellow-400" />
      : <Folder className="w-4 h-4 text-yellow-400" />
  }

  // Check if a folder or any of its descendant folders match the folder filter
  const hasFolderMatch = useCallback((node: FileNode, filter: string): boolean => {
    if (node.type !== "directory") return false
    const filterLower = filter.toLowerCase()
    if (node.name.toLowerCase().includes(filterLower)) return true
    return node.children?.some(child => hasFolderMatch(child, filter)) ?? false
  }, [])

  // Filter nodes based on search (file search) and folder filter
  const filterNodes = useCallback((node: FileNode, inMatchingFolder = false): FileNode | null => {
    const hasSearchQuery = searchQuery.length > 0
    const hasFolderFilter = folderFilter.length > 0

    // No filters active - return node as-is
    if (!hasSearchQuery && !hasFolderFilter) return node

    const matchesSearch = node.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesFolderFilter = node.name.toLowerCase().includes(folderFilter.toLowerCase())

    if (node.type === "file") {
      // If folder filter is active and we're not inside a matching folder subtree, hide the file
      if (hasFolderFilter && !inMatchingFolder) {
        return null
      }
      // Files: filtered by searchQuery
      if (hasSearchQuery) {
        return matchesSearch ? node : null
      }
      return node
    }

    // Directory handling
    // If this folder matches the filter, all its contents should be visible
    const thisMatches = matchesFolderFilter
    const descendantMatches = hasFolderFilter && hasFolderMatch(node, folderFilter)
    const showContents = inMatchingFolder || thisMatches

    // Filter children, passing down whether we're in a matching folder
    const filteredChildren = node.children
      ?.map(child => filterNodes(child, showContents))
      .filter(Boolean) as FileNode[] | undefined

    const hasVisibleChildren = filteredChildren && filteredChildren.length > 0

    // If folder filter is active: show folder if it matches, has matching descendants, or has visible children
    if (hasFolderFilter && !thisMatches && !descendantMatches && !hasVisibleChildren) {
      return null
    }

    // If search query is active (no folder filter), use original logic
    if (hasSearchQuery && !hasFolderFilter && !matchesSearch && !hasVisibleChildren) {
      return null
    }

    // Folder should be shown
    return { ...node, children: filteredChildren }
  }, [searchQuery, folderFilter, hasFolderMatch])

  const filteredTree = useMemo(() => {
    if (!fileTree) return null
    return filterNodes(fileTree)
  }, [fileTree, filterNodes])

  // Toggle folder expansion
  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }, [])

  // Handle node click
  const handleNodeClick = useCallback((node: FileNode) => {
    if (node.type === "directory") {
      toggleFolder(node.path)
      setSelectedPath(node.path)
    } else {
      setSelectedPath(node.path)
      onFileSelect?.(node.path)
    }
  }, [onFileSelect, toggleFolder])

  // Navigate up
  const navigateUp = useCallback(() => {
    const parentPath = currentPath.split("/").slice(0, -1).join("/") || "/"
    setCurrentPath(parentPath)
    fetchFileTree(parentPath, true)
  }, [currentPath, fetchFileTree])

  // Navigate home
  const navigateHome = useCallback(() => {
    setCurrentPath(basePath)
    fetchFileTree(basePath, true)
  }, [basePath, fetchFileTree])

  // Collapse all
  const collapseAll = useCallback(() => {
    if (fileTree) {
      setExpandedFolders(new Set([fileTree.path]))
    }
  }, [fileTree])

  // Expand all - collect all folder paths recursively
  const expandAll = useCallback(() => {
    const collectFolders = (node: FileNode): string[] => {
      const paths: string[] = []
      if (node.type === 'directory') {
        paths.push(node.path)
        if (node.children) {
          node.children.forEach(child => {
            paths.push(...collectFolders(child))
          })
        }
      }
      return paths
    }

    // Use filtered tree if search is active, otherwise full tree
    const treeToExpand = filteredTree || fileTree
    if (treeToExpand) {
      const allFolders = collectFolders(treeToExpand)
      setExpandedFolders(new Set(allFolders))
    }
  }, [filteredTree, fileTree])

  // Flatten visible items for keyboard navigation (respects expanded folders)
  const visibleItems = useMemo(() => {
    const items: FileNode[] = []
    const collectVisible = (node: FileNode) => {
      items.push(node)
      if (node.type === 'directory' && expandedFolders.has(node.path) && node.children) {
        node.children.forEach(collectVisible)
      }
    }
    const treeToUse = filteredTree || fileTree
    if (treeToUse) {
      collectVisible(treeToUse)
    }
    return items
  }, [filteredTree, fileTree, expandedFolders])

  // Keyboard navigation handler
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (visibleItems.length === 0) return

    const currentIndex = focusedPath
      ? visibleItems.findIndex(item => item.path === focusedPath)
      : -1

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const nextIndex = currentIndex < visibleItems.length - 1 ? currentIndex + 1 : 0
        setFocusedPath(visibleItems[nextIndex].path)
        setSelectedPath(visibleItems[nextIndex].path)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : visibleItems.length - 1
        setFocusedPath(visibleItems[prevIndex].path)
        setSelectedPath(visibleItems[prevIndex].path)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        if (currentIndex >= 0) {
          const currentItem = visibleItems[currentIndex]
          if (currentItem.type === 'directory' && !expandedFolders.has(currentItem.path)) {
            toggleFolder(currentItem.path)
          }
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (currentIndex >= 0) {
          const currentItem = visibleItems[currentIndex]
          if (currentItem.type === 'directory' && expandedFolders.has(currentItem.path)) {
            toggleFolder(currentItem.path)
          }
        }
        break
      }
      case 'Enter': {
        e.preventDefault()
        if (currentIndex >= 0) {
          const currentItem = visibleItems[currentIndex]
          handleNodeClick(currentItem)
        }
        break
      }
      case 'Home': {
        e.preventDefault()
        if (visibleItems.length > 0) {
          setFocusedPath(visibleItems[0].path)
          setSelectedPath(visibleItems[0].path)
        }
        break
      }
      case 'End': {
        e.preventDefault()
        if (visibleItems.length > 0) {
          const lastItem = visibleItems[visibleItems.length - 1]
          setFocusedPath(lastItem.path)
          setSelectedPath(lastItem.path)
        }
        break
      }
    }
  }, [visibleItems, focusedPath, expandedFolders, toggleFolder, handleNodeClick])

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ show: true, x: e.clientX, y: e.clientY, node })
    setSelectedPath(node.path)
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, show: false }))
  }, [])

  const handleCopyPath = useCallback(() => {
    if (contextMenu.node) {
      navigator.clipboard.writeText(contextMenu.node.path)
    }
  }, [contextMenu.node])

  const handleCopyAtPath = useCallback(() => {
    if (contextMenu.node) {
      navigator.clipboard.writeText(`@${contextMenu.node.path}`)
    }
  }, [contextMenu.node])

  const handlePin = useCallback(() => {
    if (contextMenu.node && contextMenu.node.type === 'file') {
      openFile(contextMenu.node.path, true) // Open as pinned
    }
  }, [contextMenu.node, openFile])

  const handleOpenInEditor = useCallback(() => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    const dir = contextMenu.node.path.split('/').slice(0, -1).join('/')
    const fileName = contextMenu.node.name

    // Use sendMessage helper to spawn terminal with editor (has error handling)
    sendMessage({
      type: 'SPAWN_TERMINAL',
      name: `Edit: ${fileName}`,
      command: `\${EDITOR:-nano} "${contextMenu.node.path}"`,
      workingDir: dir,
    })
  }, [contextMenu.node])

  // State for audio loading
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)

  // Audio file extensions
  const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'webm', 'flac', 'aac']

  // Check if file is an audio file
  const isAudioFile = (fileName: string): boolean => {
    const ext = fileName.split('.').pop()?.toLowerCase() || ''
    return AUDIO_EXTENSIONS.includes(ext)
  }

  // Helper to fetch file content
  const fetchFileContent = useCallback(async (path: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/files/content?path=${encodeURIComponent(path)}`)
      const data = await res.json()
      return data.content || null
    } catch {
      return null
    }
  }, [])

  // Send file content to chat
  const handleSendToChat = useCallback(async () => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    const content = await fetchFileContent(contextMenu.node.path)
    if (content) {
      chrome.runtime?.sendMessage({
        type: 'QUEUE_COMMAND',
        command: content,
      })
    }
  }, [contextMenu.node, fetchFileContent])

  // Paste file content to terminal
  const handlePasteToTerminal = useCallback(async () => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    const content = await fetchFileContent(contextMenu.node.path)
    if (content) {
      chrome.runtime?.sendMessage({
        type: 'PASTE_COMMAND',
        command: content,
      })
    }
  }, [contextMenu.node, fetchFileContent])

  // Play audio file directly
  const handlePlayAudio = useCallback(async () => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    if (!isAudioFile(contextMenu.node.name)) return

    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
    }

    setIsPlayingAudio(true)

    try {
      // Get audio settings for volume
      const result = await chrome.storage.local.get(['audioSettings'])
      const audioSettings = (result.audioSettings || {}) as { soundEffectsVolume?: number }
      const volume = audioSettings.soundEffectsVolume ?? 0.4

      // Build URL for local file
      const audioUrl = `${API_BASE}/api/audio/local-file?path=${encodeURIComponent(contextMenu.node.path)}`

      const audio = new Audio(audioUrl)
      audio.volume = volume
      currentAudioRef.current = audio

      audio.onended = () => {
        setIsPlayingAudio(false)
        currentAudioRef.current = null
      }
      audio.onerror = (e) => {
        console.error('Failed to play audio:', e)
        setIsPlayingAudio(false)
        currentAudioRef.current = null
      }

      await audio.play()
    } catch (err) {
      console.error('Failed to play audio:', err)
      setIsPlayingAudio(false)
    }
  }, [contextMenu.node])

  // Stop currently playing audio
  const handleStopAudio = useCallback(() => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current = null
      setIsPlayingAudio(false)
    }
  }, [])

  // Read file aloud
  const handleReadAloud = useCallback(async () => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    setIsLoadingAudio(true)

    try {
      const content = await fetchFileContent(contextMenu.node.path)
      if (!content) {
        setIsLoadingAudio(false)
        return
      }

      // Load audio settings
      const result = await chrome.storage.local.get(['audioSettings'])
      const audioSettings = (result.audioSettings || {}) as {
        voice?: string
        rate?: string
        pitch?: string
        volume?: number
        contentReading?: { useGlobal: boolean; voice?: string; rate?: string; pitch?: string }
      }

      const TTS_VOICE_VALUES = [
        'en-US-AndrewNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural',
        'en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-ChristopherNeural', 'en-US-AvaNeural',
        'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-AU-NatashaNeural', 'en-AU-WilliamNeural'
      ]

      // Check if contentReading has custom settings
      const useContentReading = audioSettings.contentReading && !audioSettings.contentReading.useGlobal

      let voice = useContentReading && audioSettings.contentReading?.voice
        ? audioSettings.contentReading.voice
        : (audioSettings.voice || 'en-US-AndrewNeural')
      if (voice === 'random') {
        voice = TTS_VOICE_VALUES[Math.floor(Math.random() * TTS_VOICE_VALUES.length)]
      }

      const rate = useContentReading && audioSettings.contentReading?.rate
        ? audioSettings.contentReading.rate
        : (audioSettings.rate || '+0%')
      const pitch = useContentReading && audioSettings.contentReading?.pitch
        ? audioSettings.contentReading.pitch
        : (audioSettings.pitch || '+0Hz')
      const volume = audioSettings.volume ?? 0.7

      // Use speak endpoint for playback
      await fetch(`${API_BASE}/api/audio/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: content, voice, rate, pitch, volume })
      })
    } catch (err) {
      console.error('Failed to read aloud:', err)
    } finally {
      setIsLoadingAudio(false)
    }
  }, [contextMenu.node, fetchFileContent])

  // Set folder as working directory
  const handleSetWorkingDir = useCallback(() => {
    if (!contextMenu.node || contextMenu.node.type !== 'directory') return
    setCurrentPath(contextMenu.node.path)
    fetchFileTree(contextMenu.node.path, true)
  }, [contextMenu.node, fetchFileTree])

  // Script actions - Run script in new terminal
  const handleRunScript = useCallback(() => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    const scriptInfo = getScriptInfo(contextMenu.node.name, contextMenu.node.path)
    if (!scriptInfo) return

    const dir = contextMenu.node.path.substring(0, contextMenu.node.path.lastIndexOf('/'))
    sendMessage({
      type: 'SPAWN_TERMINAL',
      name: `Run: ${contextMenu.node.name}`,
      command: scriptInfo.runCommand,
      workingDir: dir,
    })
  }, [contextMenu.node])

  // Script actions - Syntax check / dry run
  const handleCheckScript = useCallback(() => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    const scriptInfo = getScriptInfo(contextMenu.node.name, contextMenu.node.path)
    if (!scriptInfo?.syntaxCheckCommand) return

    const dir = contextMenu.node.path.substring(0, contextMenu.node.path.lastIndexOf('/'))
    sendMessage({
      type: 'SPAWN_TERMINAL',
      name: `Check: ${contextMenu.node.name}`,
      command: scriptInfo.syntaxCheckCommand,
      workingDir: dir,
    })
  }, [contextMenu.node])

  // Script actions - Explain script with Claude
  const [isExplaining, setIsExplaining] = useState(false)
  const [explainResult, setExplainResult] = useState<string | null>(null)

  const handleExplainScript = useCallback(async () => {
    if (!contextMenu.node || contextMenu.node.type !== 'file') return
    setIsExplaining(true)
    setExplainResult(null)

    try {
      const res = await fetch(`${API_BASE}/api/ai/explain-script`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: contextMenu.node.path })
      })
      const data = await res.json()
      if (data.success) {
        setExplainResult(data.explanation)

        // Read the explanation aloud using content reading settings
        try {
          const result = await chrome.storage.local.get(['audioSettings'])
          const audioSettings = (result.audioSettings || {}) as {
            enabled?: boolean
            voice?: string
            rate?: string
            pitch?: string
            volume?: number
            contentReading?: { useGlobal: boolean; voice?: string; rate?: string; pitch?: string }
          }

          // Only speak if audio is enabled
          if (audioSettings.enabled) {
            const TTS_VOICE_VALUES = [
              'en-US-AndrewNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural',
              'en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-ChristopherNeural', 'en-US-AvaNeural',
              'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-AU-NatashaNeural', 'en-AU-WilliamNeural'
            ]

            const useContentReading = audioSettings.contentReading && !audioSettings.contentReading.useGlobal

            let voice = useContentReading && audioSettings.contentReading?.voice
              ? audioSettings.contentReading.voice
              : (audioSettings.voice || 'en-US-AndrewNeural')
            if (voice === 'random') {
              voice = TTS_VOICE_VALUES[Math.floor(Math.random() * TTS_VOICE_VALUES.length)]
            }

            const rate = useContentReading && audioSettings.contentReading?.rate
              ? audioSettings.contentReading.rate
              : (audioSettings.rate || '+0%')
            const pitch = useContentReading && audioSettings.contentReading?.pitch
              ? audioSettings.contentReading.pitch
              : (audioSettings.pitch || '+0Hz')

            await fetch(`${API_BASE}/api/audio/speak`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: data.explanation,
                voice,
                rate,
                pitch,
                volume: audioSettings.volume ?? 0.7,
                priority: 'high'
              })
            })
          }
        } catch (ttsErr) {
          console.error('Failed to read explanation aloud:', ttsErr)
        }
      } else {
        setExplainResult(`Error: ${data.error}`)
      }
    } catch (err: any) {
      setExplainResult(`Error: ${err.message}`)
    } finally {
      setIsExplaining(false)
    }
  }, [contextMenu.node])

  // Get script info for context menu node
  const contextMenuScriptInfo = contextMenu.node?.type === 'file'
    ? getScriptInfo(contextMenu.node.name, contextMenu.node.path)
    : null

  // Render file tree recursively
  const renderFileTree = useCallback((node: FileNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path)
    const isSelected = selectedPath === node.path
    const isFocused = focusedPath === node.path
    const isDirectory = node.type === "directory"
    const isNodeFavorite = isFavorite(node.path)

    // Check if this is a Claude file for text coloring
    // Note: 'prompt' type excluded - prompty files have pink icon but white text
    const claudeType = getClaudeFileType(node.name, node.path)
    const textColorClass = (claudeType && claudeType !== 'prompt') ? claudeFileColors[claudeType]?.tailwind : ''

    return (
      <div key={node.path}>
        <div
          className={`group flex items-center py-1 px-2 cursor-pointer hover:bg-muted/50 rounded ${
            isSelected ? "bg-primary/20 text-primary" : ""
          } ${isFocused ? "ring-2 ring-primary/50 ring-inset" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            setFocusedPath(node.path)
            handleNodeClick(node)
          }}
          onContextMenu={(e) => handleContextMenu(e, node)}
          title={node.path}
        >
          <span className="w-4 h-4 flex items-center justify-center mr-1 text-muted-foreground">
            {isDirectory && (isExpanded ? <ChevronDownIcon size={12} /> : <ChevronRight className="w-3 h-3" />)}
          </span>
          <span className="mr-2">
            {isDirectory ? (
              getFolderIcon(node.name, node.path, isExpanded, node.isObsidianVault)
            ) : (
              getFileIcon(node.name, node.path)
            )}
          </span>
          <span className={`text-sm truncate flex-1 ${isDirectory ? "font-medium" : ""} ${textColorClass}`}>
            {node.name}
          </span>
          {/* Favorite star - visible on hover or if favorited */}
          <button
            className={`p-0.5 rounded hover:bg-muted/50 ${isNodeFavorite ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}
            onClick={(e) => {
              e.stopPropagation()
              toggleFavorite(node.path)
            }}
            title={isNodeFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Star
              className={`w-3 h-3 ${isNodeFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
            />
          </button>
        </div>
        {isDirectory && isExpanded && node.children && (
          <div>{node.children.map((child) => renderFileTree(child, depth + 1))}</div>
        )}
      </div>
    )
  }, [expandedFolders, selectedPath, focusedPath, handleNodeClick, handleContextMenu, isFavorite, toggleFavorite])

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-semibold text-sm">Files</h3>
        <div className="flex gap-1">
          <button onClick={navigateHome} className="p-1.5 hover:bg-muted rounded" title="Home">
            <HomeIcon size={16} />
          </button>
          <button onClick={navigateUp} className="p-1.5 hover:bg-muted rounded text-lg font-bold" title="Up">
            ↑
          </button>
          <button onClick={() => fetchFileTree(undefined, true)} className="p-1.5 hover:bg-muted rounded" title="Refresh">
            <RefreshCwIcon size={16} />
          </button>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`p-1.5 hover:bg-muted rounded ${showHidden ? "text-yellow-400" : ""}`}
            title={showHidden ? "Hide hidden files" : "Show hidden files"}
          >
            {showHidden ? <EyeIcon size={16} /> : <EyeOffIcon size={16} />}
          </button>
          <button onClick={expandAll} className="p-1.5 hover:bg-muted rounded" title="Expand all">
            <ExpandIcon size={16} />
          </button>
          <button onClick={collapseAll} className="p-1.5 hover:bg-muted rounded" title="Collapse all">
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Folder Filter */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Folder className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Filter folders..."
          value={folderFilter}
          onChange={(e) => setFolderFilter(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none"
        />
        {folderFilter && (
          <button onClick={() => setFolderFilter("")} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        )}
      </div>

      {/* File Search */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Search className="w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none"
        />
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        )}
      </div>

      {/* Tree */}
      <div
        ref={treeContainerRef}
        className="flex-1 overflow-auto p-2 outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="tree"
        aria-label="File tree"
      >
        {loading && <div className="text-center text-muted-foreground py-4">Loading...</div>}
        {error && <div className="text-center text-red-400 py-4">{error}</div>}
        {!loading && !error && filteredTree && renderFileTree(filteredTree)}
      </div>

      {/* Context Menu */}
      <FileTreeContextMenu
        show={contextMenu.show}
        x={contextMenu.x}
        y={contextMenu.y}
        node={contextMenu.node}
        isFavorite={contextMenu.node ? isFavorite(contextMenu.node.path) : false}
        onClose={closeContextMenu}
        onCopy={handleCopyPath}
        onCopyAtPath={handleCopyAtPath}
        onToggleFavorite={() => contextMenu.node && toggleFavorite(contextMenu.node.path)}
        onPin={handlePin}
        onOpenInEditor={handleOpenInEditor}
        onSendToChat={handleSendToChat}
        onPasteToTerminal={handlePasteToTerminal}
        onReadAloud={handleReadAloud}
        isLoadingAudio={isLoadingAudio}
        onSetWorkingDir={handleSetWorkingDir}
        // Audio playback for audio files
        isAudioFile={contextMenu.node ? isAudioFile(contextMenu.node.name) : false}
        onPlayAudio={handlePlayAudio}
        onStopAudio={handleStopAudio}
        isPlayingAudio={isPlayingAudio}
        // Script actions
        scriptInfo={contextMenuScriptInfo}
        onRunScript={handleRunScript}
        onCheckScript={handleCheckScript}
        onExplainScript={handleExplainScript}
        isExplaining={isExplaining}
        explainResult={explainResult}
        onClearExplainResult={() => setExplainResult(null)}
      />
    </div>
  )
}
