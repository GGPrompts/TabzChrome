/**
 * Tab Groups Client Module
 *
 * Functions for managing Chrome tab groups via the TabzChrome extension.
 */
export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan';
export interface TabGroupInfo {
    groupId: number;
    title: string;
    color: TabGroupColor;
    collapsed: boolean;
    windowId: number;
    tabCount: number;
    tabIds: number[];
}
export interface ListTabGroupsResult {
    success: boolean;
    groups: TabGroupInfo[];
    claudeActiveGroupId: number | null;
    error?: string;
}
export interface TabGroupResult {
    success: boolean;
    group?: {
        groupId: number;
        title: string;
        color: TabGroupColor;
        collapsed?: boolean;
        windowId?: number;
        tabCount?: number;
    };
    error?: string;
}
export interface UngroupResult {
    success: boolean;
    ungroupedCount?: number;
    error?: string;
}
export interface ClaudeGroupStatus {
    success: boolean;
    exists: boolean;
    groupId: number | null;
    group?: {
        groupId: number;
        title: string;
        color: TabGroupColor;
        collapsed: boolean;
    };
    tabCount: number;
    tabIds?: number[];
    error?: string;
}
/**
 * List all tab groups in the current window
 */
export declare function listTabGroups(): Promise<ListTabGroupsResult>;
/**
 * Create a new tab group from specified tabs
 */
export declare function createTabGroup(options: {
    tabIds: number[];
    title?: string;
    color?: TabGroupColor;
    collapsed?: boolean;
}): Promise<TabGroupResult>;
/**
 * Update an existing tab group's properties
 */
export declare function updateTabGroup(options: {
    groupId: number;
    title?: string;
    color?: TabGroupColor;
    collapsed?: boolean;
}): Promise<TabGroupResult>;
/**
 * Add tabs to an existing group
 */
export declare function addToTabGroup(options: {
    groupId: number;
    tabIds: number[];
}): Promise<TabGroupResult>;
/**
 * Remove tabs from their groups (ungroup them)
 */
export declare function ungroupTabs(tabIds: number[]): Promise<UngroupResult>;
/**
 * Add a tab to the "Claude Active" group (creates group if needed)
 */
export declare function addToClaudeGroup(tabId: number): Promise<TabGroupResult>;
/**
 * Remove a tab from the "Claude Active" group
 */
export declare function removeFromClaudeGroup(tabId: number): Promise<{
    success: boolean;
    message?: string;
    error?: string;
}>;
/**
 * Get the status of the "Claude Active" group
 */
export declare function getClaudeGroupStatus(): Promise<ClaudeGroupStatus>;
//# sourceMappingURL=tabGroups.d.ts.map