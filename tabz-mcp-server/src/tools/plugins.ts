/**
 * Plugin Management Tools
 *
 * Tools for listing and managing Claude Code plugins and skills
 * via the TabzChrome backend REST API.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";

// =====================================
// Types
// =====================================

interface PluginComponent {
  name: string;
  path: string;
}

interface Plugin {
  id: string;
  name: string;
  marketplace: string;
  enabled: boolean;
  scope: string;
  version: string;
  installPath: string;
  installedAt?: string;
  lastUpdated?: string;
  gitCommitSha?: string | null;
  isLocal?: boolean;
  components: string[];
  componentFiles?: {
    skills?: PluginComponent[];
    agents?: PluginComponent[];
    commands?: PluginComponent[];
    hooks?: PluginComponent[];
    mcp?: PluginComponent[];
  };
}

interface PluginsResponse {
  success: boolean;
  data?: {
    marketplaces: Record<string, Plugin[]>;
    totalPlugins: number;
    enabledCount: number;
    disabledCount: number;
    componentCounts: Record<string, number>;
    scopeCounts: Record<string, number>;
  };
  error?: string;
}

interface Skill {
  id: string;
  name: string;
  desc: string;
  pluginId: string;
  pluginName: string;
  marketplace: string;
  category: string;
}

interface SkillsResponse {
  success: boolean;
  skills?: Skill[];
  count?: number;
  error?: string;
}

interface HealthResponse {
  success: boolean;
  data?: {
    outdatedPlugins: Array<{
      pluginId: string;
      name: string;
      marketplace: string;
      installedCommit: string;
      latestCommit: string;
      hasChanges: boolean;
    }>;
    cacheSize: {
      bytes: number;
      formatted: string;
    };
    marketplaceStatus: Record<string, {
      head: string;
      path: string;
      reachable: boolean;
    }>;
  };
  error?: string;
}

interface ToggleResponse {
  success: boolean;
  pluginId?: string;
  enabled?: boolean;
  message?: string;
  error?: string;
}

// =====================================
// Schemas
// =====================================

const ListPluginsSchema = z.object({
  marketplace: z.string()
    .optional()
    .describe("Filter by marketplace name (e.g., 'my-plugins', 'anthropic')"),
  enabled: z.boolean()
    .optional()
    .describe("Filter by enabled status: true for enabled only, false for disabled only")
}).strict();

const ListSkillsSchema = z.object({
  plugin: z.string()
    .optional()
    .describe("Filter by plugin name (e.g., 'conductor', 'beads')"),
  search: z.string()
    .optional()
    .describe("Search skills by name or description (case-insensitive)")
}).strict();

const GetSkillSchema = z.object({
  skillId: z.string()
    .describe("The skill ID in format '/pluginName:skillName' (e.g., '/conductor:brainstorm')")
}).strict();

const PluginsHealthSchema = z.object({}).strict();

const TogglePluginSchema = z.object({
  pluginId: z.string()
    .describe("The plugin ID in format 'pluginName@marketplace' (e.g., 'conductor@my-plugins')"),
  enabled: z.boolean()
    .describe("Set to true to enable the plugin, false to disable")
}).strict();

// =====================================
// API Functions
// =====================================

/**
 * List all installed plugins
 */
async function listPlugins(marketplace?: string, enabled?: boolean): Promise<PluginsResponse> {
  try {
    const response = await axios.get<PluginsResponse>(`${BACKEND_URL}/api/plugins`, { timeout: 10000 });

    if (!response.data.success || !response.data.data) {
      return { success: false, error: response.data.error || 'Failed to list plugins' };
    }

    // Apply filters
    let marketplaces = response.data.data.marketplaces;

    if (marketplace) {
      const filtered: Record<string, Plugin[]> = {};
      if (marketplaces[marketplace]) {
        filtered[marketplace] = marketplaces[marketplace];
      }
      marketplaces = filtered;
    }

    if (enabled !== undefined) {
      for (const [mktName, plugins] of Object.entries(marketplaces)) {
        marketplaces[mktName] = (plugins as Plugin[]).filter((p: Plugin) => p.enabled === enabled);
      }
      // Remove empty marketplaces
      for (const mktName of Object.keys(marketplaces)) {
        if (marketplaces[mktName].length === 0) {
          delete marketplaces[mktName];
        }
      }
    }

    // Recalculate counts after filtering
    let totalPlugins = 0;
    let enabledCount = 0;
    let disabledCount = 0;
    for (const plugins of Object.values(marketplaces)) {
      for (const plugin of plugins as Plugin[]) {
        totalPlugins++;
        if (plugin.enabled) enabledCount++;
        else disabledCount++;
      }
    }

    return {
      success: true,
      data: {
        ...response.data.data,
        marketplaces,
        totalPlugins,
        enabledCount,
        disabledCount
      }
    };
  } catch (error) {
    throw handleApiError(error, 'List plugins');
  }
}

/**
 * List all skills from enabled plugins
 */
async function listSkills(plugin?: string, search?: string): Promise<SkillsResponse> {
  try {
    const response = await axios.get<SkillsResponse>(`${BACKEND_URL}/api/plugins/skills`, { timeout: 10000 });

    if (!response.data.success || !response.data.skills) {
      return { success: false, error: response.data.error || 'Failed to list skills' };
    }

    let skills = response.data.skills;

    // Filter by plugin name
    if (plugin) {
      const pluginLower = plugin.toLowerCase();
      skills = skills.filter((s: Skill) => s.pluginName.toLowerCase() === pluginLower);
    }

    // Search by name or description
    if (search) {
      const searchLower = search.toLowerCase();
      skills = skills.filter((s: Skill) =>
        s.name.toLowerCase().includes(searchLower) ||
        s.desc.toLowerCase().includes(searchLower) ||
        s.id.toLowerCase().includes(searchLower)
      );
    }

    return {
      success: true,
      skills,
      count: skills.length
    };
  } catch (error) {
    throw handleApiError(error, 'List skills');
  }
}

/**
 * Get full details for a specific skill (reads SKILL.md content)
 */
async function getSkill(skillId: string): Promise<{ success: boolean; skill?: Skill; content?: string; error?: string }> {
  try {
    // First get the skill metadata
    const skillsResponse = await listSkills();
    if (!skillsResponse.success || !skillsResponse.skills) {
      return { success: false, error: skillsResponse.error || 'Failed to list skills' };
    }

    // Find the skill by ID (normalize the ID format)
    const normalizedId = skillId.startsWith('/') ? skillId : `/${skillId}`;
    const skill = skillsResponse.skills.find(s => s.id === normalizedId);

    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${skillId}. Use tabz_list_skills to see available skills.`
      };
    }

    // Get the plugin to find the install path
    const pluginsResponse = await listPlugins();
    if (!pluginsResponse.success || !pluginsResponse.data) {
      return { success: false, error: 'Failed to get plugin info' };
    }

    let installPath: string | undefined;
    for (const plugins of Object.values(pluginsResponse.data.marketplaces)) {
      const plugin = plugins.find(p => p.id === skill.pluginId);
      if (plugin) {
        installPath = plugin.installPath;
        break;
      }
    }

    if (!installPath) {
      return { success: false, error: `Plugin not found: ${skill.pluginId}` };
    }

    // Extract skill name from ID (format: /pluginName:skillName)
    const skillName = normalizedId.split(':')[1];
    const skillPath = `${installPath}/skills/${skillName}/SKILL.md`;

    // Read the skill file
    try {
      const { readFileSync } = await import('fs');
      const content = readFileSync(skillPath, 'utf-8');
      return { success: true, skill, content };
    } catch {
      // File read failed, return skill metadata only
      return {
        success: true,
        skill,
        content: `(Unable to read SKILL.md from ${skillPath})`
      };
    }
  } catch (error) {
    throw handleApiError(error, 'Get skill');
  }
}

/**
 * Check plugin health (outdated plugins, cache size)
 */
async function pluginsHealth(): Promise<HealthResponse> {
  try {
    const response = await axios.get<HealthResponse>(`${BACKEND_URL}/api/plugins/health`, { timeout: 30000 });
    return response.data;
  } catch (error) {
    throw handleApiError(error, 'Check plugins health');
  }
}

/**
 * Toggle a plugin's enabled status
 */
async function togglePlugin(pluginId: string, enabled: boolean): Promise<ToggleResponse> {
  try {
    const response = await axios.post<ToggleResponse>(
      `${BACKEND_URL}/api/plugins/toggle`,
      { pluginId, enabled },
      { timeout: 5000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, 'Toggle plugin');
  }
}

// =====================================
// Tool Registration
// =====================================

/**
 * Register plugin management tools with the MCP server
 */
export function registerPluginTools(server: McpServer): void {
  // List plugins tool
  server.tool(
    "tabz_list_plugins",
    `List installed Claude Code plugins with their status.

Returns plugins grouped by marketplace with enabled/disabled state,
version info, and component types (skills, agents, commands, hooks, mcp).

Args:
  - marketplace (optional): Filter by marketplace name (e.g., "my-plugins")
  - enabled (optional): Filter by enabled status (true/false)

Returns:
  {
    "marketplaces": {
      "my-plugins": [
        {
          "id": "conductor@my-plugins",
          "name": "conductor",
          "enabled": true,
          "version": "1.0.0",
          "components": ["skill", "agent", "command"]
        }
      ]
    },
    "totalPlugins": 5,
    "enabledCount": 4,
    "disabledCount": 1
  }

Examples:
  - List all plugins: (no args)
  - Filter by marketplace: marketplace="my-plugins"
  - List disabled only: enabled=false

Use tabz_list_skills to see skills from enabled plugins.
Use tabz_toggle_plugin to enable/disable plugins.`,
    ListPluginsSchema.shape,
    async (params: z.infer<typeof ListPluginsSchema>) => {
      try {
        const result = await listPlugins(params.marketplace, params.enabled);

        if (!result.success || !result.data) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    }
  );

  // List skills tool
  server.tool(
    "tabz_list_skills",
    `List available skills from enabled plugins.

Returns skills with their ID, name, description, and source plugin.
Skills can be invoked in Claude Code using /<plugin>:<skill> syntax.

Args:
  - plugin (optional): Filter by plugin name (e.g., "conductor")
  - search (optional): Search skills by name/description (case-insensitive)

Returns:
  {
    "skills": [
      {
        "id": "/conductor:brainstorm",
        "name": "Brainstorm",
        "desc": "Brainstorm ideas and design workflows with a beads expert",
        "pluginName": "conductor",
        "marketplace": "my-plugins"
      }
    ],
    "count": 15
  }

Examples:
  - List all skills: (no args)
  - Filter by plugin: plugin="conductor"
  - Search for skills: search="browser"
  - Combined: plugin="tabz", search="screenshot"

Use tabz_get_skill to read the full SKILL.md content.`,
    ListSkillsSchema.shape,
    async (params: z.infer<typeof ListSkillsSchema>) => {
      try {
        const result = await listSkills(params.plugin, params.search);

        if (!result.success || !result.skills) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ skills: result.skills, count: result.count }, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    }
  );

  // Get skill details tool
  server.tool(
    "tabz_get_skill",
    `Get full details and content of a specific skill.

Reads the SKILL.md file for a skill, providing complete context
including instructions, examples, and configuration.

Args:
  - skillId (required): Skill ID in format "/pluginName:skillName"
                        (e.g., "/conductor:brainstorm", "/tabz-browser:screenshot")

Returns:
  {
    "skill": {
      "id": "/conductor:brainstorm",
      "name": "Brainstorm",
      "desc": "...",
      "pluginName": "conductor"
    },
    "content": "---\\nname: Brainstorm\\n...full SKILL.md content..."
  }

Examples:
  - Get skill: skillId="/conductor:brainstorm"
  - Without leading slash: skillId="conductor:brainstorm"

Use tabz_list_skills first to find available skill IDs.`,
    GetSkillSchema.shape,
    async (params: z.infer<typeof GetSkillSchema>) => {
      try {
        const result = await getSkill(params.skillId);

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ skill: result.skill, content: result.content }, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    }
  );

  // Plugins health check tool
  server.tool(
    "tabz_plugins_health",
    `Check plugin health: outdated versions, cache size, marketplace status.

Compares installed plugin versions against their source repositories
to identify plugins that may need updates.

Args: none

Returns:
  {
    "outdatedPlugins": [
      {
        "pluginId": "conductor@my-plugins",
        "name": "conductor",
        "installedCommit": "abc123",
        "latestCommit": "def456",
        "hasChanges": true
      }
    ],
    "cacheSize": {
      "bytes": 1048576,
      "formatted": "1.00 MB"
    },
    "marketplaceStatus": {
      "my-plugins": {
        "head": "def456",
        "path": "/home/user/.claude/plugins/cache/my-plugins",
        "reachable": true
      }
    }
  }

Use this to check if plugins need updates.
Run /restart after updating plugins to apply changes.`,
    PluginsHealthSchema.shape,
    async () => {
      try {
        const result = await pluginsHealth();

        if (!result.success || !result.data) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    }
  );

  // Toggle plugin tool
  server.tool(
    "tabz_toggle_plugin",
    `Enable or disable a Claude Code plugin.

Toggles a plugin's enabled status in Claude settings.
Requires running /restart for changes to take effect.

Args:
  - pluginId (required): Plugin ID in format "pluginName@marketplace"
                         (e.g., "conductor@my-plugins", "beads@anthropic")
  - enabled (required): true to enable, false to disable

Returns:
  {
    "success": true,
    "pluginId": "conductor@my-plugins",
    "enabled": false,
    "message": "Plugin conductor@my-plugins disabled. Run /restart to apply changes."
  }

Examples:
  - Disable plugin: pluginId="conductor@my-plugins", enabled=false
  - Enable plugin: pluginId="beads@my-plugins", enabled=true

Use tabz_list_plugins to see available plugin IDs.
Run /restart after toggling to apply changes.`,
    TogglePluginSchema.shape,
    async (params: z.infer<typeof TogglePluginSchema>) => {
      try {
        const result = await togglePlugin(params.pluginId, params.enabled);

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
          isError: true
        };
      }
    }
  );
}
