import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Terminal, Clock, Settings, Plus } from 'lucide-react'
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '../components/ui/command'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { getLocal, SyncedSession, getActiveSessionCount } from '../shared/storage'
import { sendMessage } from '../shared/messaging'
import { formatTimestamp } from '../shared/utils'
import spawnOptionsData from '../spawn-options.json'
import '../styles/globals.css'

interface SpawnOption {
  label: string
  command: string
  terminalType: string
  icon: string
  description: string
}

function ExtensionPopup() {
  const [recentSessions, setRecentSessions] = useState<SyncedSession[]>([])
  const [activeSessionCount, setActiveSessionCount] = useState(0)
  const [spawnOptions, setSpawnOptions] = useState<SpawnOption[]>([])
  const [searchValue, setSearchValue] = useState('')

  useEffect(() => {
    // Clear old active sessions from storage (reset to 0)
    chrome.storage.local.set({ activeSessions: [] })

    // Load recent sessions from storage
    getLocal(['recentSessions']).then(({ recentSessions }) => {
      setRecentSessions(recentSessions || [])
    })

    // Get active session count (should be 0 after clear)
    getActiveSessionCount().then(count => {
      setActiveSessionCount(count)
    })

    // Load spawn options from imported JSON
    const options = spawnOptionsData.spawnOptions || []
    setSpawnOptions(options)
  }, [])

  const handleSessionSelect = (sessionName: string) => {
    sendMessage({
      type: 'OPEN_SESSION',
      sessionName,
    })
    window.close() // Close popup
  }

  const handleSpawn = (spawnOption: SpawnOption) => {
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: spawnOption.terminalType,
      command: spawnOption.command,
    })
    window.close()
  }

  const handleOpenSettings = async () => {
    // TODO: Create options page
    // For now, just open side panel
    try {
      // Get the browser window (not the popup) by getting the last focused window
      // Popups themselves have windowId -1, so we need the actual browser window
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
      const lastFocused = windows.find(w => w.focused) || windows[0]

      if (lastFocused?.id) {
        await chrome.sidePanel.open({ windowId: lastFocused.id })
        window.close()
      }
    } catch (error) {
      // Side panel may fail to open in some contexts - silently ignore
    }
  }

  const handleOpenSidePanel = async () => {
    try {
      // Get the browser window (not the popup) by getting the last focused window
      // Popups themselves have windowId -1, so we need the actual browser window
      const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
      const lastFocused = windows.find(w => w.focused) || windows[0]

      if (lastFocused?.id) {
        await chrome.sidePanel.open({ windowId: lastFocused.id })
        window.close()
      }
    } catch (error) {
      // Side panel may fail to open in some contexts - silently ignore
    }
  }

  // Filter spawn options based on search
  const filteredSpawnOptions = spawnOptions.filter(option =>
    option.label.toLowerCase().includes(searchValue.toLowerCase()) ||
    option.description.toLowerCase().includes(searchValue.toLowerCase())
  )

  const filteredRecentSessions = recentSessions.filter(session =>
    session.name.toLowerCase().includes(searchValue.toLowerCase())
  )

  return (
    <div className="w-[400px] h-[500px] bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Terminal Tabs</h1>
        </div>
        <div className="flex items-center gap-2">
          {activeSessionCount > 0 && (
            <Badge variant="secondary">
              {activeSessionCount} active
            </Badge>
          )}
          <button
            onClick={handleOpenSettings}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Command Palette */}
      <Command className="rounded-none border-0">
        <CommandInput
          placeholder="Search sessions or spawn new terminal..."
          value={searchValue}
          onValueChange={setSearchValue}
        />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          {/* Recent Sessions */}
          {filteredRecentSessions.length > 0 && (
            <>
              <CommandGroup heading="Recent Sessions">
                {filteredRecentSessions.map(session => (
                  <CommandItem
                    key={session.name}
                    value={session.name}
                    onSelect={() => handleSessionSelect(session.name)}
                  >
                    <Clock className="mr-2 h-4 w-4" />
                    <div className="flex-1">
                      <div className="font-medium">{session.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {session.workingDir} • {formatTimestamp(session.lastActive)}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Quick Spawn */}
          <CommandGroup heading="Quick Spawn">
            <CommandItem
              value="open-side-panel"
              onSelect={handleOpenSidePanel}
            >
              <Plus className="mr-2 h-4 w-4" />
              <div className="flex-1">
                <div className="font-medium">Open Side Panel</div>
                <div className="text-xs text-muted-foreground">
                  Full terminal interface in side panel
                </div>
              </div>
            </CommandItem>

            {filteredSpawnOptions.slice(0, 8).map(option => (
              <CommandItem
                key={option.terminalType}
                value={option.label}
                onSelect={() => handleSpawn(option)}
              >
                <span className="mr-2 text-lg">{option.icon}</span>
                <div className="flex-1">
                  <div className="font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {option.description}
                  </div>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 p-2 border-t bg-background">
        <div className="text-xs text-center text-muted-foreground">
          Click the extension icon or use context menu
        </div>
      </div>
    </div>
  )
}

// Mount the popup
ReactDOM.createRoot(document.getElementById('popup-root')!).render(
  <React.StrictMode>
    <ExtensionPopup />
  </React.StrictMode>
)
