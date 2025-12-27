import React, { useState, useEffect } from 'react'
import { GitCommit as GitCommitIcon, ExternalLink, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { GitCommit } from '../../../hooks/useGitRepos'

interface GitCommitHistoryProps {
  repoName: string
  githubUrl: string | null
  limit?: number
}

export function GitCommitHistory({ repoName, githubUrl, limit = 5 }: GitCommitHistoryProps) {
  const [commits, setCommits] = useState<GitCommit[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    async function fetchCommits() {
      setLoading(true)
      try {
        const res = await fetch(`http://localhost:8129/api/git/repos/${encodeURIComponent(repoName)}/log?limit=${limit}`)
        const data = await res.json()
        if (data.success) {
          setCommits(data.data.commits)
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

  const getCommitUrl = (hash: string) => {
    if (!githubUrl) return null
    return `${githubUrl}/commit/${hash}`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'today'
    if (diffDays === 1) return 'yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
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
        Recent Commits
      </button>

      {expanded && (
        <div className="ml-4 space-y-1">
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
            return (
              <div key={commit.hash} className="flex items-start gap-2 text-xs py-1 group">
                <code className="font-mono text-primary shrink-0">
                  {commitUrl ? (
                    <a
                      href={commitUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      {commit.shortHash}
                      <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
                    </a>
                  ) : (
                    commit.shortHash
                  )}
                </code>
                <span className="truncate flex-1 text-foreground">{commit.message}</span>
                <span className="text-muted-foreground shrink-0">{formatDate(commit.date)}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
