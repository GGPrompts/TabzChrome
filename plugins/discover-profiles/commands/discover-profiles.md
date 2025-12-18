# Profile Discovery Assistant

Scan the user's system for installed CLI tools and help them create TabzChrome profiles.

## Instructions

1. **Check existing profiles first** to avoid duplicates. Use the profiles API:

```bash
# Get all profiles from TabzChrome (requires backend running)
curl -s http://localhost:8129/api/browser/profiles | jq
```

This returns:
- `profiles[]` - Array of all configured profiles
- `defaultProfileId` - Which profile spawns on "+"
- `globalWorkingDir` - The header working directory

Note which tools already have profiles (match by `command` field) to avoid duplicates.

2. Scan for installed CLI tools by running these checks:

```bash
# AI CLIs
for cmd in claude codex gemini aider opencode ollama gpt sgpt cursor; do
  command -v $cmd &>/dev/null && echo "✓ $cmd: $(which $cmd)"
done

# TUI Tools
for cmd in lazygit htop btop btm ranger mc ncdu tig lazydocker k9s yazi lf nnn broot; do
  command -v $cmd &>/dev/null && echo "✓ $cmd: $(which $cmd)"
done

# Editors
for cmd in nvim vim micro nano hx emacs code; do
  command -v $cmd &>/dev/null && echo "✓ $cmd: $(which $cmd)"
done

# System/Dev
for cmd in docker kubectl npm pnpm yarn tmux screen; do
  command -v $cmd &>/dev/null && echo "✓ $cmd: $(which $cmd)"
done
```

3. **AI Assistant Setup** - Ask specifically about AI tools they use:

```
Use AskUserQuestion tool with:
- question: "Which AI assistants do you use?"
- header: "AI Tools"
- multiSelect: true
- options:
  - "Claude Code" (if installed)
  - "Aider" (if installed)
  - "Codex/GPT" (if installed)
  - "Other/None"
```

**If Claude Code is selected**, ask follow-up questions:

```
Use AskUserQuestion tool with:
- question: "How do you prefer to run Claude Code?"
- header: "Claude Mode"
- multiSelect: false
- options:
  - "YOLO mode (--dangerously-skip-permissions) - Claude can edit/run without asking (Recommended)"
  - "Safe mode - Claude asks before file edits and commands"
  - "Both - create profiles for each mode"
```

Then ask about the Conductor agent (available via TabzChrome plugin):

```
Use AskUserQuestion tool with:
- question: "Add Claude Conductor profile? (multi-session orchestrator from TabzChrome)"
- header: "Conductor"
- multiSelect: false
- options:
  - "Yes - add Claude Conductor profile"
  - "No thanks"
```

If yes, add a profile with command: `claude --agent conductor`
(Note: Requires the conductor plugin from TabzChrome marketplace to be installed)

4. **Interactive Selection Loop** - Use `AskUserQuestion` with `multiSelect: true` to let users pick remaining tools:

```
Use AskUserQuestion tool with:
- question: "Which tools would you like to add as profiles?"
- header: "Add Profiles"
- multiSelect: true
- options: List the found tools that don't already have profiles (max 4 per question)
```

**IMPORTANT**: Continue the loop! After each selection:
- Confirm what was selected (e.g., "Added: lazygit, btop, htop")
- Ask "What would you like to do next?" with options:
  - "Show more tools" - continue with next batch of found tools
  - "Add a custom command" - ask for command name and details
  - "Browse awesome-tuis for ideas" - open https://github.com/rothgar/awesome-tuis in browser
  - "Done - generate profiles" - exit loop and generate JSON

Keep looping until user chooses "Done". This ensures they can:
- Select from multiple batches (since AskUserQuestion only shows 4 options at a time)
- Add custom commands not in the initial scan
- Discover new tools to install from curated lists
- Review selections before finalizing

5. **Before generating**, show a summary of selected profiles and ask for confirmation:

```
Use AskUserQuestion tool with:
- question: "Ready to create X profiles? (list them)"
- header: "Confirm"
- options:
  - "Yes, generate profiles"
  - "No, let me change selections"
```

6. For each selected tool, generate a profile JSON with:
   - Sensible `name` (e.g., "Claude Code", "LazyGit")
   - Appropriate `category` for grouping
   - Correct `command` to launch the tool
   - Empty `workingDir` (inherits from header)
   - Good defaults: `fontSize: 16`, `fontFamily: "JetBrains Mono"`, `themeName: "high-contrast"`

7. Output the complete JSON array and **save it to the user's Downloads folder** so they can import directly:

```bash
# Save to Downloads folder (same location Import looks by default)
# For WSL:
echo '$JSON_CONTENT' > "/mnt/c/Users/$USER/Downloads/new-profiles.json"
# Or use the path from tabz_get_downloads to find the correct Downloads folder
```

Tell the user: "I've saved the profiles to your Downloads folder. In TabzChrome, go to Settings (⚙️) → Profiles → Import and select `new-profiles.json`"

## Reading Existing Profiles

**Preferred method** - Use the profiles API (no export needed):

```bash
# Get all profiles directly from Chrome storage
curl -s http://localhost:8129/api/browser/profiles | jq '.profiles[] | {name, command}'
```

**Fallback** - If backend is not running, ask user to export:

1. Tell user: "Click **Export** in Settings (⚙️) → Profiles tab"
2. Find the downloaded file:
   ```bash
   mcp-cli call tabz/tabz_get_downloads '{"limit": 5, "state": "complete"}'
   ```
3. Read using the `wslPath` field from download info

Match existing profiles by the `command` field to avoid duplicates.

## Profile Schema

Each profile has these fields:

```typescript
{
  id: string           // Unique ID (lowercase, use slug of name + random suffix)
  name: string         // Display name
  category?: string    // Category for grouping (e.g., "AI Assistants", "TUI Tools")
  command?: string     // Starting command (empty = just bash)
  workingDir: string   // Working directory (empty = inherit from header)
  fontSize: number     // Font size (14-20 typical)
  fontFamily: string   // Font family (e.g., "JetBrains Mono, monospace")
  themeName: string    // Theme: "high-contrast", "dracula", "ocean", "neon", "amber", "matrix"
  audioOverrides?: {   // Optional per-profile audio settings
    mode?: string      // "default" | "enabled" | "disabled"
    voice?: string     // Voice override
    rate?: string      // Rate override (e.g., "+20%")
  }
}
```

## Example Output Format

```json
[
  {
    "id": "claude-yolo-12345",
    "name": "Claude YOLO",
    "category": "AI Assistants",
    "command": "claude --dangerously-skip-permissions",
    "workingDir": "",
    "fontSize": 16,
    "fontFamily": "JetBrains Mono, monospace",
    "themeName": "high-contrast"
  },
  {
    "id": "claude-safe-12346",
    "name": "Claude Safe",
    "category": "AI Assistants",
    "command": "claude",
    "workingDir": "",
    "fontSize": 16,
    "fontFamily": "JetBrains Mono, monospace",
    "themeName": "ocean"
  },
  {
    "id": "claude-conductor-12347",
    "name": "Claude Conductor",
    "category": "AI Assistants",
    "command": "claude --agent conductor",
    "workingDir": "",
    "fontSize": 16,
    "fontFamily": "JetBrains Mono, monospace",
    "themeName": "neon"
  },
  {
    "id": "lazygit-12348",
    "name": "LazyGit",
    "category": "TUI Tools",
    "command": "lazygit",
    "workingDir": "",
    "fontSize": 16,
    "fontFamily": "JetBrains Mono, monospace",
    "themeName": "dracula"
  }
]
```

## Tips for Users

- **Claude YOLO mode** (`--dangerously-skip-permissions`) lets Claude edit files and run commands without asking - great for trusted workflows
- **Claude Conductor** (`--agent conductor`) enables multi-session orchestration - requires the TabzChrome conductor plugin
- **TUI Tools** work best with monospace fonts like JetBrains Mono or Fira Code
- Leave `workingDir` empty to inherit from the header dropdown
- Profiles can be customized further in Settings after import
- **Emojis in names**: Add a space after emojis (e.g., "📻 PyRadio" not "📻PyRadio") - emoji widths can hide the first letter otherwise

## Useful Resources

Open these with tabz MCP if the user wants to discover more tools:

- **Awesome TUIs**: https://github.com/rothgar/awesome-tuis - Comprehensive list of TUI applications
- **Awesome CLI Apps**: https://github.com/agarrharr/awesome-cli-apps - CLI apps for various tasks
- **Modern Unix**: https://github.com/ibraheemdev/modern-unix - Modern alternatives to common Unix commands
