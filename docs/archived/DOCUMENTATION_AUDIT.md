# Documentation Audit & Reorganization Plan

**Date**: November 21, 2025
**Purpose**: Clean up root directory and organize documentation in docs/ folder

---

## 📊 Current State Analysis

### Core Documentation (Keep in Root) ✅
| File | Size | Purpose | Status |
|------|------|---------|--------|
| CLAUDE.md | 23K | AI assistant instructions, architecture | **Keep** |
| README.md | 11K | User-facing documentation | **Keep** |
| LESSONS_LEARNED.md | 34K | Bug insights, patterns, checklists | **Keep** |
| CHANGELOG.md | 7.6K | Version history | **Keep** |
| PLAN.md | 13K | Development roadmap | **Keep** |

### Files to Relocate (24 files in root)

#### 🗃️ Historical/Completed Work → docs/archived/
| File | Size | Reason |
|------|------|--------|
| SESSION_FIX_SUMMARY.md | 12K | Historical summary of past bug fix |
| SESSION_SUMMARY.md | 8.7K | Historical session notes |
| EXTENSION_BUILD_SUMMARY.md | 9.1K | Historical build notes |
| COMPARISON_PLANNED_VS_ACTUAL.md | 8.2K | Historical comparison |
| COMMANDS_PANEL_AUDIT_PROMPT.md | 6.5K | Historical audit (commands panel removed) |
| CONTINUATION_PROMPT.md | 8.5K | **Duplicate** (already in docs/archived) |

#### 🐛 Bug Investigations → docs/bugs/ (new folder)
| File | Size | Reason |
|------|------|--------|
| MULTI_WINDOW_REATTACH_BUG.md | 13K | Multi-window reattach bug investigation |
| NEXT_SESSION_CONNECTION_DEBUG.md | 14K | WebSocket connection debugging |
| NEXT_SESSION_DEBUG.md | 14K | General debugging session notes |
| SPAWN_OPTIONS_DEBUG_PROMPT.md | 8.2K | Spawn options debugging |
| browsererror.md | 3.2K | Browser error debugging |

#### 📋 Planning/Analysis → docs/planning/ (new folder)
| File | Size | Reason |
|------|------|--------|
| IMPLEMENTATION_PLAN.md | 15K | Implementation planning |
| MISSING_FEATURES.md | 4.0K | Feature tracking |
| CHROME_EXTENSION_POSSIBILITIES.md | 12K | Chrome extension brainstorming |
| SPAWN_OPTIONS_ANALYSIS.md | 5.2K | Spawn options analysis |
| TMUX_MENUS_PLAN.md | 23K | Tmux menus planning |

#### 📖 Reference Material → docs/reference/
| File | Size | Reason |
|------|------|--------|
| WORKTREE_README.md | 1.9K | Git worktree reference |

#### 🗑️ Session Notes → docs/sessions/ (new folder, or consider deletion)
| File | Size | Reason |
|------|------|--------|
| NEXT_SESSION_PROMPT.md | 7.4K | **Duplicate** (already in docs/archived) |
| NEXT_SESSION_XTERM_INTEGRATION.md | 11K | Old session notes (likely outdated) |

---

## 🎯 Proposed Directory Structure

```
TabzChrome/
├── CLAUDE.md                    # Core: AI instructions
├── README.md                    # Core: User documentation
├── LESSONS_LEARNED.md           # Core: Bug insights
├── CHANGELOG.md                 # Core: Version history
├── PLAN.md                      # Core: Development roadmap
│
└── docs/
    ├── README.md                # Documentation index (update)
    │
    ├── archived/                # Completed/historical work
    │   ├── NEXT_SESSION_PROMPT.md (existing)
    │   ├── NEXT_SESSION_QUICKSTART.md (existing)
    │   ├── SESSION_FIX_SUMMARY.md (move)
    │   ├── SESSION_SUMMARY.md (move)
    │   ├── EXTENSION_BUILD_SUMMARY.md (move)
    │   ├── COMPARISON_PLANNED_VS_ACTUAL.md (move)
    │   ├── COMMANDS_PANEL_AUDIT_PROMPT.md (move)
    │   └── CONTINUATION_PROMPT.md (duplicate - DELETE)
    │
    ├── bugs/                    # Bug investigations (NEW)
    │   ├── MULTI_WINDOW_REATTACH_BUG.md
    │   ├── CONNECTION_DEBUG.md (renamed from NEXT_SESSION_CONNECTION_DEBUG.md)
    │   ├── SESSION_DEBUG.md (renamed from NEXT_SESSION_DEBUG.md)
    │   ├── SPAWN_OPTIONS_DEBUG.md (renamed from SPAWN_OPTIONS_DEBUG_PROMPT.md)
    │   └── BROWSER_ERROR.md (renamed from browsererror.md)
    │
    ├── planning/                # Planning docs (NEW)
    │   ├── IMPLEMENTATION_PLAN.md
    │   ├── MISSING_FEATURES.md
    │   ├── CHROME_EXTENSION_POSSIBILITIES.md
    │   ├── SPAWN_OPTIONS_ANALYSIS.md
    │   └── TMUX_MENUS_PLAN.md
    │
    ├── reference/               # Technical reference (existing)
    │   ├── OPUSTRATOR_LEGACY_AUDIT.md (existing)
    │   ├── CLAUDE_CODE_COLORS.md (existing)
    │   ├── LAUNCHER.md (existing)
    │   ├── SEND_KEYS_SAFETY.md (existing)
    │   ├── SPLIT_LAYOUT_DESIGN.md (existing)
    │   └── WORKTREE_README.md (move)
    │
    ├── sessions/                # Session notes (NEW, or DELETE)
    │   ├── NEXT_SESSION_PROMPT.md (duplicate - DELETE)
    │   └── XTERM_INTEGRATION.md (renamed from NEXT_SESSION_XTERM_INTEGRATION.md)
    │
    ├── phases/                  # Implementation phases (existing)
    │   ├── PHASE_1_PROMPT.md
    │   ├── PHASE_2_PROMPT.md
    │   ├── PHASE_2_PROGRESS.md
    │   └── REMAINING_PHASES.md
    │
    ├── persistence/             # Persistence docs (existing)
    │   └── DEBUG_PERSISTENCE.md
    │
    └── brainstorm/              # Ideas/ecosystem (existing)
        └── ECOSYSTEM_INTEGRATION.md
```

---

## 🚀 Reorganization Steps

### 1. Create New Folders
```bash
mkdir -p docs/bugs
mkdir -p docs/planning
mkdir -p docs/sessions  # Optional - or just delete session notes
```

### 2. Move Historical Documents
```bash
mv SESSION_FIX_SUMMARY.md docs/archived/
mv SESSION_SUMMARY.md docs/archived/
mv EXTENSION_BUILD_SUMMARY.md docs/archived/
mv COMPARISON_PLANNED_VS_ACTUAL.md docs/archived/
mv COMMANDS_PANEL_AUDIT_PROMPT.md docs/archived/
```

### 3. Move Bug Investigation Documents
```bash
mv MULTI_WINDOW_REATTACH_BUG.md docs/bugs/
mv NEXT_SESSION_CONNECTION_DEBUG.md docs/bugs/CONNECTION_DEBUG.md
mv NEXT_SESSION_DEBUG.md docs/bugs/SESSION_DEBUG.md
mv SPAWN_OPTIONS_DEBUG_PROMPT.md docs/bugs/SPAWN_OPTIONS_DEBUG.md
mv browsererror.md docs/bugs/BROWSER_ERROR.md
```

### 4. Move Planning Documents
```bash
mv IMPLEMENTATION_PLAN.md docs/planning/
mv MISSING_FEATURES.md docs/planning/
mv CHROME_EXTENSION_POSSIBILITIES.md docs/planning/
mv SPAWN_OPTIONS_ANALYSIS.md docs/planning/
mv TMUX_MENUS_PLAN.md docs/planning/
```

### 5. Move Reference Documents
```bash
mv WORKTREE_README.md docs/reference/
```

### 6. Handle Session Notes (Recommend Deletion)
```bash
# Option A: Delete duplicates and outdated notes
rm CONTINUATION_PROMPT.md  # Duplicate of docs/archived/CONTINUATION_PROMPT.md
rm NEXT_SESSION_PROMPT.md  # Duplicate of docs/archived/NEXT_SESSION_PROMPT.md
rm NEXT_SESSION_XTERM_INTEGRATION.md  # Likely outdated

# Option B: Move to docs/sessions/ if they have value
mkdir -p docs/sessions
mv NEXT_SESSION_XTERM_INTEGRATION.md docs/sessions/XTERM_INTEGRATION.md
```

### 7. Update Documentation Index
- Update `docs/README.md` with new folder structure
- Update `CLAUDE.md` documentation references section

---

## 📊 Impact Analysis

### Before
- **Root directory**: 24 markdown files (cluttered)
- **Total size**: ~260K of documentation in root

### After
- **Root directory**: 5 core markdown files (clean)
- **docs/ organized**: 4 new categories, clear hierarchy
- **Duplicates removed**: 2-3 files

### Benefits
1. ✅ **Cleaner root** - Only essential docs visible
2. ✅ **Better organization** - Clear categories (bugs, planning, archived, reference)
3. ✅ **Easier navigation** - Logical grouping by purpose
4. ✅ **Less confusion** - No duplicate session prompts
5. ✅ **Historical context** - Archived docs preserved for reference

---

## ⚠️ Considerations

### Session Notes (NEXT_SESSION_*.md)
**Recommendation**: Delete these files
- They're continuation prompts for specific sessions
- CLAUDE.md now contains the canonical "what's in progress" info
- Keeping them creates confusion about which is current
- If needed, key info should be in CLAUDE.md or PLAN.md

### Alternative: Keep in docs/sessions/
If these notes have value:
- Move to `docs/sessions/` with clear dating
- Update docs/README.md to note they're historical
- Don't rely on them for current state

---

## 🎯 Recommendation

**Proceed with full reorganization:**
1. Create new folders (bugs, planning, sessions)
2. Move all files as proposed
3. Delete duplicate session prompts
4. Update docs/README.md
5. Update CLAUDE.md references

**Result**: Clean root with only 5 core docs, well-organized docs/ folder

---

## 📝 Next Steps After Reorganization

1. Review `docs/phases/` - Are these still relevant?
2. Review `docs/brainstorm/` - Archive if implemented?
3. Add dates to archived docs (when were they relevant?)
4. Consider adding README.md to each docs/ subfolder explaining its purpose

---

**Ready to proceed?** See detailed steps above or run the automated reorganization script.
