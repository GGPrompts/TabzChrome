import React from 'react'
import { Folder, FolderOpen } from 'lucide-react'

interface RecentDirsProps {
  dirs: string[]
  currentDir: string
  onDirClick: (dir: string) => void
}

// Shorten path for display
function shortenPath(path: string): string {
  // Replace home directory with ~
  const homePath = path.replace(/^\/home\/[^/]+/, '~')
    .replace(/^\/Users\/[^/]+/, '~')

  // If still too long, show last 2 segments
  const parts = homePath.split('/')
  if (parts.length > 3) {
    return '.../' + parts.slice(-2).join('/')
  }
  return homePath
}

export function RecentDirs({ dirs, currentDir, onDirClick }: RecentDirsProps) {
  // Filter out current dir and show top 6
  const recentDirs = dirs
    .filter(d => d !== currentDir && d !== '~')
    .slice(0, 6)

  if (recentDirs.length === 0) {
    return null
  }

  return (
    <div className="recent-dirs animate-slide-up stagger-4">
      {/* Current directory */}
      <button
        className="recent-dir"
        style={{
          borderColor: 'var(--accent-dim)',
          backgroundColor: 'var(--accent-subtle)',
        }}
        onClick={() => onDirClick(currentDir)}
        title={currentDir}
      >
        <FolderOpen className="w-3 h-3" style={{ color: 'var(--accent)' }} />
        <span style={{ color: 'var(--accent)' }}>{shortenPath(currentDir)}</span>
      </button>

      {/* Recent directories */}
      {recentDirs.map((dir) => (
        <button
          key={dir}
          className="recent-dir"
          onClick={() => onDirClick(dir)}
          title={dir}
        >
          <Folder className="w-3 h-3" />
          <span>{shortenPath(dir)}</span>
        </button>
      ))}
    </div>
  )
}
