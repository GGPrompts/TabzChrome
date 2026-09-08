import { z } from "zod";
const registeredTabzTools = new WeakMap();
function toolTable(server) {
    let table = registeredTabzTools.get(server);
    if (!table) {
        table = new Map();
        registeredTabzTools.set(server, table);
    }
    return table;
}
function errorResult(message) {
    return { content: [{ type: "text", text: message }], isError: true };
}
/** Invoke only a tool that was successfully registered on this server. */
export async function dispatchRegisteredTabzTool(server, name, input, extra) {
    if (name === "tabz_batch")
        return errorResult("tabz_batch cannot call itself.");
    const registered = registeredTabzTools.get(server)?.get(name);
    if (!registered)
        return errorResult(`Tool "${name}" is not available in this session.`);
    const parsed = await registered.inputSchema.safeParseAsync(input);
    if (!parsed.success) {
        const detail = parsed.error.issues
            .map(issue => issue.path.length > 0 ? `${issue.message} at ${issue.path.join(".")}` : issue.message)
            .join("; ");
        return errorResult(`Invalid arguments for ${name}: ${detail}`);
    }
    try {
        return await registered.handler(parsed.data, extra);
    }
    catch (error) {
        return errorResult(`${name} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function unknownArgumentErrorMap(validArguments) {
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
function withUnknownArgumentMessage(schema) {
    if (schema._def.unknownKeys !== "strict")
        return schema;
    return z.object(schema.shape, {
        errorMap: unknownArgumentErrorMap(Object.keys(schema.shape))
    }).strict();
}
/** Register one tool with its complete Zod object, preserving strictness. */
export function registerTabzTool(server, name, description, schema, handler) {
    const inputSchema = withUnknownArgumentMessage(schema);
    const registration = server.registerTool(name, { description, inputSchema }, handler);
    if (registration !== undefined) {
        toolTable(server).set(name, {
            inputSchema: inputSchema,
            handler: handler
        });
    }
}
//# sourceMappingURL=register.js.map