import React from 'react'
import { FolderOpen, ChevronDown, X } from 'lucide-react'

interface WorkingDirDropdownProps {
  globalWorkingDir: string
  setGlobalWorkingDir: (dir: string) => void
  recentDirs: string[]
  setRecentDirs: React.Dispatch<React.SetStateAction<string[]>>
  addToRecentDirs: (dir: string) => void
  customDirInput: string
  setCustomDirInput: (value: string) => void
  showDropdown: boolean
  setShowDropdown: (show: boolean) => void
}

export function WorkingDirDropdown({
  globalWorkingDir,
  setGlobalWorkingDir,
  recentDirs,
  setRecentDirs,
  addToRecentDirs,
  customDirInput,
  setCustomDirInput,
  showDropdown,
  setShowDropdown,
}: WorkingDirDropdownProps) {
  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowDropdown(!showDropdown)
          setCustomDirInput('')
        }}
        className="flex items-center gap-1.5 px-2 py-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88] max-w-[220px]"
        title={`Working Directory: ${globalWorkingDir}`}
        aria-label={`Working directory: ${globalWorkingDir}. Click to change.`}
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      >
        <FolderOpen className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs truncate">{globalWorkingDir}</span>
        <ChevronDown className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      </button>

      {showDropdown && (
        <div className="absolute right-0 top-full mt-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[220px] z-50 overflow-hidden">
          {/* Custom input */}
          <div className="p-2 border-b border-gray-800">
            <input
              type="text"
              value={customDirInput}
              onChange={(e) => setCustomDirInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customDirInput.trim()) {
                  setGlobalWorkingDir(customDirInput.trim())
                  addToRecentDirs(customDirInput.trim())
                  setShowDropdown(false)
                  setCustomDirInput('')
                }
              }}
              placeholder="Type path and press Enter"
              className="w-full px-2 py-1.5 bg-black/50 border border-gray-700 rounded text-white text-xs font-mono focus:border-[#00ff88] focus:outline-none"
              onClick={(e) => e.stopPropagation()}
              autoFocus
              aria-label="Enter custom directory path"
            />
          </div>
          {/* Recent directories */}
          <div className="max-h-[200px] overflow-y-auto" role="listbox" aria-label="Recent directories">
            {recentDirs.map((dir) => (
              <div
                key={dir}
                className={`flex items-center justify-between px-3 py-2 hover:bg-[#00ff88]/10 transition-colors text-xs font-mono border-b border-gray-800 last:border-b-0 group ${
                  dir === globalWorkingDir ? 'text-[#00ff88] bg-[#00ff88]/5' : 'text-gray-300'
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setGlobalWorkingDir(dir)
                    setShowDropdown(false)
                  }}
                  className="flex-1 text-left truncate"
                  role="option"
                  aria-selected={dir === globalWorkingDir}
                  aria-label={`Select directory ${dir}`}
                >
                  {dir}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setRecentDirs(prev => prev.filter(d => d !== dir))
                    if (globalWorkingDir === dir) {
                      setGlobalWorkingDir('~')
                    }
                  }}
                  className="ml-2 p-0.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remove from list"
                  aria-label={`Remove ${dir} from recent directories`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
