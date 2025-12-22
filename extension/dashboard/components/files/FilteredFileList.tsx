import React from 'react'
import { File, FileText, FileCode, Settings, Zap, Bot, Terminal, Plug, Package, FileJson } from 'lucide-react'
import { FileFilter, ClaudeFileType, claudeFileColors } from '../../utils/claudeFileTypes'

interface FilteredFile {
  name: string
  path: string
  type: ClaudeFileType
}

// Get relative path from a base (e.g., ~/.claude/ or project root)
function getDisplayPath(filePath: string): string {
  // Extract meaningful relative path
  const parts = filePath.split('/')

  // For files in .claude/, show path from .claude/
  const claudeIdx = parts.indexOf('.claude')
  if (claudeIdx !== -1 && claudeIdx < parts.length - 1) {
    return parts.slice(claudeIdx + 1).join('/')
  }

  // For files in plugins/, show path from plugins/
  const pluginsIdx = parts.indexOf('plugins')
  if (pluginsIdx !== -1 && pluginsIdx < parts.length - 1) {
    return parts.slice(pluginsIdx + 1).join('/')
  }

  // For files in .prompts/, show path from .prompts/
  const promptsIdx = parts.indexOf('.prompts')
  if (promptsIdx !== -1 && promptsIdx < parts.length - 1) {
    return parts.slice(promptsIdx + 1).join('/')
  }

  // Otherwise just show the filename
  return parts[parts.length - 1]
}

interface FilteredGroup {
  name: string
  icon?: string
  files: FilteredFile[]
}

interface FilteredFilesResponse {
  groups: FilteredGroup[]
}

interface FilteredFileListProps {
  filter: FileFilter
  filteredFiles: FilteredFilesResponse | null
  loading: boolean
  onFileSelect: (path: string) => void
}

// Get icon for Claude file type
function getFileTypeIcon(type: ClaudeFileType, fileName: string) {
  // For plugin files, differentiate by filename
  if (type === 'plugin') {
    if (fileName === 'plugin.json') return Package
    if (fileName.endsWith('.json')) return FileJson
    if (fileName.endsWith('.md')) return FileText
    if (fileName.endsWith('.sh')) return Terminal
    return File
  }

  switch (type) {
    case 'claude-config': return Settings
    case 'prompt': return FileText
    case 'skill': return Zap
    case 'agent': return Bot
    case 'hook': return Terminal
    case 'mcp': return Plug
    case 'command': return FileCode
    default: return File
  }
}

// Get color class for Claude file type
function getFileTypeColorClass(type: ClaudeFileType): string {
  if (!type) return ''
  return claudeFileColors[type]?.tailwind || ''
}

export function FilteredFileList({ filter, filteredFiles, loading, onFileSelect }: FilteredFileListProps) {
  if (loading) {
    return (
      <div className="flex flex-col h-full bg-card rounded-lg border border-border">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold text-sm capitalize">{filter} Files</h3>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      </div>
    )
  }

  if (!filteredFiles || filteredFiles.groups.length === 0) {
    return (
      <div className="flex flex-col h-full bg-card rounded-lg border border-border">
        <div className="p-3 border-b border-border">
          <h3 className="font-semibold text-sm capitalize">{filter} Files</h3>
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
      {/* Header */}
      <div className="p-3 border-b border-border">
        <h3 className="font-semibold text-sm capitalize">{filter} Files</h3>
      </div>

      {/* Grouped file list */}
      <div className="flex-1 overflow-auto p-2">
        {filteredFiles.groups.map((group) => (
          <div key={group.name} className="mb-4">
            {/* Group header */}
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">
              {group.icon && <span>{group.icon}</span>}
              <span>{group.name}</span>
              <span className="text-muted-foreground/50">({group.files.length})</span>
            </div>

            {/* Files in group */}
            <div className="mt-1">
              {group.files.map((file) => {
                const Icon = getFileTypeIcon(file.type, file.name)
                const colorClass = getFileTypeColorClass(file.type)
                const displayPath = getDisplayPath(file.path)

                return (
                  <div
                    key={file.path}
                    onClick={() => onFileSelect(file.path)}
                    className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-muted/50 rounded"
                    title={file.path}
                  >
                    <Icon className={`w-4 h-4 flex-shrink-0 ${colorClass}`} />
                    <span className={`text-sm truncate ${colorClass}`}>{displayPath}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
