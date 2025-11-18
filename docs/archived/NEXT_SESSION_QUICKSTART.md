# Next Session Quick Start

## 🎯 The Problem

**Only the active terminal tab renders after refresh. Other tabs show emoji but terminal never loads.**

## 🔥 Most Likely Fix (Try This First!)

**File:** `src/SimpleTerminalApp.tsx` (around line 927)

**Change this:**
```typescript
<div
  style={{ display: terminal.id === activeTerminalId ? 'block' : 'none' }}
  className="terminal-wrapper"
>
```

**To this:**
```typescript
<div
  style={{
    display: 'block',
    visibility: terminal.id === activeTerminalId ? 'visible' : 'hidden',
    height: '100%',
    width: '100%'
  }}
  className="terminal-wrapper"
>
```

**Why:** xterm.js can't initialize when parent has `display: none` (zero dimensions).

---

## 🧪 Quick Test

1. Make the change above
2. Spawn 2-3 terminals
3. Refresh (F5)
4. **All terminals should reconnect!**

---

## 📖 For More Details

See `DEBUG_PERSISTENCE.md` for:
- Full investigation steps
- Alternative fixes
- Complete context from this session
- All files modified

---

## ✅ What Already Works

- localStorage persistence
- Tmux session survival
- Session querying
- Terminal matching
- Command-based spawn option lookup
- Short session names (`tt-bash-xyz`)
- Clear button (🗑️)
- `resumable: true` flag

**Everything works EXCEPT the final rendering step!**

---

## 🚀 If Quick Fix Works

After confirming all terminals reconnect:

1. Test with 5+ terminals
2. Test switching tabs during load
3. Test closing/reopening browser entirely
4. Document the fix in NEXT_SESSION_PROMPT.md

---

**Good luck! The fix is probably one line of CSS!** 🎉
