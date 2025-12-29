# TabzChrome GitHub Pages

Quick reference site for TabzChrome terminal power users.

## Live Site

After enabling GitHub Pages, the site will be available at:
https://ggprompts.github.io/TabzChrome/

## Pages

- **index.html** - Home page with quick navigation
- **mcp-tools.html** - 12 Tabz MCP browser automation tools
- **cli-tools.html** - Claude Code, Gemini CLI, Codex CLI reference
- **tui-tools.html** - Recommended TUI tools (lazygit, htop, yazi, etc.)
- **spawn-api.html** - Terminal Spawn API with interactive Claude launcher
- **terminal-commands.html** - data-terminal-command attribute guide

## Setup GitHub Pages

1. Go to repository Settings > Pages
2. Under "Build and deployment", select:
   - Source: **GitHub Actions**
3. Push changes to main branch
4. The workflow will automatically deploy `docs/pages/`

## Local Development

Open any HTML file directly in your browser:

```bash
cd docs/pages
python3 -m http.server 8000
# or
npx serve .
```

Then visit http://localhost:8000

## Interactive Features

- **Spawn API page** has a live Claude Code command builder
- **Terminal Commands page** has working "Run in Terminal" demos
- Both require TabzChrome backend running on localhost:8129

## Tech Stack

- Plain HTML/CSS/JS (no build step)
- JetBrains Mono + Inter fonts (Google Fonts)
- Dark terminal aesthetic theme
- Mobile-responsive design
