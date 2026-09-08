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
export type ToolHandler<Schema extends ToolInputSchema> = (args: z.infer<Schema>, extra: ToolHandlerExtra) => CallToolResult | Promise<CallToolResult>;
/** Invoke only a tool that was successfully registered on this server. */
export declare function dispatchRegisteredTabzTool(server: McpServer, name: string, input: Record<string, unknown>, extra: ToolHandlerExtra): Promise<CallToolResult>;
/** Register one tool with its complete Zod object, preserving strictness. */
export declare function registerTabzTool<Schema extends ToolInputSchema>(server: McpServer, name: string, description: string, schema: Schema, handler: ToolHandler<Schema>): void;
//# sourceMappingURL=register.d.ts.map