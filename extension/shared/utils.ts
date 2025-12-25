// Shared utilities

// Backend API base URL
export const API_BASE = "http://localhost:8129"

// Get effective working directory with profile/global inheritance
export function getEffectiveWorkingDir(profileDir: string | undefined, globalDir: string): string {
  return (profileDir && profileDir !== "~") ? profileDir : globalDir
}

// Compact a full path to use ~ for home directory (Linux and macOS)
export function compactPath(path: string): string {
  if (!path) return path
  return path.replace(/^\/home\/[^/]+/, "~").replace(/^\/Users\/[^/]+/, "~")
}

// Expand ~ to full home directory path
export function expandPath(path: string, homeDir: string): string {
  return path.replace(/^~/, homeDir)
}

// Parse URL to local file path (for GitHub URLs)
export function parseUrlToPath(url: string): string | null {
  try {
    const parsed = new URL(url);

    // GitHub repo URL
    if (parsed.hostname === 'github.com') {
      const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)/);
      if (match) {
        const [, owner, repo] = match;
        // Remove .git suffix if present
        const repoName = repo.replace(/\.git$/, '');
        return `~/projects/${repoName}`;
      }
    }

    // GitLab repo URL
    if (parsed.hostname === 'gitlab.com') {
      const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)/);
      if (match) {
        const [, owner, repo] = match;
        const repoName = repo.replace(/\.git$/, '');
        return `~/projects/${repoName}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

// Generate cURL command from network request
export function generateCurlCommand(request: any): string {
  let curl = `curl '${request.request.url}'`;

  // Add method
  if (request.request.method !== 'GET') {
    curl += ` -X ${request.request.method}`;
  }

  // Add headers
  if (request.request.headers) {
    request.request.headers.forEach((header: any) => {
      curl += ` -H '${header.name}: ${header.value}'`;
    });
  }

  // Add body
  if (request.request.postData) {
    curl += ` -d '${request.request.postData.text}'`;
  }

  return curl;
}

// Detect error patterns and suggest commands
export function generateSuggestion(error: string): string {
  // Command not found
  if (error.match(/command not found: (.+)/)) {
    const cmd = error.match(/command not found: (.+)/)?.[1];
    return `Try installing: sudo apt install ${cmd} or brew install ${cmd}`;
  }

  // npm error
  if (error.includes('npm ERR!')) {
    return 'Try: npm install or npm cache clean --force';
  }

  // Permission denied
  if (error.includes('Permission denied')) {
    return 'Try running with sudo or check file permissions';
  }

  return 'Check the error message above';
}

// Format timestamp for display
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

// Truncate long strings
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
