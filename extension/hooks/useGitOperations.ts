import { useState, useCallback } from 'react'

interface OperationResult {
  success: boolean
  message?: string
  error?: string
  output?: string
}

async function getAuthToken(): Promise<string> {
  // Read from backend - the token is stored at /tmp/tabz-auth-token
  const res = await fetch('http://localhost:8129/api/auth/token')
  if (res.ok) {
    const data = await res.json()
    return data.token
  }
  throw new Error('Failed to get auth token')
}

async function gitOperation(repo: string, operation: string, body?: object): Promise<OperationResult> {
  const token = await getAuthToken()
  const res = await fetch(`http://localhost:8129/api/git/repos/${encodeURIComponent(repo)}/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token
    },
    body: body ? JSON.stringify(body) : undefined
  })
  return res.json()
}

export function useGitOperations(repoName: string) {
  const [loading, setLoading] = useState<string | null>(null) // which operation is loading
  const [error, setError] = useState<string | null>(null)

  const stageFiles = useCallback(async (files: string[] = ['.']) => {
    setLoading('stage')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'stage', { files })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stage failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  const unstageFiles = useCallback(async (files: string[]) => {
    setLoading('unstage')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'unstage', { files })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unstage failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  const commit = useCallback(async (message: string) => {
    setLoading('commit')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'commit', { message })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Commit failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  const push = useCallback(async () => {
    setLoading('push')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'push', {})
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Push failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  const pull = useCallback(async () => {
    setLoading('pull')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'pull', {})
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Pull failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  const fetch = useCallback(async () => {
    setLoading('fetch')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'fetch', {})
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fetch failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Spawn terminal with gitlogue or git log
  const openGitlogue = useCallback(async (repoPath: string) => {
    setLoading('gitlogue')
    setError(null)
    try {
      const token = await getAuthToken()
      const res = await window.fetch('http://localhost:8129/api/spawn', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Auth-Token': token
        },
        body: JSON.stringify({
          name: `gitlogue: ${repoName}`,
          workingDir: repoPath,
          command: `gitlogue -p "${repoPath}" --order desc --speed 7 || git log --oneline --graph --all`
        })
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open gitlogue')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Generate commit message using AI (Claude CLI with Haiku)
  const generateMessage = useCallback(async (model: string = 'haiku'): Promise<string> => {
    setLoading('generate')
    setError(null)
    try {
      const token = await getAuthToken()
      const res = await window.fetch(
        `http://localhost:8129/api/git/repos/${encodeURIComponent(repoName)}/generate-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Auth-Token': token
          },
          body: JSON.stringify({ model })
        }
      )
      const result = await res.json()
      if (!result.success) throw new Error(result.error)
      return result.message
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate message'
      setError(message)
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Discard changes to files
  const discardFiles = useCallback(async (files: string[]) => {
    setLoading('discard')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'discard', { files })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discard failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Discard all unstaged changes
  const discardAll = useCallback(async () => {
    setLoading('discard')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'discard', { all: true })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discard all failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Stash changes
  const stash = useCallback(async (message?: string, includeUntracked?: boolean) => {
    setLoading('stash')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'stash', { message, includeUntracked })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stash failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Pop stash
  const stashPop = useCallback(async (ref?: string) => {
    setLoading('stash-pop')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'stash-pop', { ref })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stash pop failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Apply stash (without removing)
  const stashApply = useCallback(async (ref?: string) => {
    setLoading('stash-apply')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'stash-apply', { ref })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stash apply failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  // Drop stash
  const stashDrop = useCallback(async (ref?: string) => {
    setLoading('stash-drop')
    setError(null)
    try {
      const result = await gitOperation(repoName, 'stash-drop', { ref })
      if (!result.success) throw new Error(result.error)
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stash drop failed')
      throw err
    } finally {
      setLoading(null)
    }
  }, [repoName])

  return {
    loading,
    error,
    stageFiles,
    unstageFiles,
    commit,
    push,
    pull,
    fetch,
    openGitlogue,
    generateMessage,
    discardFiles,
    discardAll,
    stash,
    stashPop,
    stashApply,
    stashDrop,
    clearError: () => setError(null)
  }
}
