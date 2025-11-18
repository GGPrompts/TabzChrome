import { useRef, useCallback } from 'react';

/**
 * Shared state for tracking tmux session dimensions across all terminals.
 * This ensures all panes in a tmux session report the same dimensions.
 */
const tmuxSessionDimensions = new Map<string, { rows: number; cols: number; fontFamily: string; fontSize: number }>();

/**
 * Hook for managing tmux session dimension coordination.
 *
 * When multiple panes share a tmux session, they must all report the same dimensions
 * to avoid corruption. This hook tracks dimensions per session and provides functions
 * to check/normalize fonts.
 *
 * @param sessionName - Tmux session name (if applicable)
 * @param isTmuxSession - Whether this terminal is in a tmux session
 * @returns Object with checkDimensions and registerDimensions functions
 */
export function useTmuxSessionDimensions(
  sessionName: string | undefined,
  isTmuxSession: boolean
) {
  const hasRegistered = useRef(false);

  /**
   * Register this terminal's dimensions as the reference for the session.
   * The first pane to register becomes the reference for all others.
   */
  const registerDimensions = useCallback((
    rows: number,
    cols: number,
    fontFamily: string,
    fontSize: number
  ) => {
    if (!isTmuxSession || !sessionName || hasRegistered.current) return;

    // Only register if this is the first pane in the session
    if (!tmuxSessionDimensions.has(sessionName)) {
      tmuxSessionDimensions.set(sessionName, { rows, cols, fontFamily, fontSize });
      hasRegistered.current = true;
      console.log(`[TmuxDimensions] Registered reference for session ${sessionName}: ${cols}x${rows}, font: ${fontFamily} ${fontSize}px`);
    }
  }, [isTmuxSession, sessionName]);

  /**
   * Get reference dimensions for the session without registering.
   * Used during initialization to check if we need to normalize font.
   */
  const getReference = useCallback((): { rows: number; cols: number; fontFamily: string; fontSize: number } | null => {
    if (!isTmuxSession || !sessionName) return null;
    return tmuxSessionDimensions.get(sessionName) || null;
  }, [isTmuxSession, sessionName]);

  /**
   * Check if current dimensions match the session reference.
   * Returns the reference dimensions if they differ, null if they match.
   * Note: This does NOT auto-register if no reference exists (use registerDimensions instead)
   */
  const checkDimensions = useCallback((
    currentRows: number,
    currentCols: number,
    currentFontFamily: string,
    currentFontSize: number
  ): { rows: number; cols: number; fontFamily: string; fontSize: number } | null => {
    if (!isTmuxSession || !sessionName) return null;

    const reference = tmuxSessionDimensions.get(sessionName);
    if (!reference) {
      // No reference yet - caller should use registerDimensions
      return null;
    }

    // Check if dimensions differ
    if (currentRows !== reference.rows || currentCols !== reference.cols) {
      console.warn(`[TmuxDimensions] Dimension mismatch for session ${sessionName}!`);
      console.warn(`  Current: ${currentCols}x${currentRows} (${currentFontFamily} ${currentFontSize}px)`);
      console.warn(`  Reference: ${reference.cols}x${reference.rows} (${reference.fontFamily} ${reference.fontSize}px)`);
      console.warn(`  → Will normalize to reference font to prevent tmux corruption`);
      return reference;
    }

    return null;
  }, [isTmuxSession, sessionName]);

  /**
   * Clear reference dimensions for a session (e.g., when all panes closed)
   */
  const clearSession = useCallback(() => {
    if (sessionName) {
      tmuxSessionDimensions.delete(sessionName);
      hasRegistered.current = false;
      console.log(`[TmuxDimensions] Cleared reference for session ${sessionName}`);
    }
  }, [sessionName]);

  return {
    getReference,
    registerDimensions,
    checkDimensions,
    clearSession,
  };
}
