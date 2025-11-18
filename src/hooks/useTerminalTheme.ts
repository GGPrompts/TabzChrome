import { useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { getThemeForTerminalType } from '../styles/terminal-themes';

/**
 * Hook for applying terminal theme changes.
 *
 * Handles theme application with proper refitting and refresh logic
 * for both WebGL and canvas renderers. Includes special handling for TUI tools.
 *
 * @param xtermRef - Ref to the xterm instance
 * @param fitAddonRef - Ref to the FitAddon instance
 * @param wsRef - Ref to the WebSocket connection
 * @param agentId - Terminal agent ID
 * @param terminalType - Type of terminal (for WebGL detection)
 * @param isTUITool - Whether this is a TUI tool requiring special handling
 * @param debouncedResize - Debounced resize handler function
 * @returns Function to apply a theme change
 */
export function useTerminalTheme(
  xtermRef: React.RefObject<XTerm | null>,
  fitAddonRef: React.RefObject<FitAddon | null>,
  wsRef: React.MutableRefObject<WebSocket | null>,
  agentId: string,
  terminalType: string,
  isTUITool: boolean,
  debouncedResize: (terminalId: string, cols: number, rows: number) => void
) {
  const applyTheme = useCallback((themeName: string) => {
    // Apply new theme to existing terminal
    if (xtermRef.current && fitAddonRef.current) {
      const newTheme = getThemeForTerminalType(themeName);
      xtermRef.current.options.theme = newTheme.xterm;

      // Use the resize trick for ALL terminals to force complete redraw
      // This is the most reliable way to refresh the display after theme change
      setTimeout(() => {
        if (xtermRef.current && fitAddonRef.current) {
          // First refresh the content
          xtermRef.current.refresh(0, xtermRef.current.rows - 1);

          // Then do the resize trick to force complete redraw
          setTimeout(() => {
            if (fitAddonRef.current && xtermRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              const currentCols = xtermRef.current.cols;
              const currentRows = xtermRef.current.rows;

              // Resize xterm itself to trigger complete redraw
              xtermRef.current.resize(currentCols - 1, currentRows);

              // Send resize to PTY
              wsRef.current.send(
                JSON.stringify({
                  type: "resize",
                  terminalId: agentId,
                  cols: currentCols - 1,
                  rows: currentRows,
                }),
              );

              // Wait a moment, then resize back to correct size
              setTimeout(() => {
                if (xtermRef.current && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                  xtermRef.current.resize(currentCols, currentRows);
                  wsRef.current.send(
                    JSON.stringify({
                      type: "resize",
                      terminalId: agentId,
                      cols: currentCols,
                      rows: currentRows,
                    }),
                  );
                }
              }, 100);
            }
          }, 150);
        }
      }, 50);
    }
  }, [xtermRef, fitAddonRef, wsRef, agentId, debouncedResize]);

  return applyTheme;
}
