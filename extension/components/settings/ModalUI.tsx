import React from 'react'
import { X, Terminal as TerminalIcon, Wrench, Volume2, Key, Copy, Check } from 'lucide-react'
import { TabType } from './types'

export function ModalHeader({ showTokenHelp, onToggleTokenHelp, onClose }: {
  showTokenHelp: boolean
  onToggleTokenHelp: () => void
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
      <h2 className="text-xl font-semibold text-white">Settings</h2>
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleTokenHelp}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all ${
            showTokenHelp
              ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700'
          }`}
          title="Get security token for external launchers"
        >
          <Key className="h-3.5 w-3.5" />
          API Token
        </button>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export function TokenHelpPanel({ tokenCopied, onCopyToken, onClose }: {
  tokenCopied: boolean
  onCopyToken: () => void
  onClose: () => void
}) {
  return (
    <div className="px-6 py-4 bg-[#0a0a0a] border-b border-gray-800">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-[#00ff88]/10 text-[#00ff88]">
          <Key className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-white mb-1">Security Token</h3>
          <p className="text-xs text-gray-400 mb-3">
            Copy this token to authorize external launchers to spawn terminals.
          </p>
          <button
            onClick={onCopyToken}
            className={`flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-all ${
              tokenCopied
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-[#00ff88] hover:bg-[#00c8ff] text-black'
            }`}
          >
            {tokenCopied ? <><Check className="h-4 w-4" />Copied!</> : <><Copy className="h-4 w-4" />Copy Token</>}
          </button>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

export function TabNavigation({ activeTab, setActiveTab, profileCount }: {
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  profileCount: number
}) {
  const tabs: { id: TabType; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'profiles', label: 'Profiles', icon: <TerminalIcon className="h-4 w-4" />, count: profileCount },
    { id: 'mcp', label: 'MCP Tools', icon: <Wrench className="h-4 w-4" /> },
    { id: 'audio', label: 'Claude Audio', icon: <Volume2 className="h-4 w-4" /> },
  ]

  return (
    <div className="flex border-b border-gray-800 px-6" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-[1px] transition-colors ${
            activeTab === tab.id
              ? 'text-[#00ff88] border-[#00ff88]'
              : 'text-gray-400 border-transparent hover:text-white hover:border-gray-600'
          }`}
          role="tab"
          aria-selected={activeTab === tab.id}
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="px-1.5 py-0.5 text-xs rounded bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export function ModalFooter({ activeTab, mcpConfigSaved, mcpConfigChanged, onClose, onSave }: {
  activeTab: TabType
  mcpConfigSaved: boolean
  mcpConfigChanged: boolean
  onClose: () => void
  onSave: () => void
}) {
  const getCloseLabel = () => {
    if (activeTab === 'audio') return 'Done'
    if (activeTab === 'mcp' && mcpConfigSaved) return 'Done'
    return activeTab === 'mcp' ? 'Close' : 'Cancel'
  }

  return (
    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
      <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm">
        {getCloseLabel()}
      </button>
      {activeTab === 'audio' ? (
        <span className="px-4 py-2 text-gray-500 text-sm">Settings save automatically</span>
      ) : activeTab === 'mcp' && mcpConfigSaved ? (
        <span className="px-4 py-2 bg-green-600/20 text-green-400 rounded text-sm font-medium">✓ Saved</span>
      ) : (
        <button
          onClick={onSave}
          disabled={activeTab === 'mcp' && !mcpConfigChanged}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            activeTab === 'mcp' && !mcpConfigChanged
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-[#00ff88] hover:bg-[#00c8ff] text-black'
          }`}
        >
          Save
        </button>
      )}
    </div>
  )
}
