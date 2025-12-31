import React, { useState, useEffect } from 'react'
import { GitCommit as GitCommitIcon, ExternalLink, ChevronDown, ChevronRight, Loader2, MoreHorizontal } from 'lucide-react'
import { GitCommit } from '../../../hooks/useGitRepos'

interface GitCommitHistoryProps {
  repoName: string
  githubUrl: string | null
  limit?: number
}

export function GitCommitHistory({ repoName, githubUrl, limit = 10 }: GitCommitHistoryProps) {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)
  const [expandedCommits, setExpandedCommits] = useState<Set<string>>(new Set())
  const [currentLimit, setCurrentLimit] = useState(limit)
  const [hasMore, setHasMore] = useState(true)

  // Only fetch on initial load or repo change, not when loading more
  useEffect(() => {
    async function fetchCommits() {
      setLoading(true)
      try {
        const res = await fetch(`http://localhost:8129/api/git/repos/${encodeURIComponent(repoName)}/log?limit=${limit}`)
        const data = await res.json()
        if (data.success) {
          setCommits(data.data.commits)
          setCurrentLimit(limit)
          setHasMore(data.data.commits.length === limit)
        } else {
          setError(data.error)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load commits')
      } finally {
        setLoading(false)
      }
    }
    fetchCommits()
  }, [repoName, limit])

  const loadMore = async () => {
    setLoadingMore(true)
    const newLimit = currentLimit + 20
    try {
      const res = await fetch(`http://localhost:8129/api/git/repos/${encodeURIComponent(repoName)}/log?limit=${newLimit}`)
      const data = await res.json()
      if (data.success) {
        setCommits(data.data.commits)
        setCurrentLimit(newLimit)
        setHasMore(data.data.commits.length === newLimit)
      }
    } catch {
      // Silently fail load more
    } finally {
      setLoadingMore(false)
    }
  }

  const toggleCommitExpanded = (hash: string) => {
    setExpandedCommits(prev => {
      const next = new Set(prev)
      if (next.has(hash)) {
        next.delete(hash)
      } else {
        next.add(hash)
      }
      return next
    })
  }

  const getCommitUrl = (hash: string) => {
    if (!githubUrl) return null
    return `${githubUrl}/commit/${hash}`
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
    return date.toLocaleDateString()
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium mb-2 hover:bg-muted/50 px-1 py-0.5 rounded"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <GitCommitIcon className="w-3 h-3" />
        Commits
        <span className="text-muted-foreground">({commits.length}{hasMore ? '+' : ''})</span>
      </button>

      {expanded && (
        <div className="ml-4 space-y-0.5">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading commits...
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 py-1">{error}</div>
          )}

          {!loading && !error && commits.map(commit => {
            const commitUrl = getCommitUrl(commit.hash)
            const isExpanded = expandedCommits.has(commit.hash)
            const hasBody = commit.body && commit.body.trim()

            return (
              <div key={commit.hash} className="text-xs group">
                <div
                  className={`flex items-start gap-2 py-1 ${hasBody ? 'cursor-pointer hover:bg-muted/30 rounded px-1 -mx-1' : ''}`}
                  onClick={hasBody ? () => toggleCommitExpanded(commit.hash) : undefined}
                >
                  {/* Expand indicator for commits with body */}
                  <span className="w-3 shrink-0">
                    {hasBody && (
                      isExpanded ?
                        <ChevronDown className="w-3 h-3 text-muted-foreground" /> :
                        <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                  </span>

                  <code className="font-mono text-primary shrink-0">
                    {commitUrl ? (
                      <a
                        href={commitUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {commit.shortHash}
                        <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
                      </a>
                    ) : (
                      commit.shortHash
                    )}
                  </code>
                  <span className={`flex-1 text-foreground ${isExpanded ? '' : 'truncate'}`}>
                    {commit.message}
                  </span>
                  <span className="text-muted-foreground shrink-0">{formatDate(commit.date)}</span>
                </div>

                {/* Expanded body */}
                {isExpanded && hasBody && (
                  <div className="ml-6 pl-2 border-l border-border mt-1 mb-2">
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                      {commit.body}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}

          {/* Load more button */}
          {!loading && !error && hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground py-2 px-1 disabled:opacity-50"
            >
              {loadingMore ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <MoreHorizontal className="w-3 h-3" />
              )}
              Load more commits
            </button>
          )}
        </div>
      )}
    </div>
  )
}
