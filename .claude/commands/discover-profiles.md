# Profile Discovery Assistant

Scan the user's system for installed CLI tools and help them create TabzChrome profiles.

## Instructions

1. **Ask if they want to export existing profiles first.** This helps avoid duplicates:
   - Tell user: "Would you like me to check your existing profiles? If so, click **Export** in Settings (⚙️) → Profiles tab"
   - If they export, use `tabz_get_downloads` to find the downloaded `tabz-profiles.json`
   - Read the file using the `wslPath` from the download info
   - Note which tools already have profiles to avoid duplicates

2. Open the awesome-tuis reference page so users can discover new tools:

```
Use tabz MCP to open: https://github.com/rothgar/awesome-tuis
```

This page has a comprehensive list of TUI applications they might want to install.

3. Scan for installed CLI tools by running these checks:

```bash
# AI CLIs
for cmd in claude codex gemini aider opencode ollama gpt sgpt cursor; do
  command -v $cmd &>/dev/null && echo "✓ $cmd: $(which $cmd)"
done

# TUI Tools
for cmd in lazygit htop btop btm ranger mc ncdu tig lazydocker k9s; do
  command -v $cmd &>/dev/null && echo "✓ $cmd: $(which $cmd)"
done

# Editors
for cmd in nvim vim micro nano hx emacs code; do
  command -v $cmd &>/dev/null && echo "✓ $cmd: $(which $cmd)"
done
```

4. Present the found tools to the user in a clean list, grouped by category:
   - **AI Assistants**: claude, codex, gemini, aider, etc.
   - **TUI Tools**: lazygit, htop, btop, ranger, etc.
   - **Editors**: nvim, vim, micro, helix, etc.
   - **Dev Tools**: docker, kubectl, npm, etc.

   If user exported existing profiles, mark tools that already have profiles with "(already configured)".

5. Ask the user which tools they'd like to create profiles for. Mention they can browse the awesome-tuis page (now open in their browser) to discover more tools to install.

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

When user exports their profiles, find and read them:

```bash
# Find recent profile export
mcp-cli call tabz/tabz_get_downloads '{"limit": 5, "state": "complete", "response_format": "json"}'

# Look for tabz-profiles*.json in the results
# Read using the wslPath field (for WSL) or filename (for native)
```

Then parse the JSON to see which commands are already configured. Match by the `command` field.

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
    "id": "claude-code-12345",
    "name": "Claude Code",
    "category": "AI Assistants",
    "command": "claude --dangerously-skip-permissions",
    "workingDir": "",
    "fontSize": 16,
    "fontFamily": "JetBrains Mono, monospace",
    "themeName": "high-contrast"
  },
  {
    "id": "lazygit-12346",
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

- **AI Assistants** benefit from `--dangerously-skip-permissions` flag for automation
- **TUI Tools** work best with monospace fonts like JetBrains Mono or Fira Code
- Leave `workingDir` empty to inherit from the header dropdown
- Profiles can be customized further in Settings after import

## Useful Resources

Open these with tabz MCP if the user wants to discover more tools:

- **Awesome TUIs**: https://github.com/rothgar/awesome-tuis - Comprehensive list of TUI applications
- **Awesome CLI Apps**: https://github.com/agarrharr/awesome-cli-apps - CLI apps for various tasks
- **Modern Unix**: https://github.com/ibraheemdev/modern-unix - Modern alternatives to common Unix commands
