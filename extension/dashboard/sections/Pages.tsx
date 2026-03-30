import React, { useState, useEffect, useRef } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { GlobeIcon, type AnimatedIconHandle } from '../../components/icons'

interface PageInfo {
  name: string
  path: string
  url: string
  category: string
}

export default function PagesSection() {
  const [pages, setPages] = useState<PageInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Animated icon ref - play animation on mount
  const iconRef = useRef<AnimatedIconHandle>(null)
  useEffect(() => {
    const timer = setTimeout(() => iconRef.current?.startAnimation(), 100)
    return () => clearTimeout(timer)
  }, [])

  const fetchPages = async () => {
    try {
      setLoading(true)
      const res = await fetch('http://localhost:8129/api/pages')
      if (!res.ok) throw new Error('Failed to fetch pages')
      const data = await res.json()
      if (data.success) {
        setPages(data.data)
      } else {
        throw new Error(data.error || 'Unknown error')
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pages')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPages()
  }, [])

  // Group pages by category
  const grouped = pages.reduce<Record<string, PageInfo[]>>((acc, page) => {
    const cat = page.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(page)
    return acc
  }, {})

  // Sort categories: "General" first, then alphabetically
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'General') return -1
    if (b === 'General') return 1
    return a.localeCompare(b)
  })

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <GlobeIcon ref={iconRef} size={32} />
            Pages
          </h1>
          <p className="text-muted-foreground mt-1">
            Backend-served HTML pages. These pages can be automated with MCP tools (screenshot, click, fill, read DOM).
          </p>
        </div>
        <button
          onClick={fetchPages}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error State */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive">
          {error}
        </div>
      )}

      {/* Loading State */}
      {loading && pages.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Pages by Category */}
      {sortedCategories.map((category) => (
        <div key={category} className="mb-8">
          <h2 className="text-lg font-semibold mb-3 text-foreground">{category}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {grouped[category].map((page) => (
              <div
                key={page.path}
                className="rounded-xl bg-card border border-border p-4 hover:border-primary/30 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">{page.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono mt-1 truncate" title={page.path}>
                      /{page.path}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Empty State */}
      {!loading && pages.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground">
          No backend pages found
        </div>
      )}
    </div>
  )
}
