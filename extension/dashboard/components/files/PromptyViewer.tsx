import React, { useState, useMemo, useCallback } from 'react'
import { Copy, Send, Terminal, ChevronDown, AtSign, Star, Pin, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { parsePrompty, getPromptForSending, getFieldProgress } from '../../utils/promptyUtils'
import { InlineField } from './InlineField'
import { sendMessage } from '../../../shared/messaging'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface TerminalInfo {
  id: string
  name: string
  sessionName?: string
  isClaudeSession?: boolean
}

interface PromptyViewerProps {
  content: string
  path: string
  name: string
  fontSize: number
  fontFamily: string
  pinned: boolean
  isFavorite: boolean
  onToggleFavorite: () => void
  onPin: () => void
  onOpenInEditor: () => void
}

export function PromptyViewer({
  content,
  path,
  name,
  fontSize,
  fontFamily,
  pinned,
  isFavorite,
  onToggleFavorite,
  onPin,
  onOpenInEditor,
}: PromptyViewerProps) {
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [showSendDropdown, setShowSendDropdown] = useState(false)
  const [terminals, setTerminals] = useState<TerminalInfo[]>([])
  const [sendStatus, setSendStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle')
  const [activeFieldIndex, setActiveFieldIndex] = useState<number | null>(null)

  // Parse the prompty file
  const parsed = useMemo(() => parsePrompty(content), [content])

  // Get ordered list of field names (for tab navigation)
  const fieldOrder = useMemo(() => {
    const fieldRegex = /\{\{([^:}]+)(?::([^}]+))?\}\}/g
    const fields: string[] = []
    let match
    while ((match = fieldRegex.exec(parsed.content)) !== null) {
      const fieldName = match[1].trim()
      if (!fields.includes(fieldName)) {
        fields.push(fieldName)
      }
    }
    return fields
  }, [parsed.content])

  // Progress tracking
  const progress = useMemo(
    () => getFieldProgress(parsed.variables, variableValues),
    [parsed.variables, variableValues]
  )

  const handleFieldChange = useCallback((fieldId: string, value: string) => {
    setVariableValues(prev => ({ ...prev, [fieldId]: value }))
  }, [])

  // Tab navigation between fields
  const handleNavigate = useCallback((currentFieldId: string, direction: 'next' | 'prev') => {
    const currentIndex = fieldOrder.indexOf(currentFieldId)
    let nextIndex: number

    if (direction === 'next') {
      if (currentIndex >= fieldOrder.length - 1) {
        // Last field, clear active
        setActiveFieldIndex(null)
        return
      }
      nextIndex = currentIndex + 1
    } else {
      if (currentIndex <= 0) {
        setActiveFieldIndex(null)
        return
      }
      nextIndex = currentIndex - 1
    }

    setActiveFieldIndex(nextIndex)
    // Clear after a moment to allow the field to activate
    setTimeout(() => setActiveFieldIndex(null), 100)
  }, [fieldOrder])

  // Helper to render text with inline fields - processes string children for {{variable}} patterns
  const renderTextWithFields = useCallback((text: string): React.ReactNode => {
    const fieldRegex = /\{\{([^:}]+)(?::([^}]+))?\}\}/g
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    let match
    let key = 0

    while ((match = fieldRegex.exec(text)) !== null) {
      // Add text before this field
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index))
      }

      const fieldName = match[1].trim()
      const hint = match[2]?.trim()
      const fieldIdx = fieldOrder.indexOf(fieldName)

      parts.push(
        <InlineField
          key={`field-${fieldName}-${key++}`}
          fieldId={fieldName}
          hint={hint}
          value={variableValues[fieldName] || ''}
          onChange={handleFieldChange}
          onNavigate={(direction) => handleNavigate(fieldName, direction)}
          isActive={activeFieldIndex === fieldIdx}
        />
      )

      lastIndex = fieldRegex.lastIndex
    }

    // Add remaining text after last field
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex))
    }

    return parts.length === 0 ? text : parts.length === 1 ? parts[0] : <>{parts}</>
  }, [fieldOrder, variableValues, handleFieldChange, handleNavigate, activeFieldIndex])

  // Process children recursively to find and replace {{variable}} patterns
  const processChildren = useCallback((children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, child => {
      if (typeof child === 'string') {
        return renderTextWithFields(child)
      }
      if (React.isValidElement(child) && child.props.children) {
        return React.cloneElement(child, {
          ...child.props,
          children: processChildren(child.props.children)
        } as any)
      }
      return child
    })
  }, [renderTextWithFields])

  const copyContent = async () => {
    const processed = getPromptForSending(content, variableValues)
    await navigator.clipboard.writeText(processed)
    setCopyStatus('copied')
    setTimeout(() => setCopyStatus('idle'), 2000)
  }

  const copyPath = async () => {
    await navigator.clipboard.writeText(`@${path}`)
  }

  const fetchTerminals = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8129/api/agents')
      if (!response.ok) return
      const data = await response.json()
      const terminalList: TerminalInfo[] = (data.data || []).map((t: any) => ({
        id: t.id,
        name: t.name || t.id,
        sessionName: t.sessionName,
        isClaudeSession: t.name?.toLowerCase().includes('claude') || t.id?.includes('claude')
      }))
      setTerminals(terminalList)
    } catch (err) {
      console.error('Failed to fetch terminals:', err)
    }
  }, [])

  const sendToTerminal = useCallback(async (terminal: TerminalInfo, sendEnter: boolean = false) => {
    const processed = getPromptForSending(content, variableValues)

    setSendStatus('sending')
    try {
      if (terminal.sessionName) {
        await sendMessage({
          type: 'TMUX_SESSION_SEND',
          sessionName: terminal.sessionName,
          text: processed,
          sendEnter
        })
      } else {
        await sendMessage({
          type: 'TERMINAL_INPUT',
          terminalId: terminal.id,
          data: processed
        })
      }
      setSendStatus('sent')
      setShowSendDropdown(false)
      setTimeout(() => setSendStatus('idle'), 2000)
    } catch (err) {
      console.error('Failed to send to terminal:', err)
      setSendStatus('idle')
    }
  }, [content, variableValues])

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-card/50 flex-wrap">
        <button
          onClick={copyContent}
          className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${copyStatus === 'copied' ? 'text-green-400' : ''}`}
          title="Copy prompt (with variables filled)"
        >
          <Copy className="w-4 h-4" /> {copyStatus === 'copied' ? 'Copied!' : 'Copy'}
        </button>
        <button onClick={copyPath} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded" title="Copy @path to clipboard">
          <AtSign className="w-4 h-4" /> Path
        </button>
        <button
          onClick={onToggleFavorite}
          className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${isFavorite ? 'text-yellow-400' : ''}`}
          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
        </button>
        {!pinned && (
          <button
            onClick={onPin}
            className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded text-primary"
            title="Pin this file (keep tab open)"
          >
            <Pin className="w-4 h-4" /> Pin
          </button>
        )}
        <button onClick={onOpenInEditor} className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded">
          <ExternalLink className="w-4 h-4" /> Edit
        </button>

        {/* Send to Terminal dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              if (!showSendDropdown) fetchTerminals()
              setShowSendDropdown(!showSendDropdown)
            }}
            className={`flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded ${
              sendStatus === 'sent' ? 'text-green-400' : ''
            }`}
            title="Send prompt to terminal"
          >
            <Send className="w-4 h-4" />
            {sendStatus === 'sent' ? 'Sent!' : 'Send'}
            <ChevronDown className="w-3 h-3" />
          </button>
          {showSendDropdown && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
              {terminals.length === 0 ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">No terminals found</div>
              ) : (
                <>
                  <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border mb-1">
                    Send to terminal
                  </div>
                  {terminals.map(t => (
                    <div key={t.id} className="px-2">
                      <button
                        onClick={() => sendToTerminal(t, false)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted rounded text-left"
                      >
                        <Terminal className={`w-4 h-4 ${t.isClaudeSession ? 'text-orange-400' : ''}`} />
                        <span className="truncate flex-1">{t.name}</span>
                        {t.isClaudeSession && <span className="text-xs text-orange-400">🤖</span>}
                      </button>
                      {t.isClaudeSession && (
                        <button
                          onClick={() => sendToTerminal(t, true)}
                          className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted rounded text-left text-muted-foreground ml-6"
                          title="Send and press Enter to submit"
                        >
                          <Send className="w-3 h-3" /> Send + Enter (submit)
                        </button>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {progress.total > 0 && (
          <div className="flex items-center gap-1.5 ml-auto text-xs text-muted-foreground">
            {progress.filled === progress.total ? (
              <CheckCircle2 className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-pink-400/60" />
            )}
            <span>
              {progress.filled}/{progress.total} filled
            </span>
          </div>
        )}
      </div>

      {/* Frontmatter header */}
      {(parsed.frontmatter.name || parsed.frontmatter.description) && (
        <div className="px-4 py-3 border-b border-border bg-pink-500/5">
          {parsed.frontmatter.name && (
            <h2 className="text-lg font-semibold text-pink-400">
              {parsed.frontmatter.url ? (
                <a
                  href={parsed.frontmatter.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline inline-flex items-center gap-1.5"
                >
                  {parsed.frontmatter.name}
                  <ExternalLink className="w-4 h-4 opacity-60" />
                </a>
              ) : (
                parsed.frontmatter.name
              )}
            </h2>
          )}
          {parsed.frontmatter.description && (
            <p className="text-sm text-muted-foreground mt-1">{parsed.frontmatter.description}</p>
          )}
        </div>
      )}

      {/* Prompt content with markdown rendering and inline fields */}
      <div
        className="flex-1 overflow-auto p-4 file-viewer-markdown"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily: `${fontFamily}, monospace`,
        }}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            // Process text in paragraphs for {{variables}}
            p: ({ children }) => <p>{processChildren(children)}</p>,
            // Process text in list items
            li: ({ children }) => <li>{processChildren(children)}</li>,
            // Process headings
            h1: ({ children }) => <h1>{processChildren(children)}</h1>,
            h2: ({ children }) => <h2>{processChildren(children)}</h2>,
            h3: ({ children }) => <h3>{processChildren(children)}</h3>,
            h4: ({ children }) => <h4>{processChildren(children)}</h4>,
            h5: ({ children }) => <h5>{processChildren(children)}</h5>,
            h6: ({ children }) => <h6>{processChildren(children)}</h6>,
            // Process table cells
            td: ({ children }) => <td>{processChildren(children)}</td>,
            th: ({ children }) => <th>{processChildren(children)}</th>,
            // Process blockquotes
            blockquote: ({ children }) => <blockquote>{processChildren(children)}</blockquote>,
            // Process strong/em
            strong: ({ children }) => <strong>{processChildren(children)}</strong>,
            em: ({ children }) => <em>{processChildren(children)}</em>,
            // Code blocks with syntax highlighting
            code({ className, children, ...props }: any) {
              const match = /language-(\w+)/.exec(className || '')
              const codeString = String(children).replace(/\n$/, '')

              // Inline code - also process for variables
              if (!match && !className) {
                return <code className={className} {...props}>{processChildren(children)}</code>
              }

              // Code block with syntax highlighting
              return (
                <SyntaxHighlighter
                  language={match?.[1] || 'text'}
                  style={vscDarkPlus}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    background: 'rgba(0, 0, 0, 0.4)',
                    borderRadius: '8px',
                    fontSize: `${fontSize}px`,
                    fontFamily: `${fontFamily}, monospace`,
                  }}
                  codeTagProps={{
                    style: {
                      fontSize: `${fontSize}px`,
                      fontFamily: `${fontFamily}, monospace`,
                    }
                  }}
                >
                  {codeString}
                </SyntaxHighlighter>
              )
            },
            // Links
            a({ href, children, ...props }: any) {
              return (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                  {...props}
                >
                  {processChildren(children)}
                </a>
              )
            },
          }}
        >
          {parsed.content}
        </ReactMarkdown>
      </div>
    </div>
  )
}
