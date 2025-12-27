import React from 'react'
import {
  ExternalLink,
  Terminal,
  Upload,
  Download,
  RefreshCw,
  Loader2,
  ArrowUp,
  ArrowDown
} from 'lucide-react'

interface GitQuickActionsProps {
  githubUrl: string | null
  repoPath: string
  ahead: number
  behind: number
  onPush: () => Promise<void>
  onPull: () => Promise<void>
  onFetch: () => Promise<void>
  onOpenGitlogue: () => Promise<void>
  loading?: string | null
}

export function GitQuickActions({
  githubUrl,
  ahead,
  behind,
  onPush,
  onPull,
  onFetch,
  onOpenGitlogue,
  loading
}: GitQuickActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* GitHub */}
      {githubUrl && (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          GitHub
        </a>
      )}

      {/* Gitlogue */}
      <button
        onClick={onOpenGitlogue}
        disabled={loading === 'gitlogue'}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading === 'gitlogue' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Terminal className="w-3.5 h-3.5" />
        )}
        Gitlogue
      </button>

      {/* Fetch */}
      <button
        onClick={onFetch}
        disabled={loading === 'fetch'}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading === 'fetch' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <RefreshCw className="w-3.5 h-3.5" />
        )}
        Fetch
      </button>

      {/* Pull */}
      <button
        onClick={onPull}
        disabled={loading === 'pull'}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-50"
      >
        {loading === 'pull' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        Pull
        {behind > 0 && (
          <span className="flex items-center gap-0.5 text-orange-400">
            <ArrowDown className="w-2.5 h-2.5" />
            {behind}
          </span>
        )}
      </button>

      {/* Push */}
      <button
        onClick={onPush}
        disabled={loading === 'push' || ahead === 0}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading === 'push' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        Push
        {ahead > 0 && (
          <span className="flex items-center gap-0.5 text-blue-400">
            <ArrowUp className="w-2.5 h-2.5" />
            {ahead}
          </span>
        )}
      </button>
    </div>
  )
}
