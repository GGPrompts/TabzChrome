import { useState, useEffect, useCallback } from 'react'

export interface GitFile {
  path: string
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?'
}

export interface GitCommit {
  hash: string
  shortHash: string
  message: string
  author: string
  email: string
  date: string
  refs: string[]
}

export interface GitRepo {
  name: string
  path: string
  branch: string
  tracking?: string
  ahead: number
  behind: number
  staged: GitFile[]
  unstaged: GitFile[]
  untracked: GitFile[]
  githubUrl: string | null
  lastActivity: string | null
  error?: string
}

export interface GitReposData {
  projectsDir: string
  repos: GitRepo[]
}

export function useGitRepos(projectsDir?: string) {
  const [data, setData] = useState<GitReposData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRepos = useCallback(async () => {
    // Don't fetch until we have a directory (wait for workingDir to load)
    if (projectsDir === undefined) {
      return
    }

    setLoading(true)
    setError(null)
    try {
      const url = `http://localhost:8129/api/git/repos?dir=${encodeURIComponent(projectsDir)}`
      const res = await fetch(url)
      const json = await res.json()
      if (json.success) {
        setData(json.data)
      } else {
        setError(json.error || 'Failed to fetch repos')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repos')
    } finally {
      setLoading(false)
    }
  }, [projectsDir])

  useEffect(() => {
    fetchRepos()
  }, [fetchRepos])

  return { data, loading, error, refetch: fetchRepos }
}
