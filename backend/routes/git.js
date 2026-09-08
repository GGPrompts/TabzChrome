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
const { createModuleLogger } = require('../modules/logger');
const { AUTH_TOKEN_FILE } = require('../modules/auth-token');

const log = createModuleLogger('Git');

// Read auth token for secure endpoints
const fs = require('fs');
let authToken = null;
try {
  authToken = fs.readFileSync(AUTH_TOKEN_FILE, 'utf-8').trim();
} catch {
  log.warn(' Could not read auth token - write operations will fail');
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

    log.info(` Scanning for repos in: ${projectsDir}`);

    const repoPaths = await gitUtils.discoverRepos(projectsDir);

    log.info(` Found ${repoPaths.length} repositories`);

    // Get status for each repo (in parallel for speed)
    const repos = await Promise.all(repoPaths.map(async (repoPath) => {
      try {
        const [status, githubUrl, lastActivity] = await Promise.all([
          gitUtils.getRepoStatus(repoPath),
          gitUtils.getGitHubUrl(repoPath),
          gitUtils.getLastActivity(repoPath)
        ]);

        // Get worktrees (only if more than 1, to avoid noise)
        const worktrees = await gitUtils.getWorktrees(repoPath, githubUrl);

        return {
          name: path.basename(repoPath),
          path: repoPath,
          ...status,
          githubUrl,
          lastActivity,
          worktrees: worktrees.length > 1 ? worktrees : []
        };
      } catch (err) {
        // Return basic info even if status fails
        log.warn(`Error getting status for ${repoPath}:`, err.message);
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
    log.error(' Error listing repos:', err);
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
    log.error(' Error getting repo status:', err);
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
    log.error(' Error getting repo log:', err);
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
    log.error(' Error staging files:', err);
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
    log.error(' Error unstaging files:', err);
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
    log.error(' Error creating commit:', err);
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
    log.error(' Error pushing:', err);
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
    log.error(' Error pulling:', err);
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
    log.error(' Error fetching:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/discard - Discard changes to files
 * Body: { files: ['path1', 'path2'] } or { all: true } for all unstaged changes
 */
router.post('/repos/:repo/discard', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    if (req.body.all) {
      await gitUtils.discardAllChanges(repoPath);
      res.json({
        success: true,
        message: 'Discarded all unstaged changes'
      });
    } else {
      const files = req.body.files;
      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files specified' });
      }

      await gitUtils.discardFiles(repoPath, files);
      res.json({
        success: true,
        message: `Discarded changes to ${files.length} file(s)`
      });
    }
  } catch (err) {
    log.error(' Error discarding changes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/git/repos/:repo/stashes - List stashes
 */
router.get('/repos/:repo/stashes', async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const stashes = await gitUtils.listStashes(repoPath);

    res.json({
      success: true,
      data: { stashes }
    });
  } catch (err) {
    log.error(' Error listing stashes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/stash - Create a stash
 * Body: { message?: 'stash message', includeUntracked?: true }
 */
router.post('/repos/:repo/stash', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const message = req.body.message || '';
    const includeUntracked = req.body.includeUntracked || false;

    await gitUtils.stashChanges(repoPath, message, includeUntracked);

    res.json({
      success: true,
      message: 'Changes stashed successfully'
    });
  } catch (err) {
    log.error(' Error stashing changes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/stash-pop - Pop the most recent stash
 * Body: { ref?: 'stash@{0}' }
 */
router.post('/repos/:repo/stash-pop', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const ref = req.body.ref || 'stash@{0}';

    await gitUtils.popStash(repoPath, ref);

    res.json({
      success: true,
      message: 'Stash popped successfully'
    });
  } catch (err) {
    log.error(' Error popping stash:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/stash-apply - Apply a stash without removing it
 * Body: { ref?: 'stash@{0}' }
 */
router.post('/repos/:repo/stash-apply', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const ref = req.body.ref || 'stash@{0}';

    await gitUtils.applyStash(repoPath, ref);

    res.json({
      success: true,
      message: 'Stash applied successfully'
    });
  } catch (err) {
    log.error(' Error applying stash:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/stash-drop - Drop a stash
 * Body: { ref?: 'stash@{0}' }
 */
router.post('/repos/:repo/stash-drop', requireAuth, async (req, res) => {
  try {
    let projectsDir = req.query.dir || gitUtils.DEFAULT_PROJECTS_DIR;
    projectsDir = expandTilde(projectsDir);

    const repoPath = validateRepoPath(req.params.repo, projectsDir);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Invalid repository name' });
    }

    const ref = req.body.ref || 'stash@{0}';

    await gitUtils.dropStash(repoPath, ref);

    res.json({
      success: true,
      message: 'Stash dropped successfully'
    });
  } catch (err) {
    log.error(' Error dropping stash:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/git/repos/:repo/generate-message - Generate commit message using AI
 * Uses Claude CLI with Haiku model for fast, cheap generation
 * Body: { model?: 'haiku' }
 */
router.post('/repos/:repo/generate-message', requireAuth, async (req, res) => {
  const { spawn, exec } = require('child_process');
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

    // Build the prompt - very strict to avoid conversational responses
    const prompt = `Write a git commit message for the following diff.

CRITICAL OUTPUT RULES:
- Output ONLY the commit message text, nothing else
- NO code fences, NO backticks, NO markdown
- NO XML tags like <output> or </output>
- NO "Here's a commit message:" or similar preamble
- NO "Co-Authored-By" or attribution lines
- NO trailing explanations

FORMAT:
- Use conventional commit prefix: feat:, fix:, refactor:, docs:, chore:
- First line under 72 chars
- Optional: blank line + bullet points for details

DIFF:
${truncatedDiff}`;

    // Run claude CLI with haiku model, passing prompt via stdin to avoid shell escaping issues
    const model = req.body.model || 'haiku';
    log.info(` Generating commit message with ${model} for ${req.params.repo}`);

    const message = await new Promise((resolve, reject) => {
      const child = spawn('claude', ['--model', model, '--print', '-p', '-'], {
        cwd: repoPath,
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => { stdout += data.toString(); });
      child.stderr.on('data', (data) => { stderr += data.toString(); });

      child.on('error', (err) => {
        reject(new Error(`Failed to spawn claude: ${err.message}`));
      });

      child.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `claude exited with code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      // Write prompt to stdin and close it
      child.stdin.write(prompt);
      child.stdin.end();
    });

    const cleanMessage = message.trim();

    if (!cleanMessage) {
      throw new Error('Claude returned empty response');
    }

    log.info(` Generated message: ${cleanMessage.split('\n')[0]}...`);

    res.json({
      success: true,
      message: cleanMessage
    });
  } catch (err) {
    log.error(' Error generating commit message:', err);

    // Check if claude CLI is not available
    if (err.message && (err.message.includes('ENOENT') || err.message.includes('not found'))) {
      return res.status(500).json({
        success: false,
        error: 'Claude CLI not found. Install with: npm install -g @anthropic-ai/claude-code'
      });
    }

    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// PATH-BASED ENDPOINTS (for external apps like markdown-themes)
// These accept full paths instead of repo names
// ============================================================================

/**
 * GET /api/git/graph - Get commit graph data for visualization
 * Query params:
 *   - path: Full path to repo or directory within repo (required)
 *   - limit: Number of commits (default: 50)
 *   - skip: Offset for pagination (default: 0)
 */
router.get('/graph', async (req, res) => {
  try {
    const repoPath = expandTilde(req.query.path);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Path is required' });
    }

    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = parseInt(req.query.skip, 10) || 0;

    const result = await gitUtils.getGraphLog(repoPath, limit, skip);

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    log.error(' Error getting graph log:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/git/diff - Get diff for a commit or between commits
 * Query params:
 *   - path: Full path to repo (required)
 *   - base: Base commit hash (optional, for single commit use this only)
 *   - head: Head commit hash (optional)
 *   - file: Specific file to diff (optional)
 */
router.get('/diff', async (req, res) => {
  try {
    const repoPath = expandTilde(req.query.path);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Path is required' });
    }

    const base = req.query.base || null;
    const head = req.query.head || null;
    const file = req.query.file || null;

    const diff = await gitUtils.getCommitDiff(repoPath, base, head, file);

    res.json({
      success: true,
      data: { diff }
    });
  } catch (err) {
    log.error(' Error getting diff:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/git/commit/:hash - Get details for a specific commit
 * Query params:
 *   - path: Full path to repo (required)
 */
router.get('/commit/:hash', async (req, res) => {
  try {
    const repoPath = expandTilde(req.query.path);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Path is required' });
    }

    const commit = await gitUtils.getCommitDetails(repoPath, req.params.hash);

    res.json({
      success: true,
      data: commit
    });
  } catch (err) {
    log.error(' Error getting commit details:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/git/branches - Get all branches for a repo
 * Query params:
 *   - path: Full path to repo (required)
 */
router.get('/branches', async (req, res) => {
  try {
    const repoPath = expandTilde(req.query.path);
    if (!repoPath) {
      return res.status(400).json({ success: false, error: 'Path is required' });
    }

    const branches = await gitUtils.getBranches(repoPath);

    res.json({
      success: true,
      data: branches
    });
  } catch (err) {
    log.error(' Error getting branches:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
