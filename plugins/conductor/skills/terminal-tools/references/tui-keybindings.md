# TUI Tool Keybindings

Complete keybinding reference for common TUI applications.

## btop / htop (System Monitors)

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

## lazygit (Git TUI)

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

## lnav (Log Navigator)

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

## TFE (Terminal File Explorer)

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

## jless (JSON Viewer)

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

**Useful:**
```bash
# Spawn jless with JSON
spawn with command: "curl -s api.example.com | jless"
```

## yazi (File Browser)

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

## gitlogue (Git Replay)

| Key | Action |
|-----|--------|
| `n` | Next commit |
| `p` | Previous commit |
| `Space` | Pause/resume |
| `r` | Random commit |
| `q` | Quit |

## CLI Tools (Non-Interactive)

### procs (Process Viewer)
```bash
procs --tree              # Show process tree
procs --watch             # Live updating
procs node                # Filter by name
procs --sortd cpu         # Sort by CPU descending
```

### dust (Disk Usage)
```bash
dust -d 2 /path           # Depth 2
dust -n 10 /path          # Top 10 items
dust -r /path             # Reverse order
```

### tokei (Code Statistics)
```bash
tokei /path               # Full stats
tokei /path --compact     # Compact view
tokei /path -s lines      # Sort by lines
tokei /path -e node_modules -e dist  # Exclude dirs
```

### hyperfine (Benchmarking)
```bash
hyperfine 'command1' 'command2'           # Compare commands
hyperfine --warmup 3 'command'            # With warmup
hyperfine --min-runs 10 'command'         # Minimum runs
hyperfine --export-markdown results.md 'cmd'
```
