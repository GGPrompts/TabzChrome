interface ToolbarProps {
  zoom: number
  setZoom: (zoom: number) => void
  resetView: () => void
  terminalCount: number
}

export function Toolbar({ zoom, setZoom, resetView, terminalCount }: ToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold text-[var(--primary)]">
          Tabz Canvas
        </h1>
        <span className="text-xs text-[var(--muted-foreground)]">
          {terminalCount} terminal{terminalCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Zoom controls */}
        <div className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--muted)]">
          <button
            onClick={() => setZoom(Math.max(0.25, zoom - 0.1))}
            className="px-2 py-0.5 text-sm hover:bg-[var(--background)] rounded"
            title="Zoom out"
          >
            -
          </button>
          <span className="w-12 text-center text-xs text-[var(--muted-foreground)]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom(Math.min(2, zoom + 0.1))}
            className="px-2 py-0.5 text-sm hover:bg-[var(--background)] rounded"
            title="Zoom in"
          >
            +
          </button>
        </div>

        <button
          onClick={resetView}
          className="px-3 py-1 text-xs rounded bg-[var(--muted)] hover:bg-[var(--border)] transition-colors"
          title="Reset view (Ctrl+0)"
        >
          Reset View
        </button>
      </div>
    </div>
  )
}
