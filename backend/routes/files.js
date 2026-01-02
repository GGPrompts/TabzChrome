/**
 * File reading API for markdown cards and file tree
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const { createModuleLogger } = require('../modules/logger');

const log = createModuleLogger('FileTree');

/**
 * Check if a file/folder should always be visible even when showHidden=false
 * These are AI-relevant files that developers need to monitor
 */
function shouldAlwaysShow(name) {
  // Core Claude ecosystem
  if (name === '.claude' || name === '.prompts') return true;

  // Obsidian vault indicator
  if (name === '.obsidian') return true;

  // Environment files (.env, .env.local, .env.production, etc.)
  if (/^\.env(\.[\w.-]+)?$/i.test(name)) return true;

  // Git files
  if (name === '.gitignore') return true;

  // Docker files
  if (name === '.dockerignore') return true;

  // Secrets/credentials files (for awareness)
  if (/\.(pem|key|crt|cer|pfx|p12)$/i.test(name)) return true;

  return false;
}

// Helper function to build file tree recursively
async function buildFileTree(dirPath, depth = 5, currentDepth = 0, showHidden = false) {
  try {
    const stats = await fs.stat(dirPath);
    const name = path.basename(dirPath);

    // Files are always included, regardless of depth
    if (!stats.isDirectory()) {
      return {
        name,
        path: dirPath,
        type: 'file',
        size: stats.size,
        modified: stats.mtime.toISOString()
      };
    }

    // For directories at depth limit, include them but with empty children
    // (so they show up in the tree and can be clicked to navigate)
    if (currentDepth >= depth) {
      return {
        name,
        path: dirPath,
        type: 'directory',
        children: [],
        modified: stats.mtime.toISOString()
      };
    }

    // It's a directory within depth limit - recurse into it
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const children = [];

    // Check if this directory is an Obsidian vault (contains .obsidian folder)
    const isObsidianVault = entries.some(e => e.name === '.obsidian' && e.isDirectory());

    // Debug: Log entry counts for top-level directories
    if (currentDepth <= 1) {
      log.debug(` Read ${entries.length} raw entries from ${dirPath}`);
    }

    // Filter and sort entries
    const sortedEntries = entries
      .filter(entry => {
        // Always exclude node_modules
        if (entry.name === 'node_modules') return false;
        // If showHidden is true, show all files, otherwise filter hidden files
        if (!showHidden && entry.name.startsWith('.')) {
          // Always include AI-relevant hidden files/folders
          return shouldAlwaysShow(entry.name);
        }
        return true;
      })
      .sort((a, b) => {
        // Directories first, then files
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    // Debug: Log filter results
    if (currentDepth <= 1) {
      log.debug(` After filtering: ${sortedEntries.length} entries (${sortedEntries.filter(e => e.isDirectory()).length} dirs, ${sortedEntries.filter(e => !e.isDirectory()).length} files)`);
    }

    // Process entries
    for (const entry of sortedEntries) {
      const childPath = path.join(dirPath, entry.name);
      try {
        // Check if this is a symlink and if it's broken
        if (entry.isSymbolicLink()) {
          try {
            // Try to stat the symlink target - this will fail if broken
            await fs.stat(childPath);
          } catch (symlinkErr) {
            // Broken symlink - skip it silently
            if (currentDepth <= 2) {
              log.debug(` Skipping broken symlink: ${childPath}`);
            }
            continue;
          }
        }

        const child = await buildFileTree(childPath, depth, currentDepth + 1, showHidden);
        if (child) children.push(child);
      } catch (err) {
        // Silently skip permission errors (very common on system dirs and WSL mounts)
        // Only log other errors at top level
        if (err.code !== 'EACCES' && err.code !== 'EPERM' && currentDepth <= 1) {
          console.warn(`[buildFileTree] Skipping ${childPath}: ${err.message}`);
        }
      }
    }
    
    if (currentDepth <= 2) {
      log.debug(` ${dirPath} has ${children.length} children (depth=${currentDepth})`);
    }

    return {
      name,
      path: dirPath,
      type: 'directory',
      children,
      modified: stats.mtime.toISOString(),
      ...(isObsidianVault && { isObsidianVault: true })
    };
  } catch (err) {
    // Silently skip permission denied errors (common on system dirs and WSL mounts)
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      return null;
    }
    console.error(`Error building tree for ${dirPath}:`, err);
    return null;
  }
}

// Read a file
router.get('/read', async (req, res) => {
  try {
    const filePath = req.query.path;
    
    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Security: Resolve the path
    const resolvedPath = path.resolve(filePath);

    // For local development, allow filesystem exploration (configurable)
    const restrictToHome = process.env.RESTRICT_TO_HOME === 'true';

    if (restrictToHome) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!resolvedPath.startsWith(homeDir)) {
        return res.status(403).json({ error: 'Access denied: File is outside home directory' });
      }
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // Read the file
    const content = await fs.readFile(resolvedPath, 'utf-8');
    
    res.json({
      path: filePath,
      content,
      fileName: path.basename(filePath),
      fileSize: content.length
    });
    
  } catch (error) {
    console.error('Error reading file:', error);
    res.status(500).json({ error: error.message });
  }
});

// List markdown files in a directory
router.get('/list-markdown', async (req, res) => {
  try {
    const dirPath = req.query.path || process.cwd();
    
    // Security: Resolve the path
    const workspaceRoot = path.resolve(process.cwd(), '..');
    const resolvedPath = path.resolve(dirPath);
    
    // Only allow listing files within the workspace
    if (!resolvedPath.startsWith(workspaceRoot)) {
      return res.status(403).json({ error: 'Access denied: Directory is outside workspace' });
    }

    // Read directory
    const files = await fs.readdir(resolvedPath);
    
    // Filter for markdown files and get their stats
    const markdownFiles = [];
    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.markdown')) {
        const filePath = path.join(resolvedPath, file);
        try {
          const stats = await fs.stat(filePath);
          markdownFiles.push({
            name: file,
            path: filePath,
            size: stats.size,
            modified: stats.mtime
          });
        } catch (err) {
          // Skip files we can't read
        }
      }
    }
    
    res.json({
      directory: dirPath,
      files: markdownFiles
    });
    
  } catch (error) {
    console.error('Error listing markdown files:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get common project files
router.get('/project-files', async (req, res) => {
  try {
    const workspaceRoot = path.resolve(process.cwd(), '..');
    const commonFiles = [
      'README.md',
      'CLAUDE.md',
      'TODO.md',
      'CHANGELOG.md',
      'CONTRIBUTING.md',
      'LICENSE.md',
      'docs/README.md'
    ];
    
    const availableFiles = [];
    
    for (const file of commonFiles) {
      const filePath = path.join(workspaceRoot, file);
      try {
        await fs.access(filePath);
        const stats = await fs.stat(filePath);
        availableFiles.push({
          name: file,
          path: filePath,
          size: stats.size,
          modified: stats.mtime
        });
      } catch {
        // File doesn't exist, skip it
      }
    }
    
    res.json({
      files: availableFiles
    });
    
  } catch (error) {
    console.error('Error getting project files:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper to expand ~ to home directory
function expandTilde(filePath) {
  if (filePath.startsWith('~')) {
    return path.join(process.env.HOME || process.env.USERPROFILE, filePath.slice(1));
  }
  return filePath;
}

// Get file tree
router.get('/tree', async (req, res) => {
  try {
    let targetPath = req.query.path || path.resolve(process.env.HOME, 'workspace');
    targetPath = expandTilde(targetPath); // Expand ~ to home directory
    const depth = parseInt(req.query.depth) || 5; // Good balance for most projects
    const showHidden = req.query.showHidden === 'true'; // Parse boolean parameter

    log.debug(` Fetching tree: path=${targetPath}, depth=${depth}, showHidden=${showHidden}`);

    // Security: Resolve the path
    const resolvedPath = path.resolve(targetPath);

    // For local development, allow filesystem exploration
    // Security note: This is appropriate for local dev tools but should be
    // restricted in production/multi-user environments via RESTRICT_TO_HOME env var
    const restrictToHome = process.env.RESTRICT_TO_HOME === 'true';

    if (restrictToHome) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!resolvedPath.startsWith(homeDir)) {
        return res.status(403).json({ error: 'Access denied: Path is outside home directory' });
      }
    }
    
    // Check if path exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'Path not found' });
    }
    
    // Build the file tree with showHidden parameter
    const tree = await buildFileTree(resolvedPath, depth, 0, showHidden);
    
    if (!tree) {
      return res.status(500).json({ error: 'Failed to build file tree' });
    }
    
    res.json(tree);
    
  } catch (error) {
    console.error('Error getting file tree:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve images as base64 or direct file
router.get('/image', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const resolvedPath = path.resolve(expandTilde(filePath));

    // For local development, allow filesystem exploration (configurable)
    const restrictToHome = process.env.RESTRICT_TO_HOME === 'true';

    if (restrictToHome) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!resolvedPath.startsWith(homeDir)) {
        return res.status(403).json({ error: 'Access denied: Path is outside home directory' });
      }
    }
    
    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Read the file and convert to base64
    const fileBuffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase().slice(1);
    
    // Map file extensions to MIME types
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'ico': 'image/x-icon',
      'bmp': 'image/bmp'
    };
    
    const mimeType = mimeTypes[ext] || 'image/png';
    const base64 = fileBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;
    
    res.json({
      dataUri,
      mimeType,
      size: fileBuffer.length,
      path: resolvedPath
    });
    
  } catch (error) {
    console.error('Error serving image:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve video files as base64
router.get('/video', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    const resolvedPath = path.resolve(expandTilde(filePath));

    // For local development, allow filesystem exploration (configurable)
    const restrictToHome = process.env.RESTRICT_TO_HOME === 'true';

    if (restrictToHome) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!resolvedPath.startsWith(homeDir)) {
        return res.status(403).json({ error: 'Access denied: Path is outside home directory' });
      }
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check file size (limit to 100MB for videos)
    const stats = await fs.stat(resolvedPath);
    if (stats.size > 100 * 1024 * 1024) {
      return res.status(400).json({ error: 'Video too large (max 100MB)' });
    }

    // Read the file and convert to base64
    const fileBuffer = await fs.readFile(resolvedPath);
    const ext = path.extname(resolvedPath).toLowerCase().slice(1);

    // Map file extensions to MIME types
    const mimeTypes = {
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      'ogg': 'video/ogg',
      'ogv': 'video/ogg',
      'mov': 'video/quicktime',
      'avi': 'video/x-msvideo',
      'mkv': 'video/x-matroska',
      'm4v': 'video/mp4'
    };

    const mimeType = mimeTypes[ext] || 'video/mp4';
    const base64 = fileBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    res.json({
      dataUri,
      mimeType,
      size: fileBuffer.length,
      path: resolvedPath
    });

  } catch (error) {
    console.error('Error serving video:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get widget documentation for a terminal type
router.get('/widget-docs/:widgetName', async (req, res) => {
  try {
    const { widgetName } = req.params;
    const widgetPath = path.resolve(process.cwd(), 'library', 'terminals', widgetName);

    // Check if widget folder exists
    try {
      await fs.access(widgetPath);
    } catch {
      // No documentation folder for this widget
      return res.json({ docs: [] });
    }

    // Read all markdown and YAML files in the widget folder
    const files = await fs.readdir(widgetPath);
    const docs = [];

    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.markdown') ||
          file.endsWith('.yml') || file.endsWith('.yaml')) {
        const filePath = path.join(widgetPath, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const stats = await fs.stat(filePath);
          const isYaml = file.endsWith('.yml') || file.endsWith('.yaml');
          docs.push({
            filename: file,
            path: filePath,
            content,
            size: stats.size,
            modified: stats.mtime,
            type: isYaml ? 'yaml' : 'markdown'
          });
        } catch (err) {
          console.error(`Error reading ${filePath}:`, err);
        }
      }
    }

    res.json({
      widgetName,
      docs,
      count: docs.length
    });

  } catch (error) {
    console.error('Error getting widget docs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get file content (for viewing files)
router.get('/content', async (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Security: Expand ~ and resolve the path
    const resolvedPath = path.resolve(expandTilde(filePath));

    // For local development, allow filesystem exploration (configurable)
    const restrictToHome = process.env.RESTRICT_TO_HOME === 'true';

    if (restrictToHome) {
      const homeDir = process.env.HOME || process.env.USERPROFILE;
      if (!resolvedPath.startsWith(homeDir)) {
        return res.status(403).json({ error: 'Access denied: File is outside home directory' });
      }
    }
    
    // Check if file exists and is a file
    const stats = await fs.stat(resolvedPath);
    if (stats.isDirectory()) {
      return res.status(400).json({ error: 'Path is a directory, not a file' });
    }
    
    // Read the file (limit size to 1MB)
    if (stats.size > 1024 * 1024) {
      return res.status(400).json({ error: 'File too large (max 1MB for viewing)' });
    }
    
    const content = await fs.readFile(resolvedPath, 'utf-8');
    
    res.json({
      path: filePath,
      content,
      fileName: path.basename(filePath),
      fileSize: stats.size,
      modified: stats.mtime.toISOString()
    });
    
  } catch (error) {
    console.error('Error reading file content:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save Excalidraw drawing
router.post('/save-excalidraw', async (req, res) => {
  try {
    const { imageData, jsonData } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    // Generate timestamp-based filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `excalidraw-${timestamp}`;

    // Create Screenshots/excalidraw directory if it doesn't exist
    const screenshotsDir = path.join(process.cwd(), 'Screenshots', 'excalidraw');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    // Save PNG image
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const imagePath = path.join(screenshotsDir, `${filename}.png`);
    fs.writeFileSync(imagePath, imageBuffer);

    // Save JSON data if provided (for re-editing)
    if (jsonData) {
      const jsonPath = path.join(screenshotsDir, `${filename}.json`);
      fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
    }

    // Return the local file path
    res.json({
      success: true,
      imagePath: `/Screenshots/excalidraw/${filename}.png`,
      jsonPath: jsonData ? `/Screenshots/excalidraw/${filename}.json` : null,
      filename: filename
    });
  } catch (error) {
    console.error('Error saving Excalidraw drawing:', error);
    res.status(500).json({ error: 'Failed to save drawing' });
  }
});

// Write/save a file
router.post('/write', async (req, res) => {
  try {
    const { path: filePath, content } = req.body || {}
    if (!filePath || typeof content !== 'string') {
      return res.status(400).json({ error: 'File path and string content are required' })
    }

    const resolvedPath = path.resolve(filePath)
    const homeDir = process.env.HOME || process.env.USERPROFILE
    // Only allow writing within the user home directory for safety
    if (!resolvedPath.startsWith(homeDir)) {
      return res.status(403).json({ error: 'Access denied: File is outside home directory' })
    }

    // Ensure parent directory exists (create if necessary)
    const dir = path.dirname(resolvedPath)
    try {
      await fs.access(dir)
    } catch {
      // Create the parent directory if it doesn't exist
      try {
        await fs.mkdir(dir, { recursive: true })
      } catch (mkdirError) {
        return res.status(400).json({ error: `Failed to create parent directory: ${mkdirError.message}` })
      }
    }

    // Write the file
    await fs.writeFile(resolvedPath, content, 'utf-8')
    const stats = await fs.stat(resolvedPath)
    return res.json({ ok: true, size: stats.size, modified: stats.mtime })
  } catch (error) {
    console.error('Error writing file:', error)
    return res.status(500).json({ error: error.message })
  }
})

// NOTE: write-spawn-options endpoint removed - profiles are now stored in Chrome storage

// Helper to get Claude file type for backend classification
function getClaudeFileType(name, filePath) {
  // CLAUDE.md and CLAUDE.local.md
  if (/^CLAUDE(\.local)?\.md$/i.test(name)) {
    return 'claude-config'
  }
  // .claude directory itself
  if (name === '.claude') {
    return 'claude-config'
  }
  // settings.json in .claude/
  if (name === 'settings.json' && filePath.includes('/.claude/')) {
    return 'claude-config'
  }
  // .mcp.json
  if (name === '.mcp.json') {
    return 'mcp'
  }
  // AGENTS.md
  if (name === 'AGENTS.md') {
    return 'agent'
  }
  // Files inside .claude subdirectories
  if (filePath.includes('/.claude/')) {
    if (filePath.includes('/agents/')) return 'agent'
    if (filePath.includes('/skills/')) return 'skill'
    if (filePath.includes('/hooks/')) return 'hook'
    if (filePath.includes('/commands/')) return 'command'
  }
  // .prompts directory
  if (name === '.prompts') {
    return 'prompt'
  }
  // .prompty files
  if (/\.prompty$/i.test(name)) {
    return 'prompt'
  }
  // Files inside .prompts/
  if (filePath.includes('/.prompts/')) {
    return 'prompt'
  }
  // plugins directory
  if (name === 'plugins' || filePath.includes('/plugins/')) {
    return 'plugin'
  }
  return null
}

// Helper to recursively find files matching criteria
async function findFilesRecursive(dir, matcher, maxDepth = 5, currentDepth = 0) {
  const results = []

  if (currentDepth >= maxDepth) return results

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      // Skip node_modules and .git directories
      if (entry.name === 'node_modules' || entry.name === '.git') continue

      const fullPath = path.join(dir, entry.name)

      // Check if it's a symlink and verify target exists
      if (entry.isSymbolicLink()) {
        try {
          await fs.stat(fullPath) // This follows the symlink
        } catch {
          // Broken symlink - skip it
          continue
        }
      }

      if (entry.isDirectory()) {
        // Don't include directories in results - only recurse into them
        // Recurse into subdirectory
        const subResults = await findFilesRecursive(fullPath, matcher, maxDepth, currentDepth + 1)
        results.push(...subResults)
      } else {
        if (matcher(entry.name, fullPath, false)) {
          results.push({ name: entry.name, path: fullPath, isDir: false })
        }
      }
    }
  } catch (err) {
    // Permission denied or other error - skip
  }

  return results
}

// Helper to build a filtered tree (only including matching files, but preserving folder structure)
async function buildFilteredTree(dirPath, matcher, maxDepth = 5, currentDepth = 0) {
  try {
    const stats = await fs.stat(dirPath)
    const name = path.basename(dirPath)

    if (!stats.isDirectory()) {
      // It's a file - check if it matches
      if (matcher(name, dirPath)) {
        return {
          name,
          path: dirPath,
          type: 'file',
          modified: stats.mtime.toISOString()
        }
      }
      return null
    }

    // It's a directory
    if (currentDepth >= maxDepth) {
      return null // Don't go deeper
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const children = []

    // Sort: directories first, then alphabetically
    const sortedEntries = entries
      .filter(entry => entry.name !== 'node_modules' && entry.name !== '.git')
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) {
          return a.isDirectory() ? -1 : 1
        }
        return a.name.localeCompare(b.name)
      })

    for (const entry of sortedEntries) {
      const childPath = path.join(dirPath, entry.name)

      // Handle symlinks
      if (entry.isSymbolicLink()) {
        try {
          await fs.stat(childPath)
        } catch {
          continue // Broken symlink
        }
      }

      const child = await buildFilteredTree(childPath, matcher, maxDepth, currentDepth + 1)
      if (child) {
        children.push(child)
      }
    }

    // Only include directory if it has matching children
    if (children.length > 0) {
      return {
        name,
        path: dirPath,
        type: 'directory',
        children,
        modified: stats.mtime.toISOString()
      }
    }

    return null
  } catch (err) {
    return null
  }
}

// GET /api/files/list - Get filtered file list (prompts, claude, favorites)
router.get('/list', async (req, res) => {
  try {
    const filter = req.query.filter || 'all'
    let workingDir = req.query.workingDir || process.cwd()
    workingDir = expandTilde(workingDir)

    const homeDir = process.env.HOME || process.env.USERPROFILE
    const trees = [] // Now returning trees instead of flat groups

    if (filter === 'claude') {
      // Claude file matcher
      const claudeMatcher = (name, filePath) => {
        return getClaudeFileType(name, filePath) !== null
      }

      // Global ~/.claude/
      const globalClaudeDir = path.join(homeDir, '.claude')
      try {
        await fs.access(globalClaudeDir)
        const tree = await buildFilteredTree(globalClaudeDir, claudeMatcher, 4)
        if (tree) {
          trees.push({
            name: 'Global (~/.claude/)',
            icon: '🌐',
            basePath: globalClaudeDir,
            tree
          })
        }
      } catch {}

      // Project .claude/ and root config files
      const projectClaudeDir = path.join(workingDir, '.claude')
      try {
        await fs.access(projectClaudeDir)
        const tree = await buildFilteredTree(projectClaudeDir, claudeMatcher, 4)
        if (tree) {
          trees.push({
            name: 'Project (.claude/)',
            icon: '📁',
            basePath: projectClaudeDir,
            tree
          })
        }
      } catch {}

      // Project root files (CLAUDE.md, .mcp.json)
      const rootFiles = []
      for (const name of ['CLAUDE.md', 'CLAUDE.local.md', '.mcp.json']) {
        const filePath = path.join(workingDir, name)
        try {
          await fs.access(filePath)
          const stats = await fs.stat(filePath)
          rootFiles.push({
            name,
            path: filePath,
            type: 'file',
            modified: stats.mtime.toISOString()
          })
        } catch {}
      }
      if (rootFiles.length > 0) {
        trees.push({
          name: 'Project Root',
          icon: '📄',
          basePath: workingDir,
          tree: {
            name: path.basename(workingDir),
            path: workingDir,
            type: 'directory',
            children: rootFiles
          }
        })
      }

      // Project plugins/
      const pluginsDir = path.join(workingDir, 'plugins')
      try {
        await fs.access(pluginsDir)
        const tree = await buildFilteredTree(pluginsDir, () => true, 3)
        if (tree) {
          trees.push({
            name: 'Plugins',
            icon: '🔌',
            basePath: pluginsDir,
            tree
          })
        }
      } catch {}

    } else if (filter === 'prompts') {
      // Prompt file matcher
      const promptMatcher = (name, filePath) => {
        return /\.(prompty|md|yaml|yml|txt)$/i.test(name)
      }

      // Global ~/.prompts/
      const globalPromptsDir = path.join(homeDir, '.prompts')
      try {
        await fs.access(globalPromptsDir)
        const tree = await buildFilteredTree(globalPromptsDir, promptMatcher, 5)
        if (tree) {
          trees.push({
            name: 'Global (~/.prompts/)',
            icon: '🌐',
            basePath: globalPromptsDir,
            tree
          })
        }
      } catch {}

      // Global ~/.claude/commands/
      const globalCommandsDir = path.join(homeDir, '.claude', 'commands')
      try {
        await fs.access(globalCommandsDir)
        const tree = await buildFilteredTree(globalCommandsDir, (name) => /\.md$/i.test(name), 3)
        if (tree) {
          trees.push({
            name: 'Global Commands (~/.claude/commands/)',
            icon: '⚡',
            basePath: globalCommandsDir,
            tree
          })
        }
      } catch {}

      // Project .prompts/
      const projectPromptsDir = path.join(workingDir, '.prompts')
      try {
        await fs.access(projectPromptsDir)
        const tree = await buildFilteredTree(projectPromptsDir, promptMatcher, 5)
        if (tree) {
          trees.push({
            name: 'Project (.prompts/)',
            icon: '📁',
            basePath: projectPromptsDir,
            tree
          })
        }
      } catch {}

      // Project .claude/commands/
      const projectCommandsDir = path.join(workingDir, '.claude', 'commands')
      try {
        await fs.access(projectCommandsDir)
        const tree = await buildFilteredTree(projectCommandsDir, (name) => /\.md$/i.test(name), 3)
        if (tree) {
          trees.push({
            name: 'Project Commands (.claude/commands/)',
            icon: '⚡',
            basePath: projectCommandsDir,
            tree
          })
        }
      } catch {}

    } else if (filter === 'favorites') {
      // Favorites are handled client-side from localStorage
      // Return empty trees array
    }

    res.json({ trees })

  } catch (error) {
    console.error('Error listing filtered files:', error)
    res.status(500).json({ error: error.message })
  }
})

// Get git status for files in a directory
// Returns file paths with their git status (staged/modified/untracked)
router.get('/git-status', async (req, res) => {
  try {
    let targetPath = req.query.path || process.cwd()
    targetPath = expandTilde(targetPath)
    const resolvedPath = path.resolve(targetPath)

    // Import git-utils for status parsing
    const { exec } = require('child_process')
    const util = require('util')
    const execAsync = util.promisify(exec)

    // Find git root for this path
    let gitRoot
    try {
      const { stdout } = await execAsync('git rev-parse --show-toplevel', {
        cwd: resolvedPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      })
      gitRoot = stdout.trim()
    } catch {
      // Not a git repo
      return res.json({ isGitRepo: false, files: {} })
    }

    // Get git status
    const { stdout: statusOutput } = await execAsync('git status -b --porcelain', {
      cwd: gitRoot,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    })

    // Parse the status output into a map of relative path -> status
    const files = {}
    const lines = statusOutput.trim().split('\n')

    for (const line of lines) {
      if (!line || line.length < 2 || line.startsWith('##')) continue

      const indexStatus = line[0]  // Status in index (staged area)
      const workTreeStatus = line[1]  // Status in work tree
      let filePath = line.substring(3)  // File path starts at position 3

      // Handle renamed files (format: "R  old -> new")
      if (filePath.includes(' -> ')) {
        filePath = filePath.split(' -> ')[1]
      }

      // Convert relative path to absolute for matching
      const absolutePath = path.join(gitRoot, filePath)

      // Determine status type (priority: staged > modified > untracked)
      let status = null
      if (indexStatus === '?' && workTreeStatus === '?') {
        status = 'untracked'
      } else if (indexStatus !== ' ' && indexStatus !== '?') {
        status = 'staged'
      } else if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
        status = 'modified'
      }

      if (status) {
        files[absolutePath] = { status, indexStatus, workTreeStatus }
      }
    }

    res.json({
      isGitRepo: true,
      gitRoot,
      files
    })

  } catch (error) {
    console.error('Error getting git status:', error)
    res.status(500).json({ error: error.message })
  }
})

module.exports = router
