import { useState, useCallback } from 'react'

export type BulkOperationType = 'fetch' | 'pull' | 'push'

export interface BulkOperationResult {
  repoName: string
  success: boolean
  error?: string
}

export interface BulkOperationProgress {
  operation: BulkOperationType
  total: number
  completed: number
  results: BulkOperationResult[]
}

async function getAuthToken(): Promise<string> {
  const res = await fetch('http://localhost:8129/api/auth/token')
  if (res.ok) {
    const data = await res.json()
    return data.token
  }
  throw new Error('Failed to get auth token')
}

async function gitOperation(repo: string, operation: string): Promise<{ success: boolean; error?: string }> {
  const token = await getAuthToken()
  const res = await fetch(`http://localhost:8129/api/git/repos/${encodeURIComponent(repo)}/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token
    },
    body: '{}'
  })
  return res.json()
}

export function useBulkGitOperations() {
  const [progress, setProgress] = useState<BulkOperationProgress | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  const runBulkOperation = useCallback(async (
    repoNames: string[],
    operation: BulkOperationType,
    onComplete?: () => void
  ) => {
    if (repoNames.length === 0) return

    setIsRunning(true)
    setProgress({
      operation,
      total: repoNames.length,
      completed: 0,
      results: []
    })

    const results: BulkOperationResult[] = []

    // Run operations in parallel with concurrency limit
    const concurrency = 3
    const chunks: string[][] = []
    for (let i = 0; i < repoNames.length; i += concurrency) {
      chunks.push(repoNames.slice(i, i + concurrency))
    }

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(async (repoName) => {
          try {
            const result = await gitOperation(repoName, operation)
            return {
              repoName,
              success: result.success,
              error: result.error
            }
          } catch (err) {
            return {
              repoName,
              success: false,
              error: err instanceof Error ? err.message : 'Unknown error'
            }
          }
        })
      )

      results.push(...chunkResults)
      setProgress(prev => prev ? {
        ...prev,
        completed: results.length,
        results: [...results]
      } : null)
    }

    setIsRunning(false)

    // Keep progress visible briefly so user can see final results
    setTimeout(() => {
      onComplete?.()
    }, 500)

    return results
  }, [])

  const clearProgress = useCallback(() => {
    setProgress(null)
  }, [])

  return {
    progress,
    isRunning,
    runBulkOperation,
    clearProgress
  }
}
