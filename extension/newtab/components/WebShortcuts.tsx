import React, { useState, useEffect } from 'react'
import { Globe, Star, BookMarked } from 'lucide-react'

interface Bookmark {
  id: string
  title: string
  url: string
  favicon?: string
}

interface WebShortcutsProps {
  onNavigate: (url: string) => void
}

// Extract domain for favicon
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
  } catch {
    return ''
  }
}

// Shorten title for display
function shortenTitle(title: string, maxLen = 16): string {
  if (title.length <= maxLen) return title
  return title.slice(0, maxLen - 1) + '…'
}

export function WebShortcuts({ onNavigate }: WebShortcutsProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)

  // Open bookmarks manager page
  const openBookmarksManager = () => {
    chrome.tabs.create({ url: 'chrome://bookmarks' })
  }

  useEffect(() => {
    // Try to find a "New Tab" or "Favorites" folder first
    // Fall back to most recent bookmarks
    chrome.bookmarks.getTree((tree) => {
      const allBookmarks: Bookmark[] = []

      // Recursive function to extract bookmarks
      const extractBookmarks = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
        for (const node of nodes) {
          if (node.url) {
            allBookmarks.push({
              id: node.id,
              title: node.title || new URL(node.url).hostname,
              url: node.url,
            })
          }
          if (node.children) {
            extractBookmarks(node.children)
          }
        }
      }

      // Look for a "New Tab" or "Favorites" folder
      const findFolder = (nodes: chrome.bookmarks.BookmarkTreeNode[], name: string): chrome.bookmarks.BookmarkTreeNode | null => {
        for (const node of nodes) {
          if (node.title?.toLowerCase() === name.toLowerCase() && node.children) {
            return node
          }
          if (node.children) {
            const found = findFolder(node.children, name)
            if (found) return found
          }
        }
        return null
      }

      const newTabFolder = findFolder(tree, 'New Tab') || findFolder(tree, 'Favorites')

      if (newTabFolder && newTabFolder.children) {
        // Use bookmarks from the special folder
        extractBookmarks(newTabFolder.children)
      } else {
        // Fall back to all bookmarks (take most recent by ID, higher = newer)
        extractBookmarks(tree)
        allBookmarks.sort((a, b) => parseInt(b.id) - parseInt(a.id))
      }

      setBookmarks(allBookmarks.slice(0, 6))
      setLoading(false)
    })
  }, [])

  if (loading) {
    return (
      <div className="shortcuts-section">
        <div className="shortcuts-header">
          <div className="shortcuts-title">Web Shortcuts</div>
        </div>
        <div className="shortcuts-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="shortcut-card animate-pulse"
              style={{ opacity: 0.5 }}
            >
              <div className="shortcut-icon-wrapper bg-[var(--elevated)]">
                <div className="w-5 h-5 rounded bg-[var(--border)]" />
              </div>
              <div className="h-3 w-16 rounded bg-[var(--border)]" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (bookmarks.length === 0) {
    return (
      <div className="shortcuts-section">
        <div className="shortcuts-header">
          <div className="shortcuts-title">Web Shortcuts</div>
        </div>
        <div className="shortcuts-empty">
          <Globe className="w-8 h-8 opacity-30" />
          <p>Create a "New Tab" bookmark folder to add shortcuts here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="shortcuts-section animate-slide-up stagger-4">
      <div className="shortcuts-header">
        <div className="shortcuts-title">
          <Globe className="w-4 h-4" />
          Web Shortcuts
        </div>
      </div>

      <div className="shortcuts-grid">
        {bookmarks.map((bookmark) => (
          <button
            key={bookmark.id}
            className="shortcut-card"
            onClick={() => onNavigate(bookmark.url)}
            title={bookmark.title}
          >
            <div className="shortcut-icon-wrapper">
              <img
                src={getFaviconUrl(bookmark.url)}
                alt=""
                className="shortcut-favicon"
                onError={(e) => {
                  // Hide broken favicon, show globe instead
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.nextElementSibling?.classList.remove('hidden')
                }}
              />
              <Globe className="w-4 h-4 hidden" />
            </div>
            <div className="shortcut-name">{shortenTitle(bookmark.title)}</div>
          </button>
        ))}

        {/* Manage Bookmarks link */}
        <button
          className="shortcut-card"
          onClick={openBookmarksManager}
          title="Manage Bookmarks"
        >
          <div className="shortcut-icon-wrapper">
            <BookMarked className="w-5 h-5" />
          </div>
          <div className="shortcut-name">Bookmarks</div>
        </button>
      </div>
    </div>
  )
}
