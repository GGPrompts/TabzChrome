/**
 * Shared sentences for the compact metadata published by tools/list.
 *
 * MCP clients handle tool schemas differently, so this module does not claim a
 * universal per-turn token cost. It keeps repeated guidance short and stable;
 * tabz_docs carries the detailed parameters, constraints, and recovery rules.
 */
/** Optional page-tool target, defaulting to this connection's current tab. */
export declare const TAB_ID_DESC = "Chrome tab ID; omit for the current tab.";
/** Optional destination for a screenshot or download. */
export declare const OUTPUT_PATH_DESC = "Where to save it; a default path otherwise.";
/** Ownership rule that remains visible even in compact presets. */
export declare const GROUP_RULE_SUMMARY = "Rule: your first opened tab creates an enforced group; outside tab IDs are refused. Leave the user's other tabs alone.";
/** Point from compact published metadata to bundled detailed guidance. */
export declare function docsPointer(toolName: string): string;
//# sourceMappingURL=descriptions.d.ts.map