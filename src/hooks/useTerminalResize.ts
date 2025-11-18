import { useEffect, useCallback, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

/**
 * Hook for handling terminal resize operations.
 *
 * Manages window resize events, ResizeObserver for container changes,
 * and provides a manual refit function. Sends resize events to backend via WebSocket.
 *
 * @param terminalRef - Ref to the terminal container element
 * @param xtermRef - Ref to the xterm instance
 * @param fitAddonRef - Ref to the FitAddon instance
 * @param wsRef - Ref to the WebSocket connection
 * @param agentId - Terminal agent ID
 * @param agentName - Terminal agent name (for PyRadio special handling)
 * @param debouncedResize - Debounced resize handler function
 * @param mountKey - Key that changes when portal host changes (triggers re-attach)
 * @returns Object with refit function
 */
export function useTerminalResize(
  terminalRef: React.RefObject<HTMLDivElement | null>,
  xtermRef: React.RefObject<XTerm | null>,
  fitAddonRef: React.RefObject<FitAddon | null>,
  wsRef: React.MutableRefObject<WebSocket | null>,
  agentId: string,
  agentName: string | undefined,
  debouncedResize: (terminalId: string, cols: number, rows: number) => void,
  mountKey?: string
) {
  const roRef = useRef<ResizeObserver | null>(null);

  /**
   * Handle window resize and send dimensions to backend
   */
  const handleResize = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current) {
      fitAddonRef.current.fit();

      // Send resize dimensions to backend
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "resize",
            terminalId: agentId,
            cols: xtermRef.current.cols,
            rows: xtermRef.current.rows,
          }),
        );

        // Special handling for PyRadio - send Ctrl+L to force refresh
        if (agentName?.toLowerCase().includes('pyradio')) {
          setTimeout(() => {
            // Send Ctrl+L to refresh PyRadio display
            wsRef.current?.send(
              JSON.stringify({
                type: "command",
                terminalId: agentId,
                command: "\x0C", // Ctrl+L character
              }),
            );
          }, 100);
        }
      }
    }
  }, [fitAddonRef, xtermRef, wsRef, agentId, agentName]);

  /**
   * Set up window resize listener
   */
  useEffect(() => {
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  /**
   * Set up ResizeObserver for container size changes (drag/resize)
   * CRITICAL: Must re-run when xtermRef becomes available (terminal initialization)
   */
  useEffect(() => {
    // Wait for both terminal ref and xterm instance to be available
    if (!terminalRef.current?.parentElement || !xtermRef.current || !fitAddonRef.current) {
      return;
    }

    roRef.current = new ResizeObserver((entries) => {
      if (fitAddonRef.current && xtermRef.current) {
        // Get the actual dimensions from the resize entry
        const entry = entries[0];
        if (
          entry &&
          entry.contentRect.width > 0 &&
          entry.contentRect.height > 0
        ) {
          try {
            fitAddonRef.current.fit();
            // Use debounced resize handler
            debouncedResize(
              agentId,
              xtermRef.current.cols,
              xtermRef.current.rows,
            );
          } catch {}
        }
      }
    });

    roRef.current.observe(terminalRef.current.parentElement);

    return () => {
      try {
        roRef.current?.disconnect();
      } catch {}
      roRef.current = null;
    };
  }, [agentId, debouncedResize, xtermRef.current, fitAddonRef.current]); // Re-run when terminal initializes

  /**
   * Re-attach ResizeObserver when portal host changes (dock <-> canvas)
   */
  useEffect(() => {
    // Only run if the terminal is initialized
    if (!terminalRef.current || !xtermRef.current || !fitAddonRef.current)
      return;

    // Re-attach ResizeObserver to the new parent element
    try {
      roRef.current?.disconnect();
    } catch {}
    roRef.current = null;

    const parent = terminalRef.current?.parentElement;
    if (parent) {
      try {
        roRef.current = new ResizeObserver(() => {
          try {
            fitAddonRef.current?.fit();
            if (xtermRef.current) {
              // Use debounced resize handler
              debouncedResize(
                agentId,
                xtermRef.current.cols,
                xtermRef.current.rows,
              );
            }
          } catch {}
        });
        roRef.current.observe(parent);
      } catch {}
    }

    // After reparenting, ensure container has size before fit/focus
    let attempts = 0;
    const tryFit = () => {
      attempts++;
      const parentEl = terminalRef.current?.parentElement;
      const ready =
        !!parentEl && parentEl.clientWidth > 0 && parentEl.clientHeight > 0;
      if (!ready && attempts < 10) {
        return setTimeout(tryFit, 40);
      }
      try {
        fitAddonRef.current?.fit();
        xtermRef.current?.refresh(0, xtermRef.current.rows - 1);
        // Always restore focus after a reparent so typing works
        xtermRef.current?.focus();
        const ta = terminalRef.current?.querySelector(
          ".xterm-helper-textarea",
        ) as HTMLTextAreaElement | null;
        ta?.focus();
        if (
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN &&
          xtermRef.current
        ) {
          wsRef.current.send(
            JSON.stringify({
              type: "resize",
              terminalId: agentId,
              cols: xtermRef.current.cols,
              rows: xtermRef.current.rows,
            }),
          );
        }
      } catch {}
    };
    setTimeout(tryFit, 50);
  }, [mountKey, agentId]);

  /**
   * Hot Refresh Recovery: Force a fit after mount to handle HMR scenarios
   */
  useEffect(() => {
    if (!xtermRef.current || !fitAddonRef.current) return;

    // Wait for DOM to settle after hot refresh
    const timer = setTimeout(() => {
      try {
        const parent = terminalRef.current?.parentElement;
        if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
          fitAddonRef.current?.fit();
          xtermRef.current?.refresh(0, xtermRef.current.rows - 1);

          // Send resize to backend
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && xtermRef.current) {
            wsRef.current.send(
              JSON.stringify({
                type: "resize",
                terminalId: agentId,
                cols: xtermRef.current.cols,
                rows: xtermRef.current.rows,
              }),
            );
          }
        }
      } catch (err) {
        console.debug('[Terminal] Hot refresh fit error:', err);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []); // Empty deps - only run once after mount

  /**
   * Listen for custom container resize events from split panes
   */
  useEffect(() => {
    const handleContainerResized = (e: Event) => {
      // Check if this event is for this specific terminal
      const customEvent = e as CustomEvent;
      const terminalIds = customEvent.detail?.terminalIds as string[] | undefined;

      // If terminalIds specified, only refit if this terminal is in the list
      if (terminalIds && !terminalIds.includes(agentId)) {
        return; // Not for this terminal
      }

      if (fitAddonRef.current) {
        // Small timeout allows DOM layout to settle
        requestAnimationFrame(() => {
          try {
            fitAddonRef.current!.fit();

            // After a fit, send exact cols/rows to backend so PTY wraps correctly
            if (
              wsRef.current &&
              wsRef.current.readyState === WebSocket.OPEN &&
              xtermRef.current
            ) {
              wsRef.current.send(
                JSON.stringify({
                  type: "resize",
                  terminalId: agentId,
                  cols: xtermRef.current.cols,
                  rows: xtermRef.current.rows,
                }),
              );
            }
          } catch (err) {
            console.error('[Terminal] Resize error:', err);
          }
        });
      }
    };

    window.addEventListener(
      "terminal-container-resized",
      handleContainerResized as EventListener,
    );

    return () => {
      window.removeEventListener(
        "terminal-container-resized",
        handleContainerResized as EventListener,
      );
    };
  }, [agentId]);

  return { handleResize };
}
