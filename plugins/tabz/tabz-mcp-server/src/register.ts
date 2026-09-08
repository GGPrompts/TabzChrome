/**
 * The registration seam for tabz tools.
 *
 * The deprecated server.tool() API accepts a raw object shape and rebuilds a
 * non-strict schema. Passing the authored Zod object to registerTool preserves
 * top-level .strict() behavior and publishes additionalProperties:false.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export type ToolInputSchema = z.AnyZodObject;
export type ToolHandlerExtra = RequestHandlerExtra<ServerRequest, ServerNotification>;

export type ToolHandler<Schema extends ToolInputSchema> = (
  args: z.infer<Schema>,
  extra: ToolHandlerExtra
) => CallToolResult | Promise<CallToolResult>;

interface RegisteredTabzTool {
  inputSchema: ToolInputSchema;
  handler: ToolHandler<ToolInputSchema>;
}

const registeredTabzTools = new WeakMap<McpServer, Map<string, RegisteredTabzTool>>();

function toolTable(server: McpServer): Map<string, RegisteredTabzTool> {
  let table = registeredTabzTools.get(server);
  if (!table) {
    table = new Map();
    registeredTabzTools.set(server, table);
  }
  return table;
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/** Invoke only a tool that was successfully registered on this server. */
export async function dispatchRegisteredTabzTool(
  server: McpServer,
  name: string,
  input: Record<string, unknown>,
  extra: ToolHandlerExtra
): Promise<CallToolResult> {
  if (name === "tabz_batch") return errorResult("tabz_batch cannot call itself.");
  const registered = registeredTabzTools.get(server)?.get(name);
  if (!registered) return errorResult(`Tool "${name}" is not available in this session.`);
  const parsed = await registered.inputSchema.safeParseAsync(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map(issue => issue.path.length > 0 ? `${issue.message} at ${issue.path.join(".")}` : issue.message)
      .join("; ");
    return errorResult(`Invalid arguments for ${name}: ${detail}`);
  }
  try {
    return await registered.handler(parsed.data, extra);
  } catch (error) {
    return errorResult(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function unknownArgumentErrorMap(validArguments: string[]): z.ZodErrorMap {
  const valid = validArguments.length > 0 ? validArguments.join(", ") : "(none)";
  return (issue, context) => {
    if (issue.code === z.ZodIssueCode.unrecognized_keys) {
      const offenders = issue.keys.map(key => `'${key}'`).join(", ");
      const label = issue.keys.length === 1 ? "argument" : "arguments";
      return { message: `Unknown ${label} ${offenders}. Valid arguments: ${valid}.` };
    }
    return { message: context.defaultError };
  };
}

function withUnknownArgumentMessage<Schema extends ToolInputSchema>(schema: Schema): Schema {
  if (schema._def.unknownKeys !== "strict") return schema;
  return z.object(schema.shape, {
    errorMap: unknownArgumentErrorMap(Object.keys(schema.shape))
  }).strict() as unknown as Schema;
}

/** Register one tool with its complete Zod object, preserving strictness. */
export function registerTabzTool<Schema extends ToolInputSchema>(
  server: McpServer,
  name: string,
  description: string,
  schema: Schema,
  handler: ToolHandler<Schema>
): void {
  const inputSchema: z.ZodTypeAny = withUnknownArgumentMessage(schema);
  const registration = server.registerTool(name, { description, inputSchema }, handler);
  if (registration !== undefined) {
    toolTable(server).set(name, {
      inputSchema: inputSchema as ToolInputSchema,
      handler: handler as ToolHandler<ToolInputSchema>
    });
  }
}
