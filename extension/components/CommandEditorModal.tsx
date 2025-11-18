import React, { useState, useEffect } from 'react'
import { X, Plus, Edit, Trash2, Save } from 'lucide-react'

interface Command {
  label: string
  command: string
  description: string
  category: string
  type: 'spawn' | 'clipboard'
  isCustom?: boolean
  workingDir?: string
  url?: string
}

interface CommandEditorModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (commands: Command[]) => void
  customCommands: Command[]
  allCategories: string[] // All existing categories from default + custom commands
  initialEditCommand?: Command | null // Optional command to edit when opening modal
}

export function CommandEditorModal({ isOpen, onClose, onSave, customCommands, allCategories, initialEditCommand }: CommandEditorModalProps) {
  const [commands, setCommands] = useState<Command[]>(customCommands)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [showCategoryInput, setShowCategoryInput] = useState(false)
  const [formData, setFormData] = useState<Command>({
    label: '',
    command: '',
    description: '',
    category: 'Custom',
    type: 'clipboard',
    isCustom: true,
    workingDir: '',
    url: '',
  })

  useEffect(() => {
    setCommands(customCommands)
  }, [customCommands])

  // Handle modal open/close and edit command
  useEffect(() => {
    if (isOpen) {
      // When opening, always sync with parent's custom commands
      setCommands(customCommands)

      // If opening to edit a specific command
      if (initialEditCommand) {
        const index = customCommands.findIndex(
          cmd => cmd.label === initialEditCommand.label &&
                 cmd.command === initialEditCommand.command
        )
        if (index !== -1) {
          setFormData(initialEditCommand)
          setEditingIndex(index)
        }
      }
    } else {
      // Reset when modal closes
      setEditingIndex(null)
      setFormData({
        label: '',
        command: '',
        description: '',
        category: 'Custom',
        type: 'clipboard',
        isCustom: true,
        workingDir: '',
        url: '',
      })
    }
  }, [isOpen, initialEditCommand, customCommands])

  // Get unique categories including custom ones
  const availableCategories = Array.from(new Set([...allCategories, ...commands.map(c => c.category)]))
    .filter(Boolean)
    .sort()

  const handleAdd = () => {
    if (!formData.label || !formData.command) return

    if (editingIndex !== null) {
      // Update existing
      const updated = [...commands]
      updated[editingIndex] = { ...formData, isCustom: true }
      setCommands(updated)
      setEditingIndex(null)
    } else {
      // Add new
      setCommands([...commands, { ...formData, isCustom: true }])
    }

    // Reset form
    setFormData({
      label: '',
      command: '',
      description: '',
      category: 'Custom',
      type: 'clipboard',
      isCustom: true,
      workingDir: '',
      url: '',
    })
  }

  const handleEdit = (index: number) => {
    setFormData(commands[index])
    setEditingIndex(index)
  }

  const handleDelete = (index: number) => {
    setCommands(commands.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    onSave(commands)
    onClose()
  }

  const handleCancel = () => {
    setEditingIndex(null)
    setShowCategoryInput(false)
    setFormData({
      label: '',
      command: '',
      description: '',
      category: 'Custom',
      type: 'clipboard',
      isCustom: true,
      workingDir: '',
      url: '',
    })
  }

  const handleCategoryChange = (value: string) => {
    if (value === '__new__') {
      setShowCategoryInput(true)
      setFormData({ ...formData, category: '' })
    } else {
      setShowCategoryInput(false)
      setFormData({ ...formData, category: value })
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f0f0f] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Edit Quick Commands</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors text-gray-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Add/Edit Form */}
          <div className="bg-black/30 border border-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-white mb-3">
              {editingIndex !== null ? 'Edit Command' : 'Add New Command'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Label</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="e.g., List Files"
                  className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Category</label>
                {showCategoryInput ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      placeholder="Enter new category name"
                      className="flex-1 px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        setShowCategoryInput(false)
                        if (!formData.category) {
                          setFormData({ ...formData, category: 'Custom' })
                        }
                      }}
                      className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
                    >
                      ✓
                    </button>
                  </div>
                ) : (
                  <select
                    value={formData.category}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                  >
                    {availableCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="__new__">+ New Category...</option>
                  </select>
                )}
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Command</label>
                <input
                  type="text"
                  value={formData.command}
                  onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  placeholder="e.g., ls -la"
                  className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., List all files with details"
                  className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Working Directory (optional)</label>
                <input
                  type="text"
                  value={formData.workingDir || ''}
                  onChange={(e) => setFormData({ ...formData, workingDir: e.target.value })}
                  placeholder="e.g., /home/user/projects/my-app"
                  className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If set, this command will always use this directory (overrides global setting)
                </p>
              </div>
              <div className="col-span-2">
                <label className="block text-xs text-gray-400 mb-1">URL (optional)</label>
                <input
                  type="text"
                  value={formData.url || ''}
                  onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                  placeholder="e.g., https://github.com/user/repo"
                  className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm font-mono focus:border-[#00ff88] focus:outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Link to documentation, installation guide, or related resources
                </p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Type</label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value as 'spawn' | 'clipboard' })}
                  className="w-full px-3 py-2 bg-black/50 border border-gray-700 rounded text-white text-sm focus:border-[#00ff88] focus:outline-none"
                >
                  <option value="clipboard">Copy to Clipboard</option>
                  <option value="spawn">Spawn Terminal</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                {editingIndex !== null && (
                  <button
                    onClick={handleCancel}
                    className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleAdd}
                  disabled={!formData.label || !formData.command}
                  className="flex-1 px-4 py-2 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {editingIndex !== null ? (
                    <>
                      <Save className="h-4 w-4" />
                      Update
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4" />
                      Add
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Commands List */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3">Custom Commands ({commands.length})</h3>
            {commands.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                No custom commands yet. Add one above!
              </div>
            ) : (
              <div className="space-y-2">
                {commands.map((cmd, index) => (
                  <div
                    key={index}
                    className="bg-black/30 border border-gray-800 rounded-lg p-3 hover:bg-black/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white text-sm">{cmd.label}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                            {cmd.category}
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded bg-[#00ff88]/20 text-[#00ff88]">
                            {cmd.type === 'spawn' ? 'Spawn' : 'Copy'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mb-1">{cmd.description}</div>
                        <div className="text-xs font-mono text-gray-300 bg-black/40 px-2 py-1 rounded border border-gray-800 truncate">
                          {cmd.command}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(index)}
                          className="p-1.5 hover:bg-[#00ff88]/10 rounded text-[#00ff88] hover:text-[#00c8ff] transition-colors"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(index)}
                          className="p-1.5 hover:bg-red-500/10 rounded text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded text-sm font-medium transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
