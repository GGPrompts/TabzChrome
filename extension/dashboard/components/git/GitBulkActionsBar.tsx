import React from 'react'
import { Download, Upload, RefreshCw, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { BulkOperationProgress, BulkOperationType } from '../../../hooks/useBulkGitOperations'

interface GitBulkActionsBarProps {
  selectedCount: number
  onFetchAll: () => void
  onPullAll: () => void
  onPushAll: () => void
  onClearSelection: () => void
  progress: BulkOperationProgress | null
  isRunning: boolean
}

const operationLabels: Record<BulkOperationType, string> = {
  fetch: 'Fetching',
  pull: 'Pulling',
  push: 'Pushing'
}

export function GitBulkActionsBar({
  selectedCount,
  onFetchAll,
  onPullAll,
  onPushAll,
  onClearSelection,
  progress,
  isRunning
}: GitBulkActionsBarProps) {
  const successCount = progress?.results.filter(r => r.success).length ?? 0
  const failedCount = progress?.results.filter(r => !r.success).length ?? 0
  const failedRepos = progress?.results.filter(r => !r.success) ?? []

  return (
    <div className="flex flex-col gap-2 p-3 border-b border-border bg-primary/5">
      {/* Actions row */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-primary">
          {selectedCount} repo{selectedCount !== 1 ? 's' : ''} selected
        </span>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onFetchAll}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Fetch from remote for all selected repos"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning && progress?.operation === 'fetch' ? 'animate-spin' : ''}`} />
            Fetch All
          </button>

          <button
            onClick={onPullAll}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Pull changes for all selected repos"
          >
            <Download className={`w-4 h-4 ${isRunning && progress?.operation === 'pull' ? 'animate-bounce' : ''}`} />
            Pull All
          </button>

          <button
            onClick={onPushAll}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-background border border-border rounded-lg hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Push changes for all selected repos"
          >
            <Upload className={`w-4 h-4 ${isRunning && progress?.operation === 'push' ? 'animate-bounce' : ''}`} />
            Push All
          </button>

          <button
            onClick={onClearSelection}
            disabled={isRunning}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg disabled:opacity-50 transition-colors"
            title="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Progress row */}
      {progress && (
        <div className="flex flex-col gap-2">
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : failedCount > 0 ? (
              <AlertCircle className="w-4 h-4 text-red-400" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            )}
            <span className="text-sm text-muted-foreground">
              {isRunning
                ? `${operationLabels[progress.operation]} ${progress.completed}/${progress.total}...`
                : `${operationLabels[progress.operation]} complete: ${successCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}`
              }
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  failedCount > 0 && !isRunning ? 'bg-yellow-500' : 'bg-primary'
                }`}
                style={{ width: `${(progress.completed / progress.total) * 100}%` }}
              />
            </div>
          </div>

          {/* Failed repos list */}
          {failedRepos.length > 0 && !isRunning && (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-red-400">Failed:</span>
              {failedRepos.map(r => (
                <span key={r.repoName} className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded" title={r.error}>
                  {r.repoName}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
