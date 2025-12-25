import React, { useState, useEffect } from 'react'
import { TabType } from './settings/types'
import { SettingsProvider, useSettings } from './settings/SettingsContext'
import { ProfilesTab } from './settings/ProfilesTab'
import { McpToolsTab } from './settings/McpToolsTab'
import { AudioTab } from './settings/AudioTab'
import { ImportExportDialog } from './settings/ImportExportDialog'
import { ModalHeader, TokenHelpPanel, TabNavigation, ModalFooter } from './settings/ModalUI'

// Re-export types for backward compatibility
export type {
  Profile,
  CategorySettings,
  AudioSettings,
  AudioEventSettings,
  AudioMode,
  ProfileAudioOverrides,
} from './settings/types'

export { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from './settings/types'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  editProfileId?: string | null
}

/**
 * SettingsModal - Main settings interface for Tabz
 * Thin orchestrator that delegates to tab components via SettingsContext
 */
export function SettingsModal({ isOpen, onClose, editProfileId }: SettingsModalProps) {
  if (!isOpen) return null

  return (
    <SettingsProvider isOpen={isOpen} onClose={onClose}>
      <SettingsModalContent onClose={onClose} editProfileId={editProfileId} />
    </SettingsProvider>
  )
}

interface SettingsModalContentProps {
  onClose: () => void
  editProfileId?: string | null
}

function SettingsModalContent({ onClose, editProfileId }: SettingsModalContentProps) {
  const [activeTab, setActiveTab] = useState<TabType>('profiles')
  const settings = useSettings()

  // Switch to profiles tab when editProfileId changes
  useEffect(() => {
    if (editProfileId) setActiveTab('profiles')
  }, [editProfileId])

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      {/* Hidden file input for import */}
      <input
        ref={settings.fileInputRef}
        type="file"
        accept=".json"
        onChange={settings.handleFileSelect}
        className="hidden"
      />

      {/* Import Confirmation Dialog */}
      {settings.showImportDialog && (
        <ImportExportDialog
          pendingImportProfiles={settings.pendingImportProfiles}
          pendingImportCategorySettings={settings.pendingImportCategorySettings}
          importWarnings={settings.importWarnings}
          onConfirm={settings.handleImportConfirm}
          onCancel={settings.handleImportCancel}
        />
      )}

      <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <ModalHeader
          showTokenHelp={settings.showTokenHelp}
          onToggleTokenHelp={() => settings.setShowTokenHelp(!settings.showTokenHelp)}
          onClose={onClose}
        />

        {/* Security Token Help Panel */}
        {settings.showTokenHelp && (
          <TokenHelpPanel
            tokenCopied={settings.tokenCopied}
            onCopyToken={settings.handleCopyToken}
            onClose={() => settings.setShowTokenHelp(false)}
          />
        )}

        {/* Tab Navigation */}
        <TabNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          profileCount={settings.profiles.length}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'profiles' && (
            <div role="tabpanel" id="profiles-panel" aria-labelledby="profiles-tab">
              <ProfilesTab
                profiles={settings.profiles}
                setProfiles={settings.setProfiles}
                defaultProfile={settings.defaultProfile}
                setDefaultProfile={settings.setDefaultProfile}
                categorySettings={settings.categorySettings}
                setCategorySettings={settings.setCategorySettings}
                audioSettings={settings.audioSettings}
                onExportProfiles={settings.handleExportProfiles}
                onImportClick={settings.handleImportClick}
                editProfileId={editProfileId}
              />
            </div>
          )}

          {activeTab === 'mcp' && (
            <div role="tabpanel" id="mcp-panel" aria-labelledby="mcp-tab">
              <McpToolsTab
                mcpEnabledTools={settings.mcpEnabledTools}
                setMcpEnabledTools={settings.setMcpEnabledTools}
                mcpConfigChanged={settings.mcpConfigChanged}
                setMcpConfigChanged={settings.setMcpConfigChanged}
                mcpConfigSaved={settings.mcpConfigSaved}
                setMcpConfigSaved={settings.setMcpConfigSaved}
                mcpLoading={settings.mcpLoading}
                allowAllUrls={settings.allowAllUrls}
                setAllowAllUrls={settings.setAllowAllUrls}
                customDomains={settings.customDomains}
                setCustomDomains={settings.setCustomDomains}
                onSave={settings.handleMcpSave}
              />
            </div>
          )}

          {activeTab === 'audio' && (
            <div role="tabpanel" id="audio-panel" aria-labelledby="audio-tab">
              <AudioTab
                audioSettings={settings.audioSettings}
                updateAudioSettings={settings.updateAudioSettings}
                updateAudioEvents={settings.updateAudioEvents}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <ModalFooter
          activeTab={activeTab}
          mcpConfigSaved={settings.mcpConfigSaved}
          mcpConfigChanged={settings.mcpConfigChanged}
          onClose={onClose}
          onSave={activeTab === 'mcp' ? settings.handleMcpSave : settings.handleSaveProfiles}
        />
      </div>
    </div>
  )
}
