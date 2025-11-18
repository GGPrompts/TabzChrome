import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { terminalThemes } from "../styles/terminal-themes";

interface ThemeDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: string;
  currentOpacity?: number;
  currentFontSize?: number;
  currentFontFamily?: string;
  onThemeSelect: (theme: string) => void;
  onOpacityChange?: (opacity: number) => void;
  onFontSizeChange?: (fontSize: number) => void;
  onFontSizeReset?: () => void;
  onFontFamilyChange?: (fontFamily: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement>;
}

export const ThemeDropdown: React.FC<ThemeDropdownProps> = ({
  isOpen,
  onClose,
  currentTheme,
  currentOpacity = 0.2,
  currentFontSize = 14,
  currentFontFamily = "monospace",
  onThemeSelect,
  onOpacityChange,
  onFontSizeChange,
  onFontSizeReset,
  onFontFamilyChange,
  buttonRef,
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = React.useState(currentOpacity);
  const [fontSize, setFontSize] = React.useState(currentFontSize);
  const [fontFamily, setFontFamily] = React.useState(currentFontFamily);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, buttonRef]);

  if (!isOpen || !buttonRef.current) return null;

  // Calculate position based on button location
  const rect = buttonRef.current.getBoundingClientRect();
  const dropdownStyle: React.CSSProperties = {
    position: "fixed",
    top: rect.bottom + 8,
    right: window.innerWidth - rect.right,
    zIndex: 999999,
  };

  return ReactDOM.createPortal(
    <div ref={dropdownRef} className="theme-dropdown" style={dropdownStyle}>
      <div className="theme-dropdown-header">Select Theme</div>
      {/* Transparency Slider */}
      <div className="theme-transparency-control">
        <label className="transparency-label">
          <span>Transparency</span>
          <span className="transparency-value">
            {Math.round((1 - opacity) * 100)}%
          </span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={opacity}
          onChange={(e) => {
            const newOpacity = parseFloat(e.target.value);
            setOpacity(newOpacity);
            onOpacityChange?.(newOpacity);
          }}
          className="transparency-slider"
        />
        <div className="transparency-preview">
          <div
            className="preview-box"
            style={{
              background: `rgba(0, 0, 0, ${opacity})`,
              border: "1px solid rgba(255, 255, 255, 0.2)",
            }}
          >
            <span style={{ color: "#00ff88" }}>Preview</span>
          </div>
        </div>
      </div>

      {/* Font Size Slider */}
      <div className="theme-fontsize-control">
        <label className="fontsize-label">
          <span>Font Size</span>
          <span className="fontsize-value">{fontSize}px</span>
        </label>
        <input
          type="range"
          min="10"
          max="24"
          step="1"
          value={fontSize}
          onChange={(e) => {
            const newSize = parseInt(e.target.value);
            setFontSize(newSize);
            onFontSizeChange?.(newSize);
          }}
          className="fontsize-slider"
        />
        <div className="fontsize-preview">
          <div
            className="preview-box"
            style={{
              background: `rgba(0, 0, 0, ${opacity})`,
              border: "1px solid rgba(255, 255, 255, 0.2)",
              fontSize: `${fontSize}px`,
              fontFamily: "monospace",
            }}
          >
            <span style={{ color: "#00ff88" }}>Sample Text</span>
          </div>
        </div>
        {onFontSizeReset && (
          <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={() => {
                onFontSizeReset?.();
                setFontSize(currentFontSize);
              }}
              className="fontsize-reset-btn"
              style={{
                background: "transparent",
                color: "#9ca3af",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                borderRadius: 6,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              Use global default
            </button>
          </div>
        )}
      </div>

      {/* Font Family Selector */}
      <div className="theme-fontfamily-control" style={{ marginTop: 16 }}>
        <label className="fontfamily-label" style={{ display: "block", marginBottom: 8, fontSize: "13px", fontWeight: 500 }}>
          <span>Font Family</span>
        </label>
        <select
          value={fontFamily}
          onChange={(e) => {
            const newFont = e.target.value;
            setFontFamily(newFont);
            onFontFamilyChange?.(newFont);
          }}
          style={{
            width: "100%",
            padding: "6px 8px",
            background: "rgba(255, 255, 255, 0.1)",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            borderRadius: "4px",
            color: "inherit",
            fontFamily: fontFamily,
            fontSize: "13px",
          }}
        >
          <option value="monospace" style={{ fontFamily: "monospace" }}>System Monospace</option>
          <option value="'Fira Code', monospace" style={{ fontFamily: "'Fira Code', monospace" }}>Fira Code</option>
          <option value="'JetBrains Mono', monospace" style={{ fontFamily: "'JetBrains Mono', monospace" }}>JetBrains Mono</option>
          <option value="'Cascadia Code', monospace" style={{ fontFamily: "'Cascadia Code', monospace" }}>Cascadia Code</option>
          <option value="'Source Code Pro', monospace" style={{ fontFamily: "'Source Code Pro', monospace" }}>Source Code Pro</option>
          <option value="'Consolas', monospace" style={{ fontFamily: "'Consolas', monospace" }}>Consolas</option>
          <option value="'Monaco', monospace" style={{ fontFamily: "'Monaco', monospace" }}>Monaco</option>
          <option value="'Courier New', monospace" style={{ fontFamily: "'Courier New', monospace" }}>Courier New</option>
          <option value="'FiraCode Nerd Font', monospace" style={{ fontFamily: "'FiraCode Nerd Font', monospace" }}>FiraCode Nerd Font</option>
          <option value="'JetBrainsMono Nerd Font', monospace" style={{ fontFamily: "'JetBrainsMono Nerd Font', monospace" }}>JetBrains Mono NF</option>
          <option value="'Hack Nerd Font', monospace" style={{ fontFamily: "'Hack Nerd Font', monospace" }}>Hack Nerd Font</option>
        </select>
      </div>

      <div className="theme-dropdown-divider" />

      {Object.entries(terminalThemes).map(([key, theme]) => (
        <div
          key={key}
          className={`theme-option ${currentTheme === key ? "active" : ""}`}
          onClick={() => {
            onThemeSelect(key);
            onClose();
          }}
        >
          <span className="theme-name">{theme.name}</span>
          <div className="theme-preview">
            <span style={{ color: theme.xterm.foreground }}>●</span>
            <span
              style={{ color: theme.xterm.green || theme.xterm.foreground }}
            >
              ●
            </span>
            <span style={{ color: theme.xterm.blue || theme.xterm.foreground }}>
              ●
            </span>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
};
