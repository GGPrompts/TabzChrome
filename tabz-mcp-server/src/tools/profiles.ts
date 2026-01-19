/**
 * Profile Management Tools
 *
 * Tools for listing terminal profiles and categories
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";

// Profile interface matching Chrome extension storage
interface Profile {
  id: string;
  name: string;
  category?: string;
  command?: string;
  workingDir?: string;
  themeName?: string;
  fontSize?: number;
  fontFamily?: string;
  [key: string]: unknown;
}

// Input schema for tabz_list_profiles
const ListProfilesSchema = z.object({
  category: z.string()
    .optional()
    .describe("Optional: Filter profiles by category name (e.g., 'AI Assistants', 'Checkpoints')"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type ListProfilesInput = z.infer<typeof ListProfilesSchema>;

// Input schema for tabz_list_categories
const ListCategoriesSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type ListCategoriesInput = z.infer<typeof ListCategoriesSchema>;

/**
 * List terminal profiles from Chrome extension
 */
async function listProfiles(category?: string): Promise<{
  profiles: Profile[];
  total: number;
  filtered: number;
  defaultProfileId?: string;
  globalWorkingDir?: string;
  error?: string;
}> {
  try {
    const params = category ? { category } : {};
    const response = await axios.get(`${BACKEND_URL}/api/browser/profiles`, {
      params,
      timeout: 5000
    });

    if (response.data.success) {
      return {
        profiles: response.data.profiles || [],
        total: response.data.total ?? response.data.profiles?.length ?? 0,
        filtered: response.data.filtered ?? response.data.profiles?.length ?? 0,
        defaultProfileId: response.data.defaultProfileId,
        globalWorkingDir: response.data.globalWorkingDir
      };
    }
    return {
      profiles: [],
      total: 0,
      filtered: 0,
      error: response.data.error || 'Failed to list profiles'
    };
  } catch (error) {
    return {
      profiles: [],
      total: 0,
      filtered: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * List profile categories from Chrome extension
 */
async function listCategories(): Promise<{
  categories: string[];
  total: number;
  error?: string;
}> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/browser/categories`, { timeout: 5000 });

    if (response.data.success) {
      return {
        categories: response.data.categories || [],
        total: response.data.total ?? 0
      };
    }
    return {
      categories: [],
      total: 0,
      error: response.data.error || 'Failed to list categories'
    };
  } catch (error) {
    return {
      categories: [],
      total: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Register profile management tools with the MCP server
 */
export function registerProfileTools(server: McpServer): void {
  // List profiles tool
  server.tool(
    "tabz_list_profiles",
    `List terminal profiles configured in TabzChrome.

Profiles define terminal appearance and behavior (theme, command, working directory).
Use this to discover available profiles before spawning terminals.

Args:
  - category: Optional filter by category name (e.g., 'AI Assistants', 'Checkpoints')
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "total": 62,            // Total profiles in system
    "filtered": 5,          // Profiles returned after filter
    "defaultProfileId": "claude",
    "globalWorkingDir": "~/projects",
    "profiles": [
      {
        "id": "claude",
        "name": "Claude",
        "category": "AI Assistants",
        "command": "claude",
        "themeName": "matrix"
      }
    ]
  }

Examples:
  - List all profiles: (no args needed)
  - Filter by category: category="AI Assistants"
  - Filter checkpoints: category="Checkpoints"
  - Get JSON: response_format="json"

Use tabz_list_categories first to see available category names.

Error Handling:
  - "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129`,
    ListProfilesSchema.shape,
    async (params: ListProfilesInput) => {
      try {
        const result = await listProfiles(params.category);

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            total: result.total,
            filtered: result.filtered,
            defaultProfileId: result.defaultProfileId,
            globalWorkingDir: result.globalWorkingDir,
            profiles: result.profiles
          }, null, 2);
        } else {
          if (result.profiles.length === 0) {
            if (params.category) {
              resultText = `# Terminal Profiles

No profiles found in category "${params.category}".
Total profiles in system: ${result.total}

Use \`tabz_list_categories\` to see available categories.`;
            } else {
              resultText = `# Terminal Profiles

No profiles configured.
Add profiles in the TabzChrome settings.`;
            }
          } else {
            const lines: string[] = [];

            if (params.category) {
              lines.push(`# Terminal Profiles - ${params.category}`);
              lines.push(`Showing ${result.filtered} of ${result.total} profiles`);
            } else {
              lines.push(`# Terminal Profiles (${result.profiles.length} total)`);
            }
            lines.push("");

            if (result.defaultProfileId) {
              const defaultProfile = result.profiles.find(p => p.id === result.defaultProfileId);
              if (defaultProfile) {
                lines.push(`**Default:** ${defaultProfile.name} (${result.defaultProfileId})`);
              }
            }
            if (result.globalWorkingDir) {
              lines.push(`**Global Working Dir:** ${result.globalWorkingDir}`);
            }
            lines.push("");

            // Group by category for better readability
            const byCategory = new Map<string, Profile[]>();
            for (const profile of result.profiles) {
              const cat = profile.category || "(No Category)";
              if (!byCategory.has(cat)) {
                byCategory.set(cat, []);
              }
              byCategory.get(cat)!.push(profile);
            }

            for (const [category, profiles] of byCategory) {
              lines.push(`## ${category}`);
              lines.push("");
              for (const profile of profiles) {
                const isDefault = profile.id === result.defaultProfileId;
                lines.push(`- **${profile.name}**${isDefault ? " (default)" : ""}`);
                lines.push(`  - ID: \`${profile.id}\``);
                if (profile.command) {
                  lines.push(`  - Command: \`${profile.command}\``);
                }
                if (profile.workingDir) {
                  lines.push(`  - Working Dir: \`${profile.workingDir}\``);
                }
                if (profile.themeName) {
                  lines.push(`  - Theme: ${profile.themeName}`);
                }
              }
              lines.push("");
            }

            lines.push("---");
            lines.push("Use `tabz_list_categories` to see available categories.");
            resultText = lines.join("\n");
          }
        }

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // List categories tool
  server.tool(
    "tabz_list_categories",
    `List all profile categories in TabzChrome.

Categories help organize profiles (e.g., 'AI Assistants', 'Dev Tools', 'TUI Apps').
Use this to discover available categories before filtering with tabz_list_profiles.

Args:
  - response_format: 'markdown' (default) or 'json'

Returns (JSON format):
  {
    "total": 62,           // Total profiles in system
    "categories": [
      "AI Assistants",
      "Checkpoints",
      "Dev Tools",
      "TUI Apps"
    ]
  }

Examples:
  - List categories: (no args needed)
  - Get JSON: response_format="json"

After getting categories, use tabz_list_profiles with category filter.

Error Handling:
  - "Cannot connect": Ensure TabzChrome extension is installed and backend is running at localhost:8129`,
    ListCategoriesSchema.shape,
    async (params: ListCategoriesInput) => {
      try {
        const result = await listCategories();

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        let resultText: string;
        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify({
            total: result.total,
            categories: result.categories
          }, null, 2);
        } else {
          if (result.categories.length === 0) {
            resultText = `# Profile Categories

No categories found.
Profiles may not have categories assigned.

Total profiles: ${result.total}`;
          } else {
            const lines: string[] = [
              `# Profile Categories (${result.categories.length} categories)`,
              "",
              `Total profiles: ${result.total}`,
              "",
              "Available categories:",
              ""
            ];

            for (const category of result.categories) {
              lines.push(`- ${category}`);
            }

            lines.push("");
            lines.push("---");
            lines.push("Use `tabz_list_profiles` with `category` to filter profiles.");
            lines.push("Example: `tabz_list_profiles(category=\"AI Assistants\")`");
            resultText = lines.join("\n");
          }
        }

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}
