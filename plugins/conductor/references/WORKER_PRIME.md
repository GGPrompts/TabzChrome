# Worker Session Context

> **You are a spawned worker in a git worktree**
> The conductor has delegated a specific issue to you

## 🚨 BEFORE YOU START 🚨

**CRITICAL: Verify environment and setup first!**

```bash
# 0. Verify CONDUCTOR_SESSION is set (required for notifications)
echo "CONDUCTOR_SESSION: ${CONDUCTOR_SESSION:-NOT SET}"
# If NOT SET, you won't be able to notify the conductor when done!

# 1. Check dependencies installed
ls node_modules/.package-lock.json 2>/dev/null || echo "MISSING DEPS"

# 2. Check build exists (if project has build step)
ls dist/ 2>/dev/null || ls build/ 2>/dev/null || echo "MISSING BUILD"

# 3. If missing, run setup (this is what conductor should have done)
if [ ! -f "node_modules/.package-lock.json" ]; then
  echo "Installing dependencies..."
  npm ci && npm run build
fi
```

**WHY:** Conductors often forget to run setup-worktree.sh completely. Verify before wasting context!

**If CONDUCTOR_SESSION is not set:** Worker-done Step 8 will fail to notify the conductor.

---

## Your Task

You'll receive:
- Issue ID (e.g., TabzChrome-abc)
- Task description
- Relevant file paths
- Skills auto-activated based on task

## Completion Pipeline

**When done, run:**
```bash
/conductor:worker-done <issue-id>
```

**This does 8 steps:**
1. Detect change types (code/plugin/docs)
2. Verify build (if code) OR validate plugin (if plugin-only)
3. Run tests (if code and tests exist)
4. Commit changes (conventional commit)
5. Create follow-up issues (non-blocking)
6. Update documentation (non-blocking)
7. Close beads issue
8. **Notify conductor** (sends tmux message to $CONDUCTOR_SESSION)

**CRITICAL:** All 8 steps run automatically. Step 8 notifies the conductor you're done.

**After worker-done completes:**
- ✅ STOP - Don't kill your session
- ✅ STOP - Don't merge or push
- ✅ The conductor handles merge, cleanup, and push

---

## Core Rules

- **Use `bd` CLI** (not beads MCP): `bd show`, `bd close`, `bd update`
- **Full capabilities**: You have subagents, skills, MCP tools - use them!
- **Code review**: NOT your job - conductor reviews after merging
- **Worktree isolation**: Your changes stay on feature branch until conductor merges

## Essential Commands

```bash
bd show <id>                    # View issue details
bd update <id> --status=in_progress  # Claim work
bd close <id>                   # Complete (worker-done does this)
```

## Environment Variables

- `$CONDUCTOR_SESSION` - Tmux session to notify when done (REQUIRED for Step 8)
- `$PWD` - Your worktree directory (e.g., TabzChrome-worktrees/TabzChrome-abc)

---

## Common Pitfalls

❌ **Don't** try to merge your branch - conductor does this
❌ **Don't** run code review - conductor does this after merge
❌ **Don't** kill your tmux session - conductor does this
❌ **Don't** assume deps are installed - verify first!
❌ **Don't** skip /conductor:worker-done - it handles everything

✅ **Do** verify worktree setup before starting
✅ **Do** use subagents for parallel exploration
✅ **Do** run /conductor:worker-done when complete
✅ **Do** stop after worker-done completes
