import React, { useState, useEffect, useRef, memo } from 'react';
import { ResizableBox } from 'react-resizable';
import 'react-resizable/css/styles.css';
import './SplitLayout.css';
import { Terminal } from './Terminal';
import { Terminal as StoredTerminal } from '../stores/simpleTerminalStore';
import { Agent } from '../types';
import { useSimpleTerminalStore } from '../stores/simpleTerminalStore';
import { useSettingsStore } from '../stores/useSettingsStore';
import { THEME_BACKGROUNDS } from '../constants/terminalConfig';

interface SplitLayoutProps {
  terminal: StoredTerminal;
  terminals: StoredTerminal[];
  agents: Agent[];
  onClose: (terminalId: string) => void;
  onPopOut: (terminalId: string) => void;
  onCommand: (cmd: string, terminalId: string) => void;
  wsRef: React.RefObject<WebSocket | null>;
  terminalRef?: React.RefObject<any>;
  activeTerminalId: string | null;
}

const SplitLayoutComponent: React.FC<SplitLayoutProps> = ({
  terminal,
  terminals,
  agents,
  onClose,
  onPopOut,
  onCommand,
  wsRef,
  terminalRef,
  activeTerminalId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const { updateTerminal, focusedTerminalId, setFocusedTerminal, removeTerminal } = useSimpleTerminalStore();

  // Track drag width for smooth dragging (only update expensive operations on drag end)
  const [verticalDragWidth, setVerticalDragWidth] = useState<number | null>(null);
  const [horizontalDragHeight, setHorizontalDragHeight] = useState<number | null>(null);

  // Debounce terminal refit events to prevent excessive re-renders during drag
  const refitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerTerminalRefit = (terminalIds: string[]) => {
    if (refitTimeoutRef.current) {
      clearTimeout(refitTimeoutRef.current);
    }
    refitTimeoutRef.current = setTimeout(() => {
      // Dispatch CustomEvent with terminal IDs to only refit terminals in this split
      window.dispatchEvent(new CustomEvent('terminal-container-resized', {
        detail: { terminalIds }
      }));
    }, 100); // Wait 100ms after last resize before refitting
  };

  // Handle closing a pane in a split
  const handleClosePane = (paneTerminalId: string) => {
    if (!splitLayout || splitLayout.type === 'single') return;

    const remainingPanes = splitLayout.panes.filter(p => p.terminalId !== paneTerminalId);

    if (remainingPanes.length === 1) {
      // Only 1 pane left - convert to single terminal
      console.log('[SplitLayout] Only 1 pane remaining after close, converting to single terminal');
      updateTerminal(terminal.id, {
        splitLayout: { type: 'single', panes: [] }
      });
    } else if (remainingPanes.length > 1) {
      // Still have multiple panes
      updateTerminal(terminal.id, {
        splitLayout: {
          ...splitLayout,
          panes: remainingPanes
        }
      });
    }

    // Close the pane's terminal (will trigger backend cleanup)
    onClose(paneTerminalId);
  };

  const { splitLayout } = terminal;

  // Debug: Log split layout when rendering (REMOVED - was causing spam)
  // Performance: This was logging on every render, causing console spam during resize
  // if (splitLayout && splitLayout.type !== 'single') {
  //   console.log('[SplitLayout] Rendering split:', {...});
  // }

  // Measure container dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
        setContainerHeight(containerRef.current.offsetHeight);
      }
    };

    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      // Clean up any pending refit timeout
      if (refitTimeoutRef.current) {
        clearTimeout(refitTimeoutRef.current);
      }
    };
  }, []);

  // If no split layout or single terminal, render simple Terminal component
  if (!splitLayout || splitLayout.type === 'single') {
    const agent = agents.find(a => a.id === terminal.agentId);
    if (!agent) return null;

    return (
      <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
        <Terminal
          key={`term-${terminal.id}`}
          ref={terminal.id === activeTerminalId ? terminalRef : null}
          agent={agent}
          onClose={() => onClose(terminal.id)}
          onCommand={(cmd) => onCommand(cmd, terminal.id)}
          wsRef={wsRef}
          embedded={true}
          initialTheme={terminal.theme}
          initialBackground={terminal.background || THEME_BACKGROUNDS[terminal.theme || 'default'] || 'dark-neutral'}
          initialOpacity={terminal.transparency !== undefined ? terminal.transparency / 100 : 1}
          initialFontSize={terminal.fontSize}
          initialFontFamily={terminal.fontFamily}
          isSelected={terminal.id === activeTerminalId}
        />
      </div>
    );
  }

  // Vertical split (left/right)
  if (splitLayout.type === 'vertical') {
    const leftPane = splitLayout.panes.find(p => p.position === 'left');
    const rightPane = splitLayout.panes.find(p => p.position === 'right');

    if (!leftPane || !rightPane) {
      console.warn('[SplitLayout] Missing panes in vertical split:', { leftPane, rightPane });
      return null;
    }

    const leftTerminal = terminals.find(t => t.id === leftPane.terminalId);
    const rightTerminal = terminals.find(t => t.id === rightPane.terminalId);
    const leftAgent = leftTerminal?.agentId ? agents.find(a => a.id === leftTerminal.agentId) : null;
    const rightAgent = rightTerminal?.agentId ? agents.find(a => a.id === rightTerminal.agentId) : null;

    // If terminals don't exist at all, something is wrong - return null
    if (!leftTerminal || !rightTerminal) {
      console.error('[SplitLayout] Pane terminals not found in store!', {
        leftPane: leftPane.terminalId.slice(-8),
        rightPane: rightPane.terminalId.slice(-8),
        leftTerminal: !!leftTerminal,
        rightTerminal: !!rightTerminal,
        allTerminalIds: terminals.map(t => t.id.slice(-8))
      });
      return null;
    }

    // If agents aren't connected yet, show loading state (race condition during reconnection)
    if (!leftAgent || !rightAgent) {
      console.warn('[SplitLayout] Waiting for agents in vertical split:', {
        leftPane: leftPane.terminalId.slice(-8),
        rightPane: rightPane.terminalId.slice(-8),
        leftTerminal: leftTerminal.name,
        rightTerminal: rightTerminal.name,
        leftAgent: !!leftAgent,
        rightAgent: !!rightAgent,
        leftAgentId: leftTerminal.agentId?.slice(-8),
        rightAgentId: rightTerminal.agentId?.slice(-8),
        availableAgents: agents.map(a => a.id.slice(-8))
      });

      // Show loading state for the split (instead of hiding it completely)
      return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner"></div>
            <div style={{ marginTop: '10px', color: '#888' }}>
              Connecting split panes...
            </div>
          </div>
        </div>
      );
    }

    // Wait for container to have valid dimensions before rendering split
    // (prevents xterm from initializing with width/height 0)
    if (containerWidth === 0 || containerHeight === 0) {
      return <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>;
    }

    const leftWidth = (leftPane.size / 100) * containerWidth;

    return (
      <div ref={containerRef} className="split-layout-container split-vertical">
        <ResizableBox
          width={verticalDragWidth ?? (leftWidth || containerWidth * 0.5)}
          height={containerHeight}
          axis="x"
          minConstraints={[200, containerHeight]}
          maxConstraints={[containerWidth - 200, containerHeight]}
          onResize={(e, data) => {
            // Update visual width during drag (smooth, no state updates)
            setVerticalDragWidth(data.size.width);
          }}
          onResizeStop={(e, data) => {
            // Clear drag width
            setVerticalDragWidth(null);

            const newSize = (data.size.width / containerWidth) * 100;
            updateTerminal(terminal.id, {
              splitLayout: {
                ...splitLayout,
                panes: splitLayout.panes.map(p =>
                  p.position === 'left' ? { ...p, size: newSize } :
                  p.position === 'right' ? { ...p, size: 100 - newSize } : p
                ),
              },
            });

            // Refit only terminals in this split (not all terminals globally)
            triggerTerminalRefit([leftTerminal.id, rightTerminal.id]);
          }}
          resizeHandles={['e']}
          className={`split-pane split-pane-left ${leftTerminal.id === focusedTerminalId ? 'focused' : ''}`}
          onClick={() => setFocusedTerminal(leftTerminal.id)}
        >
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div style={{ width: '100%', height: '100%' }}>
              <Terminal
                key={`term-${leftTerminal.id}`}
                ref={leftTerminal.id === focusedTerminalId ? terminalRef : null}
                agent={leftAgent}
                onClose={() => onClose(leftTerminal.id)}
                onCommand={(cmd) => onCommand(cmd, leftTerminal.id)}
                wsRef={wsRef}
                embedded={true}
                initialTheme={leftTerminal.theme}
                initialBackground={leftTerminal.background || THEME_BACKGROUNDS[leftTerminal.theme || 'default'] || 'dark-neutral'}
                initialOpacity={leftTerminal.transparency !== undefined ? leftTerminal.transparency / 100 : 1}
                initialFontSize={leftTerminal.fontSize}
                initialFontFamily={leftTerminal.fontFamily}
                isSelected={leftTerminal.id === activeTerminalId}
              />
            </div>
          </div>
        </ResizableBox>

        <div
          className={`split-pane split-pane-right ${rightTerminal.id === focusedTerminalId ? 'focused' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setFocusedTerminal(rightTerminal.id)}
        >
          <Terminal
            key={`term-${rightTerminal.id}`}
            ref={rightTerminal.id === focusedTerminalId ? terminalRef : null}
            agent={rightAgent}
            onClose={() => onClose(rightTerminal.id)}
            onCommand={(cmd) => onCommand(cmd, rightTerminal.id)}
            wsRef={wsRef}
            embedded={true}
            initialTheme={rightTerminal.theme}
            initialBackground={rightTerminal.background || THEME_BACKGROUNDS[rightTerminal.theme || 'default'] || 'dark-neutral'}
            initialOpacity={rightTerminal.transparency !== undefined ? rightTerminal.transparency / 100 : 1}
            initialFontSize={rightTerminal.fontSize}
            initialFontFamily={rightTerminal.fontFamily}
            isSelected={rightTerminal.id === activeTerminalId}
          />
        </div>
      </div>
    );
  }

  // Horizontal split (top/bottom)
  if (splitLayout.type === 'horizontal') {
    const topPane = splitLayout.panes.find(p => p.position === 'top');
    const bottomPane = splitLayout.panes.find(p => p.position === 'bottom');

    if (!topPane || !bottomPane) {
      console.warn('[SplitLayout] Missing panes in horizontal split:', { topPane, bottomPane });
      return null;
    }

    const topTerminal = terminals.find(t => t.id === topPane.terminalId);
    const bottomTerminal = terminals.find(t => t.id === bottomPane.terminalId);
    const topAgent = topTerminal?.agentId ? agents.find(a => a.id === topTerminal.agentId) : null;
    const bottomAgent = bottomTerminal?.agentId ? agents.find(a => a.id === bottomTerminal.agentId) : null;

    // If terminals don't exist at all, something is wrong - return null
    if (!topTerminal || !bottomTerminal) {
      console.error('[SplitLayout] Pane terminals not found in store!', {
        topPane: topPane.terminalId.slice(-8),
        bottomPane: bottomPane.terminalId.slice(-8),
        topTerminal: !!topTerminal,
        bottomTerminal: !!bottomTerminal,
        allTerminalIds: terminals.map(t => t.id.slice(-8))
      });
      return null;
    }

    // If agents aren't connected yet, show loading state (race condition during reconnection)
    if (!topAgent || !bottomAgent) {
      console.warn('[SplitLayout] Waiting for agents in horizontal split:', {
        topPane: topPane.terminalId.slice(-8),
        bottomPane: bottomPane.terminalId.slice(-8),
        topTerminal: topTerminal.name,
        bottomTerminal: bottomTerminal.name,
        topAgent: !!topAgent,
        bottomAgent: !!bottomAgent,
        topAgentId: topTerminal.agentId?.slice(-8),
        bottomAgentId: bottomTerminal.agentId?.slice(-8),
        availableAgents: agents.map(a => a.id.slice(-8))
      });

      // Show loading state for the split (instead of hiding it completely)
      return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <div className="loading-spinner"></div>
            <div style={{ marginTop: '10px', color: '#888' }}>
              Connecting split panes...
            </div>
          </div>
        </div>
      );
    }

    // Wait for container to have valid dimensions before rendering split
    // (prevents xterm from initializing with height 0)
    if (containerHeight === 0) {
      return <div ref={containerRef} style={{ width: '100%', height: '100%' }}></div>;
    }

    const topHeight = (topPane.size / 100) * containerHeight;

    return (
      <div ref={containerRef} className="split-layout-container split-horizontal">
        <ResizableBox
          width={containerWidth}
          height={horizontalDragHeight ?? (topHeight || containerHeight * 0.5)}
          axis="y"
          minConstraints={[containerWidth, 200]}
          maxConstraints={[containerWidth, containerHeight - 200]}
          onResize={(e, data) => {
            // Update visual height during drag (smooth, no state updates)
            setHorizontalDragHeight(data.size.height);
          }}
          onResizeStop={(e, data) => {
            // Clear drag height
            setHorizontalDragHeight(null);

            const newSize = (data.size.height / containerHeight) * 100;
            updateTerminal(terminal.id, {
              splitLayout: {
                ...splitLayout,
                panes: splitLayout.panes.map(p =>
                  p.position === 'top' ? { ...p, size: newSize } :
                  p.position === 'bottom' ? { ...p, size: 100 - newSize } : p
                ),
              },
            });

            // Refit only terminals in this split (not all terminals globally)
            triggerTerminalRefit([topTerminal.id, bottomTerminal.id]);
          }}
          resizeHandles={['s']}
          className={`split-pane split-pane-top ${topTerminal.id === focusedTerminalId ? 'focused' : ''}`}
          onClick={() => setFocusedTerminal(topTerminal.id)}
        >
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <div style={{ width: '100%', height: '100%' }}>
              <Terminal
                key={`term-${topTerminal.id}`}
                ref={topTerminal.id === focusedTerminalId ? terminalRef : null}
                agent={topAgent}
                onClose={() => onClose(topTerminal.id)}
                onCommand={(cmd) => onCommand(cmd, topTerminal.id)}
                wsRef={wsRef}
                embedded={true}
                initialTheme={topTerminal.theme}
                initialBackground={topTerminal.background || THEME_BACKGROUNDS[topTerminal.theme || 'default'] || 'dark-neutral'}
                initialOpacity={topTerminal.transparency !== undefined ? topTerminal.transparency / 100 : 1}
                initialFontSize={topTerminal.fontSize}
                initialFontFamily={topTerminal.fontFamily}
                isSelected={topTerminal.id === activeTerminalId}
              />
            </div>
          </div>
        </ResizableBox>

        <div
          className={`split-pane split-pane-bottom ${bottomTerminal.id === focusedTerminalId ? 'focused' : ''}`}
          style={{ flex: 1 }}
          onClick={() => setFocusedTerminal(bottomTerminal.id)}
        >
          <Terminal
            key={`term-${bottomTerminal.id}`}
            ref={bottomTerminal.id === focusedTerminalId ? terminalRef : null}
            agent={bottomAgent}
            onClose={() => onClose(bottomTerminal.id)}
            onCommand={(cmd) => onCommand(cmd, bottomTerminal.id)}
            wsRef={wsRef}
            embedded={true}
            initialTheme={bottomTerminal.theme}
            initialBackground={bottomTerminal.background || THEME_BACKGROUNDS[bottomTerminal.theme || 'default'] || 'dark-neutral'}
            initialOpacity={bottomTerminal.transparency !== undefined ? bottomTerminal.transparency / 100 : 1}
            initialFontSize={bottomTerminal.fontSize}
            initialFontFamily={bottomTerminal.fontFamily}
            isSelected={bottomTerminal.id === activeTerminalId}
          />
        </div>
      </div>
    );
  }

  return null;
};

// Memoize component to prevent re-renders when props haven't changed
// This is critical for performance during resize operations
export const SplitLayout = memo(SplitLayoutComponent, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.terminal.id === nextProps.terminal.id &&
    prevProps.terminal.splitLayout?.type === nextProps.terminal.splitLayout?.type &&
    prevProps.activeTerminalId === nextProps.activeTerminalId &&
    prevProps.terminals.length === nextProps.terminals.length &&
    prevProps.agents.length === nextProps.agents.length &&
    // Check if the relevant pane terminals have changed
    JSON.stringify(prevProps.terminal.splitLayout?.panes) === JSON.stringify(nextProps.terminal.splitLayout?.panes)
  );
});
