import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { GitBranch, RefreshCw, AlertCircle, Star, Search } from 'lucide-react'
import { useGitRepos } from '../../hooks/useGitRepos'
import { useGitVisibility } from '../../hooks/useGitVisibility'
import { useWorkingDirectory } from '../../hooks/useWorkingDirectory'
import { useBulkGitOperations } from '../../hooks/useBulkGitOperations'
import { GitFilterBar } from '../components/git/GitFilterBar'
import { GitRepoCard } from '../components/git/GitRepoCard'
import { GitBulkActionsBar } from '../components/git/GitBulkActionsBar'

// Loading skeleton component
function GitRepoSkeleton() {
  return (
    <div className="border border-border rounded-lg p-3 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-4 h-4 bg-muted rounded" />
        <div className="w-4 h-4 bg-muted rounded" />
        <div className="w-32 h-4 bg-muted rounded" />
        <div className="w-16 h-4 bg-muted rounded ml-2" />
        <div className="w-20 h-4 bg-muted rounded ml-auto" />
      </div>
    </div>
  )
}

export default function GitSection() {
  const { globalWorkingDir, isLoaded: workingDirLoaded } = useWorkingDirectory()
  const { data, loading, error, refetch } = useGitRepos(workingDirLoaded ? globalWorkingDir : undefined)
  const {
    searchQuery,
    showActiveOnly,
    sortBy,
    loaded: visibilityLoaded,
    toggleActive,
    isActive,
    setShowActiveOnly,
    setSortBy,
    setSearchQuery
  } = useGitVisibility()

  // Track which cards are expanded
  const [expandedRepos, setExpandedRepos] = useState<Set<string>>(new Set())

  // Track focused repo index for keyboard navigation
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  // Track selected repos for bulk operations
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())

  // Bulk operations
  const { progress, isRunning, runBulkOperation, clearProgress } = useBulkGitOperations()

  // Ref for the search input
  const searchInputRef = useRef<HTMLInputElement>(null)

  const toggleExpand = useCallback((repoName: string) => {
    setExpandedRepos(prev => {
      const next = new Set(prev)
      if (next.has(repoName)) {
        next.delete(repoName)
      } else {
        next.add(repoName)
      }
      return next
    })
  }, [])

  const toggleSelect = useCallback((repoName: string) => {
    setSelectedRepos(prev => {
      const next = new Set(prev)
      if (next.has(repoName)) {
        next.delete(repoName)
      } else {
        next.add(repoName)
      }
      return next
    })
  }, [])

  // Reset focused index when filtered repos change
  useEffect(() => {
    setFocusedIndex(-1)
  }, [searchQuery, showActiveOnly])

  // Filter and sort repos
  const filteredRepos = useMemo(() => {
    if (!data?.repos) return []

    let repos = [...data.repos]

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      repos = repos.filter(r => r.name.toLowerCase().includes(query))
    }

    // Filter by active
    if (showActiveOnly) {
      repos = repos.filter(r => isActive(r.name))
    }

    // Sort
    repos.sort((a, b) => {
      switch (sortBy) {
        case 'activity':
          // Most recent first
          return (b.lastActivity || '').localeCompare(a.lastActivity || '')
        case 'status':
          // Dirty repos first, then by change count
          const aChanges = a.staged.length + a.unstaged.length + a.untracked.length
          const bChanges = b.staged.length + b.unstaged.length + b.untracked.length
          return bChanges - aChanges
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })

    return repos
  }, [data?.repos, searchQuery, showActiveOnly, sortBy, isActive])

  // Check if all visible repos are clean
  const allReposClean = useMemo(() => {
    return filteredRepos.length > 0 && filteredRepos.every(r =>
      r.staged.length === 0 && r.unstaged.length === 0 && r.untracked.length === 0
    )
  }, [filteredRepos])

  // Selection callbacks (must be after filteredRepos is defined)
  const selectAllFiltered = useCallback(() => {
    setSelectedRepos(new Set(filteredRepos.map(r => r.name)))
  }, [filteredRepos])

  const clearSelection = useCallback(() => {
    setSelectedRepos(new Set())
    clearProgress()
  }, [clearProgress])

  // Bulk operation handlers
  const handleBulkFetch = useCallback(() => {
    runBulkOperation(Array.from(selectedRepos), 'fetch', refetch)
  }, [selectedRepos, runBulkOperation, refetch])

  const handleBulkPull = useCallback(() => {
    runBulkOperation(Array.from(selectedRepos), 'pull', refetch)
  }, [selectedRepos, runBulkOperation, refetch])

  const handleBulkPush = useCallback(() => {
    runBulkOperation(Array.from(selectedRepos), 'push', refetch)
  }, [selectedRepos, runBulkOperation, refetch])

  // Auto-expand if only one repo is showing (on initial load)
  const hasAutoExpanded = useRef(false)
  useEffect(() => {
    if (!hasAutoExpanded.current && filteredRepos.length === 1 && !loading) {
      setExpandedRepos(new Set([filteredRepos[0].name]))
      hasAutoExpanded.current = true
    }
  }, [filteredRepos, loading])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case '/':
          // Focus search
          e.preventDefault()
          searchInputRef.current?.focus()
          break
        case 'j':
          // Move to next repo
          e.preventDefault()
          setFocusedIndex(prev => {
            const next = prev + 1
            return next >= filteredRepos.length ? 0 : next
          })
          break
        case 'k':
          // Move to previous repo
          e.preventDefault()
          setFocusedIndex(prev => {
            const next = prev - 1
            return next < 0 ? filteredRepos.length - 1 : next
          })
          break
        case 'Enter':
          // Toggle expand on focused repo
          if (focusedIndex >= 0 && focusedIndex < filteredRepos.length) {
            e.preventDefault()
            toggleExpand(filteredRepos[focusedIndex].name)
          }
          break
        case 'Escape':
          // Clear search or collapse all
          e.preventDefault()
          if (searchQuery) {
            setSearchQuery('')
          } else {
            setExpandedRepos(new Set())
            setFocusedIndex(-1)
          }
          break
        case 'r':
          // Refresh if not already loading
          if (!loading) {
            e.preventDefault()
            refetch()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchQuery, loading, refetch, setSearchQuery, filteredRepos, focusedIndex, toggleExpand])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-card/50">
        <h2 className="text-lg font-semibold font-mono text-primary flex items-center gap-2">
          <GitBranch className="w-5 h-5" />
          Source Control
        </h2>

        <span className="text-sm text-muted-foreground font-mono ml-auto">
          {data?.projectsDir || '~/projects'}
        </span>

        <button
          onClick={refetch}
          disabled={loading}
          className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter bar */}
      {visibilityLoaded && (
        <GitFilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          showActiveOnly={showActiveOnly}
          onShowActiveOnlyChange={setShowActiveOnly}
          sortBy={sortBy}
          onSortChange={setSortBy}
          totalCount={data?.repos.length || 0}
          filteredCount={filteredRepos.length}
          searchInputRef={searchInputRef}
          selectedCount={selectedRepos.size}
          allSelected={filteredRepos.length > 0 && filteredRepos.every(r => selectedRepos.has(r.name))}
          onSelectAll={selectAllFiltered}
          onDeselectAll={clearSelection}
        />
      )}

      {/* Bulk actions bar - shown when repos are selected */}
      {selectedRepos.size > 0 && (
        <GitBulkActionsBar
          selectedCount={selectedRepos.size}
          onFetchAll={handleBulkFetch}
          onPullAll={handleBulkPull}
          onPushAll={handleBulkPush}
          onClearSelection={clearSelection}
          progress={progress}
          isRunning={isRunning}
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Loading state with skeletons */}
        {loading && !data && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <GitRepoSkeleton key={i} />)}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex flex-col items-center justify-center h-32 text-red-400">
            <AlertCircle className="w-6 h-6 mb-2" />
            <p className="text-center max-w-sm">{error}</p>
            <button
              onClick={refetch}
              className="mt-3 px-4 py-2 text-sm bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty state: No repos found at all */}
        {!loading && !error && data?.repos.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <GitBranch className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No repositories found</p>
            <p className="text-sm text-center max-w-sm">
              No git repositories were found in {data?.projectsDir}.
              Create a new project or clone an existing one to get started.
            </p>
          </div>
        )}

        {/* Empty state: No active repos (when filter is on) */}
        {!loading && !error && filteredRepos.length === 0 && showActiveOnly && (data?.repos.length || 0) > 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Star className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No active repositories</p>
            <p className="text-sm text-center max-w-sm">
              Star some repositories to mark them as active, then use the "Active Only" filter to focus on them.
            </p>
            <button
              onClick={() => setShowActiveOnly(false)}
              className="mt-4 px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            >
              Show All Repositories
            </button>
          </div>
        )}

        {/* Empty state: No search results */}
        {!loading && !error && filteredRepos.length === 0 && searchQuery && !showActiveOnly && (data?.repos.length || 0) > 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Search className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium mb-2">No matches found</p>
            <p className="text-sm">No repositories match "{searchQuery}"</p>
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            >
              Clear Search
            </button>
          </div>
        )}

        {/* Success banner: All repos are clean */}
        {!loading && !error && allReposClean && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-center">
            <span className="text-emerald-400 text-sm">All repositories are clean!</span>
          </div>
        )}

        {/* Repo list */}
        {filteredRepos.length > 0 && (
          <div className="space-y-2">
            {filteredRepos.map((repo, index) => (
              <GitRepoCard
                key={repo.path}
                repo={repo}
                isActive={isActive(repo.name)}
                onToggleActive={() => toggleActive(repo.name)}
                isExpanded={expandedRepos.has(repo.name)}
                onToggleExpand={() => toggleExpand(repo.name)}
                onRefresh={refetch}
                isFocused={focusedIndex === index}
                isSelected={selectedRepos.has(repo.name)}
                onToggleSelect={() => toggleSelect(repo.name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Keyboard shortcuts help */}
      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex items-center gap-4 bg-card/30">
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">/</kbd> Search</span>
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">j</kbd><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono ml-0.5">k</kbd> Navigate</span>
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Enter</kbd> Expand</span>
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">r</kbd> Refresh</span>
        <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px] font-mono">Esc</kbd> Clear</span>
      </div>
    </div>
  )
}
