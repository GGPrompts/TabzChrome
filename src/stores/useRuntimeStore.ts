import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface RuntimeState {
  // Active modals and their states
  activeModals: Set<string>;

  // Currently dragging/resizing items
  draggingItems: Set<string>;
  resizingItems: Set<string>;

  // Focus states
  focusedTerminalId: string | null;
  focusedCardId: string | null;
  focusedWidgetId: string | null;

  // Selection states
  selectedItems: Set<string>;
  multiSelectMode: boolean;

  // Temporary UI states
  contextMenuOpen: boolean;
  contextMenuPosition: { x: number; y: number } | null;
  tooltipVisible: boolean;
  tooltipContent: string | null;

  // Performance metrics
  fps: number;
  frameTime: number;
  memoryUsage: number | null;

  // Temporary notifications
  notifications: Array<{
    id: string;
    message: string;
    type: "info" | "success" | "warning" | "error";
    timestamp: number;
  }>;

  // Clipboard state
  clipboardContent: any | null;
  clipboardType: "terminal" | "card" | "widget" | null;

  // Undo/Redo stack (for future implementation)
  undoStack: any[];
  redoStack: any[];

  // Temporary overlays
  isLoading: boolean;
  loadingMessage: string | null;

  // Canvas interaction states
  isPanning: boolean;
  isZooming: boolean;
  spaceKeyPressed: boolean;

  // Terminal specific runtime states
  terminalOutputBuffers: Map<string, string[]>;
  terminalCommandHistory: Map<string, string[]>;

  // File browser states
  expandedDirectories: Set<string>;
  fileSearchQuery: string;

  // Temporary filters
  activeFilters: Map<string, any>;
}

interface RuntimeActions {
  // Modal management
  openModal: (modalId: string) => void;
  closeModal: (modalId: string) => void;
  isModalOpen: (modalId: string) => boolean;

  // Drag/Resize management
  setDragging: (itemId: string, isDragging: boolean) => void;
  setResizing: (itemId: string, isResizing: boolean) => void;

  // Focus management
  setFocusedTerminal: (terminalId: string | null) => void;
  setFocusedCard: (cardId: string | null) => void;
  setFocusedWidget: (widgetId: string | null) => void;

  // Selection management
  selectItem: (itemId: string) => void;
  deselectItem: (itemId: string) => void;
  clearSelection: () => void;
  toggleMultiSelect: () => void;

  // Context menu
  showContextMenu: (position: { x: number; y: number }) => void;
  hideContextMenu: () => void;

  // Notifications
  addNotification: (
    message: string,
    type: "info" | "success" | "warning" | "error",
  ) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Clipboard
  setClipboard: (content: any, type: "terminal" | "card" | "widget") => void;
  clearClipboard: () => void;

  // Loading states
  setLoading: (isLoading: boolean, message?: string) => void;

  // Canvas interactions
  setPanning: (isPanning: boolean) => void;
  setZooming: (isZooming: boolean) => void;
  setSpaceKeyPressed: (pressed: boolean) => void;

  // Terminal runtime
  appendTerminalOutput: (terminalId: string, output: string) => void;
  clearTerminalOutput: (terminalId: string) => void;
  addTerminalCommand: (terminalId: string, command: string) => void;

  // File browser
  toggleDirectory: (path: string) => void;
  setFileSearchQuery: (query: string) => void;

  // Filters
  setFilter: (key: string, value: any) => void;
  clearFilter: (key: string) => void;
  clearAllFilters: () => void;

  // Performance metrics
  updatePerformanceMetrics: (metrics: {
    fps?: number;
    frameTime?: number;
    memoryUsage?: number;
  }) => void;

  // Reset all runtime state
  resetRuntime: () => void;
}

type RuntimeStore = RuntimeState & RuntimeActions;

const defaultState: RuntimeState = {
  activeModals: new Set(),
  draggingItems: new Set(),
  resizingItems: new Set(),
  focusedTerminalId: null,
  focusedCardId: null,
  focusedWidgetId: null,
  selectedItems: new Set(),
  multiSelectMode: false,
  contextMenuOpen: false,
  contextMenuPosition: null,
  tooltipVisible: false,
  tooltipContent: null,
  fps: 60,
  frameTime: 16.67,
  memoryUsage: null,
  notifications: [],
  clipboardContent: null,
  clipboardType: null,
  undoStack: [],
  redoStack: [],
  isLoading: false,
  loadingMessage: null,
  isPanning: false,
  isZooming: false,
  spaceKeyPressed: false,
  terminalOutputBuffers: new Map(),
  terminalCommandHistory: new Map(),
  expandedDirectories: new Set(),
  fileSearchQuery: "",
  activeFilters: new Map(),
};

// Note: This store is NOT persisted - it only holds runtime state
export const useRuntimeStore = create<RuntimeStore>()(
  immer((set, get) => ({
    ...defaultState,

    // Modal management
    openModal: (modalId) =>
      set((state) => {
        state.activeModals.add(modalId);
      }),
    closeModal: (modalId) =>
      set((state) => {
        state.activeModals.delete(modalId);
      }),
    isModalOpen: (modalId) => get().activeModals.has(modalId),

    // Drag/Resize management
    setDragging: (itemId, isDragging) =>
      set((state) => {
        if (isDragging) {
          state.draggingItems.add(itemId);
        } else {
          state.draggingItems.delete(itemId);
        }
      }),
    setResizing: (itemId, isResizing) =>
      set((state) => {
        if (isResizing) {
          state.resizingItems.add(itemId);
        } else {
          state.resizingItems.delete(itemId);
        }
      }),

    // Focus management
    setFocusedTerminal: (terminalId) =>
      set((state) => {
        state.focusedTerminalId = terminalId;
        state.focusedCardId = null;
        state.focusedWidgetId = null;
      }),
    setFocusedCard: (cardId) =>
      set((state) => {
        state.focusedCardId = cardId;
        state.focusedTerminalId = null;
        state.focusedWidgetId = null;
      }),
    setFocusedWidget: (widgetId) =>
      set((state) => {
        state.focusedWidgetId = widgetId;
        state.focusedTerminalId = null;
        state.focusedCardId = null;
      }),

    // Selection management
    selectItem: (itemId) =>
      set((state) => {
        state.selectedItems.add(itemId);
      }),
    deselectItem: (itemId) =>
      set((state) => {
        state.selectedItems.delete(itemId);
      }),
    clearSelection: () =>
      set((state) => {
        state.selectedItems.clear();
      }),
    toggleMultiSelect: () =>
      set((state) => {
        state.multiSelectMode = !state.multiSelectMode;
      }),

    // Context menu
    showContextMenu: (position) =>
      set((state) => {
        state.contextMenuOpen = true;
        state.contextMenuPosition = position;
      }),
    hideContextMenu: () =>
      set((state) => {
        state.contextMenuOpen = false;
        state.contextMenuPosition = null;
      }),

    // Notifications
    addNotification: (message, type) =>
      set((state) => {
        const notification = {
          id: Date.now().toString(),
          message,
          type,
          timestamp: Date.now(),
        };
        state.notifications.push(notification);

        // Auto-remove after 5 seconds
        setTimeout(() => {
          get().removeNotification(notification.id);
        }, 5000);
      }),
    removeNotification: (id) =>
      set((state) => {
        state.notifications = state.notifications.filter((n) => n.id !== id);
      }),
    clearNotifications: () =>
      set((state) => {
        state.notifications = [];
      }),

    // Clipboard
    setClipboard: (content, type) =>
      set((state) => {
        state.clipboardContent = content;
        state.clipboardType = type;
      }),
    clearClipboard: () =>
      set((state) => {
        state.clipboardContent = null;
        state.clipboardType = null;
      }),

    // Loading states
    setLoading: (isLoading, message) =>
      set((state) => {
        state.isLoading = isLoading;
        state.loadingMessage = message || null;
      }),

    // Canvas interactions
    setPanning: (isPanning) =>
      set((state) => {
        state.isPanning = isPanning;
      }),
    setZooming: (isZooming) =>
      set((state) => {
        state.isZooming = isZooming;
      }),
    setSpaceKeyPressed: (pressed) =>
      set((state) => {
        state.spaceKeyPressed = pressed;
      }),

    // Terminal runtime
    appendTerminalOutput: (terminalId, output) =>
      set((state) => {
        const buffer = state.terminalOutputBuffers.get(terminalId) || [];
        buffer.push(output);
        // Keep only last 1000 lines
        if (buffer.length > 1000) {
          buffer.shift();
        }
        state.terminalOutputBuffers.set(terminalId, buffer);
      }),
    clearTerminalOutput: (terminalId) =>
      set((state) => {
        state.terminalOutputBuffers.delete(terminalId);
      }),
    addTerminalCommand: (terminalId, command) =>
      set((state) => {
        const history = state.terminalCommandHistory.get(terminalId) || [];
        history.push(command);
        // Keep only last 100 commands
        if (history.length > 100) {
          history.shift();
        }
        state.terminalCommandHistory.set(terminalId, history);
      }),

    // File browser
    toggleDirectory: (path) =>
      set((state) => {
        if (state.expandedDirectories.has(path)) {
          state.expandedDirectories.delete(path);
        } else {
          state.expandedDirectories.add(path);
        }
      }),
    setFileSearchQuery: (query) =>
      set((state) => {
        state.fileSearchQuery = query;
      }),

    // Filters
    setFilter: (key, value) =>
      set((state) => {
        state.activeFilters.set(key, value);
      }),
    clearFilter: (key) =>
      set((state) => {
        state.activeFilters.delete(key);
      }),
    clearAllFilters: () =>
      set((state) => {
        state.activeFilters.clear();
      }),

    // Performance metrics
    updatePerformanceMetrics: (metrics) =>
      set((state) => {
        if (metrics.fps !== undefined) state.fps = metrics.fps;
        if (metrics.frameTime !== undefined)
          state.frameTime = metrics.frameTime;
        if (metrics.memoryUsage !== undefined)
          state.memoryUsage = metrics.memoryUsage;
      }),

    // Reset all runtime state
    resetRuntime: () => set(() => defaultState),
  })),
);
