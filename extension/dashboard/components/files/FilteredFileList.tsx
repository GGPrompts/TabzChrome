import React, { useState, useCallback, useMemo } from 'react'
import {
  ChevronRight,
  ChevronDown,
  File,
  FileText,
  FileCode,
  Folder,
  FolderOpen,
  Zap,
  Bot,
  Terminal,
  Plug,
  FileJson,
  Star,
  Search,
  Minimize2,
} from 'lucide-react'
// Animated icons
import { RefreshCwIcon, ExpandIcon } from '../../../components/icons'
import { FileFilter, ClaudeFileType, claudeFileColors, getClaudeFileType } from '../../utils/claudeFileTypes'
import { FileTreeContextMenu } from './FileTreeContextMenu'
import { useFilesContext } from '../../contexts/FilesContext'
import { sendMessage } from '../../../shared/messaging'

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
}

interface FilteredFileListProps {
  filter: FileFilter
  filteredFiles: FilteredFilesResponse | null
  loading: boolean
  onFileSelect: (path: string) => void
  onQuickOpen?: () => void
  onRefresh?: () => void
}

// Get icon for Claude file types
function getClaudeIcon(claudeType: ClaudeFileType) {
  switch (claudeType) {
    case 'claude-config': return Bot  // CLAUDE.md gets robot icon
    case 'prompt': return FileText
    case 'skill': return Zap
    case 'agent': return Bot
    case 'hook': return Terminal
    case 'mcp': return Plug
    case 'command': return FileCode
    case 'plugin': return FileJson
    default: return null
  }
}

// Get file icon based on name and path
function getFileIcon(fileName: string, filePath: string) {
  const ext = fileName.split('.').pop()?.toLowerCase()

  // Extension-based icons first (more variety)
  const codeExts = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'css', 'scss', 'html', 'vue', 'rs', 'go', 'sh']
  const jsonExts = ['json', 'jsonc', 'json5']
  const yamlExts = ['yaml', 'yml']

  if (ext === 'prompty') return <FileText className="w-4 h-4 text-pink-400" />
  if (ext === 'md') return <FileText className="w-4 h-4 text-blue-400" />
  if (ext === 'txt') return <FileText className="w-4 h-4 text-gray-400" />
  if (yamlExts.includes(ext || '')) return <FileJson className="w-4 h-4 text-amber-400" />
  if (jsonExts.includes(ext || '')) return <FileJson className="w-4 h-4 text-orange-400" />
  if (codeExts.includes(ext || '')) return <FileCode className="w-4 h-4 text-green-400" />

  // Check Claude file types for special files (CLAUDE.md, .mcp.json, etc.)
  const claudeType = getClaudeFileType(fileName, filePath)
  if (claudeType && claudeType !== 'prompt') {
    const ClaudeIcon = getClaudeIcon(claudeType)
    if (ClaudeIcon) {
      const colorClass = claudeFileColors[claudeType]?.tailwind || ''
      return <ClaudeIcon className={`w-4 h-4 ${colorClass}`} />
    }
  }

  return <File className="w-4 h-4" />
}

// Get folder icon - always yellow for simplicity
function getFolderIcon(folderName: string, folderPath: string, isExpanded: boolean) {
  // Special folders get their Claude colors
  const claudeType = getClaudeFileType(folderName, folderPath)
  if (claudeType && ['skill', 'agent', 'hook', 'command', 'mcp', 'claude-config'].includes(claudeType)) {
    const colorClass = claudeFileColors[claudeType]?.tailwind || 'text-yellow-400'
    return isExpanded
      ? <FolderOpen className={`w-4 h-4 ${colorClass}`} />
      : <Folder className={`w-4 h-4 ${colorClass}`} />
  }
  // Default yellow for regular folders (including prompt folders)
  return isExpanded
    ? <FolderOpen className="w-4 h-4 text-yellow-400" />
    : <Folder className="w-4 h-4 text-yellow-400" />
}

// Get text color for files (extension-based)
function getTextColorClass(name: string, path: string, isDirectory: boolean): string {
  if (isDirectory) return '' // Folders use default text color

  const ext = name.split('.').pop()?.toLowerCase()
  // prompty files: pink icon but white text (no color class)
  if (ext === 'prompty') return ''
  if (ext === 'md') return 'text-blue-400'
  if (ext === 'yaml' || ext === 'yml') return 'text-amber-400'
  if (ext === 'json') return 'text-orange-400'

  // Check Claude types for special files
  const claudeType = getClaudeFileType(name, path)
  if (claudeType && claudeType !== 'prompt') {
    return claudeFileColors[claudeType]?.tailwind || ''
  }
  return ''
}

// Mini tree component for rendering a source tree
function MiniTree({
  node,
  depth,
  expandedPaths,
  toggleExpand,
  onFileSelect,
  selectedPath,
  onContextMenu,
  isFavorite,
  toggleFavorite,
}: {
  node: TreeNode
  depth: number
  expandedPaths: Set<string>
  toggleExpand: (path: string) => void
  onFileSelect: (path: string) => void
  selectedPath: string | null
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  isFavorite: (path: string) => boolean
  toggleFavorite: (path: string) => void
}) {
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = selectedPath === node.path
  const isDirectory = node.type === 'directory'
  const textColorClass = getTextColorClass(node.name, node.path, isDirectory)
  const isNodeFavorite = isFavorite(node.path)

  return (
    <div>
      <div
        className={`group flex items-center py-1 px-2 cursor-pointer hover:bg-muted/50 rounded ${
          isSelected ? 'bg-primary/20 text-primary' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isDirectory) {
            toggleExpand(node.path)
          } else {
            onFileSelect(node.path)
          }
        }}
        onContextMenu={(e) => onContextMenu(e, node)}
        title={node.path}
      >
        <span className="w-4 h-4 flex items-center justify-center mr-1 text-muted-foreground">
          {isDirectory && (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
        </span>
        <span className="mr-2">
          {isDirectory
            ? getFolderIcon(node.name, node.path, isExpanded)
            : getFileIcon(node.name, node.path)}
        </span>
        <span className={`text-sm truncate flex-1 ${isDirectory ? 'font-medium' : ''} ${textColorClass}`}>
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
        <div>
          {node.children.map((child) => (
            <MiniTree
              key={child.path}
              node={child}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              onContextMenu={onContextMenu}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Collapsible section for each source
function TreeSection({
  source,
  onFileSelect,
  selectedPath,
  startCollapsed = false,
  onContextMenu,
  isFavorite,
  toggleFavorite,
  expandAllTrigger,
  collapseAllTrigger,
}: {
  source: FilteredTree
  onFileSelect: (path: string) => void
  selectedPath: string | null
  startCollapsed?: boolean
  onContextMenu: (e: React.MouseEvent, node: TreeNode) => void
  isFavorite: (path: string) => boolean
  toggleFavorite: (path: string) => void
  expandAllTrigger?: number
  collapseAllTrigger?: number
}) {
  const [isCollapsed, setIsCollapsed] = useState(startCollapsed)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    // Start collapsed for favorites, expanded for other filters
    return startCollapsed ? new Set() : new Set([source.tree.path])
  })

  // Collect all folder paths recursively
  const collectAllFolderPaths = useCallback((node: TreeNode): string[] => {
    const paths: string[] = []
    if (node.type === 'directory') {
      paths.push(node.path)
      if (node.children) {
        node.children.forEach(child => {
          paths.push(...collectAllFolderPaths(child))
        })
      }
    }
    return paths
  }, [])

  // Handle expand all trigger from parent
  React.useEffect(() => {
    if (expandAllTrigger && expandAllTrigger > 0) {
      setIsCollapsed(false)
      const allPaths = collectAllFolderPaths(source.tree)
      setExpandedPaths(new Set(allPaths))
    }
  }, [expandAllTrigger, source.tree, collectAllFolderPaths])

  // Handle collapse all trigger from parent
  React.useEffect(() => {
    if (collapseAllTrigger && collapseAllTrigger > 0) {
      setExpandedPaths(new Set([source.tree.path]))
    }
  }, [collapseAllTrigger, source.tree.path])

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  return (
    <div className="mb-2">
      {/* Section header */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/30 rounded-md bg-muted/10"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <span className="text-muted-foreground">
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </span>
        {source.icon && <span>{source.icon}</span>}
        <span className="text-sm font-medium">{source.name}</span>
      </div>

      {/* Tree content */}
      {!isCollapsed && (
        <div className="mt-1">
          {source.tree.children?.map((child) => (
            <MiniTree
              key={child.path}
              node={child}
              depth={0}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              onContextMenu={onContextMenu}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          ))}
          {/* If root has no children but is a file itself */}
          {!source.tree.children && source.tree.type === 'file' && (
            <MiniTree
              node={source.tree}
              depth={0}
              expandedPaths={expandedPaths}
              toggleExpand={toggleExpand}
              onFileSelect={onFileSelect}
              selectedPath={selectedPath}
              onContextMenu={onContextMenu}
              isFavorite={isFavorite}
              toggleFavorite={toggleFavorite}
            />
          )}
        </div>
      )}
    </div>
  )
}

export function FilteredFileList({ filter, filteredFiles, loading, onFileSelect, onQuickOpen, onRefresh }: FilteredFileListProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { toggleFavorite, isFavorite, openFile, pinFile } = useFilesContext()

  // Expand/collapse all triggers (increment to trigger effect in children)
  const [expandAllTrigger, setExpandAllTrigger] = useState(0)
  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0)

  const handleExpandAll = useCallback(() => {
    setExpandAllTrigger(prev => prev + 1)
  }, [])

  const handleCollapseAll = useCallback(() => {
    setCollapseAllTrigger(prev => prev + 1)
  }, [])

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    node: TreeNode | null
  }>({ show: false, x: 0, y: 0, node: null })

  // Filter tree nodes based on search query
  const filterTreeNode = useCallback((node: TreeNode, query: string): TreeNode | null => {
    if (!query) return node

    const queryLower = query.toLowerCase()
    const nameMatches = node.name.toLowerCase().includes(queryLower)

    if (node.type === 'file') {
      return nameMatches ? node : null
    }

    // Directory: filter children and include if any match or name matches
    const filteredChildren = node.children
      ?.map(child => filterTreeNode(child, query))
      .filter((child): child is TreeNode => child !== null)

    if (nameMatches || (filteredChildren && filteredChildren.length > 0)) {
      return { ...node, children: filteredChildren }
    }

    return null
  }, [])

  // Apply search filter to all trees
  const filteredTrees = useMemo(() => {
    if (!filteredFiles?.trees || !searchQuery) return filteredFiles?.trees || []

    return filteredFiles.trees
      .map(source => {
        const filteredTree = filterTreeNode(source.tree, searchQuery)
        if (!filteredTree) return null
        return { ...source, tree: filteredTree }
      })
      .filter((source): source is FilteredTree => source !== null)
  }, [filteredFiles?.trees, searchQuery, filterTreeNode])

  const handleFileSelect = (path: string) => {
    setSelectedPath(path)
    onFileSelect(path)
  }

  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
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

    sendMessage({
      type: 'SPAWN_TERMINAL',
      name: `Edit: ${fileName}`,
      command: `\${EDITOR:-nano} "${contextMenu.node.path}"`,
      workingDir: dir,
    })
  }, [contextMenu.node])

  // State for audio loading
  const [isLoadingAudio, setIsLoadingAudio] = useState(false)

  const API_BASE = "http://localhost:8129"

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

  if (loading) {
    return (
      <div className="flex flex-col h-full bg-card rounded-lg border border-border">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="font-semibold text-sm capitalize">{filter} Files</h3>
          <div className="flex gap-1">
            {onQuickOpen && (
              <button onClick={onQuickOpen} className="p-1.5 hover:bg-muted rounded" title="Quick Open (Ctrl+P)">
                <Search className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      </div>
    )
  }

  // Handle new tree-based response
  const trees = filteredFiles?.trees || []

  // Also handle legacy groups format for backwards compatibility (favorites)
  const groups = (filteredFiles as any)?.groups || []

  if (trees.length === 0 && groups.length === 0) {
    return (
      <div className="flex flex-col h-full bg-card rounded-lg border border-border">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="font-semibold text-sm capitalize">{filter} Files</h3>
          <div className="flex gap-1">
            {onQuickOpen && (
              <button onClick={onQuickOpen} className="p-1.5 hover:bg-muted rounded" title="Quick Open (Ctrl+P)">
                <Search className="w-4 h-4" />
              </button>
            )}
            {onRefresh && (
              <button onClick={onRefresh} className="p-1.5 hover:bg-muted rounded" title="Refresh">
                <RefreshCwIcon size={16} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-4 text-center">
          <div>
            <p>No {filter} files found</p>
            <p className="text-xs mt-1">
              {filter === 'prompts' && 'Create .prompty files in ~/.prompts/ or .prompts/'}
              {filter === 'claude' && 'No Claude config files in this project'}
              {filter === 'favorites' && 'Star files to add them to favorites'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-card rounded-lg border border-border">
      {/* Header with Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="font-semibold text-sm capitalize">{filter} Files</h3>
        <div className="flex gap-1">
          {onQuickOpen && (
            <button onClick={onQuickOpen} className="p-1.5 hover:bg-muted rounded" title="Quick Open (Ctrl+P)">
              <Search className="w-4 h-4" />
            </button>
          )}
          {onRefresh && (
            <button onClick={onRefresh} className="p-1.5 hover:bg-muted rounded" title="Refresh">
              <RefreshCwIcon size={16} />
            </button>
          )}
          <button onClick={handleExpandAll} className="p-1.5 hover:bg-muted rounded" title="Expand all">
            <ExpandIcon size={16} />
          </button>
          <button onClick={handleCollapseAll} className="p-1.5 hover:bg-muted rounded" title="Collapse all">
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>
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
          <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
            ×
          </button>
        )}
      </div>

      {/* Tree sections */}
      <div className="flex-1 overflow-auto p-2">
        {filteredTrees.map((source) => (
          <TreeSection
            key={source.basePath}
            source={source}
            onFileSelect={handleFileSelect}
            selectedPath={selectedPath}
            startCollapsed={filter === 'favorites'}
            onContextMenu={handleContextMenu}
            isFavorite={isFavorite}
            toggleFavorite={toggleFavorite}
            expandAllTrigger={expandAllTrigger}
            collapseAllTrigger={collapseAllTrigger}
          />
        ))}

        {/* Legacy groups format for favorites */}
        {groups.length > 0 && groups.map((group: any) => (
          <div key={group.name} className="mb-4">
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {group.icon && <span>{group.icon}</span>}
              <span>{group.name}</span>
              <span className="text-muted-foreground/50">({group.files?.length || 0})</span>
            </div>
            <div className="mt-1">
              {group.files?.map((file: any) => (
                <div
                  key={file.path}
                  onClick={() => handleFileSelect(file.path)}
                  onContextMenu={(e) => handleContextMenu(e, { name: file.name, path: file.path, type: 'file' })}
                  className={`flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50 rounded ${
                    selectedPath === file.path ? 'bg-primary/20 text-primary' : ''
                  }`}
                  title={file.path}
                >
                  {getFileIcon(file.name, file.path)}
                  <span className="text-sm truncate">{file.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
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
      />
    </div>
  )
}
