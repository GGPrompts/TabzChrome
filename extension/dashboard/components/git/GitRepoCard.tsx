import React, { useRef, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Star, GitBranch, ExternalLink, AlertCircle, FolderTree } from 'lucide-react'
import { GitRepo } from '../../../hooks/useGitRepos'
import { useGitOperations } from '../../../hooks/useGitOperations'
import { GitStatusBadge } from './GitStatusBadge'
import { GitQuickActions } from './GitQuickActions'
import { GitChangesTree } from './GitChangesTree'
import { GitCommitForm } from './GitCommitForm'
import { GitCommitHistory } from './GitCommitHistory'

interface GitRepoCardProps {
  repo: GitRepo
  isActive: boolean
  onToggleActive: () => void
  isExpanded: boolean
  onToggleExpand: () => void
  onRefresh: () => void
  isFocused?: boolean
  isSelected?: boolean
  onToggleSelect?: () => void
}

export function GitRepoCard({ repo, isActive, onToggleActive, isExpanded, onToggleExpand, onRefresh, isFocused = false, isSelected = false, onToggleSelect }: GitRepoCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const hasChanges = repo.staged.length > 0 || repo.unstaged.length > 0 || repo.untracked.length > 0
  const [stashCount, setStashCount] = useState(0)

  // Fetch stash count when expanded
  useEffect(() => {
    if (isExpanded) {
      window.fetch(`http://localhost:8129/api/git/repos/${encodeURIComponent(repo.name)}/stashes`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setStashCount(data.data.stashes.length)
          }
        })
        .catch(() => {})
    }
  }, [isExpanded, repo.name])

  // Scroll into view when expanded
  useEffect(() => {
    if (isExpanded && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isExpanded])

  // Scroll into view when focused via keyboard
  useEffect(() => {
    if (isFocused && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isFocused])

  const {
    loading,
    error,
    stageFiles,
    unstageFiles,
    commit,
    push,
    pull,
    fetch,
    openLazygit,
    openGitlogueCommit,
    generateMessage,
    discardFiles,
    discardAll,
    stash,
    stashPop,
    clearError
  } = useGitOperations(repo.name)

  // Handlers that refresh after operation
  const handleStage = async (files: string[]) => {
    await stageFiles(files)
    onRefresh()
  }

  const handleUnstage = async (files: string[]) => {
    await unstageFiles(files)
    onRefresh()
  }

  const handleStageAll = async () => {
    await stageFiles(['.'])
    onRefresh()
  }

  const handleCommit = async (message: string) => {
    await commit(message)
    onRefresh()
  }

  const handlePush = async () => {
    await push()
    onRefresh()
  }

  const handlePull = async () => {
    await pull()
    onRefresh()
  }

  const handleFetch = async () => {
    await fetch()
    onRefresh()
  }

  const handleOpenLazygit = async () => {
    await openLazygit(repo.path)
  }

  const handleOpenGitlogueCommit = async (commitHash: string) => {
    await openGitlogueCommit(repo.path, commitHash)
  }

  const handleDiscard = async (files: string[]) => {
    await discardFiles(files)
    onRefresh()
  }

  const handleDiscardAll = async () => {
    await discardAll()
    onRefresh()
  }

  const refreshStashCount = async () => {
    try {
      const res = await window.fetch(`http://localhost:8129/api/git/repos/${encodeURIComponent(repo.name)}/stashes`)
      const data = await res.json()
      if (data.success) {
        setStashCount(data.data.stashes.length)
      }
    } catch {}
  }

  const handleStash = async () => {
    await stash()
    await refreshStashCount()
    onRefresh()
  }

  const handleStashPop = async () => {
    await stashPop()
    await refreshStashCount()
    onRefresh()
  }

  return (
    <div
      ref={cardRef}
      className={`border border-border rounded-lg overflow-hidden transition-all ${
        hasChanges ? 'border-l-2 border-l-yellow-500' : ''
      } ${isFocused ? 'ring-2 ring-primary/50 ring-offset-1 ring-offset-background' : ''}`}
    >
      {/* Header - always visible */}
      <div
        className="flex items-center gap-3 p-3 bg-card/50 hover:bg-muted/50 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Selection checkbox */}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => { e.stopPropagation(); onToggleSelect() }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary/50 focus:ring-offset-0 cursor-pointer"
          />
        )}

        {/* Expand chevron */}
        <button className="p-0.5 hover:bg-muted rounded">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </button>

        {/* Star/active toggle */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleActive() }}
          className="p-0.5 hover:bg-muted rounded"
          title={isActive ? 'Remove from active' : 'Mark as active'}
        >
          <Star className={`w-4 h-4 ${isActive ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`} />
        </button>

        {/* Repo name */}
        <span className="font-medium font-mono">{repo.name}</span>

        {/* Branch */}
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <GitBranch className="w-3 h-3" />
          {repo.branch}
        </span>

        {/* Status badge */}
        <div className="ml-auto">
          <GitStatusBadge
            staged={repo.staged.length}
            unstaged={repo.unstaged.length}
            untracked={repo.untracked.length}
            ahead={repo.ahead}
            behind={repo.behind}
          />
        </div>

        {/* Quick GitHub link */}
        {repo.githubUrl && (
          <a
            href={repo.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
            title="Open on GitHub"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-4 border-t border-border bg-background/50 space-y-4">
          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button
                onClick={clearError}
                className="text-xs hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Quick actions */}
          <GitQuickActions
            githubUrl={repo.githubUrl}
            repoPath={repo.path}
            ahead={repo.ahead}
            behind={repo.behind}
            hasChanges={hasChanges}
            stashCount={stashCount}
            onPush={handlePush}
            onPull={handlePull}
            onFetch={handleFetch}
            onOpenLazygit={handleOpenLazygit}
            onStash={handleStash}
            onStashPop={handleStashPop}
            loading={loading}
          />

          {/* Worktrees section */}
          {repo.worktrees && repo.worktrees.length > 0 && (
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
                <FolderTree className="w-4 h-4" />
                Worktrees ({repo.worktrees.length})
              </div>
              <div className="space-y-1.5 ml-6">
                {repo.worktrees.map((wt, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-3 h-3 text-muted-foreground" />
                    <span className={`font-mono ${wt.branch === repo.branch ? 'text-primary font-medium' : 'text-foreground'}`}>
                      {wt.branch || (wt.detached ? 'detached' : 'unknown')}
                    </span>
                    <span className="text-muted-foreground text-xs truncate flex-1" title={wt.path}>
                      {wt.path}
                    </span>
                    {wt.githubUrl && (
                      <a
                        href={wt.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                        title={`View ${wt.branch} on GitHub`}
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* File changes tree */}
          <div className="border-t border-border pt-4">
            <GitChangesTree
              staged={repo.staged}
              unstaged={repo.unstaged}
              untracked={repo.untracked}
              onStage={handleStage}
              onUnstage={handleUnstage}
              onDiscard={handleDiscard}
              onDiscardAll={handleDiscardAll}
              loading={loading}
            />
          </div>

          {/* Commit form - only show if there are changes */}
          {hasChanges && (
            <div className="border-t border-border pt-4">
              <GitCommitForm
                onCommit={handleCommit}
                onStageAll={handleStageAll}
                onGenerateMessage={generateMessage}
                hasUnstaged={repo.unstaged.length > 0 || repo.untracked.length > 0}
                hasStaged={repo.staged.length > 0}
                loading={loading}
              />
            </div>
          )}

          {/* Commit history */}
          <div className="border-t border-border pt-4">
            <GitCommitHistory
              repoName={repo.name}
              githubUrl={repo.githubUrl}
              limit={10}
              onOpenGitlogue={handleOpenGitlogueCommit}
              loading={loading}
            />
          </div>

          {/* Path info */}
          <div className="border-t border-border pt-3 text-xs text-muted-foreground space-y-1">
            <p>Path: {repo.path}</p>
            {repo.lastActivity && (
              <p>Last activity: {new Date(repo.lastActivity).toLocaleDateString()}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
