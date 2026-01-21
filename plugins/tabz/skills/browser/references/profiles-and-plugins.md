# Claude Integration

Tools for terminal profiles and Claude Code plugins.

*Part of the [Tabz MCP Tools](../MCP_TOOLS.md) reference.*

---

## tabz_list_profiles

**Purpose:** List terminal profiles configured in TabzChrome.

**Trigger phrases:**
- [List profiles](tabz:paste?text=List%20profiles)
- [What profiles are available?](tabz:paste?text=What%20profiles%20are%20available%3F)
- [Show AI assistant profiles](tabz:paste?text=Show%20AI%20assistant%20profiles)

**Parameters:**
- `category` (optional): Filter by category name (e.g., "AI Assistants", "TUI Tools")
- `response_format`: `markdown` (default) or `json`

**Returns (JSON format):**
```json
{
  "total": 62,
  "filtered": 11,
  "defaultProfileId": "claude",
  "globalWorkingDir": "~/projects",
  "profiles": [
    {
      "id": "claude-worker",
      "name": "Claude Worker",
      "category": "AI Assistants",
      "command": "claude",
      "themeName": "matrix"
    }
  ]
}
```

**Examples:**
```javascript
// List all profiles
{}

// Filter by category
{ category: "AI Assistants" }

// Get JSON format
{ response_format: "json" }
```

**Notes:**
- Use `tabz_list_categories` first to see available category names
- Profile IDs can be used with `/api/agents` endpoint for spawning

---

## tabz_list_categories

**Purpose:** List all profile categories in TabzChrome.

**Trigger phrases:**
- [List categories](tabz:paste?text=List%20categories)
- [What profile categories exist?](tabz:paste?text=What%20profile%20categories%20exist%3F)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns (JSON format):**
```json
{
  "total": 62,
  "categories": [
    "AI Assistants",
    "TUI Tools",
    "Git Tools",
    "NoCommand"
  ]
}
```

**Notes:**
- Use categories with `tabz_list_profiles` to filter profiles
- Categories are user-defined in profile settings

---

## tabz_spawn_profile

**Purpose:** Spawn a terminal using a saved profile.

**Trigger phrases:**
- [Spawn claude profile](tabz:paste?text=Spawn%20claude%20profile)
- [Start terminal with codex-reviewer](tabz:paste?text=Start%20terminal%20with%20codex-reviewer)
- [Spawn profile in ~/projects](tabz:paste?text=Spawn%20profile%20in%20~/projects)

**Parameters:**
- `profileId` (required): Profile ID or name to spawn
- `workingDir` (optional): Override the profile's default working directory
- `name` (optional): Custom name for this terminal instance
- `env` (optional): Additional environment variables (key-value object)

**Returns (JSON format):**
```json
{
  "success": true,
  "terminal": {
    "id": "ctt-claude-abc123",
    "name": "Claude Worker",
    "terminalType": "claude-code",
    "platform": "local",
    "state": "running",
    "createdAt": "2024-01-15T10:30:00Z",
    "profileId": "claude",
    "profileName": "Claude"
  }
}
```

**Examples:**
```javascript
// Basic spawn
{ profileId: "claude" }

// With working directory override
{ profileId: "claude", workingDir: "~/projects/myapp" }

// Named instance with env vars
{ profileId: "codex-reviewer", name: "PR Review #123", env: { PR_NUMBER: "123" } }
```

**Notes:**
- Requires auth token at `/tmp/tabz-auth-token` (created by backend)
- Use `tabz_list_profiles` to discover available profiles
- Profile settings (command, theme, etc.) are automatically applied

---

## tabz_get_profile

**Purpose:** Get details of a specific terminal profile.

**Trigger phrases:**
- [Show claude profile](tabz:paste?text=Show%20claude%20profile)
- [Get profile details](tabz:paste?text=Get%20profile%20details)

**Parameters:**
- `profileId` (required): Profile ID or name to retrieve
- `response_format`: `markdown` (default) or `json`

**Returns (JSON format):**
```json
{
  "id": "claude",
  "name": "Claude",
  "category": "AI Assistants",
  "command": "claude",
  "workingDir": "~/projects",
  "themeName": "matrix",
  "fontSize": 14,
  "fontFamily": "JetBrains Mono"
}
```

**Notes:**
- Searches by both ID and name
- Use before `tabz_spawn_profile` to check profile settings

---

## tabz_create_profile

**Purpose:** Create a new terminal profile.

**Trigger phrases:**
- [Create new profile](tabz:paste?text=Create%20new%20profile)
- [Add checkpoint profile](tabz:paste?text=Add%20checkpoint%20profile)

**Parameters:**
- `name` (required): Display name for the profile (max 50 chars)
- `command` (optional): Command to run on terminal start
- `workingDir` (optional): Default working directory
- `category` (optional): Category for organization
- `themeName` (optional): Color theme (e.g., 'matrix', 'dracula')
- `fontSize` (optional): Font size in pixels (8-32)
- `fontFamily` (optional): Font family name

**Returns:**
```json
{
  "success": true,
  "profile": {
    "id": "my-profile-abc123",
    "name": "My Profile",
    ...
  }
}
```

**Examples:**
```javascript
// Basic profile
{ name: "My Claude" }

// With command and category
{ name: "Codex Review", command: "claude /codex-review", category: "Checkpoints" }

// Styled profile
{ name: "Matrix Terminal", themeName: "matrix", fontSize: 16 }
```

---

## tabz_update_profile

**Purpose:** Update an existing terminal profile.

**Trigger phrases:**
- [Update profile theme](tabz:paste?text=Update%20profile%20theme)
- [Change profile command](tabz:paste?text=Change%20profile%20command)

**Parameters:**
- `profileId` (required): ID of the profile to update
- `updates` (required): Object with fields to update:
  - `name`, `command`, `workingDir`, `category`, `themeName`, `fontSize`, `fontFamily`

**Examples:**
```javascript
// Change theme
{ profileId: "claude", updates: { themeName: "dracula" } }

// Change command
{ profileId: "my-worker", updates: { command: "claude --agent codex-reviewer" } }

// Multiple updates
{ profileId: "dev", updates: { category: "Checkpoints", themeName: "amber" } }
```

**Notes:**
- Only specified fields are updated
- Changes apply to new terminals using this profile

---

## tabz_delete_profile

**Purpose:** Delete a terminal profile.

**Trigger phrases:**
- [Delete profile](tabz:paste?text=Delete%20profile)
- [Remove old profile](tabz:paste?text=Remove%20old%20profile)

**Parameters:**
- `profileId` (required): ID of the profile to delete

**Returns:**
```json
{
  "success": true
}
```

**Notes:**
- Deletion is permanent and cannot be undone
- Running terminals using this profile will continue to work
- Default profile cannot be deleted

---

## tabz_list_plugins

**Purpose:** List installed Claude Code plugins with their status.

**Trigger phrases:**
- [List plugins](tabz:paste?text=List%20plugins)
- [Show installed plugins](tabz:paste?text=Show%20installed%20plugins)
- [What plugins are enabled?](tabz:paste?text=What%20plugins%20are%20enabled%3F)

**Parameters:**
- `marketplace` (optional): Filter by marketplace name (e.g., "my-plugins")
- `enabled` (optional): Filter by enabled status (true/false)

**Returns:**
- Plugins grouped by marketplace with enabled status, version, and components

---

## tabz_list_skills

**Purpose:** List available skills from enabled plugins.

**Trigger phrases:**
- [List skills](tabz:paste?text=List%20skills)
- [What skills are available?](tabz:paste?text=What%20skills%20are%20available%3F)
- [Find browser skills](tabz:paste?text=Find%20browser%20skills)

**Parameters:**
- `plugin` (optional): Filter by plugin name (e.g., "conductor")
- `search` (optional): Search skills by name/description

**Returns:**
- Skills with ID, name, description, and source plugin

---

## tabz_get_skill

**Purpose:** Get full details and SKILL.md content for a specific skill.

**Trigger phrases:**
- [Show skill details](tabz:paste?text=Show%20skill%20details)
- [Get conductor:brainstorm skill](tabz:paste?text=Get%20conductor%3Abrainstorm%20skill)

**Parameters:**
- `skillId` (required): Skill ID in format "/pluginName:skillName"

**Returns:**
- Skill metadata and full SKILL.md content

---

## tabz_plugins_health

**Purpose:** Check plugin health: outdated versions, cache size, marketplace status.

**Trigger phrases:**
- [Check plugin health](tabz:paste?text=Check%20plugin%20health)
- [Are any plugins outdated?](tabz:paste?text=Are%20any%20plugins%20outdated%3F)

**Parameters:** None

**Returns:**
- List of outdated plugins, cache size, and marketplace connectivity

---

## tabz_toggle_plugin

**Purpose:** Enable or disable a Claude Code plugin.

**Trigger phrases:**
- [Disable plugin](tabz:paste?text=Disable%20plugin)
- [Enable conductor plugin](tabz:paste?text=Enable%20conductor%20plugin)

**Parameters:**
- `pluginId` (required): Plugin ID in format "pluginName@marketplace"
- `enabled` (required): true to enable, false to disable

**Returns:**
- Success/failure with message to run /restart

---
