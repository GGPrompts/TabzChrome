# Claude Code Terminal Colors Guide

## How Claude Code Uses ANSI Colors

Claude Code uses specific ANSI escape codes to emphasize different types of output. Understanding this helps you customize color palettes for optimal readability.

---

## Color Usage by Element Type

### 🟢 **GREEN** - Success & Positive Feedback
- ✅ Tool execution success
- ✓ Task completion
- "Done", "Success", "Completed" messages
- Positive status indicators

**Examples:**
```
✓ File written successfully
✓ 142 tests passed
● Tool executed: Read
```

### 🟡 **YELLOW** - Warnings & Important Notes
- ⚠ Warning messages
- Important notices
- Suggestions
- Highlighted information

**Examples:**
```
⚠ File already exists, overwriting
⚠ Large file detected (2.3MB)
Note: This operation may take a few seconds
```

### 🔴 **RED** - Errors & Critical Issues
- ✗ Errors
- Critical failures
- Exceptions
- Exit code errors

**Examples:**
```
✗ Error: File not found
✗ Build failed with 3 errors
TypeError: Cannot read property 'x'
```

### 🔵 **BLUE** - Paths & Links
- File paths
- URLs
- Line numbers (file.ts:123)
- References

**Examples:**
```
src/components/Terminal.tsx:456
https://docs.example.com
Reading /home/user/config.json
```

### 🟣 **MAGENTA** - Tool Names & Functions
- Tool/function names
- Method calls
- API endpoints
- Commands being executed

**Examples:**
```
Calling Read tool
Executing npm install
Function: handleThemeChange
```

### 🔷 **CYAN** - Headers & Section Dividers
- Section headers
- Dividers
- Category labels
- Metadata labels

**Examples:**
```
━━━ Terminal Output ━━━
## Build Results
Status: Running
```

### ⚫ **BRIGHT BLACK (Gray)** - Dim/Less Important
- Timestamps
- Metadata
- PIDs, IDs
- Less important details

**Examples:**
```
[14:23:45]
PID: 12345
Request ID: abc123def
```

### ⚪ **WHITE/BRIGHT WHITE** - Primary Text
- Main content
- Code output
- General text
- Default foreground

---

## Recommended Palettes for Different Use Cases

### For Long Coding Sessions (Low Eye Strain)
- **claude-soft-ocean** - Gentle pastels, easy on eyes
- **claude-dracula** - Popular balanced theme

### For Maximum Clarity (Presentations, Debugging)
- **claude-high-contrast** - Every element pops distinctly
- **claude-neon** - Ultra-vibrant, impossible to miss

### For Classic Terminal Feel
- **claude-amber-modern** - Retro amber with modern accents
- **claude-mono-green** - Classic green terminal vibes

---

## Testing Your Color Palette

Create a test file to see all colors:

```bash
# test-colors.sh
echo -e "\033[32m✓ Green: Success message\033[0m"
echo -e "\033[33m⚠ Yellow: Warning message\033[0m"
echo -e "\033[31m✗ Red: Error message\033[0m"
echo -e "\033[34msrc/file.ts:123\033[0m (Blue: File path)"
echo -e "\033[35mTool: Read\033[0m (Magenta: Tool name)"
echo -e "\033[36m━━━ Header ━━━\033[0m (Cyan: Section)"
echo -e "\033[90m[14:23:45]\033[0m (Dim: Timestamp)"
echo -e "\033[1;32m✓ Bright Green: Highlighted success\033[0m"
```

---

## Color Contrast Tips

1. **Errors should be LOUD** - Red should be your most vibrant color
2. **Success can be calm** - Green doesn't need to scream
3. **Paths should be readable** - Blue needs good contrast with background
4. **Dim text should still be visible** - brightBlack shouldn't be too dark
5. **Headers need presence** - Cyan should stand out without being harsh

---

## Using Custom Palettes

### In spawn-options.json:
```json
{
  "label": "Claude Code (Neon)",
  "command": "claude",
  "terminalType": "claude-code",
  "colorPalette": "claude-neon",
  "defaultTransparency": 95,
  "background": "cyberpunk-gradient"
}
```

---

## Creating Your Own Palette

Copy and modify one of the palettes in `src/styles/claude-code-themes.ts`:

```typescript
"my-custom": {
  name: "My Custom Palette",
  description: "Describe your color scheme",

  foreground: "#e0e0e0",    // Main text
  background: "rgba(10, 10, 15, 0.95)",
  cursor: "#00d4ff",
  selection: "rgba(0, 212, 255, 0.3)",

  // Focus on these for Claude Code:
  red: "#ff4757",         // Make errors stand out!
  green: "#5af78e",       // Success should be satisfying
  yellow: "#ffd93d",      // Warnings should be noticeable
  blue: "#57c7ff",        // Paths should be readable
  magenta: "#ff6ac1",     // Tool names should pop
  cyan: "#6bcf7f",        // Headers need presence

  // Don't forget bright variants for emphasis:
  brightRed: "#ff5c7c",   // Critical errors
  brightGreen: "#7dff94", // Highlighted success
  // ... etc
}
```

---

## Examples in Action

### High Contrast Theme
```
✓ File written successfully           (Vibrant green - immediate positive feedback)
⚠ Large file detected                 (Warm yellow - draws attention)
✗ Error: Permission denied            (Bright red - can't miss it)
src/components/Terminal.tsx:456       (Sky blue - stands out from text)
Calling Read tool                      (Hot pink - function names pop)
━━━ Build Results ━━━                (Teal - clear section break)
[14:23:45] PID: 12345                (Gray - visible but de-emphasized)
```

### Soft Ocean Theme
```
✓ File written successfully           (Calm green - gentle confirmation)
⚠ Large file detected                 (Soft yellow - pleasant notice)
✗ Error: Permission denied            (Muted red - clear but not harsh)
src/components/Terminal.tsx:456       (Soft blue - easy to read)
Calling Read tool                      (Lavender - elegant function names)
━━━ Build Results ━━━                (Soft cyan - subtle divide)
[14:23:45] PID: 12345                (Medium gray - readable metadata)
```

---

## Pro Tips

1. **Test with real Claude Code output** - Don't just look at color swatches
2. **Consider your lighting** - Bright room vs dark room affects perception
3. **Mix and match** - Use "claude-high-contrast" colors with "soft-ocean" background
4. **Bold matters** - Claude Code uses `\033[1m` for emphasis, so bold rendering is important
5. **Dim text is metadata** - Don't make brightBlack too dark or you'll lose timestamps

---

**Current Best for Claude Code:** `claude-high-contrast` or `claude-dracula`

**Current Best for Long Sessions:** `claude-soft-ocean`

**Current Best for Fun:** `claude-neon`
