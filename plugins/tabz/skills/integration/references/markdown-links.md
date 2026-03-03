# Markdown Links Integration

Interactive terminal buttons in markdown files using the `tabz:` protocol. Rendered automatically in TabzChrome's file viewer.

## Usage

Standard markdown links with `tabz:` URLs:

```markdown
[Start Dev Server](tabz:spawn?cmd=npm%20run%20dev&name=Dev)
[Queue: git status](tabz:queue?text=git%20status)
[Paste: pwd](tabz:paste?text=pwd)
```

## Actions

| Action | URL Format | Button Color | Behavior |
|--------|------------|--------------|----------|
| **Spawn** | `tabz:spawn?...` | Green | Create new terminal tab |
| **Queue** | `tabz:queue?...` | Blue | Add to chat input, user picks terminal |
| **Paste** | `tabz:paste?...` | Orange | Paste into active terminal |

## Spawn Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `cmd` | Command to run | `cmd=npm%20test` |
| `name` | Tab display name | `name=Dev%20Server` |
| `dir` | Working directory | `dir=~/projects/myapp` |
| `profile` | Profile to use | `profile=claude%20code` |

### Examples

```markdown
<!-- Simple command -->
[Run Tests](tabz:spawn?cmd=npm%20test)

<!-- With directory and name -->
[Start Dev](tabz:spawn?cmd=npm%20run%20dev&dir=~/projects/myapp&name=Dev%20Server)

<!-- Spawn by profile -->
[Launch Claude](tabz:spawn?profile=claude%20code)

<!-- Just open a terminal in a directory -->
[Terminal in ~/projects](tabz:spawn?dir=~/projects&name=Projects)
```

## Queue Parameters

| Parameter | Description |
|-----------|-------------|
| `text` | Text to queue to chat input |

User selects which terminal receives the queued text.

```markdown
[Queue: Check status](tabz:queue?text=git%20status)
[Queue: Ask Claude](tabz:queue?text=Explain%20this%20codebase)
```

## Paste Parameters

| Parameter | Description |
|-----------|-------------|
| `text` | Text to paste into active terminal |

Pastes directly into the currently focused terminal tab.

```markdown
[Paste: pwd](tabz:paste?text=pwd)
[Paste: clear](tabz:paste?text=clear)
```

## URL Encoding

Encode special characters in parameter values:

| Character | Encoded |
|-----------|---------|
| Space | `%20` |
| Newline | `%0A` |
| Ampersand | `%26` |
| Question mark | `%3F` |
| Equals | `%3D` |

## Example: Project Dashboard

```markdown
# MyProject

## Development
[Dev Server](tabz:spawn?cmd=npm%20run%20dev&dir=~/projects/myapp&name=Dev)
[Run Tests](tabz:spawn?cmd=npm%20test&dir=~/projects/myapp&name=Tests)
[Build](tabz:spawn?cmd=npm%20run%20build&dir=~/projects/myapp&name=Build)

## Claude Prompts
[Review Changes](tabz:queue?text=Review%20the%20recent%20git%20changes)
[Check Blockers](tabz:queue?text=What%20issues%20are%20blocking%3F%20Run%20bd%20blocked)
[Explain Code](tabz:queue?text=Explain%20how%20this%20project%20is%20structured)

## Quick Launch
[Claude in Project](tabz:spawn?cmd=claude&dir=~/projects/myapp&name=MyApp)
[Conductor](tabz:spawn?profile=conductor)
```

## Requirements

- TabzChrome extension installed
- File viewed in TabzChrome's file viewer/dashboard
- No authentication required
