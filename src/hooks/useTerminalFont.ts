import { useCallback, useEffect } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

/**
 * Hook for managing terminal font customization.
 *
 * Provides functions to update font size and font family with proper
 * refitting and PTY dimension synchronization.
 *
 * @param xtermRef - Ref to the xterm instance
 * @param fitAddonRef - Ref to the FitAddon instance
 * @param agentId - Terminal agent ID
 * @param initialFontSize - Initial font size (if set, ignores global changes)
 * @param debouncedResize - Debounced resize handler function
 * @returns Object with updateFontSize and updateFontFamily functions
 */
export function useTerminalFont(
  xtermRef: React.RefObject<XTerm | null>,
  fitAddonRef: React.RefObject<FitAddon | null>,
  agentId: string,
  initialFontSize: number | undefined,
  debouncedResize: (terminalId: string, cols: number, rows: number) => void
) {
  /**
   * Update font size and refit terminal
   */
  const updateFontSize = useCallback((newFontSize: number) => {
    if (xtermRef.current) {
      xtermRef.current.options.fontSize = newFontSize;
      // NOTE: Footer font controls should NOT update global default
      // Global default is only changed via ⚙️ spawn options manager
      // Refit terminal after font size change and send new dimensions to backend
      setTimeout(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit();

          // Use the debounced resize handler to send new dimensions to backend PTY
          // This prevents corrupted text when font size changes
          debouncedResize(
            agentId,
            xtermRef.current.cols,
            xtermRef.current.rows,
          );
        }
      }, 100);
    }
  }, [xtermRef, fitAddonRef, agentId, debouncedResize]);

  /**
   * Update font family and force complete redraw
   */
  const updateFontFamily = useCallback((newFontFamily: string) => {
    if (xtermRef.current && fitAddonRef.current) {
      console.log('[Terminal] updateFontFamily called with:', newFontFamily);
      console.log('[Terminal] Current font:', xtermRef.current.options.fontFamily);

      // Store current scroll position
      const currentScrollPos = xtermRef.current.buffer.active.viewportY;

      xtermRef.current.options.fontFamily = newFontFamily;
      console.log('[Terminal] Set new font:', xtermRef.current.options.fontFamily);

      // Force complete redraw by clearing renderer cache
      // This is necessary because the canvas renderer caches glyphs
      setTimeout(() => {
        if (xtermRef.current && fitAddonRef.current) {
          console.log('[Terminal] Clearing and refitting after font change');

          // Clear the screen (forces renderer to redraw everything)
          xtermRef.current.clear();

          // Restore viewport position
          xtermRef.current.scrollToLine(currentScrollPos);

          // Full refresh
          xtermRef.current.refresh(0, xtermRef.current.rows - 1);

          // Refit
          fitAddonRef.current.fit();

          // Send new dimensions to backend PTY
          debouncedResize(
            agentId,
            xtermRef.current.cols,
            xtermRef.current.rows,
          );

          console.log('[Terminal] Font change complete');
        }
      }, 100);
    }
  }, [xtermRef, fitAddonRef, agentId, debouncedResize]);

  /**
   * Listen for global font size changes (only if no initialFontSize is set)
   */
  useEffect(() => {
    const handleFontSizeChange = (event: CustomEvent) => {
      // If this terminal has a specific font size, ignore global changes
      if (initialFontSize) return;

      const newSize = event.detail.fontSize;
      if (xtermRef.current && newSize) {
        xtermRef.current.options.fontSize = newSize;
        // Refit terminal after font size change
        setTimeout(() => {
          if (fitAddonRef.current) {
            fitAddonRef.current.fit();
          }
        }, 100);
      }
    };

    window.addEventListener(
      "terminalFontSizeChange",
      handleFontSizeChange as any,
    );

    return () => {
      window.removeEventListener(
        "terminalFontSizeChange",
        handleFontSizeChange as any,
      );
    };
  }, [xtermRef, fitAddonRef, initialFontSize]);

  return { updateFontSize, updateFontFamily };
}
