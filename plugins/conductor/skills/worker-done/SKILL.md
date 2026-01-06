---
name: worker-done
description: "Complete worker task: verify build, run code review, commit, and close issue. Invoke with /conductor:worker-done <issue-id>"
---

# Worker Done - Task Completion Pipeline

Run this when you've finished implementing a feature/fix and are ready to complete your task.

## Usage

```
/conductor:worker-done TabzChrome-abc
```

Or if issue ID is in your task header, just:
```
/conductor:worker-done
```

## Pipeline Steps

Execute these steps in order. Stop if any step fails.

### Step 1: Verify Build

```bash
echo "=== Step 1: Build Verification ==="
npm run build 2>&1 | tee /tmp/build-output.txt
BUILD_EXIT=$?

if [ $BUILD_EXIT -ne 0 ]; then
  echo "BUILD FAILED - fix errors before continuing"
  tail -30 /tmp/build-output.txt
  exit 1
fi
echo "Build passed"
```

### Step 2: Run Tests (if available)

```bash
echo "=== Step 2: Test Verification ==="
if grep -q '"test"' package.json 2>/dev/null; then
  npm test 2>&1 | tee /tmp/test-output.txt
  TEST_EXIT=$?

  if [ $TEST_EXIT -ne 0 ]; then
    echo "TESTS FAILED - fix failing tests before continuing"
    exit 1
  fi
  echo "Tests passed"
else
  echo "No test script found, skipping"
fi
```

### Step 3: Code Review

Use Codex (GPT-5.2) for fast, high-quality code review:

```bash
echo "=== Step 3: Code Review (via Codex) ==="

# Get the diff for review
DIFF=$(git diff --cached --stat && git diff --cached)

# Call Codex for review (gpt-5.2 is optimized for analysis, faster than codex variants)
REVIEW_RESULT=$(mcp-cli call codex/codex "$(cat <<EOF | jq -Rs '{prompt: ., model: "gpt-5.2", sandbox: "read-only", cwd: "$(pwd)"}'
Review these code changes for issue $ISSUE_ID.

Check for:
1. Bugs or logic errors
2. Security vulnerabilities
3. Missing error handling
4. Code quality issues

Changes:
$DIFF

Respond with JSON only:
{"passed": true/false, "issues": ["issue1", "issue2"], "summary": "brief summary"}
EOF
)")

echo "$REVIEW_RESULT"
```

**Handle result:**
- If `passed: false` → Stop pipeline, fix the blockers listed
- If `passed: true` → Continue to commit

**Why GPT-5.2?** Pure analysis task - no tool use needed. GPT-5.2 is faster and better for review/planning than codex variants which are optimized for agentic execution.

### Step 4: Commit Changes

```bash
echo "=== Step 4: Commit ==="
git add .
git status --short

# Commit with conventional format
git commit -m "feat($SCOPE): $DESCRIPTION

Implements $ISSUE_ID

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <co-author>"
```

### Step 5: Create Follow-up Tasks

**Critical for research/spike tasks:** If this was a research task, create implementation issues.

```bash
echo "=== Step 5: Follow-up Tasks ==="
```

Check if follow-up work is needed:

| Task Type | Follow-up Action |
|-----------|------------------|
| Research/Spike | Create implementation issues based on findings |
| Feature | Create issues for discovered edge cases, TODOs, or future enhancements |
| Bug fix | Create issues if root cause reveals other problems |
| Refactor | Create issues for remaining cleanup identified |

**For research tasks, ALWAYS create follow-up issues:**

```bash
# Example: Research task completed, create implementation issues
bd create --title "Implement Radio Browser API" --type feature --priority 2 \
  --description "Based on research in $ISSUE_ID. See docs/research/..."

bd create --title "Add pyradio station import" --type feature --priority 3 \
  --description "Phase 2 from $ISSUE_ID research."
```

**If no follow-ups needed:**
```bash
echo "No follow-up tasks identified"
```

**If unsure, ask:**
Use AskUserQuestion to confirm if any follow-up tasks should be created before closing.

### Step 6: Update Documentation

Check if documentation needs updating for LLM consumption:

```bash
echo "=== Step 6: Documentation Check ==="
```

**What to document (bare-minimum, LLM-friendly):**

| Change Type | Documentation Action |
|-------------|---------------------|
| New API route | Add to API section in CLAUDE.md or relevant docs |
| New component | Add to component list with file path |
| New hook | Add to hooks section with usage example |
| Config change | Update config documentation |
| New env var | Add to environment setup docs |
| Breaking change | Add migration note |

**Documentation style (for-llms):**
- One-liner descriptions, not paragraphs
- File paths over explanations
- Example usage over theory
- What changed, not why

**Example additions:**

```markdown
## New in this PR

### API Routes
- `POST /api/radio/search` - Search Radio Browser stations (app/api/radio/search/route.ts)
- `GET /api/radio/pyradio` - Load user's pyradio stations (app/api/radio/pyradio/route.ts)

### Hooks
- `useRadioStations()` - Search/play internet radio (hooks/useRadioStations.ts)
```

**If docs updated:**
```bash
git add docs/ CLAUDE.md
# Will be included in the commit
```

**If no docs needed:**
```bash
echo "No documentation updates required"
```

### Step 7: Close Issue

```bash
echo "=== Step 7: Close Issue ==="
bd close $ISSUE_ID --reason "Implemented: $SUMMARY"
```

### Step 8: Notify Completion

```bash
echo "=== Task Complete ==="
echo "Issue $ISSUE_ID closed"
echo "Branch ready for merge: feature/$ISSUE_ID"

# Summary of what was done
echo ""
echo "Follow-up tasks created: [list or 'none']"
echo "Documentation updated: [files or 'none']"
```

## Error Handling

| Step | On Failure |
|------|------------|
| Build | Show errors, stop pipeline |
| Tests | Show failures, stop pipeline |
| Review | Show blockers, stop pipeline (fix and re-run `/conductor:worker-done`) |
| Commit | Show git errors |
| Follow-ups | Non-blocking - log and continue |
| Docs | Non-blocking - log and continue |
| Close | Show beads errors |

## Re-running After Fixes

If the pipeline stopped due to build/test/review failure:

1. Fix the issues
2. Run `/conductor:worker-done` again

The pipeline is idempotent - safe to re-run.

## Customizing the Pipeline

To skip steps, use flags (future enhancement):
- `/conductor:worker-done --skip-tests` - Skip test step
- `/conductor:worker-done --skip-review` - Skip code review (not recommended)

## Example Session

### Feature Implementation

```
> /conductor:worker-done TabzChrome-hyo

=== Step 1: Build Verification ===
✓ Build passed

=== Step 2: Test Verification ===
✓ Tests passed (42 tests)

=== Step 3: Code Review ===
Spawning code-reviewer subagent...
Review result: { passed: true, summary: "No issues found" }

=== Step 4: Commit ===
[feature/TabzChrome-hyo abc1234] feat(sidebar): show bookmarked profiles
 2 files changed, 150 insertions(+)

=== Step 5: Follow-up Tasks ===
No follow-up tasks identified

=== Step 6: Documentation Check ===
Added to CLAUDE.md:
  - New component: BookmarkProfileCard (components/BookmarkProfileCard.tsx)
✓ Documentation updated

=== Step 7: Close Issue ===
✓ Closed TabzChrome-hyo

=== Task Complete ===
Issue TabzChrome-hyo closed
Branch ready for merge: feature/TabzChrome-hyo

Follow-up tasks created: none
Documentation updated: CLAUDE.md
```

### Research Task (creates follow-ups)

```
> /conductor:worker-done TabzChrome-abc

=== Step 1: Build Verification ===
✓ Build passed (no code changes, research only)

=== Step 2: Test Verification ===
No test script found, skipping

=== Step 3: Code Review ===
Review result: { passed: true, summary: "Research docs look good" }

=== Step 4: Commit ===
[feature/TabzChrome-abc def5678] docs: research YouTube API integration
 1 file changed, 150 insertions(+)

=== Step 5: Follow-up Tasks ===
Creating implementation issues from research findings...
✓ Created: TabzChrome-xyz "Implement YouTube search API" (P2)
✓ Created: TabzChrome-uvw "Add YouTube player component" (P2)
✓ Created: TabzChrome-rst "Cache YouTube API responses" (P3)

=== Step 6: Documentation Check ===
Research doc created: docs/research/youtube-api.md
No CLAUDE.md updates needed (research only)

=== Step 7: Close Issue ===
✓ Closed TabzChrome-abc

=== Task Complete ===
Issue TabzChrome-abc closed
Branch ready for merge: feature/TabzChrome-abc

Follow-up tasks created: TabzChrome-xyz, TabzChrome-uvw, TabzChrome-rst
Documentation updated: docs/research/youtube-api.md
```

## After Completion

When `/conductor:worker-done` succeeds:
- Issue is closed in beads
- Commit is on the feature branch
- Worker's job is done

**The conductor is responsible for:**
- Merging the feature branch to main
- Killing this worker's tmux session
- Removing the worktree
- Deleting the feature branch

Workers do NOT kill their own session - the conductor monitors for closed issues and handles cleanup.

Execute this pipeline now.
