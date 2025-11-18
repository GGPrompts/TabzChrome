const fs = require('fs').promises;
const path = require('path');
const matter = require('gray-matter');
const chokidar = require('chokidar');

class WorkspaceManager {
  constructor() {
    this.workspaceRoot = path.join(__dirname, '../../workspace');
    this.watchers = new Map();
    this.listeners = new Set();
  }

  // Initialize workspace directories
  async initWorkspace() {
    const dirs = ['prompts', 'notes', 'docs', 'templates'];
    for (const dir of dirs) {
      const dirPath = path.join(this.workspaceRoot, dir);
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  // Parse markdown file with frontmatter
  async parseMarkdownFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const { data: metadata, content: body } = matter(content);
      
      return {
        id: path.basename(filePath, '.md'),
        path: filePath,
        relativePath: path.relative(this.workspaceRoot, filePath),
        metadata,
        content: body,
        raw: content
      };
    } catch (error) {
      console.error(`Error parsing markdown file ${filePath}:`, error);
      throw error;
    }
  }

  // List all files in a category
  async listFiles(category) {
    const categoryPath = path.join(this.workspaceRoot, category);
    
    try {
      const files = await fs.readdir(categoryPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));
      
      const fileData = await Promise.all(
        mdFiles.map(async (file) => {
          const filePath = path.join(categoryPath, file);
          return this.parseMarkdownFile(filePath);
        })
      );
      
      return fileData;
    } catch (error) {
      console.error(`Error listing files in ${category}:`, error);
      return [];
    }
  }

  // Save a markdown file
  async saveFile(category, filename, content, metadata = {}) {
    // Ensure filename ends with .md
    if (!filename.endsWith('.md')) {
      filename += '.md';
    }
    
    const filePath = path.join(this.workspaceRoot, category, filename);
    
    // Add timestamps to metadata
    const now = new Date().toISOString();
    if (!metadata.created) {
      metadata.created = now;
    }
    metadata.modified = now;
    
    // Create markdown with frontmatter
    const fileContent = matter.stringify(content, metadata);
    
    await fs.writeFile(filePath, fileContent, 'utf-8');
    
    // Notify listeners
    this.notifyListeners('save', { category, filename, path: filePath });
    
    return { success: true, path: filePath };
  }

  // Delete a markdown file
  async deleteFile(category, filename) {
    const filePath = path.join(this.workspaceRoot, category, filename);
    
    try {
      await fs.unlink(filePath);
      this.notifyListeners('delete', { category, filename, path: filePath });
      return { success: true };
    } catch (error) {
      console.error(`Error deleting file ${filePath}:`, error);
      throw error;
    }
  }

  // Read a specific file
  async readFile(category, filename) {
    const filePath = path.join(this.workspaceRoot, category, filename);
    return this.parseMarkdownFile(filePath);
  }

  // Search files by content or metadata
  async searchFiles(query, options = {}) {
    const { category = null, tags = [], searchContent = true } = options;
    const results = [];
    
    const categories = category ? [category] : ['prompts', 'notes', 'docs', 'templates'];
    
    for (const cat of categories) {
      const files = await this.listFiles(cat);
      
      for (const file of files) {
        let match = false;
        
        // Search in title
        if (file.metadata.title && file.metadata.title.toLowerCase().includes(query.toLowerCase())) {
          match = true;
        }
        
        // Search in content
        if (searchContent && file.content.toLowerCase().includes(query.toLowerCase())) {
          match = true;
        }
        
        // Filter by tags
        if (tags.length > 0 && file.metadata.tags) {
          const fileTags = Array.isArray(file.metadata.tags) ? file.metadata.tags : [file.metadata.tags];
          if (tags.some(tag => fileTags.includes(tag))) {
            match = true;
          }
        }
        
        if (match) {
          results.push({ ...file, category: cat });
        }
      }
    }
    
    return results;
  }

  // Watch for file changes
  watchCategory(category, callback) {
    const categoryPath = path.join(this.workspaceRoot, category);
    
    if (this.watchers.has(category)) {
      this.watchers.get(category).close();
    }
    
    const watcher = chokidar.watch(categoryPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true
    });
    
    watcher
      .on('add', path => callback('add', path))
      .on('change', path => callback('change', path))
      .on('unlink', path => callback('delete', path));
    
    this.watchers.set(category, watcher);
  }

  // Stop watching
  stopWatching(category) {
    if (this.watchers.has(category)) {
      this.watchers.get(category).close();
      this.watchers.delete(category);
    }
  }

  // Add listener for file events
  addListener(callback) {
    this.listeners.add(callback);
  }

  // Remove listener
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  // Notify all listeners
  notifyListeners(event, data) {
    this.listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Error notifying listener:', error);
      }
    });
  }

  // Get workspace structure
  async getWorkspaceStructure() {
    const structure = {};
    const categories = ['prompts', 'notes', 'docs', 'templates'];
    
    for (const category of categories) {
      const files = await this.listFiles(category);
      structure[category] = files.map(f => ({
        id: f.id,
        title: f.metadata.title || f.id,
        tags: f.metadata.tags || [],
        created: f.metadata.created,
        modified: f.metadata.modified
      }));
    }
    
    return structure;
  }
}

module.exports = WorkspaceManager;