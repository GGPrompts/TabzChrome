# Contributing to TabzChrome

Thank you for your interest in contributing to TabzChrome! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please be respectful and constructive in all interactions. We're building something useful together.

## Getting Started

### Prerequisites

- Node.js 18+
- Chrome 116+ (for Manifest V3 side panel support)
- tmux 3.0+
- WSL2, Linux, or macOS

### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/GGPrompts/TabzChrome.git
   cd TabzChrome
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd backend && npm install && cd ..
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```

4. **Load in Chrome**
   - Navigate to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked" → Select `dist-extension` folder

5. **Start the backend**
   ```bash
   cd backend && npm start
   ```

6. **Open the sidebar**
   - Click the Tabz extension icon, or
   - Press `Ctrl+Shift+9`

## How to Contribute

### Reporting Bugs

1. Check [existing issues](https://github.com/GGPrompts/TabzChrome/issues) first
2. Create a new issue with:
   - Clear title describing the bug
   - Steps to reproduce
   - Expected vs actual behavior
   - Browser version, OS, and TabzChrome version
   - Console errors (if any)

### Suggesting Features

1. Check [existing issues](https://github.com/GGPrompts/TabzChrome/issues) for similar suggestions
2. Create a new issue with the "enhancement" label
3. Describe:
   - The problem you're trying to solve
   - Your proposed solution
   - Alternative approaches considered

### Submitting Pull Requests

1. **Fork the repository**

2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**
   - Follow the existing code style
   - Keep changes focused and atomic
   - Test your changes thoroughly

4. **Run tests**
   ```bash
   npm test
   ```

5. **Commit with a clear message**
   ```bash
   git commit -m "feat: add new feature description"
   ```

   Use conventional commit prefixes:
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation only
   - `refactor:` - Code refactoring
   - `test:` - Adding tests
   - `chore:` - Maintenance tasks

6. **Push and create PR**
   ```bash
   git push origin feature/your-feature-name
   ```
   Then open a Pull Request on GitHub.

## Development Guidelines

### Code Style

- TypeScript for frontend (extension/)
- JavaScript for backend (backend/)
- Use existing patterns in the codebase
- Keep it simple - avoid over-engineering

### Architecture Principles

From [CLAUDE.md](CLAUDE.md):

1. **Windows Terminal Simplicity** - Just bash terminals with profiles
2. **Profiles Over Complexity** - Appearance + optional command
3. **Smart Directory Inheritance** - Global working directory in header
4. **Chrome Native** - Side panel API, no external dependencies
5. **Easy to Deploy** - Extension + Node.js backend

### What NOT to Do

- Don't add complex terminal types (bash only)
- Don't over-engineer solutions
- Don't break WebSocket protocol compatibility
- Don't add unnecessary dependencies

### Testing

- Run `npm test` before submitting PRs
- Test the extension manually in Chrome
- Verify WebSocket communication works
- Test on multiple screen sizes (sidebar responsiveness)

## Project Structure

```
TabzChrome/
├── extension/           # Chrome extension (React + TypeScript)
│   ├── sidepanel/       # Main sidebar UI
│   ├── components/      # React components
│   ├── background/      # Service worker
│   └── shared/          # Shared utilities
├── backend/             # Node.js WebSocket server
│   ├── modules/         # Core functionality
│   └── routes/          # REST API endpoints
├── tabz-mcp-server/     # MCP server for Claude integration
└── docs/                # Documentation
```

## Getting Help

- Read [CLAUDE.md](CLAUDE.md) for architecture details
- Check [LESSONS_LEARNED.md](LESSONS_LEARNED.md) for common pitfalls
- Open an issue for questions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
