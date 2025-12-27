import React, { useState } from 'react'
import { Send, Loader2, Sparkles } from 'lucide-react'

interface GitCommitFormProps {
  onCommit: (message: string) => Promise<void>
  onStageAll?: () => Promise<void>
  onGenerateMessage?: () => Promise<string>
  hasUnstaged: boolean
  hasStaged: boolean
  loading?: string | null
}

export function GitCommitForm({ onCommit, onStageAll, onGenerateMessage, hasUnstaged, hasStaged, loading }: GitCommitFormProps) {
  const [message, setMessage] = useState('')
  const isCommitting = loading === 'commit'
  const isStaging = loading === 'stage'
  const isGenerating = loading === 'generate'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || isCommitting) return

    try {
      await onCommit(message.trim())
      setMessage('')
    } catch {
      // Error handled by parent
    }
  }

  const handleGenerate = async () => {
    if (!onGenerateMessage || isGenerating) return
    try {
      const generated = await onGenerateMessage()
      setMessage(generated)
    } catch {
      // Error handled by parent
    }
  }

  const canCommit = hasStaged && message.trim().length > 0

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="relative">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message..."
          className="w-full px-3 py-2 pr-10 bg-background border border-border rounded-lg text-sm resize-none focus:outline-none focus:border-primary/50 font-mono"
          rows={2}
          disabled={isCommitting || isGenerating}
        />

        {/* AI Generate button */}
        {onGenerateMessage && hasStaged && (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || isCommitting}
            className="absolute right-2 top-2 p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md transition-colors disabled:opacity-50"
            title="Generate commit message with AI (Haiku)"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Stage all button if there are unstaged changes */}
        {hasUnstaged && onStageAll && (
          <button
            type="button"
            onClick={onStageAll}
            disabled={isStaging || isCommitting}
            className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg transition-colors disabled:opacity-50"
          >
            {isStaging ? (
              <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
            ) : null}
            Stage All
          </button>
        )}

        <button
          type="submit"
          disabled={!canCommit || isCommitting}
          className="px-3 py-1.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ml-auto"
        >
          {isCommitting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Send className="w-3 h-3" />
          )}
          Commit
        </button>
      </div>

      {!hasStaged && message.trim() && (
        <p className="text-xs text-yellow-400">
          Stage some changes before committing
        </p>
      )}
    </form>
  )
}
