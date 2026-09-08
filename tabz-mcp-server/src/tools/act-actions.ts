/** Canonical compact action names. The extension handles PAGE_ACT_ACTIONS. */
export const PAGE_ACT_ACTIONS = [
  "click", "right_click", "double_click", "triple_click", "hover",
  "type", "key", "scroll", "scroll_to", "drag"
] as const;

export const ACT_ACTIONS = [...PAGE_ACT_ACTIONS, "screenshot", "zoom", "wait"] as const;

export type PageActAction = typeof PAGE_ACT_ACTIONS[number];
export type ActAction = typeof ACT_ACTIONS[number];
