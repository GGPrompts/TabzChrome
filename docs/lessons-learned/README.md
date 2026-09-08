# Lessons Learned - TabzChrome

This folder contains debugging lessons, gotchas, and best practices discovered during TabzChrome development.

## Quick Links

| Topic | File | Summary |
|-------|------|---------|
| Terminal Rendering | [terminal-rendering.md](terminal-rendering.md) | xterm.js, resize coordination, tmux integration |
| Chrome Extension | [chrome-extension.md](chrome-extension.md) | Storage, reconnection, audio notifications |
| React Patterns | [react-patterns.md](react-patterns.md) | Hooks, performance, state management |
| Architecture | [architecture.md](architecture.md) | Multi-window, splits, WebSocket routing |
| Debugging | [debugging.md](debugging.md) | Dev environment, troubleshooting patterns |
| Capture Lifecycle | [2026-09-07-capture-lifecycle.md](2026-09-07-capture-lifecycle.md) | Document revocation, debugger cleanup, bounded queues and UTF-8 limits |
| Rebuild Safety | [windows-rebuild-safety.md](windows-rebuild-safety.md) | Windows destination resolution, guarded sync and separate runtime outcomes |

## Related Resources

- **xterm-js Skill** (`skills/xterm-js/`) - Generalized xterm.js best practices extracted from these lessons
- **CLAUDE.md** - Current architecture and development rules
- **CHANGELOG.md** - Version history and bug fixes

## How to Use

1. **Debugging a bug?** Check the relevant topic file for similar issues
2. **Adding a feature?** Review patterns that might apply
3. **Found a new gotcha?** Add it to the appropriate file with:
   - Problem description
   - Root cause analysis
   - Solution with code examples
   - Prevention checklist

## Contributing

When adding new lessons:

```markdown
### Lesson: [Short Title] (Date)

**Problem:** What went wrong

**What Happened:**
1. Step-by-step description
2. ...

**Root Cause:** Why it happened

**Solution:**
```code
// Fix with explanation
```

**Key Insights:**
- Generalizable takeaways
- Prevention strategies

**Files:**
- `path/to/file.ts:line` - What was changed
```

---

**Last Updated:** December 13, 2025
