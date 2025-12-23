import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  FileText,
  Image,
  FileJson,
  FileCode,
  Home,
  Minimize2,
  Maximize2,
  Video,
  Table,
  Settings,
  Zap,
  Bot,
  Terminal,
  Plug,
  // New icons for AI-relevant files
  Container,  // Docker
  GitBranch,  // .gitignore
  Lock,       // .env files
  Key,        // secrets
  Brain,      // Obsidian (using Brain as closest match)
  Star,       // Favorites
} from "lucide-react"
import { useFilesContext } from "../../contexts/FilesContext"
import { getClaudeFileType, claudeFileColors, ClaudeFileType } from "../../utils/claudeFileTypes"
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
      case 'claude-config': return Settings
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

    if (codeExts.includes(ext || "")) return <FileCode className="w-4 h-4 text-green-400" />
    if (docExts.includes(ext || "")) return <FileText className="w-4 h-4 text-blue-400" />
    if (imageExts.includes(ext || "")) return <Image className="w-4 h-4 text-yellow-400" />
    if (jsonExts.includes(ext || "")) return <FileJson className="w-4 h-4 text-orange-400" />
    if (videoExts.includes(ext || "")) return <Video className="w-4 h-4 text-purple-400" />
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

  // Filter nodes based on search
  const filterNodes = useCallback((node: FileNode): FileNode | null => {
    if (!searchQuery) return node

    const matches = node.name.toLowerCase().includes(searchQuery.toLowerCase())

    if (node.type === "file") {
      return matches ? node : null
    }

    const filteredChildren = node.children?.map(filterNodes).filter(Boolean) as FileNode[] | undefined

    if (matches || (filteredChildren && filteredChildren.length > 0)) {
      return { ...node, children: filteredChildren }
    }

    return null
  }, [searchQuery])

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

  // Render file tree recursively
  const renderFileTree = useCallback((node: FileNode, depth = 0): React.ReactNode => {
    const isExpanded = expandedFolders.has(node.path)
    const isSelected = selectedPath === node.path
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
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleNodeClick(node)}
          onContextMenu={(e) => handleContextMenu(e, node)}
          title={node.path}
        >
          <span className="w-4 h-4 flex items-center justify-center mr-1 text-muted-foreground">
            {isDirectory && (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
          </span>
          <span className="mr-2">
            {isDirectory ? (
              getFolderIcon(node.name, node.path, isExpanded, node.isObsidianVault)
            ) : (
              getFileIcon(node.name, node.path)
            )}
          </span>
          <span className={`text-sm truncate flex-1 ${isDirectory ? "font-medium" : ""} ${textColorClass}`}>{node.name}</span>
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
  }, [expandedFolders, selectedPath, handleNodeClick, handleContextMenu, isFavorite, toggleFavorite])

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-semibold text-sm">Files</h3>
        <div className="flex gap-1">
          <button onClick={navigateHome} className="p-1.5 hover:bg-muted rounded" title="Home">
            <Home className="w-4 h-4" />
          </button>
          <button onClick={navigateUp} className="p-1.5 hover:bg-muted rounded text-lg font-bold" title="Up">
            ↑
          </button>
          <button onClick={() => fetchFileTree(undefined, true)} className="p-1.5 hover:bg-muted rounded" title="Refresh">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowHidden(!showHidden)}
            className={`p-1.5 hover:bg-muted rounded ${showHidden ? "text-yellow-400" : ""}`}
            title={showHidden ? "Hide hidden" : "Show hidden"}
          >
            {showHidden ? "👁️" : "🙈"}
          </button>
          <button onClick={expandAll} className="p-1.5 hover:bg-muted rounded" title="Expand all">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button onClick={collapseAll} className="p-1.5 hover:bg-muted rounded" title="Collapse all">
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Path */}
      <div className="px-3 py-2 text-xs text-muted-foreground border-b border-border truncate">
        {currentPath}
      </div>

      {/* Search */}
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
      <div className="flex-1 overflow-auto p-2">
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
      />
    </div>
  )
}
