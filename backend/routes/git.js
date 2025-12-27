/**
 * Git API routes for TabzChrome dashboard
 *
 * Provides REST endpoints for git operations on local repositories.
 * Uses native git CLI via child_process (same pattern as tmux integration).
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const gitUtils = require('../modules/git-utils');

// Read auth token for secure endpoints
const fs = require('fs');
const WS_AUTH_TOKEN_FILE = '/tmp/tabz-auth-token';
let authToken = null;
try {
  authToken = fs.readFileSync(WS_AUTH_TOKEN_FILE, 'utf-8').trim();
} catch {
  console.warn('[Git API] Could not read auth token - write operations will fail');
}

/**
 * Middleware to validate auth token for write operations
 */
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (!authToken || token !== authToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized - valid token required' });
  }
  next();
}

/**
 * Helper to expand ~ to home directory
 */
function expandTilde(filePath) {
  if (!filePath) return filePath;
  if (filePath.startsWith('~')) {
    return path.join(process.env.HOME || process.env.USERPROFILE, filePath.slice(1));
  }
  return filePath;
}

/**
 * Helper to validate repo name and get full path
 * Prevents path traversal attacks
 */
function validateRepoPath(repoName, projectsDir) {
  // Repo name should not contain path separators or ..
  if (!repoName || repoName.includes('..') || repoName.includes('/') || repoName.includes('\\')) {
    return null;
  }

  const fullPath = path.join(projectsDir, repoName);

  // Verify path is within projects directory
  if (!gitUtils.isValidPath(fullPath, projectsDir)) {
    return null;
  }

  return fullPath;
}

// ============================================================================
// READ ENDPOINTS (no auth required - read-only)
// ============================================================================

/**
 * GET /api/git/repos - List all repositories with status
 * Query params:
 *   - dir: Projects directory (default: ~/projects)
 */
router.get('/repos', async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    console.log(`[Git API] Scanning for repos in: ${projectsDir}`);

    const repoPaths = await gitUtils.discoverRepos(projectsDir);

    console.log(`[Git API] Found ${repoPaths.length} repositories`);

    // Get status for each repo (in parallel for speed)
    const repos = await Promise.all(repoPaths.map(async (repoPath) => {
      try {
        const [status, githubUrl, lastActivity] = await Promise.all([
          gitUtils.getRepoStatus(repoPath),
          gitUtils.getGitHubUrl(repoPath),
          gitUtils.getLastActivity(repoPath)
        ]);

        return {
          name: path.basename(repoPath),
          path: repoPath,
          ...status,
          githubUrl,
          lastActivity
        };
      } catch (err) {
        // Return basic info even if status fails
        console.warn(`[Git API] Error getting status for ${repoPath}:`, err.message);
        return {
          name: path.basename(repoPath),
          path: repoPath,
          error: err.message
        };
      }
    }));

    res.json({
      success: true,
      data: {
        projectsDir,
        repos
      }
    });
  } catch (err) {
    console.error('[Git API] Error listing repos:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/git/repos/:repo/status - Detailed status for one repo
 */
router.get('/repos/:repo/status', async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const status = await gitUtils.getRepoStatus(repoPath);

    res.json({
      success: true,
      data: status
    });
  } catch (err) {
    console.error('[Git API] Error getting repo status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/git/repos/:repo/log - Recent commits
 * Query params:
 *   - limit: Number of commits (default: 20)
 */
router.get('/repos/:repo/log', async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const limit = parseInt(req.query.limit, 10) || 20;
    const commits = await gitUtils.getRepoLog(repoPath, limit);

    res.json({
      success: true,
      data: {
        commits
      }
    });
  } catch (err) {
    console.error('[Git API] Error getting repo log:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// WRITE ENDPOINTS (auth required)
// ============================================================================

/**
 * POST /api/git/repos/:repo/stage - Stage files
 * Body: { files: ['path1', 'path2'] } or { files: ['.'] } for all
 */
router.post('/repos/:repo/stage', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const files = req.body.files || ['.'];
    await gitUtils.stageFiles(repoPath, files);

    res.json({
      success: true,
      message: `Staged ${files.length === 1 && files[0] === '.' ? 'all' : files.length} file(s)`
    });
  } catch (err) {
    console.error('[Git API] Error staging files:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/unstage - Unstage files
 * Body: { files: ['path1', 'path2'] }
 */
router.post('/repos/:repo/unstage', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const files = req.body.files;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files specified' });
    }

    await gitUtils.unstageFiles(repoPath, files);

    res.json({
      success: true,
      message: `Unstaged ${files.length} file(s)`
    });
  } catch (err) {
    console.error('[Git API] Error unstaging files:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/commit - Create commit
 * Body: { message: 'Commit message' }
 */
router.post('/repos/:repo/commit', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const message = req.body.message;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'Commit message is required' });
    }

    const result = await gitUtils.createCommit(repoPath, message.trim());

    res.json({
      success: true,
      message: 'Commit created successfully',
      output: result.stdout
    });
  } catch (err) {
    console.error('[Git API] Error creating commit:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/push - Push to remote
 * Body: { remote?: 'origin', branch?: 'main' }
 */
router.post('/repos/:repo/push', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const remote = req.body.remote || 'origin';
    const branch = req.body.branch || null;

    const result = await gitUtils.pushToRemote(repoPath, remote, branch);

    res.json({
      success: true,
      message: 'Push completed successfully',
      output: result.stdout || result.stderr
    });
  } catch (err) {
    console.error('[Git API] Error pushing:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/pull - Pull from remote
 * Body: { remote?: 'origin', branch?: 'main' }
 */
router.post('/repos/:repo/pull', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const remote = req.body.remote || 'origin';
    const branch = req.body.branch || null;

    const result = await gitUtils.pullFromRemote(repoPath, remote, branch);

    res.json({
      success: true,
      message: 'Pull completed successfully',
      output: result.stdout || result.stderr
    });
  } catch (err) {
    console.error('[Git API] Error pulling:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/fetch - Fetch from remote
 * Body: { remote?: 'origin' }
 */
router.post('/repos/:repo/fetch', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const remote = req.body.remote || 'origin';

    const result = await gitUtils.fetchFromRemote(repoPath, remote);

    res.json({
      success: true,
      message: 'Fetch completed successfully',
      output: result.stdout || result.stderr || 'Up to date'
    });
  } catch (err) {
    console.error('[Git API] Error fetching:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/generate-message - Generate commit message using AI
 * Uses Claude CLI with Haiku model for fast, cheap generation
 * Body: { model?: 'haiku' }
 */
router.post('/repos/:repo/generate-message', requireAuth, async (req, res) => {
  const { exec } = require('child_process');
  const util = require('util');
  const execAsync = util.promisify(exec);

  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    // Get the staged diff
    const { stdout: diff } = await execAsync('git diff --cached', {
      cwd: repoPath,
      maxBuffer: 1024 * 1024 // 1MB buffer for large diffs
    });

    if (!diff.trim()) {
      return res.status(400).json({
        success: false,
        error: 'No staged changes to generate a message for'
      });
    }

    // Truncate diff if too large (Claude has context limits)
    const maxDiffLength = 50000;
    const truncatedDiff = diff.length > maxDiffLength
      ? diff.slice(0, maxDiffLength) + '\n\n[... diff truncated ...]'
      : diff;

    // Build the prompt
    const prompt = `Generate a concise git commit message for the following diff.
Follow conventional commit format (e.g., "feat:", "fix:", "refactor:", "docs:", "chore:").
Output ONLY the commit message, no explanations or markdown.
Keep it under 72 characters for the first line. Add a blank line and bullet points for details if needed.

Diff:
${truncatedDiff}`;

    // Run claude CLI with haiku model
    const model = req.body.model || 'haiku';
    console.log(`[Git API] Generating commit message with ${model} for ${req.params.repo}`);

    const { stdout: message } = await execAsync(
      `claude -p ${JSON.stringify(prompt)} --model ${model} --print`,
      {
        cwd: repoPath,
        timeout: 30000, // 30 second timeout
        maxBuffer: 1024 * 1024
      }
    );

    const cleanMessage = message.trim();

    if (!cleanMessage) {
      throw new Error('Claude returned empty response');
    }

    console.log(`[Git API] Generated message: ${cleanMessage.split('\n')[0]}...`);

    res.json({
      success: true,
      message: cleanMessage
    });
  } catch (err) {
    console.error('[Git API] Error generating commit message:', err);

    // Check if claude CLI is not available
    if (err.message && err.message.includes('command not found')) {
      return res.status(500).json({
        success: false,
        error: 'Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code'
      });
    }

    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
