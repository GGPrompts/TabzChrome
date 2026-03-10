/**
 * Terminal Management Tools
 *
 * Tools for listing terminals and sending keys/commands to them.
 * Uses tmux send-keys with proper delays for Claude terminals.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { readFileSync } from "fs";
import { BACKEND_URL } from "../shared.js";
import { ResponseFormat } from "../types.js";

// Auth token file location (same as backend uses)
const AUTH_TOKEN_FILE = "/tmp/tabz-auth-token";

/**
 * Read auth token from file
 */
function getAuthToken(): string | null {
  try {
    return readFileSync(AUTH_TOKEN_FILE, "utf-8").trim();
  } catch {
    return null;
  }
}

// Terminal interface matching backend response
interface Terminal {
  id: string;
  name: string;
  terminalType: string;
  platform: string;
  resumable?: boolean;
  color?: string;
  icon?: string;
  workingDir?: string;
  state: string;
  embedded?: boolean;
  createdAt: string;
  lastActivity?: string;
}

// Input schema for tabz_list_terminals
const ListTerminalsSchema = z.object({
  state: z.enum(["active", "disconnected", "all"])
    .default("all")
    .describe("Filter by terminal state: 'active', 'disconnected', or 'all' (default)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type ListTerminalsInput = z.infer<typeof ListTerminalsSchema>;

// Input schema for tabz_send_keys
const SendKeysSchema = z.object({
  terminal: z.string()
    .min(1)
    .describe("Terminal name or ID to send keys to (use tabz_list_terminals to find terminals)"),
  text: z.string()
    .min(1)
    .describe("Text to send to the terminal"),
  execute: z.boolean()
    .default(true)
    .describe("Whether to press Enter after sending text (default: true). Set to false to just paste text."),
  delay: z.number()
    .int()
    .min(0)
    .max(5000)
    .default(600)
    .describe("Delay in milliseconds before pressing Enter (default: 600ms). Helps Claude terminals process long prompts.")
}).strict();

type SendKeysInput = z.infer<typeof SendKeysSchema>;

// Input schema for tabz_capture_terminal
const CaptureTerminalSchema = z.object({
  terminal: z.string()
    .min(1)
    .describe("Terminal name or ID to capture output from"),
  lines: z.number()
    .int()
    .min(1)
    .max(1000)
    .default(50)
    .describe("Number of lines to capture (default: 50, max: 1000)")
}).strict();

type CaptureTerminalInput = z.infer<typeof CaptureTerminalSchema>;

/**
 * List all terminals from backend
 */
async function listTerminals(state?: string): Promise<{
  terminals: Terminal[];
  total: number;
  error?: string;
}> {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/agents`, {
      timeout: 5000
    });

    if (response.data.success) {
      let terminals: Terminal[] = response.data.data || [];

      // Filter by state if specified
      if (state && state !== "all") {
        terminals = terminals.filter(t => t.state === state);
      }

      return {
        terminals,
        total: response.data.count ?? terminals.length
      };
    }
    return {
      terminals: [],
      total: 0,
      error: response.data.error || "Failed to list terminals"
    };
  } catch (error) {
    if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
      return {
        terminals: [],
        total: 0,
        error: "Cannot connect to TabzChrome backend at localhost:8129. Is ./scripts/dev.sh running?"
      };
    }
    return {
      terminals: [],
      total: 0,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Find terminal by name or ID
 */
async function findTerminal(nameOrId: string): Promise<{
  terminal?: Terminal;
  error?: string;
}> {
  const result = await listTerminals();
  if (result.error) {
    return { error: result.error };
  }

  // Try exact ID match first
  let terminal = result.terminals.find(t => t.id === nameOrId);

  // Then try exact name match
  if (!terminal) {
    terminal = result.terminals.find(t => t.name === nameOrId);
  }

  // Then try case-insensitive name match
  if (!terminal) {
    const lowerName = nameOrId.toLowerCase();
    terminal = result.terminals.find(t => t.name.toLowerCase() === lowerName);
  }

  // Then try partial name match
  if (!terminal) {
    const lowerName = nameOrId.toLowerCase();
    terminal = result.terminals.find(t => t.name.toLowerCase().includes(lowerName));
  }

  if (!terminal) {
    return { error: `Terminal not found: "${nameOrId}". Use tabz_list_terminals to see available terminals.` };
  }

  return { terminal };
}

/**
 * Send keys to a terminal via tmux (with proper delay for Claude terminals)
 */
async function sendKeys(
  terminal: Terminal,
  text: string,
  execute: boolean,
  delay: number
): Promise<{ success: boolean; error?: string }> {
  const token = getAuthToken();
  if (!token) {
    return {
      success: false,
      error: "Auth token not found at /tmp/tabz-auth-token. Is the TabzChrome backend running?"
    };
  }

  try {
    // Use the terminal's tmux session name (which is the terminal ID for ctt-* terminals)
    // The backend will use tmux send-keys with the delay
    const response = await axios.post(
      `${BACKEND_URL}/api/terminals/send-keys`,
      {
        terminalId: terminal.id,
        sessionName: terminal.id, // tmux session name is the terminal ID
        text,
        execute,
        delay
      },
      {
        headers: { "X-Auth-Token": token },
        timeout: 10000
      }
    );

    if (response.data.success) {
      return { success: true };
    }
    return {
      success: false,
      error: response.data.error || "Failed to send keys"
    };
  } catch (error) {
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
 * Capture terminal output via tmux capture-pane
 */
async function captureTerminal(
  terminal: Terminal,
  lines: number
): Promise<{ output?: string; error?: string }> {
  try {
    const response = await axios.get(
      `${BACKEND_URL}/api/terminals/${encodeURIComponent(terminal.id)}/capture`,
      {
        params: { lines },
        timeout: 5000
      }
    );

    if (response.data.success) {
      return { output: response.data.output };
    }
    return { error: response.data.error || "Failed to capture terminal output" };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return {
        error: error.response.data?.error || `HTTP ${error.response.status}: ${error.response.statusText}`
      };
    }
    return {
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Register terminal management tools with the MCP server
 */
export function registerTerminalTools(server: McpServer): void {
  // List terminals tool
  server.tool(
    "tabz_list_terminals",
    `List running terminals in TabzChrome. Filter by state: 'active', 'disconnected', or 'all'. Returns IDs for tabz_send_keys and tabz_capture_terminal. Use tabz_get_skill for detailed docs.`,
    ListTerminalsSchema.shape,
    async (params: ListTerminalsInput) => {
      try {
        const result = await listTerminals(params.state);

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
            filtered: result.terminals.length,
            terminals: result.terminals
          }, null, 2);
        } else {
          if (result.terminals.length === 0) {
            resultText = `# Terminals

No terminals found${params.state !== "all" ? ` with state "${params.state}"` : ""}.

Total terminals in system: ${result.total}

Use \`tabz_spawn_profile\` to create a terminal.`;
          } else {
            const lines: string[] = [
              `# Terminals (${result.terminals.length}${params.state !== "all" ? ` ${params.state}` : ""})`,
              ""
            ];

            // Group by state
            const byState = new Map<string, Terminal[]>();
            for (const terminal of result.terminals) {
              const state = terminal.state || "unknown";
              if (!byState.has(state)) {
                byState.set(state, []);
              }
              byState.get(state)!.push(terminal);
            }

            for (const [state, terminals] of byState) {
              lines.push(`## ${state.charAt(0).toUpperCase() + state.slice(1)} (${terminals.length})`);
              lines.push("");
              for (const t of terminals) {
                lines.push(`- **${t.name}** (\`${t.id}\`)`);
                lines.push(`  - Type: ${t.terminalType}`);
                if (t.workingDir) {
                  lines.push(`  - Dir: \`${t.workingDir}\``);
                }
                const createdAt = new Date(t.createdAt).toLocaleString();
                lines.push(`  - Created: ${createdAt}`);
              }
              lines.push("");
            }

            lines.push("---");
            lines.push("Use `tabz_send_keys` to send commands to a terminal.");
            lines.push("Use `tabz_capture_terminal` to see terminal output.");
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

  // Send keys tool
  server.tool(
    "tabz_send_keys",
    `Send text/keys to a terminal via tmux. Default 600ms delay before Enter suits Claude terminals; increase for long prompts. Use tabz_get_skill for detailed docs.`,
    SendKeysSchema.shape,
    async (params: SendKeysInput) => {
      try {
        // Find terminal by name or ID
        const findResult = await findTerminal(params.terminal);
        if (findResult.error) {
          return {
            content: [{ type: "text", text: `Error: ${findResult.error}` }],
            isError: true
          };
        }

        const terminal = findResult.terminal!;

        // Check if terminal is active
        if (terminal.state !== "active") {
          return {
            content: [{
              type: "text",
              text: `Error: Terminal "${terminal.name}" is ${terminal.state}. Cannot send keys to inactive terminals.`
            }],
            isError: true
          };
        }

        // Send keys
        const result = await sendKeys(terminal, params.text, params.execute, params.delay);

        if (!result.success) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        const resultText = `## Keys Sent

**Terminal:** ${terminal.name} (\`${terminal.id}\`)
**Text Length:** ${params.text.length} characters
**Executed:** ${params.execute ? "Yes (Enter pressed)" : "No (pasted only)"}
${params.execute ? `**Delay:** ${params.delay}ms before Enter` : ""}

Keys have been sent to the terminal.`;

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

  // Capture terminal output tool
  server.tool(
    "tabz_capture_terminal",
    `Capture recent output from a terminal's scrollback buffer. Returns last N lines (default 50, max 1000). Use tabz_get_skill for detailed docs.`,
    CaptureTerminalSchema.shape,
    async (params: CaptureTerminalInput) => {
      try {
        // Find terminal by name or ID
        const findResult = await findTerminal(params.terminal);
        if (findResult.error) {
          return {
            content: [{ type: "text", text: `Error: ${findResult.error}` }],
            isError: true
          };
        }

        const terminal = findResult.terminal!;

        // Capture output
        const result = await captureTerminal(terminal, params.lines);

        if (result.error) {
          return {
            content: [{ type: "text", text: `Error: ${result.error}` }],
            isError: true
          };
        }

        const output = result.output || "(empty)";
        const resultText = `## Terminal Output: ${terminal.name}

\`\`\`
${output}
\`\`\`

*Captured ${params.lines} lines from terminal \`${terminal.id}\`*`;

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
