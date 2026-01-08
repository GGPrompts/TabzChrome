---
name: new-project
description: "Multi-phase workflow for brainstorming, scaffolding, and setting up new projects with skill-aware configuration"
---

# New Project - Template-Based Project Scaffolding

Create new projects from TabzTemplates starters with pre-configured beads issues and workflows.

## Usage

```bash
# Interactive - prompts for all options
/conductor:new-project

# With starter specified
/conductor:new-project --starter=saas-landing

# List available starters
/conductor:new-project --list
```

## Available Starters

Starters are located in `${TABZ_TEMPLATES_DIR:-~/projects/TabzTemplates}/starters/`:

| Starter | Description | Tech Stack |
|---------|-------------|------------|
| `saas-landing` | SaaS landing page with dashboards | Next.js + Tailwind + shadcn |

### Component References

For UI components and design inspiration, see:
- **portfolio-style-guides** - 147 page templates + 44 UI components
- **TUITemplate** - Go/Bubbletea terminal UI starters

---

## Workflow Phases

### Phase 1: Starter Selection

If no `--starter` specified, list available starters:

```bash
TEMPLATES_DIR="${TABZ_TEMPLATES_DIR:-$HOME/projects/TabzTemplates}"
ls "$TEMPLATES_DIR/starters/"
```

For each starter, read its `manifest.yaml` and display:
- Name and description
- Tech stack
- Required plugins/MCP servers

Use **AskUserQuestion** to let user choose a starter.

### Phase 2: Variable Collection

Read the starter's `manifest.yaml` to get required variables:

```yaml
variables:
  business_name:
    prompt: "Business name"
    example: "Sunshine Rides"
  primary_color:
    prompt: "Primary brand color"
    options: [orange, blue, green, purple, red, teal]
```

Use **AskUserQuestion** to collect each variable. Show examples and options where provided.

### Phase 3: Project Directory

Ask for the target project directory:

```bash
# Default suggestion based on business_name
~/projects/{business_name_slug}/
```

Create the directory if it doesn't exist.

### Phase 4: Template Processing

For each file in `templates/`:
1. Read the `.tmpl` file
2. Replace all `{{variable_name}}` placeholders with user values
3. Write to target directory (removing `.tmpl` extension)

Special handling:
- `CLAUDE.md.tmpl` → `CLAUDE.md`
- `issues.jsonl.tmpl` → `.beads/issues.jsonl`

### Phase 5: Generate Issue Prefix

Create a unique prefix for beads issues based on project name:

```bash
# Example: "Sunshine Rides" → "SR"
# Example: "My Cool App" → "MCA"
```

Replace `{{prefix}}` in issues with this value.

### Phase 6: Beads Initialization

```bash
cd /path/to/new/project
bd sync  # Initialize beads with the generated issues
bd ready # Verify issues are loaded
```

### Phase 7: Plugin Setup

Based on `manifest.yaml` plugins, remind user to configure:

```bash
# If tabz-chrome plugins needed, ensure TabzChrome is installed
# If beads MCP needed, ensure beads is in mcp_servers
```

### Phase 8: Summary

Display:
- Project created at: `/path/to/project`
- Issues loaded: N issues in M waves
- Next steps: `cd /path/to/project && claude` then `/conductor:bd-swarm-auto`

---

## Template Syntax

Templates use simple `{{variable}}` replacement:

```markdown
# {{business_name}} - Built with Claude

Primary color: {{primary_color}}
```

Reserved variables (auto-generated):
- `{{prefix}}` - Issue ID prefix (e.g., "SR", "MCA")

---

## Example Session

```
User: /conductor:new-project

Claude: I found 1 available starter:
  1. saas-landing - Modern SaaS landing page with dashboards

Which starter would you like to use?

User: saas-landing

Claude: Great! Let me collect the required information.

[Uses AskUserQuestion for each variable]

Claude: Creating project at ~/projects/sunshine-rides/...
- Generated CLAUDE.md
- Created 19 beads issues
- Initialized beads tracking

Ready! To start building:
  cd ~/projects/sunshine-rides && claude
  /conductor:bd-swarm-auto
```

---

## Error Handling

| Error | Resolution |
|-------|------------|
| TabzTemplates not found | Set `TABZ_TEMPLATES_DIR` env var or clone to `~/projects/TabzTemplates` |
| Starter not found | List available starters |
| Target dir exists | Ask to overwrite or choose new path |
| beads init fails | Check beads MCP server is running |

---

## Execute This Workflow

When this skill is invoked:

1. Check if `--list` flag → just show available starters and exit
2. Check if `--starter=X` provided → use that starter
3. Otherwise → prompt for starter selection
4. Collect all variables from manifest
5. Create project directory
6. Process templates
7. Initialize beads
8. Show summary with next steps
