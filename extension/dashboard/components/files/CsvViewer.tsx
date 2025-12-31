import React from 'react'
import { MoreVertical } from 'lucide-react'
// Animated icons
import { CopyIcon } from '../../../components/icons'
import { parseCSV, formatRelativeTime } from './fileViewerUtils'

export interface CsvViewerFile {
  name: string
  path: string
  content?: string | null
  lineCount?: number
  modified?: string
}

export interface ViewerSettings {
  fontSize: number
  fontFamily: string
}

export interface CsvViewerProps {
  file: CsvViewerFile
  viewerSettings: ViewerSettings
  onCopy: () => void
  onOpenActions: (e: React.MouseEvent) => void
}

export function CsvViewer({ file, viewerSettings, onCopy, onOpenActions }: CsvViewerProps) {
  const { headers, rows } = parseCSV(file.content || '')

  return (
    <div className="h-full flex flex-col">
      {/* CSV Toolbar */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-card/50">
        <button
          onClick={onCopy}
          className="flex items-center gap-1 px-2 py-1 text-sm hover:bg-muted rounded"
          title="Copy file content"
        >
          <CopyIcon size={16} /> Copy
        </button>
        <button
          onClick={onOpenActions}
          className="p-1.5 hover:bg-muted rounded"
          title="More actions"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
        <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          {file.lineCount !== undefined && (
            <span>{file.lineCount} rows</span>
          )}
          {file.modified && (
            <span title={new Date(file.modified).toLocaleString()}>
              {formatRelativeTime(file.modified)}
            </span>
          )}
          <span className="truncate max-w-[200px]" title={file.path}>{file.path}</span>
        </div>
      </div>
      {/* CSV Table */}
      <div className="flex-1 overflow-auto p-4">
        <table
          className="w-full border-collapse text-sm"
          style={{ fontFamily: `${viewerSettings.fontFamily}, monospace`, fontSize: `${viewerSettings.fontSize}px` }}
        >
          <thead>
            <tr className="bg-muted/50 sticky top-0">
              {headers.map((header, i) => (
                <th key={i} className="border border-border px-3 py-2 text-left font-semibold whitespace-nowrap">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-muted/30">
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-border px-3 py-1.5 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
