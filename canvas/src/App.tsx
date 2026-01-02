import { useEffect, useRef, useState, useCallback } from 'react'
import { useCanvasViewport, useCanvasTerminals, useCanvasFiles, type FileType } from './hooks'
import { CanvasTerminal } from './components/CanvasTerminal'
import { CanvasFileCard } from './components/CanvasFileCard'
import { Toolbar } from './components/Toolbar'

// File extension to language mapping for syntax highlighting
const extensionToLanguage: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  sql: 'sql',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  vue: 'vue',
  svelte: 'svelte',
  lua: 'lua',
  r: 'r',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
}

// Detect file type from extension
function detectFileType(filename: string): { fileType: FileType; language?: string } {
  const ext = filename.split('.').pop()?.toLowerCase() || ''

  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext)) {
    return { fileType: 'image' }
  }

  // Markdown files
  if (['md', 'mdx', 'markdown'].includes(ext)) {
    return { fileType: 'markdown' }
  }

  // Code files
  const language = extensionToLanguage[ext]
  if (language) {
    return { fileType: 'code', language }
  }

  // Plain text
  return { fileType: 'text' }
}

function App() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [startPan, setStartPan] = useState({ x: 0, y: 0 })
  const [isDragOver, setIsDragOver] = useState(false)

  // Use hooks instead of Zustand stores
  const { pan, setPan, zoom, setZoom, resetView } = useCanvasViewport()
  const { terminals, updateTerminal, removeTerminal } = useCanvasTerminals()
  const { files, addFile, updateFile, removeFile } = useCanvasFiles()

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only pan on middle mouse or when clicking empty canvas
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      setIsPanning(true)
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }, [pan])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return
    setPan({
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    })
  }, [isPanning, startPan, setPan])

  const handleMouseUp = useCallback(() => {
    setIsPanning(false)
  }, [])

  // Zoom with wheel - use native event listener for non-passive
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.min(Math.max(zoom * delta, 0.25), 2)

      // Zoom toward cursor position
      const rect = container.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      const newPan = {
        x: mouseX - (mouseX - pan.x) * (newZoom / zoom),
        y: mouseY - (mouseY - pan.y) * (newZoom / zoom),
      }

      setPan(newPan)
      setZoom(newZoom)
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [zoom, pan, setZoom, setPan])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Reset view with Ctrl+0
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        resetView()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [resetView])

  // File drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only set to false if leaving the container entirely
    if (e.currentTarget === e.target) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return

    // Calculate drop position in canvas coordinates
    const dropX = (e.clientX - rect.left - pan.x) / zoom
    const dropY = (e.clientY - rect.top - pan.y) / zoom

    const droppedFiles = Array.from(e.dataTransfer.files)

    for (let i = 0; i < droppedFiles.length; i++) {
      const file = droppedFiles[i]
      const { fileType, language } = detectFileType(file.name)

      try {
        let content: string

        if (fileType === 'image') {
          // Read as data URL for images
          content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(file)
          })
        } else {
          // Read as text for other files
          content = await file.text()
        }

        addFile({
          name: file.name,
          content,
          fileType,
          language,
          position: {
            x: dropX + i * 30,
            y: dropY + i * 30,
          },
          size: {
            width: fileType === 'image' ? 400 : 500,
            height: fileType === 'image' ? 300 : 400,
          },
        })
      } catch (err) {
        console.error('Error reading file:', file.name, err)
      }
    }
  }, [pan, zoom, addFile])

  return (
    <div className="h-full w-full flex flex-col bg-[var(--background)]">
      <Toolbar
        zoom={zoom}
        setZoom={setZoom}
        resetView={resetView}
        terminalCount={terminals.length}
      />

      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden"
        style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Grid pattern background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(var(--border) 1px, transparent 1px),
              linear-gradient(90deg, var(--border) 1px, transparent 1px)
            `,
            backgroundSize: `${50 * zoom}px ${50 * zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />

        {/* Canvas content */}
        <div
          className="absolute"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {terminals.map((terminal) => (
            <CanvasTerminal
              key={terminal.id}
              terminal={terminal}
              zoom={zoom}
              onUpdate={(updates) => updateTerminal(terminal.id, updates)}
              onRemove={() => removeTerminal(terminal.id)}
            />
          ))}
          {files.map((file) => (
            <CanvasFileCard
              key={file.id}
              file={file}
              zoom={zoom}
              onUpdate={(updates) => updateFile(file.id, updates)}
              onRemove={() => removeFile(file.id)}
            />
          ))}
        </div>

        {/* Drop overlay */}
        {isDragOver && (
          <div className="absolute inset-0 bg-[var(--primary)]/10 border-2 border-dashed border-[var(--primary)] pointer-events-none flex items-center justify-center">
            <div className="bg-[var(--card)] px-6 py-4 rounded-lg shadow-lg border border-[var(--border)]">
              <p className="text-sm font-medium">Drop files to view on canvas</p>
            </div>
          </div>
        )}

        {/* Zoom indicator */}
        <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded text-xs text-[var(--muted-foreground)]">
          {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  )
}

export default App
