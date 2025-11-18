/**
 * Layout Manager v2 - Enhanced terminal position persistence
 * 
 * New features for v3:
 * - Canvas mode terminal positions (x, y, width, height)
 * - Z-index management for terminal stacking
 * - Terminal groups and tabs
 * - Layout templates and presets
 * - Auto-save capability
 */

const fs = require('fs').promises;
const path = require('path');
const Joi = require('joi');
const EventEmitter = require('events');

// Terminal position schema for canvas mode
const terminalPositionSchema = Joi.object({
  id: Joi.string().required(),
  x: Joi.number().required(),
  y: Joi.number().required(),
  width: Joi.number().required(),
  height: Joi.number().required(),
  zIndex: Joi.number().default(0),
  minimized: Joi.boolean().default(false),
  maximized: Joi.boolean().default(false),
  groupId: Joi.string().allow(null).optional(),
  tabIndex: Joi.number().optional()
});

// Layout schema
const layoutSchema = Joi.object({
  name: Joi.string().required().min(1).max(50),
  mode: Joi.string().valid('canvas', 'grid', 'tabs').default('canvas'),
  terminals: Joi.array().items(terminalPositionSchema).default([]),
  groups: Joi.array().items(Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    color: Joi.string().optional(),
    collapsed: Joi.boolean().default(false)
  })).default([]),
  viewport: Joi.object({
    width: Joi.number().default(1920),
    height: Joi.number().default(1080),
    scale: Joi.number().default(1),
    offsetX: Joi.number().default(0),
    offsetY: Joi.number().default(0)
  }).default({}),
  metadata: Joi.object().default({}),
  autoSave: Joi.boolean().default(false),
  autoSaveInterval: Joi.number().default(30000) // 30 seconds
});

class LayoutManagerV2 extends EventEmitter {
  constructor() {
    super();
    
    this.layoutsDir = path.join(__dirname, '../../data/layouts');
    this.presetsDir = path.join(__dirname, '../../library/layout-presets');
    this.currentLayout = null;
    this.autoSaveTimer = null;
    
    this.ensureDirectories();
    this.loadPresets();
  }

  /**
   * Ensure required directories exist
   */
  async ensureDirectories() {
    try {
      await fs.mkdir(this.layoutsDir, { recursive: true });
      await fs.mkdir(this.presetsDir, { recursive: true });
    } catch (error) {
      console.error('[LayoutManager] Failed to create directories:', error);
    }
  }

  /**
   * Load preset layouts
   */
  async loadPresets() {
    // Create default presets if they don't exist
    const defaultPresets = [
      {
        name: 'development',
        mode: 'canvas',
        terminals: [
          { id: 'editor', x: 10, y: 10, width: 800, height: 600, zIndex: 1 },
          { id: 'terminal', x: 820, y: 10, width: 600, height: 300, zIndex: 2 },
          { id: 'logs', x: 820, y: 320, width: 600, height: 290, zIndex: 3 }
        ],
        groups: [
          { id: 'main', name: 'Main Development', color: '#3b82f6' }
        ]
      },
      {
        name: 'monitoring',
        mode: 'grid',
        terminals: [
          { id: 'metrics', x: 0, y: 0, width: 50, height: 50, zIndex: 1 },
          { id: 'logs', x: 50, y: 0, width: 50, height: 50, zIndex: 2 },
          { id: 'alerts', x: 0, y: 50, width: 50, height: 50, zIndex: 3 },
          { id: 'traces', x: 50, y: 50, width: 50, height: 50, zIndex: 4 }
        ],
        groups: []
      },
      {
        name: 'orchestration',
        mode: 'tabs',
        terminals: [],
        groups: [
          { id: 'agents', name: 'Active Agents', color: '#fbbf24' },
          { id: 'tasks', name: 'Running Tasks', color: '#22c55e' }
        ]
      }
    ];

    for (const preset of defaultPresets) {
      const presetPath = path.join(this.presetsDir, `${preset.name}.json`);
      try {
        await fs.access(presetPath);
      } catch {
        // Preset doesn't exist, create it
        await fs.writeFile(presetPath, JSON.stringify(preset, null, 2));
        console.log(`[LayoutManager] Created preset: ${preset.name}`);
      }
    }
  }

  /**
   * Save layout with terminal positions
   */
  async saveLayout(name, layoutData) {
    // Validate layout
    const { error, value } = layoutSchema.validate({
      name,
      ...layoutData
    });
    
    if (error) {
      throw new Error(`Invalid layout: ${error.message}`);
    }
    
    const layout = {
      ...value,
      createdAt: value.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const filePath = path.join(this.layoutsDir, `${name}.json`);
    await fs.writeFile(filePath, JSON.stringify(layout, null, 2));
    
    console.log(`[LayoutManager] Saved layout: ${name}`);
    this.emit('layout-saved', layout);
    
    return layout;
  }

  /**
   * Load layout with terminal positions
   */
  async loadLayout(name) {
    const filePath = path.join(this.layoutsDir, `${name}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const layout = JSON.parse(data);
      
      // Validate loaded layout
      const { error, value } = layoutSchema.validate(layout);
      if (error) {
        console.warn(`[LayoutManager] Invalid layout ${name}:`, error.message);
        throw new Error(`Invalid layout format`);
      }
      
      this.currentLayout = value;
      
      // Setup auto-save if enabled
      if (value.autoSave) {
        this.startAutoSave(value.autoSaveInterval);
      }
      
      console.log(`[LayoutManager] Loaded layout: ${name}`);
      this.emit('layout-loaded', value);
      
      return value;
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Layout '${name}' not found`);
      }
      throw error;
    }
  }

  /**
   * Update terminal position in current layout
   */
  updateTerminalPosition(terminalId, position) {
    if (!this.currentLayout) {
      console.warn('[LayoutManager] No current layout to update');
      return;
    }
    
    const terminalIndex = this.currentLayout.terminals.findIndex(t => t.id === terminalId);
    
    if (terminalIndex === -1) {
      // Add new terminal
      this.currentLayout.terminals.push({
        id: terminalId,
        ...position
      });
    } else {
      // Update existing terminal
      this.currentLayout.terminals[terminalIndex] = {
        ...this.currentLayout.terminals[terminalIndex],
        ...position
      };
    }
    
    this.emit('position-updated', { terminalId, position });
  }

  /**
   * Remove terminal from layout
   */
  removeTerminal(terminalId) {
    if (!this.currentLayout) return;
    
    this.currentLayout.terminals = this.currentLayout.terminals.filter(
      t => t.id !== terminalId
    );
    
    this.emit('terminal-removed', terminalId);
  }

  /**
   * Update z-index for terminal stacking
   */
  updateZIndex(terminalId, zIndex) {
    if (!this.currentLayout) return;
    
    const terminal = this.currentLayout.terminals.find(t => t.id === terminalId);
    if (terminal) {
      terminal.zIndex = zIndex;
      
      // Normalize z-indexes to prevent overflow
      this.normalizeZIndexes();
      
      this.emit('zindex-updated', { terminalId, zIndex });
    }
  }

  /**
   * Normalize z-indexes to sequential values
   */
  normalizeZIndexes() {
    if (!this.currentLayout) return;
    
    // Sort by current z-index
    const sorted = [...this.currentLayout.terminals].sort((a, b) => a.zIndex - b.zIndex);
    
    // Assign sequential z-indexes
    sorted.forEach((terminal, index) => {
      terminal.zIndex = index;
    });
  }

  /**
   * Bring terminal to front
   */
  bringToFront(terminalId) {
    if (!this.currentLayout) return;
    
    const maxZ = Math.max(...this.currentLayout.terminals.map(t => t.zIndex || 0));
    this.updateZIndex(terminalId, maxZ + 1);
  }

  /**
   * Create terminal group
   */
  createGroup(groupName, terminalIds = []) {
    if (!this.currentLayout) return null;
    
    const groupId = `group-${Date.now()}`;
    
    this.currentLayout.groups.push({
      id: groupId,
      name: groupName,
      color: this.generateGroupColor(),
      collapsed: false
    });
    
    // Assign terminals to group
    terminalIds.forEach(terminalId => {
      const terminal = this.currentLayout.terminals.find(t => t.id === terminalId);
      if (terminal) {
        terminal.groupId = groupId;
      }
    });
    
    this.emit('group-created', { groupId, groupName, terminalIds });
    
    return groupId;
  }

  /**
   * Generate random group color
   */
  generateGroupColor() {
    const colors = ['#3b82f6', '#22c55e', '#fbbf24', '#ef4444', '#a855f7', '#06b6d4'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Start auto-save timer
   */
  startAutoSave(interval = 30000) {
    this.stopAutoSave();
    
    this.autoSaveTimer = setInterval(async () => {
      if (this.currentLayout) {
        try {
          await this.saveLayout(this.currentLayout.name, this.currentLayout);
          console.log('[LayoutManager] Auto-saved layout');
        } catch (error) {
          console.error('[LayoutManager] Auto-save failed:', error);
        }
      }
    }, interval);
    
    console.log(`[LayoutManager] Auto-save enabled (${interval}ms)`);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
      console.log('[LayoutManager] Auto-save disabled');
    }
  }

  /**
   * Get all layouts
   */
  async getAllLayouts() {
    const layouts = [];
    
    try {
      const files = await fs.readdir(this.layoutsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(this.layoutsDir, file), 'utf-8');
            const layout = JSON.parse(data);
            layouts.push({
              name: layout.name,
              mode: layout.mode,
              createdAt: layout.createdAt,
              updatedAt: layout.updatedAt,
              terminalCount: layout.terminals.length,
              groupCount: layout.groups.length,
              autoSave: layout.autoSave
            });
          } catch (error) {
            console.error(`[LayoutManager] Failed to parse ${file}:`, error);
          }
        }
      }
      
    } catch (error) {
      console.error('[LayoutManager] Failed to read layouts:', error);
    }
    
    return layouts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  /**
   * Get preset layouts
   */
  async getPresets() {
    const presets = [];
    
    try {
      const files = await fs.readdir(this.presetsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const data = await fs.readFile(path.join(this.presetsDir, file), 'utf-8');
            const preset = JSON.parse(data);
            presets.push({
              name: preset.name,
              mode: preset.mode,
              description: preset.description || `${preset.mode} layout preset`
            });
          } catch (error) {
            console.error(`[LayoutManager] Failed to parse preset ${file}:`, error);
          }
        }
      }
      
    } catch (error) {
      console.error('[LayoutManager] Failed to read presets:', error);
    }
    
    return presets;
  }

  /**
   * Apply preset layout
   */
  async applyPreset(presetName) {
    const presetPath = path.join(this.presetsDir, `${presetName}.json`);
    
    try {
      const data = await fs.readFile(presetPath, 'utf-8');
      const preset = JSON.parse(data);
      
      // Create new layout from preset
      const layoutName = `${presetName}-${Date.now()}`;
      return await this.saveLayout(layoutName, preset);
      
    } catch (error) {
      throw new Error(`Preset '${presetName}' not found`);
    }
  }

  /**
   * Export layout for sharing
   */
  async exportLayout(name) {
    const layout = await this.loadLayout(name);
    
    // Remove internal IDs and timestamps for cleaner export
    const exportData = {
      ...layout,
      terminals: layout.terminals.map(t => ({
        x: t.x,
        y: t.y,
        width: t.width,
        height: t.height,
        zIndex: t.zIndex
      })),
      createdAt: undefined,
      updatedAt: undefined
    };
    
    return exportData;
  }

  /**
   * Import layout
   */
  async importLayout(name, layoutData) {
    // Validate imported layout
    const { error, value } = layoutSchema.validate({
      name,
      ...layoutData
    });
    
    if (error) {
      throw new Error(`Invalid layout import: ${error.message}`);
    }
    
    return await this.saveLayout(name, value);
  }

  /**
   * Get current layout
   */
  getCurrentLayout() {
    return this.currentLayout;
  }

  /**
   * Clear current layout
   */
  clearCurrentLayout() {
    this.stopAutoSave();
    this.currentLayout = null;
    this.emit('layout-cleared');
  }
}

// Export singleton
module.exports = new LayoutManagerV2();