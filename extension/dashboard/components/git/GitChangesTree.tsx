import React, { useState } from 'react'
import { File, FilePlus, FileMinus, FileEdit, FileQuestion, ChevronDown, ChevronRight, Plus, Minus, Undo2 } from 'lucide-react'
import { GitFile } from '../../../hooks/useGitRepos'

interface GitChangesTreeProps {
  staged: GitFile[]
  unstaged: GitFile[]
  untracked: GitFile[]
  onStage?: (files: string[]) => void
  onUnstage?: (files: string[]) => void
  onDiscard?: (files: string[]) => void
  onDiscardAll?: () => void
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
  onDiscard?: (files: string[]) => void
  onDiscardAll?: () => void
  showDiscard?: boolean
  loading?: boolean
  discardLoading?: boolean
}

function FileList({
  files,
  title,
  titleColor,
  actionIcon: ActionIcon,
  actionLabel,
  onAction,
  onDiscard,
  onDiscardAll,
  showDiscard,
  loading,
  discardLoading
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

        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Discard all button */}
          {showDiscard && onDiscardAll && (
            <button
              onClick={(e) => { e.stopPropagation(); onDiscardAll() }}
              disabled={discardLoading}
              className="p-1 hover:bg-red-500/20 rounded text-red-400 disabled:opacity-50"
              title="Discard all changes"
            >
              <Undo2 className="w-3 h-3" />
            </button>
          )}

          {/* Stage/Unstage all button */}
          {onAction && ActionIcon && (
            <button
              onClick={(e) => { e.stopPropagation(); onAction(files.map(f => f.path)) }}
              disabled={loading}
              className="p-1 hover:bg-muted rounded disabled:opacity-50"
              title={actionLabel}
            >
              <ActionIcon className="w-3 h-3" />
            </button>
          )}
        </div>
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

              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {/* Individual discard */}
                {showDiscard && onDiscard && (
                  <button
                    onClick={() => onDiscard([file.path])}
                    disabled={discardLoading}
                    className="p-0.5 hover:bg-red-500/20 rounded text-red-400 disabled:opacity-50"
                    title="Discard changes"
                  >
                    <Undo2 className="w-3 h-3" />
                  </button>
                )}

                {/* Individual stage/unstage */}
                {onAction && ActionIcon && (
                  <button
                    onClick={() => onAction([file.path])}
                    disabled={loading}
                    className="p-0.5 hover:bg-muted rounded disabled:opacity-50"
                    title={actionLabel}
                  >
                    <ActionIcon className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function GitChangesTree({ staged, unstaged, untracked, onStage, onUnstage, onDiscard, onDiscardAll, loading }: GitChangesTreeProps) {
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
        onDiscard={onDiscard}
        onDiscardAll={onDiscardAll}
        showDiscard={true}
        loading={loading === 'stage'}
        discardLoading={loading === 'discard'}
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
