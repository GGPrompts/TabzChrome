/**
 * Tab Groups Client Module
 *
 * Functions for managing Chrome tab groups via the TabzChrome extension.
 */

import axios from "axios";
import { BACKEND_URL, handleApiError } from "./core.js";

// Valid tab group colors
export type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan';

// Tab group info returned from list
export interface TabGroupInfo {
  groupId: number;
  title: string;
  color: TabGroupColor;
  collapsed: boolean;
  windowId: number;
  tabCount: number;
  tabIds: number[];
}

// Result from list tab groups
export interface ListTabGroupsResult {
  success: boolean;
  groups: TabGroupInfo[];
  claudeActiveGroupId: number | null;
  error?: string;
}

// Result from create/update group operations
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

// Result from ungroup operation
export interface UngroupResult {
  success: boolean;
  ungroupedCount?: number;
  error?: string;
}

// Result from Claude group status
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
export async function listTabGroups(): Promise<ListTabGroupsResult> {
  try {
    const response = await axios.get<ListTabGroupsResult>(
      `${BACKEND_URL}/api/browser/tab-groups`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      groups: [],
      claudeActiveGroupId: null,
      error: handleApiError(error, "Failed to list tab groups").message
    };
  }
}

/**
 * Create a new tab group from specified tabs
 */
export async function createTabGroup(options: {
  tabIds: number[];
  title?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
}): Promise<TabGroupResult> {
  try {
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: handleApiError(error, "Failed to create tab group").message
    };
  }
}

/**
 * Update an existing tab group's properties
 */
export async function updateTabGroup(options: {
  groupId: number;
  title?: string;
  color?: TabGroupColor;
  collapsed?: boolean;
}): Promise<TabGroupResult> {
  try {
    const { groupId, ...updateProps } = options;
    const response = await axios.put<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/${groupId}`,
      updateProps,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: handleApiError(error, "Failed to update tab group").message
    };
  }
}

/**
 * Add tabs to an existing group
 */
export async function addToTabGroup(options: {
  groupId: number;
  tabIds: number[];
}): Promise<TabGroupResult> {
  try {
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/tab-groups/${options.groupId}/tabs`,
      { tabIds: options.tabIds },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: handleApiError(error, "Failed to add tabs to group").message
    };
  }
}

/**
 * Remove tabs from their groups (ungroup them)
 */
export async function ungroupTabs(tabIds: number[]): Promise<UngroupResult> {
  try {
    const response = await axios.post<UngroupResult>(
      `${BACKEND_URL}/api/browser/ungroup-tabs`,
      { tabIds },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: handleApiError(error, "Failed to ungroup tabs").message
    };
  }
}

/**
 * Add a tab to the "Claude Active" group (creates group if needed)
 */
export async function addToClaudeGroup(tabId: number): Promise<TabGroupResult> {
  try {
    const response = await axios.post<TabGroupResult>(
      `${BACKEND_URL}/api/browser/claude-group/add`,
      { tabId },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: handleApiError(error, "Failed to add tab to Claude group").message
    };
  }
}

/**
 * Remove a tab from the "Claude Active" group
 */
export async function removeFromClaudeGroup(tabId: number): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/browser/claude-group/remove`,
      { tabId },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      error: handleApiError(error, "Failed to remove tab from Claude group").message
    };
  }
}

/**
 * Get the status of the "Claude Active" group
 */
export async function getClaudeGroupStatus(): Promise<ClaudeGroupStatus> {
  try {
    const response = await axios.get<ClaudeGroupStatus>(
      `${BACKEND_URL}/api/browser/claude-group/status`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return {
      success: false,
      exists: false,
      groupId: null,
      tabCount: 0,
      error: handleApiError(error, "Failed to get Claude group status").message
    };
  }
}
