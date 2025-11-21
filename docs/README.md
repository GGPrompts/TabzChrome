# TabzChrome Documentation Index

This directory contains all project documentation organized by category.

**Last Updated**: November 21, 2025

---

## 📂 Directory Structure

### `/bugs/` - Bug Investigation & Debugging
Documentation of bugs, debugging sessions, and issue investigations.

- **MULTI_WINDOW_REATTACH_BUG.md** - Multi-window reattach bug investigation
- **CONNECTION_DEBUG.md** - WebSocket connection debugging notes
- **SESSION_DEBUG.md** - General debugging session notes
- **SPAWN_OPTIONS_DEBUG.md** - Spawn options debugging investigation
- **BROWSER_ERROR.md** - Browser error debugging

**Use Case**: Reference when debugging similar issues or understanding past bug fixes.

---

### `/planning/` - Planning & Analysis
Feature planning, architectural analysis, and brainstorming documents.

- **IMPLEMENTATION_PLAN.md** - Implementation planning documentation
- **MISSING_FEATURES.md** - Feature tracking and wishlist
- **CHROME_EXTENSION_POSSIBILITIES.md** - Chrome extension capabilities brainstorming
- **SPAWN_OPTIONS_ANALYSIS.md** - Spawn options system analysis
- **TMUX_MENUS_PLAN.md** - Tmux menus planning and design

**Use Case**: Review when planning new features or understanding architectural decisions.

---

### `/archived/` - Archived & Historical Documentation
Completed work summaries, outdated prompts, and historical reference materials.

- **SESSION_FIX_SUMMARY.md** - Historical summary of session bug fixes
- **SESSION_SUMMARY.md** - Historical session notes
- **EXTENSION_BUILD_SUMMARY.md** - Historical build process notes
- **COMPARISON_PLANNED_VS_ACTUAL.md** - Historical comparison of planned vs actual implementation
- **COMMANDS_PANEL_AUDIT_PROMPT.md** - Historical audit (commands panel removed)
- **NEXT_SESSION_PROMPT.md** - Legacy continuation prompt template
- **NEXT_SESSION_QUICKSTART.md** - Legacy quick start for sessions

**Note**: These documents are kept for historical reference but may be outdated. For current state, see core docs in root.

---

### `/reference/` - Technical Reference Documentation
Technical reference materials for specific features, patterns, and integrations.

- **SPLIT_LAYOUT_DESIGN.md** - Split layout system design and specification
- **OPUSTRATOR_LEGACY_AUDIT.md** - Audit of removed Opustrator code (cleanup Nov 8, 2025)
- **CLAUDE_CODE_COLORS.md** - Claude Code terminal color schemes
- **LAUNCHER.md** - Terminal launcher and spawn system documentation
- **SEND_KEYS_SAFETY.md** - Safety guidelines for send-keys functionality
- **WORKTREE_README.md** - Git worktree reference guide

**Use Case**: Quick reference for specific technical details and patterns.

---

### `/phases/` - Implementation Phase Documentation
Phase-by-phase implementation guides and progress tracking for the split layout system.

- **PHASE_1_PROMPT.md** - Phase 1 implementation guide (split infrastructure)
- **PHASE_2_PROMPT.md** - Phase 2 implementation guide (drag-and-drop, focus)
- **PHASE_2_PROGRESS.md** - Phase 2 progress tracking and completion notes
- **REMAINING_PHASES.md** - Roadmap for remaining implementation work

**Current Phase Status**: Phase 2 Complete ✅

---

### `/persistence/` - Persistence System Documentation
Technical documentation about terminal persistence and session management.

- **DEBUG_PERSISTENCE.md** - Debugging guide for persistence issues

**Key Concepts**: Tmux session management, LocalStorage synchronization, terminal reconnection logic, split layout persistence.

---

### `/brainstorm/` - Ideas & Ecosystem Integration
Brainstorming documents and ecosystem integration ideas.

- **ECOSYSTEM_INTEGRATION.md** - Ecosystem integration ideas and possibilities

**Use Case**: Future feature exploration and integration planning.

---

## 📖 Primary Documentation (Root Directory)

Essential documentation that lives in the project root:

- **[README.md](../README.md)** - Project overview, getting started, features (user-facing)
- **[CLAUDE.md](../CLAUDE.md)** - Architecture, development rules, AI assistant instructions
- **[LESSONS_LEARNED.md](../LESSONS_LEARNED.md)** - Bug insights, common pitfalls, prevention strategies
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history, bug fixes, feature additions
- **[PLAN.md](../PLAN.md)** - Development roadmap and technical debt tracking

---

## 🗺️ Quick Navigation

### For New Contributors:
1. Start with **[/README.md](../README.md)** - Project overview
2. Read **[/CLAUDE.md](../CLAUDE.md)** - Development guidelines and architecture
3. Review **[/PLAN.md](../PLAN.md)** - Current roadmap and technical decisions

### For Debugging Issues:
1. Check **[/LESSONS_LEARNED.md](../LESSONS_LEARNED.md)** - Common pitfalls and solutions
2. Search **[bugs/](bugs/)** directory - Past bug investigations
3. Reference **[reference/](reference/)** - Technical patterns and guidelines

### For Planning New Features:
1. Review **[planning/](planning/)** - Existing plans and analysis
2. Check **[phases/REMAINING_PHASES.md](phases/REMAINING_PHASES.md)** - Current roadmap
3. Reference **[/PLAN.md](../PLAN.md)** - Technical debt and priorities

### For Understanding Architecture:
1. Read **[/CLAUDE.md](../CLAUDE.md)** - Complete architecture overview
2. Check **[reference/SPLIT_LAYOUT_DESIGN.md](reference/SPLIT_LAYOUT_DESIGN.md)** - Split layout design
3. Review **[phases/](phases/)** - Implementation phases and decisions

### For Historical Context:
1. Browse **[archived/](archived/)** - Completed work and old notes
2. Check **[reference/OPUSTRATOR_LEGACY_AUDIT.md](reference/OPUSTRATOR_LEGACY_AUDIT.md)** - Legacy code audit

---

## 📝 Documentation Standards

When creating new documentation:

1. **Keep it current** - Update docs when code changes
2. **Be concise** - Link to detailed docs rather than duplicating
3. **Use examples** - Code snippets and screenshots help
4. **Date your updates** - Add timestamps to major changes
5. **Organize properly** - Use the right folder for the right purpose

### File Naming Convention:
- **UPPERCASE.md** - Primary docs in root (e.g., `PLAN.md`, `CLAUDE.md`)
- **TITLE_CASE.md** - Category-specific docs (e.g., `Split_Layout.md`)
- **Prefix with category** - If applicable (e.g., `PHASE_1_*.md`)

### When to Update Which Docs:

**After Completing Work** (features, bug fixes):
1. **[/CHANGELOG.md](../CHANGELOG.md)** - Add version entry with changes
2. **[/LESSONS_LEARNED.md](../LESSONS_LEARNED.md)** - Capture key insights from complex bugs
3. **[/CLAUDE.md](../CLAUDE.md)** - Update ONLY for architecture changes

**After Debugging**:
1. Create file in **[bugs/](bugs/)** - Document investigation and solution
2. Update **[/LESSONS_LEARNED.md](../LESSONS_LEARNED.md)** - Add prevention strategies

**When Planning Features**:
1. Create file in **[planning/](planning/)** - Document plan and analysis
2. Update **[/PLAN.md](../PLAN.md)** - Add to roadmap

---

## 🔄 Recent Changes

**November 21, 2025** - Major documentation reorganization
- Created `/bugs/` folder for bug investigations (5 files moved)
- Created `/planning/` folder for planning docs (5 files moved)
- Moved historical docs to `/archived/` (6 files)
- Removed duplicate session prompts (3 files deleted)
- Root directory cleaned up: 24 files → 6 core files
- Updated this index to reflect new structure

**November 18, 2025** - Profiles system implementation
- Profiles infrastructure complete (working directory + appearance settings)
- Tab close buttons working (PTY processes properly killed)
- Fresh start philosophy adopted (no session restoration)

**November 9, 2025** - Split layout completion
- Split layouts fully implemented and persistent
- Individual pane close buttons added
- Exit command handling implemented
- Race condition fixes complete

---

## 📊 Documentation Stats

| Category | Files | Purpose |
|----------|-------|---------|
| **Root** | 6 | Core documentation (README, CLAUDE, LESSONS, CHANGELOG, PLAN, audit) |
| **bugs/** | 5 | Bug investigations and debugging notes |
| **planning/** | 5 | Feature planning and analysis |
| **archived/** | 7 | Historical and completed work |
| **reference/** | 6 | Technical reference materials |
| **phases/** | 4 | Implementation phase tracking |
| **persistence/** | 1 | Persistence system documentation |
| **brainstorm/** | 1 | Ideas and ecosystem integration |

**Total**: 35 organized documentation files

---

**Need help finding something?** Use the Quick Navigation section above or search by category folder!
