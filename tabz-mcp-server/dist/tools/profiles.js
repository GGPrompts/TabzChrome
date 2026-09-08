/**
 * Profile Management Tools
 *
 * Tools for listing, creating, updating, deleting terminal profiles,
 * and spawning terminals by profile.
 */
import { registerTabzTool } from "../register.js";
import { z } from "zod";
import axios from "axios";
import { readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";
// Auth token file location (same as backend uses)
const AUTH_TOKEN_FILE = join(tmpdir(), "tabz-auth-token");
/**
 * Read auth token from file
 */
function getAuthToken() {
    try {
        return readFileSync(AUTH_TOKEN_FILE, "utf-8").trim();
    }
    catch {
        return null;
    }
}
// Input schema for tabz_list_profiles
const ListProfilesSchema = z.object({
    category: z.string()
        .optional()
        .describe("Category to filter by (tabz_list_categories)."),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
// Input schema for tabz_list_categories
const ListCategoriesSchema = z.object({
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
// Input schema for tabz_spawn_profile
const SpawnProfileSchema = z.object({
    profileId: z.string()
        .min(1)
        .describe("Profile ID or name (tabz_list_profiles)."),
    workingDir: z.string()
        .optional()
        .describe("Override the profile's working directory."),
    name: z.string()
        .optional(),
    env: z.record(z.string())
        .optional()
}).strict();
// Input schema for tabz_get_profile
const GetProfileSchema = z.object({
    profileId: z.string()
        .min(1),
    response_format: z.nativeEnum(ResponseFormat)
        .default(ResponseFormat.MARKDOWN)
}).strict();
// Input schema for tabz_create_profile
const CreateProfileSchema = z.object({
    name: z.string()
        .min(1)
        .max(50),
    command: z.string()
        .optional()
        .describe("Command to run on start, e.g. 'claude'."),
    workingDir: z.string()
        .optional(),
    category: z.string()
        .optional(),
    themeName: z.string()
        .optional(),
    fontSize: z.number()
        .int()
        .min(8)
        .max(32)
        .optional(),
    fontFamily: z.string()
        .optional()
}).strict();
// Input schema for tabz_update_profile
const UpdateProfileSchema = z.object({
    profileId: z.string()
        .min(1),
    updates: z.object({
        name: z.string().min(1).max(50).optional(),
        command: z.string().optional(),
        workingDir: z.string().optional(),
        category: z.string().optional(),
        themeName: z.string().optional(),
        fontSize: z.number().int().min(8).max(32).optional(),
        fontFamily: z.string().optional()
    })
}).strict();
// Input schema for tabz_delete_profile
const DeleteProfileSchema = z.object({
    profileId: z.string()
        .min(1)
}).strict();
/**
 * List terminal profiles from Chrome extension
 */
async function listProfiles(category) {
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
    }
    catch (error) {
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
async function listCategories() {
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
    }
    catch (error) {
        return {
            categories: [],
            total: 0,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * Spawn a terminal using a profile
 */
async function spawnByProfile(profileId, workingDir, name, env) {
    const token = getAuthToken();
    if (!token) {
        return {
            success: false,
            error: `Auth token not found at ${AUTH_TOKEN_FILE}. Is the TabzChrome backend running?`
        };
    }
    try {
        const response = await axios.post(`${BACKEND_URL}/api/agents`, {
            profileId,
            workingDir,
            name,
            env
        }, {
            headers: { "X-Auth-Token": token },
            timeout: 30000
        });
        return response.data;
    }
    catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return {
                success: false,
                error: error.response.data?.error || `HTTP ${error.response.status}: ${error.response.statusText}`
            };
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * Get a single profile by ID
 */
async function getProfile(profileId) {
    try {
        // Fetch all profiles and find the one with matching ID or name
        const response = await axios.get(`${BACKEND_URL}/api/browser/profiles`, { timeout: 5000 });
        if (response.data.success) {
            const profiles = response.data.profiles || [];
            const profile = profiles.find(p => p.id === profileId || p.name === profileId);
            if (profile) {
                return { profile };
            }
            return { error: `Profile not found: ${profileId}` };
        }
        return { error: response.data.error || "Failed to fetch profiles" };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Create a new profile
 */
async function createProfile(profile) {
    try {
        const response = await axios.post(`${BACKEND_URL}/api/browser/profiles`, { profile }, { timeout: 5000 });
        if (response.data.success) {
            return { profile: response.data.profile };
        }
        return { error: response.data.error || "Failed to create profile" };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Update an existing profile
 */
async function updateProfile(profileId, updates) {
    try {
        const response = await axios.put(`${BACKEND_URL}/api/browser/profiles/${encodeURIComponent(profileId)}`, updates, { timeout: 5000 });
        if (response.data.success) {
            return { profile: response.data.profile };
        }
        return { error: response.data.error || "Failed to update profile" };
    }
    catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
/**
 * Delete a profile
 */
async function deleteProfile(profileId) {
    try {
        const response = await axios.delete(`${BACKEND_URL}/api/browser/profiles/${encodeURIComponent(profileId)}`, { timeout: 5000 });
        return {
            success: response.data.success ?? false,
            error: response.data.error
        };
    }
    catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}
/**
 * Register profile management tools with the MCP server
 */
export function registerProfileTools(server) {
    // List profiles tool
    registerTabzTool(server, "tabz_list_profiles", "List the saved terminal profiles, to find one before spawning.", ListProfilesSchema, async (params) => {
        try {
            const result = await listProfiles(params.category);
            if (result.error) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({
                    total: result.total,
                    filtered: result.filtered,
                    defaultProfileId: result.defaultProfileId,
                    globalWorkingDir: result.globalWorkingDir,
                    profiles: result.profiles
                }, null, 2);
            }
            else {
                if (result.profiles.length === 0) {
                    if (params.category) {
                        resultText = `# Terminal Profiles

No profiles found in category "${params.category}".
Total profiles in system: ${result.total}

Use \`tabz_list_categories\` to see available categories.`;
                    }
                    else {
                        resultText = `# Terminal Profiles

No profiles configured.
Add profiles in the TabzChrome settings.`;
                    }
                }
                else {
                    const lines = [];
                    if (params.category) {
                        lines.push(`# Terminal Profiles - ${params.category}`);
                        lines.push(`Showing ${result.filtered} of ${result.total} profiles`);
                    }
                    else {
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
                    const byCategory = new Map();
                    for (const profile of result.profiles) {
                        const cat = profile.category || "(No Category)";
                        if (!byCategory.has(cat)) {
                            byCategory.set(cat, []);
                        }
                        byCategory.get(cat).push(profile);
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
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // List categories tool
    registerTabzTool(server, "tabz_list_categories", "List the profile categories, for filtering tabz_list_profiles.", ListCategoriesSchema, async (params) => {
        try {
            const result = await listCategories();
            if (result.error) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify({
                    total: result.total,
                    categories: result.categories
                }, null, 2);
            }
            else {
                if (result.categories.length === 0) {
                    resultText = `# Profile Categories

No categories found.
Profiles may not have categories assigned.

Total profiles: ${result.total}`;
                }
                else {
                    const lines = [
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
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Spawn terminal by profile
    registerTabzTool(server, "tabz_spawn_profile", "Spawn a terminal from a saved profile (tabz_list_profiles to find one).", SpawnProfileSchema, async (params) => {
        try {
            const result = await spawnByProfile(params.profileId, params.workingDir, params.name, params.env);
            if (!result.success || result.error) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error || "Failed to spawn terminal"}` }],
                    isError: true
                };
            }
            // Backend returns terminal in 'data' field, not 'terminal'
            const terminal = result.data || result.terminal;
            if (!terminal) {
                return {
                    content: [{ type: "text", text: `Error: Spawn succeeded but no terminal data returned` }],
                    isError: true
                };
            }
            const resultText = `## Terminal Spawned

**ID:** \`${terminal.id}\`
**Name:** ${terminal.name}
**Type:** ${terminal.terminalType}
**State:** ${terminal.state}
${terminal.profileId ? `**Profile:** ${terminal.profileName || terminal.profileId}` : ""}

Terminal is now running. Connect via TabzChrome sidebar to interact.`;
            return {
                content: [{ type: "text", text: resultText }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Get single profile
    registerTabzTool(server, "tabz_get_profile", "Get every setting of one terminal profile.", GetProfileSchema, async (params) => {
        try {
            const result = await getProfile(params.profileId);
            if (result.error) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            const profile = result.profile;
            let resultText;
            if (params.response_format === ResponseFormat.JSON) {
                resultText = JSON.stringify(profile, null, 2);
            }
            else {
                const lines = [
                    `# Profile: ${profile.name}`,
                    "",
                    `**ID:** \`${profile.id}\``
                ];
                if (profile.category)
                    lines.push(`**Category:** ${profile.category}`);
                if (profile.command)
                    lines.push(`**Command:** \`${profile.command}\``);
                if (profile.workingDir)
                    lines.push(`**Working Dir:** \`${profile.workingDir}\``);
                if (profile.themeName)
                    lines.push(`**Theme:** ${profile.themeName}`);
                if (profile.fontSize)
                    lines.push(`**Font Size:** ${profile.fontSize}px`);
                if (profile.fontFamily)
                    lines.push(`**Font Family:** ${profile.fontFamily}`);
                lines.push("");
                lines.push("---");
                lines.push("Use `tabz_spawn_profile` to create a terminal with this profile.");
                resultText = lines.join("\n");
            }
            return {
                content: [{ type: "text", text: resultText }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Create profile
    registerTabzTool(server, "tabz_create_profile", "Create a terminal profile to spawn from later.", CreateProfileSchema, async (params) => {
        try {
            const result = await createProfile({
                name: params.name,
                command: params.command,
                workingDir: params.workingDir,
                category: params.category,
                themeName: params.themeName,
                fontSize: params.fontSize,
                fontFamily: params.fontFamily
            });
            if (result.error) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            const profile = result.profile;
            const resultText = `## Profile Created

**Name:** ${profile.name}
**ID:** \`${profile.id}\`
${profile.category ? `**Category:** ${profile.category}` : ""}
${profile.command ? `**Command:** \`${profile.command}\`` : ""}
${profile.themeName ? `**Theme:** ${profile.themeName}` : ""}

Use \`tabz_spawn_profile(profileId="${profile.id}")\` to spawn a terminal.`;
            return {
                content: [{ type: "text", text: resultText }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Update profile
    registerTabzTool(server, "tabz_update_profile", "Update a terminal profile; only the fields you pass change.", UpdateProfileSchema, async (params) => {
        try {
            const result = await updateProfile(params.profileId, params.updates);
            if (result.error) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error}` }],
                    isError: true
                };
            }
            const profile = result.profile;
            const updatedFields = Object.keys(params.updates).join(", ");
            const resultText = `## Profile Updated

**Name:** ${profile.name}
**ID:** \`${profile.id}\`

Updated fields: ${updatedFields}

Changes are saved and will apply to new terminals using this profile.`;
            return {
                content: [{ type: "text", text: resultText }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
    // Delete profile
    registerTabzTool(server, "tabz_delete_profile", "Delete a terminal profile permanently. Running terminals are unaffected.", DeleteProfileSchema, async (params) => {
        try {
            const result = await deleteProfile(params.profileId);
            if (!result.success || result.error) {
                return {
                    content: [{ type: "text", text: `Error: ${result.error || "Failed to delete profile"}` }],
                    isError: true
                };
            }
            const resultText = `## Profile Deleted

Profile \`${params.profileId}\` has been permanently deleted.

Use \`tabz_list_profiles\` to see remaining profiles.`;
            return {
                content: [{ type: "text", text: resultText }]
            };
        }
        catch (error) {
            return {
                content: [{
                        type: "text",
                        text: `Error: ${error instanceof Error ? error.message : String(error)}`
                    }],
                isError: true
            };
        }
    });
}
//# sourceMappingURL=profiles.js.map