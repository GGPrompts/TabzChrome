/**
 * Git utility functions for TabzChrome
 * Uses native git CLI via child_process (same pattern as tmux integration)
 */

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const util = require('util');
const execAsync = util.promisify(exec);

// Configuration
const DEFAULT_PROJECTS_DIR = path.join(process.env.HOME, 'projects');

/**
 * Validate that a path is within allowed directories (security)
 * Prevents path traversal attacks
 * @param {string} repoPath - Path to validate
 * @param {string} baseDir - Base directory that path must be within
 * @returns {boolean} True if path is valid and within baseDir
 */
function isValidPath(repoPath, baseDir) {
  const resolvedPath = path.resolve(repoPath);
  const resolvedBase = path.resolve(baseDir);
  return resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
}

/**
 * Escape shell argument to prevent command injection
 * @param {string} arg - Argument to escape
 * @returns {string} Escaped argument
 */
function escapeShellArg(arg) {
  // Replace single quotes with escaped version
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

/**
 * Discover all git repositories in a directory (non-recursive, depth 1)
 * @param {string} dir - Directory to scan
 * @returns {Promise<string[]>} Array of repo paths
 */
async function discoverRepos(dir = DEFAULT_PROJECTS_DIR) {
  const repos = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Skip hidden directories (except we still check them for .git)
      const entryPath = path.join(dir, entry.name);
      const gitPath = path.join(entryPath, '.git');

      try {
        const gitStat = await fs.stat(gitPath);
        if (gitStat.isDirectory()) {
          repos.push(entryPath);
        }
      } catch {
        // Not a git repo, skip
      }
    }
  } catch (err) {
    console.error(`[Git] Error scanning directory ${dir}:`, err.message);
  }

  return repos;
}

/**
 * Parse git status --porcelain output
 * @param {string} output - Raw git status output
 * @returns {object} Parsed status { staged: [], unstaged: [], untracked: [] }
 */
function parseGitStatus(output) {
  const staged = [];
  const unstaged = [];
  const untracked = [];

  if (!output || !output.trim()) {
    return { staged, unstaged, untracked };
  }

  const lines = output.trim().split('\n');

  for (const line of lines) {
    if (!line || line.length < 2) continue;

    // Skip branch line (starts with ##)
    if (line.startsWith('##')) continue;

    const indexStatus = line[0];  // Status in index (staged area)
    const workTreeStatus = line[1];  // Status in work tree
    const filePath = line.substring(3);  // File path starts at position 3

    // Handle renamed files (format: "R  old -> new")
    let displayPath = filePath;
    if (filePath.includes(' -> ')) {
      const [oldPath, newPath] = filePath.split(' -> ');
      displayPath = newPath;
    }

    // Staged changes (index has modification)
    if (indexStatus !== ' ' && indexStatus !== '?') {
      staged.push({ path: displayPath, status: indexStatus });
    }

    // Unstaged changes (work tree has modification)
    if (workTreeStatus !== ' ' && workTreeStatus !== '?') {
      unstaged.push({ path: displayPath, status: workTreeStatus });
    }

    // Untracked files
    if (indexStatus === '?' && workTreeStatus === '?') {
      untracked.push({ path: displayPath });
    }
  }

  return { staged, unstaged, untracked };
}

/**
 * Parse branch tracking info from git status -b --porcelain output
 * @param {string} output - Raw git status output
 * @returns {object} { branch, tracking, ahead, behind }
 */
function parseBranchInfo(output) {
  const result = {
    branch: 'unknown',
    tracking: null,
    ahead: 0,
    behind: 0
  };

  if (!output) return result;

  const lines = output.trim().split('\n');
  const branchLine = lines.find(l => l.startsWith('##'));

  if (!branchLine) return result;

  // Parse branch line: ## main...origin/main [ahead 3, behind 1]
  // or just: ## main
  // or: ## HEAD (no branch)
  const branchMatch = branchLine.match(/^## ([^.\s]+)/);
  if (branchMatch) {
    result.branch = branchMatch[1];
  }

  // Check for tracking branch
  const trackingMatch = branchLine.match(/\.\.\.([^\s\[]+)/);
  if (trackingMatch) {
    result.tracking = trackingMatch[1];
  }

  // Check for ahead/behind
  const aheadMatch = branchLine.match(/ahead (\d+)/);
  if (aheadMatch) {
    result.ahead = parseInt(aheadMatch[1], 10);
  }

  const behindMatch = branchLine.match(/behind (\d+)/);
  if (behindMatch) {
    result.behind = parseInt(behindMatch[1], 10);
  }

  return result;
}

/**
 * Get repository status (branch, ahead/behind, staged/unstaged/untracked)
 * @param {string} repoPath - Full path to repository
 * @returns {Promise<object>} Status object
 */
async function getRepoStatus(repoPath) {
  try {
    // Use -b for branch info, --porcelain for stable output format
    const { stdout } = await execAsync('git status -b --porcelain', {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }  // Disable git prompts
    });

    const branchInfo = parseBranchInfo(stdout);
    const changes = parseGitStatus(stdout);

    // Determine overall status
    let status = 'clean';
    if (changes.staged.length > 0 || changes.unstaged.length > 0 || changes.untracked.length > 0) {
      status = 'dirty';
    }

    return {
      branch: branchInfo.branch,
      tracking: branchInfo.tracking,
      ahead: branchInfo.ahead,
      behind: branchInfo.behind,
      status,
      changes: {
        staged: changes.staged.length,
        unstaged: changes.unstaged.length,
        untracked: changes.untracked.length
      },
      staged: changes.staged,
      unstaged: changes.unstaged,
      untracked: changes.untracked
    };
  } catch (err) {
    throw new Error(`Failed to get git status: ${err.message}`);
  }
}

/**
 * Get recent commits
 * @param {string} repoPath - Full path to repository
 * @param {number} limit - Number of commits (default 20)
 * @returns {Promise<object[]>} Array of commit objects
 */
async function getRepoLog(repoPath, limit = 20) {
  try {
    // Format: hash|shortHash|subject|authorName|authorEmail|authorDateISO|refNames
    const format = '%H|%h|%s|%an|%ae|%aI|%D';
    const { stdout } = await execAsync(
      `git log --format='${format}' -n ${parseInt(limit, 10)}`,
      {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }
    );

    if (!stdout.trim()) {
      return [];
    }

    const commits = stdout.trim().split('\n').map(line => {
      const [hash, shortHash, message, author, email, date, refs] = line.split('|');
      return {
        hash,
        shortHash,
        message,
        author,
        email,
        date,
        refs: refs ? refs.split(', ').filter(r => r) : []
      };
    });

    return commits;
  } catch (err) {
    // Handle repos with no commits yet
    if (err.message && err.message.includes('does not have any commits yet')) {
      return [];
    }
    throw new Error(`Failed to get git log: ${err.message}`);
  }
}

/**
 * Extract GitHub URL from git remote
 * Converts SSH and HTTPS URLs to web URLs
 * @param {string} repoPath - Full path to repository
 * @returns {Promise<string|null>} GitHub web URL or null
 */
async function getGitHubUrl(repoPath) {
  try {
    const { stdout } = await execAsync('git remote get-url origin', {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    const remoteUrl = stdout.trim();

    if (!remoteUrl) return null;

    // Convert SSH URL: git@github.com:user/repo.git -> https://github.com/user/repo
    if (remoteUrl.startsWith('git@github.com:')) {
      return remoteUrl
        .replace('git@github.com:', 'https://github.com/')
        .replace(/\.git$/, '');
    }

    // Convert HTTPS URL: https://github.com/user/repo.git -> https://github.com/user/repo
    if (remoteUrl.includes('github.com')) {
      return remoteUrl.replace(/\.git$/, '');
    }

    // Other remotes - return as-is if it looks like a URL
    if (remoteUrl.startsWith('http')) {
      return remoteUrl.replace(/\.git$/, '');
    }

    return null;
  } catch {
    // No remote or error - that's fine
    return null;
  }
}

/**
 * Get last activity date (most recent commit)
 * @param {string} repoPath - Full path to repository
 * @returns {Promise<string|null>} ISO date string or null
 */
async function getLastActivity(repoPath) {
  try {
    const { stdout } = await execAsync('git log -1 --format=%aI', {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Stage files
 * @param {string} repoPath - Full path to repository
 * @param {string[]} files - Files to stage (or ['.'] for all)
 */
async function stageFiles(repoPath, files = ['.']) {
  if (!Array.isArray(files) || files.length === 0) {
    files = ['.'];
  }

  // Validate files don't contain malicious paths
  for (const file of files) {
    if (file.includes('..')) {
      throw new Error('Invalid file path');
    }
  }

  const escapedFiles = files.map(f => escapeShellArg(f)).join(' ');

  try {
    await execAsync(`git add ${escapedFiles}`, {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
  } catch (err) {
    throw new Error(`Failed to stage files: ${err.message}`);
  }
}

/**
 * Unstage files
 * @param {string} repoPath - Full path to repository
 * @param {string[]} files - Files to unstage
 */
async function unstageFiles(repoPath, files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files specified to unstage');
  }

  // Validate files don't contain malicious paths
  for (const file of files) {
    if (file.includes('..')) {
      throw new Error('Invalid file path');
    }
  }

  const escapedFiles = files.map(f => escapeShellArg(f)).join(' ');

  try {
    await execAsync(`git restore --staged ${escapedFiles}`, {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });
  } catch (err) {
    throw new Error(`Failed to unstage files: ${err.message}`);
  }
}

/**
 * Create commit
 * @param {string} repoPath - Full path to repository
 * @param {string} message - Commit message
 */
async function createCommit(repoPath, message) {
  if (!message || typeof message !== 'string' || !message.trim()) {
    throw new Error('Commit message is required');
  }

  try {
    // Use stdin to pass message to avoid shell escaping issues
    const { spawn } = require('child_process');

    return new Promise((resolve, reject) => {
      const git = spawn('git', ['commit', '-m', message], {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });

      let stdout = '';
      let stderr = '';

      git.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      git.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      git.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || stdout || 'Commit failed'));
        }
      });

      git.on('error', (err) => {
        reject(new Error(`Failed to create commit: ${err.message}`));
      });
    });
  } catch (err) {
    throw new Error(`Failed to create commit: ${err.message}`);
  }
}

/**
 * Push to remote
 * @param {string} repoPath - Full path to repository
 * @param {string} remote - Remote name (default: origin)
 * @param {string} branch - Branch name (optional, uses current branch)
 */
async function pushToRemote(repoPath, remote = 'origin', branch = null) {
  try {
    const branchArg = branch ? escapeShellArg(branch) : '';
    const cmd = branch
      ? `git push ${escapeShellArg(remote)} ${branchArg}`
      : `git push ${escapeShellArg(remote)}`;

    const { stdout, stderr } = await execAsync(cmd, {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    return { stdout, stderr };
  } catch (err) {
    throw new Error(`Failed to push: ${err.message}`);
  }
}

/**
 * Pull from remote
 * @param {string} repoPath - Full path to repository
 * @param {string} remote - Remote name (default: origin)
 * @param {string} branch - Branch name (optional, uses current branch)
 */
async function pullFromRemote(repoPath, remote = 'origin', branch = null) {
  try {
    const branchArg = branch ? escapeShellArg(branch) : '';
    const cmd = branch
      ? `git pull ${escapeShellArg(remote)} ${branchArg}`
      : `git pull ${escapeShellArg(remote)}`;

    const { stdout, stderr } = await execAsync(cmd, {
      cwd: repoPath,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
    });

    return { stdout, stderr };
  } catch (err) {
    throw new Error(`Failed to pull: ${err.message}`);
  }
}

/**
 * Fetch from remote
 * @param {string} repoPath - Full path to repository
 * @param {string} remote - Remote name (default: origin)
 */
async function fetchFromRemote(repoPath, remote = 'origin') {
  try {
    const { stdout, stderr } = await execAsync(
      `git fetch ${escapeShellArg(remote)}`,
      {
        cwd: repoPath,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      }
    );

    return { stdout, stderr };
  } catch (err) {
    throw new Error(`Failed to fetch: ${err.message}`);
  }
}

/**
 * Get the last commit info (for quick summary)
 * @param {string} repoPath - Full path to repository
 * @returns {Promise<object|null>} Last commit info or null
 */
async function getLastCommit(repoPath) {
  try {
    const commits = await getRepoLog(repoPath, 1);
    return commits[0] || null;
  } catch {
    return null;
  }
}

module.exports = {
  discoverRepos,
  getRepoStatus,
  getRepoLog,
  getGitHubUrl,
  getLastActivity,
  getLastCommit,
  parseGitStatus,
  parseBranchInfo,
  stageFiles,
  unstageFiles,
  createCommit,
  pushToRemote,
  pullFromRemote,
  fetchFromRemote,
  isValidPath,
  escapeShellArg,
  DEFAULT_PROJECTS_DIR
};
