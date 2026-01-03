import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Globe,
  Trash2,
  Plus,
  Search,
  Home,
  Star,
} from 'lucide-react'

interface BookmarkNode {
  id: string
  title: string
  url?: string
  parentId?: string
  index?: number
  dateAdded?: number
  children?: BookmarkNode[]
}

// Get favicon URL for a bookmark
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

// Format date for display
function formatDate(timestamp?: number): string {
  if (!timestamp) return ''
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Folder tree item component
function FolderTreeItem({
  node,
  selectedFolderId,
  expandedFolders,
  onFolderSelect,
  onToggleExpand,
  depth = 0,
}: {
  node: BookmarkNode
  selectedFolderId: string | null
  expandedFolders: Set<string>
  onFolderSelect: (id: string) => void
  onToggleExpand: (id: string) => void
  depth?: number
}) {
  const hasChildren = node.children && node.children.some((child) => !child.url)
  const isExpanded = expandedFolders.has(node.id)
  const isSelected = selectedFolderId === node.id

  // Skip root node display but render its children
  if (node.id === '0') {
    return (
      <>
        {node.children
          ?.filter((child) => !child.url)
          .map((child) => (
            <FolderTreeItem
              key={child.id}
              node={child}
              selectedFolderId={selectedFolderId}
              expandedFolders={expandedFolders}
              onFolderSelect={onFolderSelect}
              onToggleExpand={onToggleExpand}
              depth={depth}
            />
          ))}
      </>
    )
  }

  return (
    <div className="folder-tree-item">
      <button
        className={`folder-tree-button ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onFolderSelect(node.id)}
      >
        <span
          className="folder-expand"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand(node.id)
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </span>
        {isSelected ? (
          <FolderOpen className="w-4 h-4 folder-icon" />
        ) : (
          <Folder className="w-4 h-4 folder-icon" />
        )}
        <span className="folder-name">{node.title || 'Untitled'}</span>
      </button>

      {isExpanded && hasChildren && (
        <div className="folder-children">
          {node.children
            ?.filter((child) => !child.url)
            .map((child) => (
              <FolderTreeItem
                key={child.id}
                node={child}
                selectedFolderId={selectedFolderId}
                expandedFolders={expandedFolders}
                onFolderSelect={onFolderSelect}
                onToggleExpand={onToggleExpand}
                depth={depth + 1}
              />
            ))}
        </div>
      )}
    </div>
  )
}

// Bookmark list item component
function BookmarkListItem({
  bookmark,
  onDelete,
}: {
  bookmark: BookmarkNode
  onDelete: (id: string) => void
}) {
  const handleClick = () => {
    if (bookmark.url) {
      chrome.tabs.create({ url: bookmark.url })
    }
  }

  return (
    <div className="bookmark-item">
      <button className="bookmark-content" onClick={handleClick}>
        <div className="bookmark-icon">
          {bookmark.url ? (
            <img
              src={getFaviconUrl(bookmark.url)}
              alt=""
              className="favicon"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : (
            <Folder className="w-4 h-4" />
          )}
          <Globe className="w-4 h-4 hidden" />
        </div>
        <div className="bookmark-info">
          <div className="bookmark-title">{bookmark.title || 'Untitled'}</div>
          {bookmark.url && <div className="bookmark-url">{bookmark.url}</div>}
        </div>
        <div className="bookmark-date">{formatDate(bookmark.dateAdded)}</div>
      </button>
      <button
        className="bookmark-delete"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(bookmark.id)
        }}
        title="Delete bookmark"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function Bookmarks() {
  const [bookmarkTree, setBookmarkTree] = useState<BookmarkNode[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>('1') // Bookmarks Bar
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['0', '1', '2']))
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<BookmarkNode[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolderInput, setShowNewFolderInput] = useState(false)

  // Load bookmark tree
  const loadBookmarks = useCallback(() => {
    chrome.bookmarks.getTree((tree) => {
      setBookmarkTree(tree)
    })
  }, [])

  useEffect(() => {
    loadBookmarks()

    // Listen for bookmark changes
    const handleChange = () => loadBookmarks()
    chrome.bookmarks.onCreated.addListener(handleChange)
    chrome.bookmarks.onRemoved.addListener(handleChange)
    chrome.bookmarks.onChanged.addListener(handleChange)
    chrome.bookmarks.onMoved.addListener(handleChange)

    return () => {
      chrome.bookmarks.onCreated.removeListener(handleChange)
      chrome.bookmarks.onRemoved.removeListener(handleChange)
      chrome.bookmarks.onChanged.removeListener(handleChange)
      chrome.bookmarks.onMoved.removeListener(handleChange)
    }
  }, [loadBookmarks])

  // Search bookmarks
  useEffect(() => {
    if (searchQuery.trim()) {
      setIsSearching(true)
      chrome.bookmarks.search(searchQuery, (results) => {
        setSearchResults(results as BookmarkNode[])
      })
    } else {
      setIsSearching(false)
      setSearchResults([])
    }
  }, [searchQuery])

  // Get bookmarks for selected folder
  const getSelectedFolderContents = useCallback((): BookmarkNode[] => {
    if (!selectedFolderId || bookmarkTree.length === 0) return []

    const findFolder = (
      nodes: BookmarkNode[],
      targetId: string
    ): BookmarkNode | null => {
      for (const node of nodes) {
        if (node.id === targetId) return node
        if (node.children) {
          const found = findFolder(node.children, targetId)
          if (found) return found
        }
      }
      return null
    }

    const folder = findFolder(bookmarkTree, selectedFolderId)
    return folder?.children || []
  }, [selectedFolderId, bookmarkTree])

  // Get folder path for breadcrumb
  const getFolderPath = useCallback((): BookmarkNode[] => {
    if (!selectedFolderId || bookmarkTree.length === 0) return []

    const path: BookmarkNode[] = []
    const findPath = (
      nodes: BookmarkNode[],
      targetId: string,
      currentPath: BookmarkNode[]
    ): boolean => {
      for (const node of nodes) {
        if (node.id === targetId) {
          path.push(...currentPath, node)
          return true
        }
        if (node.children) {
          if (findPath(node.children, targetId, [...currentPath, node])) {
            return true
          }
        }
      }
      return false
    }

    findPath(bookmarkTree, selectedFolderId, [])
    return path.slice(1) // Remove root
  }, [selectedFolderId, bookmarkTree])

  // Toggle folder expansion
  const handleToggleExpand = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  // Delete bookmark
  const handleDeleteBookmark = async (id: string) => {
    try {
      await chrome.bookmarks.remove(id)
    } catch {
      // If remove fails (it's a folder), use removeTree
      await chrome.bookmarks.removeTree(id)
    }
  }

  // Create new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !selectedFolderId) return

    await chrome.bookmarks.create({
      title: newFolderName.trim(),
      parentId: selectedFolderId,
    })

    setNewFolderName('')
    setShowNewFolderInput(false)
    setExpandedFolders((prev) => new Set([...prev, selectedFolderId]))
  }

  // Navigate to new tab
  const handleGoHome = () => {
    chrome.tabs.update({ url: 'chrome://newtab' })
  }

  const folderContents = getSelectedFolderContents()
  const displayContents = isSearching ? searchResults : folderContents
  const folderPath = getFolderPath()

  return (
    <>
      {/* Background effects */}
      <div className="bookmarks-bg" />
      <div className="noise-overlay" />

      <div className="bookmarks-container">
        {/* Header */}
        <header className="bookmarks-header">
          <div className="header-left">
            <button className="home-button" onClick={handleGoHome} title="New Tab">
              <Home className="w-5 h-5" />
            </button>
            <h1 className="bookmarks-title">
              <Star className="w-5 h-5" />
              Bookmarks
            </h1>
          </div>
          <div className="search-bar">
            <Search className="w-4 h-4 search-icon" />
            <input
              type="text"
              placeholder="Search bookmarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </header>

        {/* Main content */}
        <main className="bookmarks-main">
          {/* Sidebar - Folder tree */}
          <aside className="folder-sidebar">
            <div className="sidebar-header">
              <span className="sidebar-title">Folders</span>
              <button
                className="new-folder-button"
                onClick={() => setShowNewFolderInput(!showNewFolderInput)}
                title="New folder"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {showNewFolderInput && (
              <div className="new-folder-input-wrapper">
                <input
                  type="text"
                  placeholder="Folder name..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateFolder()
                    if (e.key === 'Escape') {
                      setShowNewFolderInput(false)
                      setNewFolderName('')
                    }
                  }}
                  className="new-folder-input"
                  autoFocus
                />
              </div>
            )}

            <div className="folder-tree">
              {bookmarkTree.map((node) => (
                <FolderTreeItem
                  key={node.id}
                  node={node}
                  selectedFolderId={selectedFolderId}
                  expandedFolders={expandedFolders}
                  onFolderSelect={setSelectedFolderId}
                  onToggleExpand={handleToggleExpand}
                />
              ))}
            </div>
          </aside>

          {/* Content - Bookmark list */}
          <section className="bookmark-list-section">
            {/* Breadcrumb */}
            {!isSearching && folderPath.length > 0 && (
              <div className="breadcrumb">
                {folderPath.map((folder, index) => (
                  <React.Fragment key={folder.id}>
                    {index > 0 && <ChevronRight className="w-4 h-4 breadcrumb-sep" />}
                    <button
                      className={`breadcrumb-item ${
                        index === folderPath.length - 1 ? 'current' : ''
                      }`}
                      onClick={() => setSelectedFolderId(folder.id)}
                    >
                      {folder.title || 'Bookmarks'}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {isSearching && (
              <div className="search-results-header">
                Search results for "{searchQuery}" ({searchResults.length} found)
              </div>
            )}

            {/* Bookmark list */}
            <div className="bookmark-list">
              {displayContents.length === 0 ? (
                <div className="empty-state">
                  {isSearching ? (
                    <>
                      <Search className="w-12 h-12 opacity-30" />
                      <p>No bookmarks found</p>
                    </>
                  ) : (
                    <>
                      <Folder className="w-12 h-12 opacity-30" />
                      <p>This folder is empty</p>
                    </>
                  )}
                </div>
              ) : (
                displayContents.map((bookmark) => (
                  <BookmarkListItem
                    key={bookmark.id}
                    bookmark={bookmark}
                    onDelete={handleDeleteBookmark}
                  />
                ))
              )}
            </div>
          </section>
        </main>
      </div>
    </>
  )
}
