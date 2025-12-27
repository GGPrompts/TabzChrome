import React, { useState } from 'react'
import { File, FilePlus, FileMinus, FileEdit, FileQuestion, ChevronDown, ChevronRight, Plus, Minus } from 'lucide-react'
import { GitFile } from '../../../hooks/useGitRepos'

interface GitChangesTreeProps {
  staged: GitFile[]
  unstaged: GitFile[]
  untracked: GitFile[]
  onStage?: (files: string[]) => void
  onUnstage?: (files: string[]) => void
  loading?: string | null
}

function FileIcon({ status }: { status: string }) {
  switch (status) {
    case 'A': return <FilePlus className="w-4 h-4 text-green-400" />
    case 'D': return <FileMinus className="w-4 h-4 text-red-400" />
    case 'M': return <FileEdit className="w-4 h-4 text-yellow-400" />
    case '?': return <FileQuestion className="w-4 h-4 text-gray-400" />
    default: return <File className="w-4 h-4 text-muted-foreground" />
  }
}

interface FileListProps {
  files: GitFile[]
  title: string
  titleColor: string
  action?: 'stage' | 'unstage'
  actionIcon?: typeof Plus
  actionLabel?: string
  onAction?: (files: string[]) => void
  loading?: boolean
}

function FileList({
  files,
  title,
  titleColor,
  actionIcon: ActionIcon,
  actionLabel,
  onAction,
  loading
}: FileListProps) {
  const [expanded, setExpanded] = useState(true)

  if (files.length === 0) return null

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium mb-1 hover:bg-muted/50 px-1 py-0.5 rounded w-full text-left group"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className={titleColor}>{title}</span>
        <span className="text-muted-foreground">({files.length})</span>

        {/* Stage/Unstage all button */}
        {onAction && ActionIcon && (
          <button
            onClick={(e) => { e.stopPropagation(); onAction(files.map(f => f.path)) }}
            disabled={loading}
            className="ml-auto p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
            title={actionLabel}
          >
            <ActionIcon className="w-3 h-3" />
          </button>
        )}
      </button>

      {expanded && (
        <div className="ml-4 space-y-0.5">
          {files.map(file => (
            <div
              key={file.path}
              className="flex items-center gap-2 text-xs py-0.5 px-1 hover:bg-muted/30 rounded group"
            >
              <FileIcon status={file.status} />
              <span className="font-mono truncate flex-1">{file.path}</span>

              {/* Individual stage/unstage */}
              {onAction && ActionIcon && (
                <button
                  onClick={() => onAction([file.path])}
                  disabled={loading}
                  className="p-0.5 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  title={actionLabel}
                >
                  <ActionIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function GitChangesTree({ staged, unstaged, untracked, onStage, onUnstage, loading }: GitChangesTreeProps) {
  const totalChanges = staged.length + unstaged.length + untracked.length

  if (totalChanges === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        No changes
      </div>
    )
  }

  return (
    <div className="text-sm">
      <FileList
        files={staged}
        title="Staged Changes"
        titleColor="text-green-400"
        action="unstage"
        actionIcon={Minus}
        actionLabel="Unstage"
        onAction={onUnstage}
        loading={loading === 'unstage'}
      />
      <FileList
        files={unstaged}
        title="Changes"
        titleColor="text-yellow-400"
        action="stage"
        actionIcon={Plus}
        actionLabel="Stage"
        onAction={onStage}
        loading={loading === 'stage'}
      />
      <FileList
        files={untracked}
        title="Untracked"
        titleColor="text-gray-400"
        action="stage"
        actionIcon={Plus}
        actionLabel="Stage"
        onAction={onStage}
        loading={loading === 'stage'}
      />
    </div>
  )
}
