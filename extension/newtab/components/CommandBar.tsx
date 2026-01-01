import React, { useState, useRef, useEffect, useMemo, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Search, Terminal, Globe, Folder, Bookmark } from 'lucide-react'

interface Profile {
  id: string
  name: string
  icon?: string
  color?: string
  category?: string
}

interface CommandBarProps {
  profiles: Profile[]
  recentDirs: string[]
  onSpawnTerminal: (profileId: string) => void
  onNavigate: (url: string) => void
}

interface BookmarkResult {
  id: string
  title: string
  url?: string
}

interface Suggestion {
  type: 'profile' | 'url' | 'search' | 'dir' | 'bookmark'
  id: string
  title: string
  subtitle?: string
  icon?: React.ReactNode
  color?: string
  action: () => void
}

function isValidUrl(str: string): boolean {
  // Check for URL-like patterns
  if (str.startsWith('http://') || str.startsWith('https://')) return true
  if (str.match(/^[\w-]+\.(com|org|net|io|dev|co|app|me|ai|gg|sh|xyz)/i)) return true
  return false
}

export const CommandBar = forwardRef<HTMLInputElement, CommandBarProps>(
  function CommandBar({ profiles, recentDirs, onSpawnTerminal, onNavigate }, ref) {
  const [query, setQuery] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [bookmarks, setBookmarks] = useState<BookmarkResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Expose the input ref to parent
  useImperativeHandle(ref, () => inputRef.current!, [])

  // Focus input on mount
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 300)
    return () => clearTimeout(timer)
  }, [])

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Search bookmarks when query changes
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setBookmarks([])
      return
    }

    // Debounce bookmark search
    const timer = setTimeout(() => {
      chrome.bookmarks.search(q, (results) => {
        // Filter to only bookmarks with URLs (not folders)
        const filtered = results
          .filter(b => b.url)
          .slice(0, 5)
          .map(b => ({ id: b.id, title: b.title, url: b.url }))
        setBookmarks(filtered)
      })
    }, 150)

    return () => clearTimeout(timer)
  }, [query])

  // Generate suggestions based on query
  const suggestions = useMemo((): Suggestion[] => {
    const q = query.toLowerCase().trim()
    if (!q) return []

    const results: Suggestion[] = []

    // Check for URL
    if (isValidUrl(query)) {
      const url = query.startsWith('http') ? query : `https://${query}`
      results.push({
        type: 'url',
        id: 'url',
        title: query,
        subtitle: 'Open URL',
        icon: <Globe className="w-4 h-4" />,
        action: () => onNavigate(url),
      })
    }

    // Match profiles
    const matchedProfiles = profiles.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q)
    ).slice(0, 4)

    matchedProfiles.forEach(profile => {
      results.push({
        type: 'profile',
        id: profile.id,
        title: profile.name,
        subtitle: profile.category || 'Terminal',
        icon: profile.icon ? (
          <span className="text-lg">{profile.icon}</span>
        ) : (
          <Terminal className="w-4 h-4" />
        ),
        color: profile.color,
        action: () => onSpawnTerminal(profile.id),
      })
    })

    // Match directories
    const matchedDirs = recentDirs.filter(d =>
      d.toLowerCase().includes(q)
    ).slice(0, 3)

    matchedDirs.forEach(dir => {
      results.push({
        type: 'dir',
        id: dir,
        title: dir,
        subtitle: 'Open directory in terminal',
        icon: <Folder className="w-4 h-4" />,
        action: () => {
          // Use default profile with this directory
          onSpawnTerminal('default')
        },
      })
    })

    // Add bookmarks
    bookmarks.forEach(bookmark => {
      results.push({
        type: 'bookmark',
        id: `bookmark-${bookmark.id}`,
        title: bookmark.title || bookmark.url || 'Bookmark',
        subtitle: bookmark.url ? new URL(bookmark.url).hostname : undefined,
        icon: <Bookmark className="w-4 h-4" />,
        color: '#f59e0b', // amber color for bookmarks
        action: () => onNavigate(bookmark.url!),
      })
    })

    // Default: search query (only if no other results)
    if (!isValidUrl(query) && results.length === 0) {
      results.push({
        type: 'search',
        id: 'search',
        title: query,
        subtitle: 'Search Google',
        icon: <Search className="w-4 h-4" />,
        action: () => onNavigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`),
      })
    }

    return results
  }, [query, profiles, recentDirs, bookmarks, onSpawnTerminal, onNavigate])

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0)
  }, [suggestions.length])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter' && query.trim()) {
        // Default action: search
        if (isValidUrl(query)) {
          const url = query.startsWith('http') ? query : `https://${query}`
          onNavigate(url)
        } else {
          onNavigate(`https://www.google.com/search?q=${encodeURIComponent(query)}`)
        }
      }
      return
    }

    switch (e.key) {
      case 'ArrowDown':
      case 'Tab':
        e.preventDefault()
        if (e.shiftKey) {
          setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length)
        } else {
          setSelectedIndex(i => (i + 1) % suggestions.length)
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length)
        break
      case 'Enter':
        e.preventDefault()
        suggestions[selectedIndex]?.action()
        setQuery('')
        setShowSuggestions(false)
        break
      case 'Escape':
        setShowSuggestions(false)
        setQuery('')
        break
    }
  }, [showSuggestions, suggestions, selectedIndex, query, onNavigate])

  return (
    <div className="command-bar-wrapper animate-slide-up stagger-2" ref={wrapperRef}>
      <div className="command-bar">
        <span className="command-bar-prefix">$</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setShowSuggestions(e.target.value.trim().length > 0)
          }}
          onFocus={() => query.trim() && setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search, open URL, or spawn terminal..."
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="command-suggestions animate-fade-in">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.id}
              className={`suggestion-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => {
                suggestion.action()
                setQuery('')
                setShowSuggestions(false)
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div
                className="suggestion-icon"
                style={{
                  color: suggestion.color || 'var(--accent)',
                  backgroundColor: suggestion.color
                    ? `${suggestion.color}15`
                    : 'var(--raised)',
                }}
              >
                {suggestion.icon}
              </div>
              <div className="suggestion-content">
                <div className="suggestion-title">{suggestion.title}</div>
                <div className="suggestion-subtitle">{suggestion.subtitle}</div>
              </div>
              <div className="suggestion-action">
                {suggestion.type === 'profile' && 'Spawn'}
                {suggestion.type === 'url' && 'Open'}
                {suggestion.type === 'search' && 'Search'}
                {suggestion.type === 'dir' && 'Open'}
                {suggestion.type === 'bookmark' && 'Open'}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
