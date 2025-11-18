/**
 * File reading API for markdown cards and file tree
 */

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

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

    // Debug: Log entry counts for top-level directories
    if (currentDepth <= 1) {
      console.log(`[buildFileTree] Read ${entries.length} raw entries from ${dirPath}`);
    }

    // Filter and sort entries
    const sortedEntries = entries
      .filter(entry => {
        // Always exclude node_modules
        if (entry.name === 'node_modules') return false;
        // If showHidden is true, show all files, otherwise filter hidden files
        if (!showHidden && entry.name.startsWith('.')) {
          // But always include .claude folder
          return entry.name === '.claude';
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
      console.log(`[buildFileTree] After filtering: ${sortedEntries.length} entries (${sortedEntries.filter(e => e.isDirectory()).length} dirs, ${sortedEntries.filter(e => !e.isDirectory()).length} files)`);
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
              console.log(`[buildFileTree] Skipping broken symlink: ${childPath}`);
            }
            continue;
          }
        }

        const child = await buildFileTree(childPath, depth, currentDepth + 1, showHidden);
        if (child) children.push(child);
      } catch (err) {
        // Log permission errors or other issues (only for top-level for brevity)
        if (currentDepth <= 1) {
          console.warn(`[buildFileTree] Skipping ${childPath}: ${err.message}`);
        }
      }
    }
    
    if (currentDepth <= 2) {
      console.log(`[buildFileTree] ${dirPath} has ${children.length} children (depth=${currentDepth})`);
    }

    return {
      name,
      path: dirPath,
      type: 'directory',
      children,
      modified: stats.mtime.toISOString()
    };
  } catch (err) {
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

// Get file tree
router.get('/tree', async (req, res) => {
  try {
    const targetPath = req.query.path || path.resolve(process.env.HOME, 'workspace');
    const depth = parseInt(req.query.depth) || 5; // Good balance for most projects
    const showHidden = req.query.showHidden === 'true'; // Parse boolean parameter

    console.log(`[FileTree API] Fetching tree: path=${targetPath}, depth=${depth}, showHidden=${showHidden}`);
    
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
    
    const resolvedPath = path.resolve(filePath);

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
      fileSize: stats.size
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

module.exports = router;

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

// Write spawn-options.json file
router.post('/write-spawn-options', async (req, res) => {
  try {
    const { content } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Content is required' })
    }

    // Validate JSON
    try {
      JSON.parse(content)
    } catch (parseError) {
      return res.status(400).json({ error: `Invalid JSON: ${parseError.message}` })
    }

    // Write to both locations (project root and frontend/public)
    const projectRoot = path.join(__dirname, '..', '..')
    const rootPath = path.join(projectRoot, 'spawn-options.json')
    const publicPath = path.join(projectRoot, 'frontend', 'public', 'spawn-options.json')

    await fs.writeFile(rootPath, content, 'utf-8')
    await fs.writeFile(publicPath, content, 'utf-8')

    console.log('[Files API] Updated spawn-options.json in both locations')
    return res.json({ ok: true, message: 'Spawn options updated successfully' })
  } catch (error) {
    console.error('Error writing spawn-options.json:', error)
    return res.status(500).json({ error: error.message })
  }
})

module.exports = router
