# Terminal Tools Skill

Reference knowledge for tmux mastery and TUI tool control.

## tmux Quick Reference

### Session Management
```bash
tmux ls                              # List all sessions
tmux new -s NAME                     # Create named session
tmux attach -t NAME                  # Attach to session
tmux kill-session -t NAME            # Kill session
tmux has-session -t NAME 2>/dev/null # Check if exists (exit code)
```

### Capture & Send (Critical)
```bash
# Capture pane content
tmux capture-pane -t SESSION -p              # Print to stdout
tmux capture-pane -t SESSION -p -S -50       # Include 50 lines scrollback
tmux capture-pane -t SESSION -p -S - -E -    # Entire scrollback

# Send keys
tmux send-keys -t SESSION "text"             # Send text (interpreted)
tmux send-keys -t SESSION -l "text"          # Send literal
tmux send-keys -t SESSION C-c                # Ctrl+C
tmux send-keys -t SESSION Enter              # Enter key
tmux send-keys -t SESSION Escape             # Escape key

# Navigation keys
tmux send-keys -t SESSION Up/Down/Left/Right
tmux send-keys -t SESSION NPage              # Page Down
tmux send-keys -t SESSION PPage              # Page Up
tmux send-keys -t SESSION Tab/BTab           # Tab/Shift+Tab
```

### Timing Pattern (Critical)
```bash
# Always delay between send-keys and capture/submit
tmux send-keys -t SESSION -l "prompt text"
sleep 0.3  # CRITICAL: prevents race conditions
tmux send-keys -t SESSION Enter
```

### Window/Pane
```bash
tmux split-window -h                 # Split horizontal
tmux split-window -v                 # Split vertical
tmux split-window -h -l 30%          # Split with size
tmux select-pane -L/-R/-U/-D         # Navigate panes
tmux resize-pane -L/-R/-U/-D 10      # Resize pane
```

---

## TUI Quick Reference

**Full keybindings:** `references/tui-keybindings.md`

### Common Keys (Most TUIs)
| Key | Action |
|-----|--------|
| `q` | Quit |
| `/` | Search |
| `h` or `?` | Help |
| `j/k` | Navigate (vim-style) |
| `Enter` | Select/expand |

### Quit Any TUI
```bash
tmux send-keys -t SESSION q          # Most TUIs
tmux send-keys -t SESSION C-c        # Force exit
tmux send-keys -t SESSION ":q" Enter # Vim-style
```

### Refresh View
```bash
tmux send-keys -t SESSION r          # Many TUIs support 'r'
tmux send-keys -t SESSION C-l        # Clear/refresh screen
```

---

## TabzChrome Session Naming

Sessions spawned by TabzChrome:
```
ctt-{name-slug}-{uuid}

Examples:
ctt-claude-frontend-abc123
ctt-tui-btop-def456
```

**Find sessions:**
```bash
tmux ls | grep "^ctt-"         # All TabzChrome sessions
tmux ls | grep "^ctt-tui-"     # TUI tools
tmux ls | grep "^ctt-claude-"  # Claude workers
```

---

## Common TUI Tools

| Tool | Purpose | Key Commands |
|------|---------|--------------|
| btop/htop | System monitor | `f` filter, `k` kill, `s` sort |
| lazygit | Git TUI | `1-5` panels, `c` commit, `p` push |
| lnav | Log viewer | `e/E` errors, `f` filter, `:` command |
| jless | JSON viewer | `Space` expand, `yp` yank path |
| yazi | File browser | vim keys, `y/x/p` copy/cut/paste |

---

## CLI Tools (Non-Interactive)

```bash
# Process info
procs --tree              # Process tree
procs node                # Filter by name

# Disk usage
dust -d 2 /path           # Depth 2
dust -n 10 /path          # Top 10 items

# Code stats
tokei /path --compact     # Quick stats

# Benchmarking
hyperfine 'cmd1' 'cmd2'   # Compare commands
```

---

## Navigation Pattern

```bash
# Scroll down, capture, check content
tmux send-keys -t SESSION NPage
sleep 0.2
tmux capture-pane -t SESSION -p | grep "pattern"
```

---

## Reference Files

| File | Content |
|------|---------|
| `references/tui-keybindings.md` | Complete keybindings for all TUI tools |
