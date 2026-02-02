import React from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Play, ClipboardPaste, MessageSquare } from 'lucide-react'
import { parseFrontmatter } from './fileViewerUtils'
import { spawnTerminal, queueCommand, pasteCommand, getProfiles } from '../../hooks/useDashboard'

export interface MarkdownViewerFile {
  name: string
  path: string
  content?: string | null
}

export interface ViewerSettings {
  fontSize: number
  fontFamily: string
}

export interface MarkdownViewerProps {
  file: MarkdownViewerFile
  viewerSettings: ViewerSettings
  onOpenFile: (path: string) => void
}

export function MarkdownViewer({ file, viewerSettings, onOpenFile }: MarkdownViewerProps) {
  // Parse frontmatter for SKILL.md, AGENT.md, and similar files
  const { frontmatter, content: markdownContent } = parseFrontmatter(file.content || '')

  return (
    <div
      className="file-viewer-markdown"
      style={{
        fontSize: `${viewerSettings.fontSize}px`,
        fontFamily: `${viewerSettings.fontFamily}, monospace`,
      }}
    >
      {/* Frontmatter header for skill/agent files */}
      {frontmatter && Object.keys(frontmatter).length > 0 && (
        <div className="mb-6 pb-4 border-b border-border">
          {frontmatter.name && (
            <h1 className="text-2xl font-bold text-primary mb-2 flex items-center gap-2">
              {file.name.toLowerCase().includes('skill') && <span>⚡</span>}
              {file.name.toLowerCase().includes('agent') && <span>🤖</span>}
              {file.name.toLowerCase().includes('command') && <span>⚡</span>}
              {frontmatter.name}
            </h1>
          )}
          {frontmatter.description && (
            <p className="text-muted-foreground text-base leading-relaxed">
              {frontmatter.description}
            </p>
          )}
          {/* Show all other frontmatter fields */}
          {(() => {
            const otherFields = Object.entries(frontmatter).filter(
              ([key]) => !['name', 'description'].includes(key)
            )
            if (otherFields.length === 0) return null
            return (
              <div className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                {otherFields.map(([key, value]) => (
                  <React.Fragment key={key}>
                    <span className="text-muted-foreground/70 font-medium">{key}:</span>
                    <span className="text-foreground/90 font-mono text-xs">{value}</span>
                  </React.Fragment>
                ))}
              </div>
            )
          })()}
        </div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) => {
          // Allow tabz: protocol through (default sanitizer strips it)
          if (url.startsWith('tabz:')) return url
          // Default behavior for other URLs
          return url
        }}
        components={{
          a({ href, children, ...props }: any) {
            // Handle tabz: protocol links for terminal integration
            if (href?.startsWith('tabz:')) {
              // Parse tabz:action?params manually (URL constructor doesn't handle custom protocols well)
              const withoutProtocol = href.slice(5) // remove 'tabz:'
              const [action, queryString] = withoutProtocol.split('?')
              const params = new URLSearchParams(queryString || '')

              const handleClick = async (e: React.MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                try {
                  if (action === 'spawn') {
                    // tabz:spawn?profile=xxx or tabz:spawn?cmd=xxx&name=xxx&dir=xxx
                    const profileName = params.get('profile')
                    if (profileName) {
                      const profiles = await getProfiles()
                      const searchLower = profileName.toLowerCase()

                      // Find profile with priority: exact > emoji-stripped > starts-with > contains
                      const profile =
                        // 1. Exact match on id
                        profiles.find(p => p.id === profileName) ||
                        // 2. Exact match on name (case-insensitive)
                        profiles.find(p => p.name.toLowerCase() === searchLower) ||
                        // 3. Match ignoring emoji prefix (e.g., "🖥️ TFE" matches "tfe")
                        profiles.find(p => p.name.toLowerCase().replace(/^\p{Emoji}\s*/u, '') === searchLower) ||
                        // 4. Name starts with search term (e.g., "claude" matches "Claude Code")
                        profiles.find(p => p.name.toLowerCase().startsWith(searchLower)) ||
                        // 5. Emoji-stripped name starts with search term
                        profiles.find(p => p.name.toLowerCase().replace(/^\p{Emoji}\s*/u, '').startsWith(searchLower))
                      if (profile) {
                        await spawnTerminal({ profile, name: profile.name })
                      } else {
                        console.error(`Profile not found: "${profileName}". Available: ${profiles.map(p => p.name).join(', ')}`)
                      }
                    } else {
                      // No profile specified - use default profile for theme settings
                      const profiles = await getProfiles()
                      const defaultProfileId = await new Promise<string>(resolve => {
                        chrome.storage.local.get(['defaultProfile'], (result: { defaultProfile?: string }) => {
                          resolve(result.defaultProfile || profiles[0]?.id || '')
                        })
                      })
                      const defaultProfile = profiles.find(p => p.id === defaultProfileId) || profiles[0]

                      await spawnTerminal({
                        name: params.get('name') || 'Terminal',
                        command: params.get('cmd') || undefined,
                        workingDir: params.get('dir') || undefined,
                        profile: defaultProfile, // Use default profile's theme
                      })
                    }
                  } else if (action === 'queue') {
                    // tabz:queue?text=xxx - queue to chat input
                    const text = params.get('text')
                    if (text) await queueCommand(text)
                  } else if (action === 'paste') {
                    // tabz:paste?text=xxx - paste into active terminal
                    const text = params.get('text')
                    if (text) await pasteCommand(text)
                  }
                } catch (err) {
                  console.error('Tabz link action failed:', err)
                }
              }

              // Determine button style based on action
              const buttonStyles: Record<string, { colors: string, icon: React.ReactNode }> = {
                spawn: { colors: 'text-green-400 border-green-500/50 hover:border-green-400 hover:bg-green-500/10', icon: <Play className="w-3 h-3" /> },
                queue: { colors: 'text-blue-400 border-blue-500/50 hover:border-blue-400 hover:bg-blue-500/10', icon: <MessageSquare className="w-3 h-3" /> },
                paste: { colors: 'text-orange-400 border-orange-500/50 hover:border-orange-400 hover:bg-orange-500/10', icon: <ClipboardPaste className="w-3 h-3" /> },
              }
              const style = buttonStyles[action] || buttonStyles.spawn

              return (
                <button
                  type="button"
                  onClick={handleClick}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium border transition-colors ${style.colors}`}
                  title={href}
                >
                  {style.icon}
                  {children}
                </button>
              )
            }

            // Check if it's a relative file link (not http/https/mailto/etc)
            const isRelativeFile = href && !href.match(/^(https?:|mailto:|#|\/\/|tabz:)/)

            if (isRelativeFile && file) {
              // Resolve relative path based on current file's directory
              const currentDir = file.path.split('/').slice(0, -1).join('/')
              const resolvedPath = href.startsWith('/')
                ? href
                : `${currentDir}/${href}`.replace(/\/\.\//g, '/') // handle ./

              return (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault()
                    onOpenFile(resolvedPath)
                  }}
                  className="text-primary hover:underline cursor-pointer"
                  title={`Open: ${resolvedPath}`}
                  {...props}
                >
                  {children}
                </a>
              )
            }

            // External links - open in new tab
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
                {...props}
              >
                {children}
              </a>
            )
          },
          // Detect box-drawing characters and render with monospace
          p({ children, ...props }: any) {
            // Recursively extract text from React children
            const extractText = (node: any): string => {
              if (typeof node === 'string') return node
              if (typeof node === 'number') return String(node)
              if (!node) return ''
              if (Array.isArray(node)) return node.map(extractText).join('')
              if (node.props?.children) return extractText(node.props.children)
              return ''
            }
            // Check if content contains box-drawing characters (U+2500 to U+257F)
            const textContent = extractText(children)
            const hasBoxDrawing = /[\u2500-\u257F]/.test(textContent)

            if (hasBoxDrawing) {
              return (
                <pre
                  className="box-art"
                  style={{
                    fontFamily: `${viewerSettings.fontFamily}, 'JetBrains Mono', monospace`,
                    fontSize: `${viewerSettings.fontSize}px`,
                  }}
                  {...props}
                >
                  {children}
                </pre>
              )
            }

            return <p {...props}>{children}</p>
          },
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const codeString = String(children).replace(/\n$/, '')

            // Inline code
            if (!match && !className) {
              return <code className={className} {...props}>{children}</code>
            }

            // Detect box-drawing characters for tighter line-height
            const hasBoxDrawing = /[\u2500-\u257F]/.test(codeString)

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
                  fontSize: `${viewerSettings.fontSize}px`,
                  fontFamily: `${viewerSettings.fontFamily}, monospace`,
                  // Tighter line-height for box art so lines connect
                  ...(hasBoxDrawing && { lineHeight: 1.15 }),
                }}
                codeTagProps={{
                  style: {
                    fontSize: `${viewerSettings.fontSize}px`,
                    fontFamily: `${viewerSettings.fontFamily}, monospace`,
                    // Tighter line-height for box art
                    ...(hasBoxDrawing && { lineHeight: 1.15 }),
                  }
                }}
              >
                {codeString}
              </SyntaxHighlighter>
            )
          }
        }}
      >
        {markdownContent}
      </ReactMarkdown>
    </div>
  )
}
