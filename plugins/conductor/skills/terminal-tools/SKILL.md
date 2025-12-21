# Terminal Tools Skill

Reference knowledge for tmux mastery and TUI tool control.

## tmux Commands

### Session Management
```bash
tmux ls                              # List all sessions
tmux new -s NAME                     # Create named session
tmux attach -t NAME                  # Attach to session
tmux kill-session -t NAME            # Kill session
tmux has-session -t NAME 2>/dev/null # Check if exists (exit code)
```

### Window/Pane Management
```bash
tmux split-window -h                 # Split horizontal
tmux split-window -v                 # Split vertical
tmux split-window -h -l 30%          # Split with size
tmux select-pane -L/-R/-U/-D         # Navigate panes
tmux resize-pane -L/-R/-U/-D 10      # Resize pane
```

### Capture & Send
```bash
# Capture pane content (CRITICAL for reading TUIs)
tmux capture-pane -t SESSION -p              # Print to stdout
tmux capture-pane -t SESSION -p -S -50       # Include 50 lines of scrollback
tmux capture-pane -t SESSION -p -S - -E -    # Entire scrollback

# Send keys (CRITICAL for controlling TUIs)
tmux send-keys -t SESSION "text"             # Send text (interpreted)
tmux send-keys -t SESSION -l "text"          # Send literal (preserves special chars)
tmux send-keys -t SESSION C-c                # Ctrl+C
tmux send-keys -t SESSION C-d                # Ctrl+D
tmux send-keys -t SESSION Enter              # Enter key
tmux send-keys -t SESSION Escape             # Escape key

# Special keys for TUI navigation
tmux send-keys -t SESSION Up/Down/Left/Right # Arrow keys
tmux send-keys -t SESSION NPage              # Page Down
tmux send-keys -t SESSION PPage              # Page Up
tmux send-keys -t SESSION Home/End           # Home/End
tmux send-keys -t SESSION Tab                # Tab
tmux send-keys -t SESSION BTab               # Shift+Tab
tmux send-keys -t SESSION Space              # Space
```

### Timing Pattern
```bash
# Always delay between send-keys and capture/submit
tmux send-keys -t SESSION -l "prompt text"
sleep 0.3  # CRITICAL: prevents race conditions
tmux send-keys -t SESSION Enter
```

## TUI Tool Keybindings

### btop / htop (System Monitors)
| Key | Action |
|-----|--------|
| `f` | Filter processes |
| `/` | Search |
| `k` | Kill process |
| `t` | Tree view toggle |
| `s` | Sort options |
| `h` | Help |
| `q` | Quit |
| `Up/Down` | Navigate |
| `F6` | Sort by column (htop) |
| `F9` | Kill (htop) |

**Useful captures:**
```bash
# Get top CPU process
tmux capture-pane -t SESSION -p | grep -E "^\s+\d+.*[0-9]+\.[0-9]+\s*$" | head -5
```

### lazygit (Git TUI)
| Key | Action |
|-----|--------|
| `1-5` | Jump to panel (Status/Files/Branches/Commits/Stash) |
| `j/k` | Navigate up/down |
| `Enter` | Expand/view |
| `Space` | Stage/unstage file |
| `c` | Commit |
| `p` | Push |
| `P` | Pull |
| `a` | Stage all |
| `d` | View diff |
| `/` | Search |
| `?` | Help |
| `q` | Quit |

**Useful captures:**
```bash
# Get current branch
tmux capture-pane -t SESSION -p | grep -E "^\*.*main|master" | head -1

# Get modified files count
tmux capture-pane -t SESSION -p | grep -E "M\s+\w" | wc -l
```

### lnav (Log Navigator)
| Key | Action |
|-----|--------|
| `/` | Search regex |
| `n/N` | Next/prev match |
| `e/E` | Next/prev error |
| `w/W` | Next/prev warning |
| `f` | Filter |
| `Tab` | Focus panels |
| `g/G` | Top/bottom |
| `q` | Quit |
| `:` | Command mode |

**Useful captures:**
```bash
# Count errors in view
tmux capture-pane -t SESSION -p | grep -i "error" | wc -l
```

### TFE (Terminal File Explorer)
| Key | Action |
|-----|--------|
| `Tab` | Toggle focus left/right pane |
| `Up/Down` | Navigate files (left) or scroll preview (right) |
| `NPage/PPage` | Page down/up in preview |
| `Enter` | Open/select file |
| `r` | Refresh |
| `h` | Toggle hidden files |
| `/` | Search |
| `q` | Quit |

**Useful captures:**
```bash
# Get selected file
tmux capture-pane -t SESSION -p | grep "Selected:" | head -1

# Get scroll position
tmux capture-pane -t SESSION -p | grep -oE "[0-9]+/[0-9]+ \([0-9]+%\)"
```

### gitlogue (Git Replay)
| Key | Action |
|-----|--------|
| `n` | Next commit |
| `p` | Previous commit |
| `Space` | Pause/resume |
| `r` | Random commit |
| `q` | Quit |

**Useful info:**
```bash
# Get current commit being shown
tmux capture-pane -t SESSION -p | grep "hash:" | head -1
```

### jless (JSON Viewer)
| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate (vim-style) |
| `J/K` | Jump to next/prev sibling |
| `Space` | Toggle collapse/expand |
| `c` | Collapse all |
| `e` | Expand all |
| `yy` | Yank value |
| `yp` | Yank path (great for jq!) |
| `yk` | Yank key |
| `/` | Search forward |
| `?` | Search backward |
| `n/N` | Next/prev match |
| `q` | Quit |

**Useful captures:**
```bash
# Spawn jless with JSON
spawn with command: "curl -s api.example.com | jless"

# Get current path in JSON
tmux capture-pane -t SESSION -p | grep "Path:" | head -1
```

### yazi (File Browser)
| Key | Action |
|-----|--------|
| `h/j/k/l` | Navigate (vim-style) |
| `Enter` | Open file/directory |
| `q` | Quit |
| `y` | Yank (copy) |
| `x` | Cut |
| `p` | Paste |
| `d` | Delete (trash) |
| `D` | Delete permanently |
| `a` | Create file |
| `A` | Create directory |
| `r` | Rename |
| `Space` | Toggle selection |
| `v` | Visual mode |
| `/` | Search |
| `z` | Jump to directory (zoxide) |
| `~` | Go home |

**Useful captures:**
```bash
# Get current directory
tmux capture-pane -t SESSION -p | head -1
```

### procs (Process Viewer)
| Key | Action |
|-----|--------|
| `Up/Down` | Navigate |
| `q` | Quit |
| `/` | Search |

**CLI flags (non-interactive):**
```bash
procs --tree              # Show process tree
procs --watch             # Live updating
procs node                # Filter by name
procs --sortd cpu         # Sort by CPU descending
```

**Useful captures:**
```bash
# Get process info (non-TUI, easier to parse)
procs --tree | head -20
procs node | grep -v "^$"
```

### dust (Disk Usage)
Non-interactive - run and capture output:
```bash
dust -d 2 /path           # Depth 2
dust -n 10 /path          # Top 10 items
dust -r /path             # Reverse order (smallest first)
```

**Useful captures:**
```bash
# Find biggest directories
dust -d 1 ~ | head -15
```

### tokei (Code Statistics)
Non-interactive - run and capture output:
```bash
tokei /path               # Full stats
tokei /path --compact     # Compact view
tokei /path -s lines      # Sort by lines
tokei /path -e node_modules -e dist  # Exclude dirs
```

**Useful captures:**
```bash
# Get code summary
tokei /path --compact | tail -5
```

### hyperfine (Benchmarking)
Non-interactive - run and capture output:
```bash
hyperfine 'command1' 'command2'           # Compare two commands
hyperfine --warmup 3 'command'            # With warmup runs
hyperfine --min-runs 10 'command'         # Minimum runs
hyperfine --export-markdown results.md 'cmd'  # Export results
```

**Useful captures:**
```bash
# Benchmark and get summary
hyperfine --min-runs 5 'npm run build' 2>&1 | tail -10
```

### delta (Git Diff Pager)
Integrates with git automatically when configured. Not a TUI but enhances lazygit:
```bash
# Add to ~/.gitconfig
[core]
    pager = delta
[delta]
    navigate = true
    side-by-side = true
    line-numbers = true
```

### General TUI Patterns

**Quitting any TUI:**
```bash
tmux send-keys -t SESSION q          # Most TUIs
tmux send-keys -t SESSION C-c        # Force exit
tmux send-keys -t SESSION ":q" Enter # Vim-style
```

**Refreshing view:**
```bash
tmux send-keys -t SESSION r          # Many TUIs support 'r'
tmux send-keys -t SESSION C-l        # Clear/refresh screen
```

**Navigation pattern:**
```bash
# Scroll down, capture, check content
tmux send-keys -t SESSION NPage
sleep 0.2
tmux capture-pane -t SESSION -p | grep "pattern"
```

## TabzChrome Session Naming

Sessions spawned by TabzChrome follow this pattern:
```
ctt-{name-slug}-{uuid}

Examples:
ctt-claude-frontend-abc123
ctt-tui-btop-def456
ctt-docs-readme-ghi789
```

**Listing TabzChrome sessions:**
```bash
tmux ls | grep "^ctt-"
```

**Finding specific tool sessions:**
```bash
tmux ls | grep "^ctt-tui-"      # TUI tools
tmux ls | grep "^ctt-claude-"   # Claude workers
tmux ls | grep "^ctt-docs-"     # Doc viewers
```
