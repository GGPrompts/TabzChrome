#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { open, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_TABZ_ENDPOINT, TabzClient, TabzClientError, TabzToolError, TabzUsageError } from "../client/index.js";
const DEFAULT_MAX_BINARY_BYTES = 20 * 1024 * 1024;
const MAX_ARGUMENT_BYTES = 1024 * 1024;
const cliStdoutWrite = process.stdout.write.bind(process.stdout);
function usage() {
    return [
        "Usage:",
        "  tabz [options] discover",
        "  tabz [options] call <tool> [--input <json-file>] [--output <binary-file>]",
        "  tabz [options] run <trusted-module>",
        "",
        "Options:",
        `  --endpoint <url>       MCP URL (default ${DEFAULT_TABZ_ENDPOINT})`,
        "  --preset <slug>        replace the endpoint's final path segment",
        "  --timeout <ms>         request timeout",
        "  --input <path>         read call arguments from a JSON file (default stdin)",
        "  --output <path>        write one returned image to this explicit path",
        "  --max-binary-bytes <n> maximum decoded image size (default 20971520)",
        "  -h, --help             show this help",
        "",
        "Environment: TABZ_MCP_ENDPOINT, TABZ_MCP_PRESET, TABZ_CLI_TIMEOUT_MS"
    ].join("\n");
}
function parsePositiveInteger(value, option) {
    const parsed = value === undefined ? NaN : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new TabzUsageError(`${option} must be a positive integer`);
    }
    return parsed;
}
function parseArgs(argv, env) {
    const positionals = [];
    let endpoint = env.TABZ_MCP_ENDPOINT ?? DEFAULT_TABZ_ENDPOINT;
    let preset = env.TABZ_MCP_PRESET;
    let timeoutMs = env.TABZ_CLI_TIMEOUT_MS === undefined
        ? undefined
        : parsePositiveInteger(env.TABZ_CLI_TIMEOUT_MS, "TABZ_CLI_TIMEOUT_MS");
    let inputPath;
    let outputPath;
    let maxBinaryBytes = DEFAULT_MAX_BINARY_BYTES;
    let help = false;
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const next = () => {
            const value = argv[++index];
            if (value === undefined)
                throw new TabzUsageError(`${argument} needs a value`);
            return value;
        };
        if (argument === "--endpoint")
            endpoint = next();
        else if (argument === "--preset")
            preset = next();
        else if (argument === "--timeout")
            timeoutMs = parsePositiveInteger(next(), "--timeout");
        else if (argument === "--input")
            inputPath = next();
        else if (argument === "--output")
            outputPath = next();
        else if (argument === "--max-binary-bytes") {
            maxBinaryBytes = parsePositiveInteger(next(), "--max-binary-bytes");
        }
        else if (argument === "--help" || argument === "-h")
            help = true;
        else if (argument.startsWith("-"))
            throw new TabzUsageError(`unknown option: ${argument}`);
        else
            positionals.push(argument);
    }
    return { endpoint, preset, timeoutMs, inputPath, outputPath, maxBinaryBytes, help, positionals };
}
async function readJsonArguments(path) {
    let source;
    try {
        if (path) {
            const handle = await open(resolve(path), "r");
            try {
                const stat = await handle.stat();
                if (!stat.isFile()) {
                    throw new TabzUsageError("JSON argument input must be a regular file");
                }
                if (stat.size > MAX_ARGUMENT_BYTES) {
                    throw new TabzUsageError(`JSON argument file exceeds ${MAX_ARGUMENT_BYTES} bytes`);
                }
                const input = Buffer.allocUnsafe(MAX_ARGUMENT_BYTES + 1);
                let bytes = 0;
                while (bytes <= MAX_ARGUMENT_BYTES) {
                    const read = await handle.read(input, bytes, MAX_ARGUMENT_BYTES + 1 - bytes, null);
                    if (read.bytesRead === 0)
                        break;
                    bytes += read.bytesRead;
                }
                if (bytes > MAX_ARGUMENT_BYTES) {
                    throw new TabzUsageError(`JSON argument file exceeds ${MAX_ARGUMENT_BYTES} bytes`);
                }
                source = input.subarray(0, bytes).toString("utf8");
            }
            finally {
                await handle.close();
            }
        }
        else {
            const chunks = [];
            let bytes = 0;
            for await (const chunk of process.stdin) {
                const buffer = Buffer.from(chunk);
                bytes += buffer.byteLength;
                if (bytes > MAX_ARGUMENT_BYTES) {
                    throw new TabzUsageError(`stdin JSON exceeds ${MAX_ARGUMENT_BYTES} bytes`);
                }
                chunks.push(buffer);
            }
            source = Buffer.concat(chunks, bytes).toString("utf8");
        }
    }
    catch (error) {
        if (error instanceof TabzUsageError)
            throw error;
        throw new TabzUsageError(`could not read JSON arguments ${path ? "from the input file" : "from stdin"}`, { cause: error });
    }
    if (source.trim() === "")
        return {};
    let parsed;
    try {
        parsed = JSON.parse(source);
    }
    catch (error) {
        throw new TabzUsageError("arguments are not valid JSON", { cause: error });
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new TabzUsageError("tool arguments must be a JSON object");
    }
    return parsed;
}
function decodedSize(data) {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) {
        throw new TabzUsageError("tool returned malformed base64 binary data");
    }
    const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
    return (data.length / 4) * 3 - padding;
}
async function prepareOutput(result, outputPath, maxBinaryBytes) {
    const images = result.content.filter(block => block.type === "image");
    if (outputPath && images.length !== 1) {
        throw new TabzUsageError(`--output requires exactly one returned image; received ${images.length}`);
    }
    let artifact;
    const decodedImages = images.map(image => ({
        image,
        size: decodedSize(image.data)
    }));
    const totalBytes = decodedImages.reduce((total, decoded) => total + decoded.size, 0);
    if (totalBytes > maxBinaryBytes) {
        throw new TabzUsageError(`returned images total ${totalBytes} bytes, over the ${maxBinaryBytes} byte limit`);
    }
    if (outputPath) {
        const image = images[0];
        const bytes = Buffer.from(image.data, "base64");
        const path = resolve(outputPath);
        try {
            await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
        }
        catch (error) {
            throw new TabzUsageError("could not write the requested binary output", { cause: error });
        }
        artifact = { path, bytes: bytes.byteLength, mimeType: image.mimeType };
    }
    return {
        ...result,
        content: result.content.map(block => {
            if (block.type !== "image")
                return block;
            const bytes = decodedSize(block.data);
            return artifact
                ? { type: "text", text: JSON.stringify({ artifact }) }
                : { type: "text", text: JSON.stringify({ image: { mimeType: block.mimeType, bytes, omitted: true } }) };
        })
    };
}
function requiredTools(value) {
    if (value === undefined) {
        throw new TabzUsageError("workflow module must export requiredTools for preflight");
    }
    if (!Array.isArray(value) || value.some(name => typeof name !== "string" || name.length === 0)) {
        throw new TabzUsageError("workflow requiredTools must be an array of non-empty tool names");
    }
    return [...new Set(value)];
}
async function loadWorkflow(modulePath) {
    const absolutePath = resolve(modulePath);
    let loaded;
    try {
        loaded = await withWorkflowConsole(() => import(pathToFileURL(absolutePath).href));
    }
    catch (error) {
        throw new TabzUsageError("could not load trusted workflow module", { cause: error });
    }
    const run = loaded.default ?? loaded.run;
    if (typeof run !== "function") {
        throw new TabzUsageError("workflow module must export a default function or named run function");
    }
    return { run: run, required: requiredTools(loaded.requiredTools) };
}
function writeJson(value, maxBinaryBytes = DEFAULT_MAX_BINARY_BYTES) {
    cliStdoutWrite(`${JSON.stringify(sanitizeBinaryForStdout(value, maxBinaryBytes))}\n`);
}
function sanitizeBinaryForStdout(value, maxBinaryBytes) {
    let totalBytes = 0;
    const visit = (current) => {
        if (Array.isArray(current))
            return current.map(visit);
        if (!current || typeof current !== "object")
            return current;
        const record = current;
        if ((record.type === "image" || record.type === "audio") && typeof record.data === "string") {
            const bytes = decodedSize(record.data);
            totalBytes += bytes;
            if (totalBytes > maxBinaryBytes) {
                throw new TabzUsageError(`binary output exceeds the ${maxBinaryBytes} byte limit`);
            }
            return { type: record.type, mimeType: record.mimeType, bytes, omitted: true };
        }
        if (record.type === "resource" && record.resource && typeof record.resource === "object") {
            const resource = record.resource;
            if (typeof resource.blob === "string") {
                const bytes = decodedSize(resource.blob);
                totalBytes += bytes;
                if (totalBytes > maxBinaryBytes) {
                    throw new TabzUsageError(`binary output exceeds the ${maxBinaryBytes} byte limit`);
                }
                const { blob: _blob, ...metadata } = resource;
                return { ...record, resource: { ...metadata, bytes, omitted: true } };
            }
        }
        return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, visit(child)]));
    };
    return visit(value);
}
async function withWorkflowConsole(operation) {
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalDebug = console.debug;
    const originalStdoutWrite = process.stdout.write;
    const diagnostic = (..._values) => {
        process.stderr.write("tabz: workflow emitted a console diagnostic\n");
    };
    console.log = diagnostic;
    console.info = diagnostic;
    console.debug = diagnostic;
    process.stdout.write = ((...writeArguments) => {
        process.stderr.write("tabz: workflow attempted direct stdout output\n");
        let callback;
        for (let index = writeArguments.length - 1; index >= 0; index -= 1) {
            if (typeof writeArguments[index] === "function") {
                callback = writeArguments[index];
                break;
            }
        }
        if (callback)
            queueMicrotask(callback);
        return true;
    });
    try {
        return await operation();
    }
    finally {
        console.log = originalLog;
        console.info = originalInfo;
        console.debug = originalDebug;
        process.stdout.write = originalStdoutWrite;
    }
}
function workflowName(path) {
    return basename(path).replace(/\.[^.]+$/, "") || "workflow";
}
export async function main(argv = process.argv.slice(2), env = process.env) {
    let options;
    try {
        options = parseArgs(argv, env);
    }
    catch (error) {
        return reportError(error);
    }
    if (options.help) {
        process.stdout.write(`${usage()}\n`);
        return 0;
    }
    const [command, operand, extra] = options.positionals;
    if (!command || extra !== undefined || !["discover", "call", "run"].includes(command)) {
        return reportError(new TabzUsageError("expected discover, call <tool>, or run <trusted-module>"));
    }
    if ((command === "call" || command === "run") && !operand) {
        return reportError(new TabzUsageError(`${command} needs ${command === "call" ? "a tool name" : "a module path"}`));
    }
    if (command === "discover" && operand) {
        return reportError(new TabzUsageError("discover takes no operand"));
    }
    if (command !== "call" && (options.inputPath || options.outputPath)) {
        return reportError(new TabzUsageError("--input and --output are valid only with call"));
    }
    let workflow;
    if (command === "run") {
        try {
            workflow = await loadWorkflow(operand);
        }
        catch (error) {
            return reportError(error);
        }
    }
    let client;
    try {
        client = new TabzClient({
            endpoint: options.endpoint,
            preset: options.preset,
            workflow: command === "run" ? workflowName(operand) : command === "call" ? `call-${operand}` : "discover",
            timeoutMs: options.timeoutMs
        });
    }
    catch (error) {
        return reportError(error);
    }
    const workflowAbort = new AbortController();
    let signalExit;
    const handleSignal = (signal) => {
        if (signalExit !== undefined)
            return;
        const activeMutation = client.activeMutationTool;
        signalExit = activeMutation ? 4 : 3;
        workflowAbort.abort(new Error(signal));
        void client.close().catch(error => {
            process.stderr.write(`tabz: cleanup after ${signal} failed: ${error instanceof Error ? error.message : error}\n`);
        }).finally(() => {
            writeJson({
                ok: false,
                code: signalExit,
                error: activeMutation
                    ? "interrupted while a mutation was in flight; outcome is uncertain"
                    : `interrupted by ${signal}`,
                ...(activeMutation ? { tool: activeMutation, uncertain: true } : {})
            });
            process.exit(signalExit);
        });
    };
    process.once("SIGINT", handleSignal);
    process.once("SIGTERM", handleSignal);
    let primaryError;
    let exitCode = 0;
    let output;
    let outputMaxBinaryBytes = DEFAULT_MAX_BINARY_BYTES;
    try {
        if (command === "discover") {
            const tools = await client.discover();
            output = { endpoint: `${client.endpoint.origin}${client.endpoint.pathname}`, agent: client.agentIdentity, tools };
        }
        else if (command === "call") {
            const input = await readJsonArguments(options.inputPath);
            const result = await client.callTool(operand, input);
            output = await prepareOutput(result, options.outputPath, options.maxBinaryBytes);
            outputMaxBinaryBytes = options.maxBinaryBytes;
        }
        else {
            await client.bindWorkflowTools(workflow.required);
            const result = await withWorkflowConsole(() => Promise.resolve(workflow.run(client, { signal: workflowAbort.signal })));
            output = result === undefined ? { ok: true } : result;
            outputMaxBinaryBytes = options.maxBinaryBytes;
        }
    }
    catch (error) {
        primaryError = error;
        if (signalExit === undefined)
            exitCode = reportError(error);
    }
    finally {
        process.removeListener("SIGINT", handleSignal);
        process.removeListener("SIGTERM", handleSignal);
        try {
            await client.close();
        }
        catch (error) {
            process.stderr.write(`tabz: ${error instanceof Error ? error.message : error}\n`);
            if (!primaryError) {
                output = { ok: false, code: 3, error: "session cleanup failed" };
                exitCode = 3;
            }
        }
    }
    if (!primaryError && signalExit === undefined) {
        try {
            writeJson(output, outputMaxBinaryBytes);
        }
        catch (error) {
            exitCode = reportError(error);
        }
    }
    return signalExit ?? exitCode;
}
function reportError(error) {
    const code = error instanceof TabzClientError ? error.exitCode : 3;
    const message = error instanceof TabzClientError ? error.message : "workflow failed";
    if (error instanceof TabzToolError) {
        writeJson(error.result);
    }
    else {
        writeJson({
            ok: false,
            code,
            error: message,
            ...(error instanceof TabzClientError && "toolName" in error
                ? { tool: error.toolName, uncertain: code === 4 }
                : {})
        });
    }
    process.stderr.write(`tabz: ${message}\n`);
    return code;
}
function isDirectExecution(argvPath) {
    if (!argvPath)
        return false;
    try {
        return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(argvPath));
    }
    catch {
        return import.meta.url === pathToFileURL(resolve(argvPath)).href;
    }
}
if (isDirectExecution(process.argv[1])) {
    main().then(code => {
        process.exitCode = code;
    }).catch(error => {
        process.exitCode = reportError(error);
    });
}
//# sourceMappingURL=index.js.map