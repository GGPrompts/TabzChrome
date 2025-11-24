# Add Context Menu Command

Add a new command to the Chrome extension's right-click context menu.

## Instructions

The user wants to add a command that appears when right-clicking in Chrome. Follow these steps:

### 1. Identify Command Type

Ask the user which type of command they want to add:

- **TUI App** - A terminal UI application (e.g., lazygit, htop, ranger)
  - Will be grouped by category in the context menu
  - Only appears if the command is installed (checked via `which`)

- **Git Command** - A git shortcut (e.g., git status, git pull)
  - Only appears when .git directory exists

- **Docker Command** - A docker/docker-compose command
  - Only appears when docker-compose.yml exists

- **Project Command** - Language-specific command (Python/Rust/Go/etc)
  - Only appears when project files exist (requirements.txt, Cargo.toml, go.mod, etc)

- **Custom Command** - Any other command that should always appear

### 2. Gather Required Information

For **TUI Apps**, get:
- `name`: Display name (e.g., "lazygit")
- `command`: Actual command to run (e.g., "lazygit" or "/full/path/to/app")
- `description`: Short description (e.g., "Git TUI")
- `category`: One of: Git, System, Files, Editors, AI, Dev, Media, Tools

For **Other Commands**, get:
- `name`: Display name shown in menu
- `command`: Command to execute in terminal
- `description`: Short description/tooltip

### 3. Edit the File

Edit `backend/modules/context-detector.js`:

**For TUI Apps** - Add to the `this.tuiApps` array in the constructor (around line 11):
```javascript
{ name: 'appname', command: 'appname', description: 'Description', category: 'Category' },
```

**For Git Commands** - Add to `commands.gitCommands` array (around line 124):
```javascript
{ name: 'git commandname', command: 'git commandname --args', description: 'Description' },
```

**For Docker Commands** - Add to `commands.dockerCommands` array (around line 111):
```javascript
{ name: 'docker-compose action', command: 'docker-compose action', description: 'Description' },
```

**For Project Commands** - Add to the appropriate section (lines 146-174):
```javascript
// Python projects
if (fs.existsSync(path.join(workingDir, 'requirements.txt')) || ...) {
  commands.customCommands.push(
    { name: 'command name', command: 'actual command', description: 'Description' }
  );
}
```

**For New Language Support** - Add a new conditional block:
```javascript
// Your Language
if (fs.existsSync(path.join(workingDir, 'marker-file'))) {
  commands.customCommands.push(
    { name: 'command name', command: 'command to run', description: 'Description' },
    { name: 'another command', command: 'another command', description: 'Description' }
  );
}
```

### 4. Restart Backend

After editing, restart the backend server:
```bash
cd backend && pkill -f "node server.js" && sleep 1 && node server.js &
```

### 5. Verify

Tell the user:
1. The command has been added
2. Where it will appear in the context menu
3. What triggers it to show up (if conditional)
4. That they need to reload the Chrome extension to see it

## Important Notes

- Commands are only shown if they're relevant (e.g., Git commands only show in git repos)
- TUI apps are only shown if installed (backend checks with `which`)
- Context menu updates every 30 seconds or when extension reloads
- All spawned terminals use the `ctt-` prefix and appear in the Chrome sidebar
- Commands run in the detected working directory

## Example Interaction

**User**: "Add neovim to the context menu"

**Response**:
1. Identify: This is a TUI App
2. Ask: "What category should neovim be in? (Git, System, Files, Editors, AI, Dev, Media, Tools)"
3. User says: "Editors"
4. Edit context-detector.js to add:
   ```javascript
   { name: 'neovim', command: 'nvim', description: 'Neovim editor', category: 'Editors' },
   ```
5. Restart backend
6. Confirm: "Added neovim to the Editors category. It will appear in the context menu if nvim is installed. Reload the extension to see it."
