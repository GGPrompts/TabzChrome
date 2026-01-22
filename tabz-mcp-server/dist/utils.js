/**
 * Shared Utilities
 *
 * Common helper functions used across the MCP server.
 */
/**
 * Format bytes as human-readable size (B, KB, MB, GB)
 */
export function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
//# sourceMappingURL=utils.js.map