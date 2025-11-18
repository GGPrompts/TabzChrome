# Tabz Documentation Index

This directory contains all project documentation organized by category.

## 📂 Directory Structure

### `/phases/` - Implementation Phase Documentation
Phase-by-phase implementation guides and progress tracking for the split layout system.

- **PHASE_1_PROMPT.md** - Phase 1 implementation guide (split infrastructure)
- **PHASE_2_PROMPT.md** - Phase 2 implementation guide (drag-and-drop, focus)
- **PHASE_2_PROGRESS.md** - Phase 2 progress tracking and completion notes

**Current Phase Status:** Phase 2 Complete ✅ (See `/REMAINING_PHASES.md` in root)

---

### `/persistence/` - Persistence System Documentation
Technical documentation about terminal persistence and session management.

- **PERSISTENCE_INDEX.md** - Complete guide to how persistence works in Tabz
- **PERSISTENCE_COMPARISON.md** - Comparison of persistence approaches (Opustrator vs Tabz)
- **PERSISTENCE_QUICK_REFERENCE.md** - Quick reference for persistence debugging
- **DEBUG_PERSISTENCE.md** - Debugging guide for persistence issues

**Key Concepts:**
- Tmux session management
- LocalStorage synchronization
- Terminal reconnection logic
- Split layout persistence

---

### `/reference/` - Technical Reference Documentation
Reference materials for specific features and integrations.

- **OPUSTRATOR_LEGACY_AUDIT.md** - Audit of removed Opustrator code (cleanup Nov 8, 2025)
- **CLAUDE_CODE_COLORS.md** - Claude Code terminal color schemes
- **LAUNCHER.md** - Terminal launcher and spawn system documentation
- **SEND_KEYS_SAFETY.md** - Safety guidelines for send-keys functionality

---

### `/archived/` - Archived & Continuation Prompts
Outdated documentation and session continuation prompts.

- **NEXT_SESSION_PROMPT.md** - Continuation prompt template
- **NEXT_SESSION_QUICKSTART.md** - Quick start for new sessions

**Note:** These are kept for historical reference but may be outdated.

---

## 📖 Primary Documentation (Root Directory)

Essential documentation that should stay in the project root:

- **README.md** - Project overview and quick start guide
- **CLAUDE.md** - Instructions for AI assistants working on the project
- **PLAN.md** - Comprehensive development plan and architecture
- **SPLIT_LAYOUT_DESIGN.md** - Split layout system design and specification
- **REMAINING_PHASES.md** - Roadmap for remaining implementation work
- **CHANGELOG.md** - Version history and changes

---

## 🗺️ Quick Navigation

### For New Contributors:
1. Start with `/README.md` (project overview)
2. Read `/CLAUDE.md` (development guidelines)
3. Review `/PLAN.md` (architecture and design decisions)

### For Working on Split Layouts:
1. Read `/SPLIT_LAYOUT_DESIGN.md` (design spec)
2. Check `/REMAINING_PHASES.md` (current status)
3. Reference `phases/` directory for implementation guides

### For Debugging Persistence:
1. Start with `persistence/PERSISTENCE_INDEX.md`
2. Use `persistence/PERSISTENCE_QUICK_REFERENCE.md` for quick lookups
3. Check `persistence/DEBUG_PERSISTENCE.md` for troubleshooting

### For Understanding Legacy Code:
1. See `reference/OPUSTRATOR_LEGACY_AUDIT.md`
2. Review `reference/` directory for specific features

---

## 📝 Documentation Standards

When creating new documentation:

1. **Keep it current** - Update docs when code changes
2. **Be concise** - Link to detailed docs rather than duplicating
3. **Use examples** - Code snippets and screenshots help
4. **Date your updates** - Add timestamps to major changes

### File Naming Convention:
- `UPPERCASE.md` for primary docs (e.g., `PLAN.md`)
- `Title_Case.md` for feature-specific docs (e.g., `Split_Layout.md`)
- Prefix with category if applicable (e.g., `PHASE_1_*.md`)

---

## 🔄 Last Updated

**November 9, 2025** - Reorganized documentation after Phase 2 completion
- Split layouts fully implemented and persistent
- Individual pane close buttons added
- Exit command handling implemented
- Race condition fixes complete

See `/REMAINING_PHASES.md` for next steps.
