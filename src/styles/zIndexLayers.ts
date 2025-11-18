/**
 * Centralized z-index layer management
 *
 * This provides a consistent z-index hierarchy to prevent overlapping issues
 * and ensure proper stacking of UI elements.
 *
 * Rules:
 * - Canvas elements: 1-99
 * - Draggable cards/terminals: 100-999
 * - Sidebar/panels: 1000-1999
 * - Modals: 2000-2999
 * - Notifications: 3000-3999
 * - Command Dispatcher: 4000-4999
 * - Locked/pinned elements: 5000-5999
 * - Critical overlays: 9000-9999
 * - Debug tools: 99999
 */

export const Z_INDEX = {
  // Base canvas layer
  CANVAS_BASE: 1,
  CANVAS_ELEMENT: 10,

  // Draggable elements on canvas
  TERMINAL_BASE: 100,
  TERMINAL_FOCUSED: 200,
  CARD_BASE: 100,
  CARD_FOCUSED: 200,

  // UI Panels
  SIDEBAR: 1000,
  CONNECTION_STATUS: 1100,

  // Modals and overlays
  MODAL_BACKDROP: 2000,
  MODAL_CONTENT: 2100,
  DROPDOWN: 2200,

  // Notifications
  NOTIFICATION: 3000,
  TOAST: 3100,

  // Command Dispatcher (UnifiedChat)
  COMMAND_DISPATCHER: 4000,
  COMMAND_DISPATCHER_EXPANDED: 4100,

  // Locked/Pinned elements (viewport-fixed)
  LOCKED_TERMINAL: 5000,
  LOCKED_CARD: 5000,
  LOCKED_MAXIMIZED: 5100,

  // Critical overlays (fullscreen, etc)
  FULLSCREEN_OVERLAY: 9000,
  FULLSCREEN_CONTENT: 9100,

  // Debug layer (highest)
  DEBUG_OVERLAY: 99999,
} as const;

export type ZIndexLayer = typeof Z_INDEX[keyof typeof Z_INDEX];

/**
 * Helper to get dynamic z-index based on focus
 */
export const getDynamicZIndex = (base: number, isFocused: boolean, offset = 100): number => {
  return isFocused ? base + offset : base;
};

/**
 * Helper to ensure z-index stays within a layer range
 */
export const clampToLayer = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};