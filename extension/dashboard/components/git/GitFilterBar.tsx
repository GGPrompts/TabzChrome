import React, { RefObject } from 'react'
import { Search, Star, ArrowUpDown, CheckSquare } from 'lucide-react'
import { SortOption } from '../../../hooks/useGitVisibility'

interface GitFilterBarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  showActiveOnly: boolean
  onShowActiveOnlyChange: (show: boolean) => void
  sortBy: SortOption
  onSortChange: (sort: SortOption) => void
  totalCount: number
  filteredCount: number
  searchInputRef?: RefObject<HTMLInputElement>
  // Selection props
  selectedCount?: number
  allSelected?: boolean
  onSelectAll?: () => void
  onDeselectAll?: () => void
}

export function GitFilterBar({
  searchQuery,
  onSearchChange,
  showActiveOnly,
  onShowActiveOnlyChange,
  sortBy,
  onSortChange,
  totalCount,
  filteredCount,
  searchInputRef,
  selectedCount = 0,
  allSelected = false,
  onSelectAll,
  onDeselectAll
}: GitFilterBarProps) {
  const hasSelection = selectedCount > 0

  return (
    <div className="flex items-center gap-3 p-3 border-b border-border bg-card/50">
      {/* Select all checkbox */}
      {onSelectAll && onDeselectAll && filteredCount > 0 && (
        <button
          onClick={allSelected ? onDeselectAll : onSelectAll}
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors ${
            hasSelection
              ? 'bg-primary/20 text-primary border border-primary/30'
              : 'hover:bg-muted text-muted-foreground border border-transparent'
          }`}
          title={allSelected ? 'Deselect all' : 'Select all visible repos'}
        >
          <CheckSquare className={`w-4 h-4 ${hasSelection ? 'fill-primary/30' : ''}`} />
          {allSelected ? 'All' : 'Select'}
        </button>
      )}

      {/* Search */}
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search repos..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 bg-background border border-border rounded-lg text-sm focus:outline-none focus:border-primary/50"
        />
      </div>

      {/* Active only toggle */}
      <button
        onClick={() => onShowActiveOnlyChange(!showActiveOnly)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
          showActiveOnly
            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
            : 'hover:bg-muted text-muted-foreground border border-transparent'
        }`}
      >
        <Star className={`w-4 h-4 ${showActiveOnly ? 'fill-yellow-400' : ''}`} />
        Active Only
      </button>

      {/* Sort dropdown */}
      <div className="relative">
        <select
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="appearance-none pl-3 pr-8 py-1.5 bg-background border border-border rounded-lg text-sm cursor-pointer focus:outline-none focus:border-primary/50"
        >
          <option value="name">Sort: Name</option>
          <option value="activity">Sort: Activity</option>
          <option value="status">Sort: Status</option>
        </select>
        <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
      </div>

      {/* Count */}
      <span className="text-xs text-muted-foreground">
        {filteredCount} / {totalCount} repos
      </span>
    </div>
  )
}
