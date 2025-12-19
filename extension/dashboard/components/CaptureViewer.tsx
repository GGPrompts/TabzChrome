import React, { useState } from 'react'
import { X, Download, Copy, Check, FileText } from 'lucide-react'

interface CaptureMetadata {
  sessionName: string
  workingDir: string | null
  gitBranch: string | null
  capturedAt: string
}

interface CaptureData {
  content: string
  lines: number
  metadata: CaptureMetadata
}

interface CaptureViewerProps {
  capture: CaptureData
  onClose: () => void
}

export default function CaptureViewer({ capture, onClose }: CaptureViewerProps) {
  const [copied, setCopied] = useState(false)

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString()
  }

  const generateMarkdown = () => {
    const { metadata, content } = capture
    const lines = [
      `# Terminal Capture: ${metadata.sessionName}`,
      '',
      `**Captured:** ${formatDate(metadata.capturedAt)}`,
    ]

    if (metadata.workingDir) {
      lines.push(`**Working Directory:** ${metadata.workingDir}`)
    }

    if (metadata.gitBranch) {
      lines.push(`**Git Branch:** ${metadata.gitBranch}`)
    }

    lines.push('', '---', '', '```', content, '```')

    return lines.join('\n')
  }

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(capture.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  const handleSaveMarkdown = () => {
    const markdown = generateMarkdown()
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.download = `${capture.metadata.sessionName}-${timestamp}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card/50">
        <div className="flex items-center gap-4">
          <FileText className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold terminal-glow">
              {capture.metadata.sessionName}
            </h1>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span>{formatDate(capture.metadata.capturedAt)}</span>
              {capture.metadata.workingDir && (
                <span className="flex items-center gap-1">
                  <span className="text-primary/60">dir:</span>
                  {capture.metadata.workingDir}
                </span>
              )}
              {capture.metadata.gitBranch && (
                <span className="flex items-center gap-1">
                  <span className="text-primary/60">branch:</span>
                  {capture.metadata.gitBranch}
                </span>
              )}
              <span className="text-muted-foreground/60">
                {capture.lines.toLocaleString()} lines
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopyAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy All</span>
              </>
            )}
          </button>
          <button
            onClick={handleSaveMarkdown}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/20 hover:bg-primary/30 text-primary transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Save as Markdown</span>
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors ml-2"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <pre className="font-mono text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/90">
          {capture.content}
        </pre>
      </div>
    </div>
  )
}
