---
name: gg-wave-done
description: "Batch cleanup when individual cleanups were skipped - capture, merge, cleanup, summary"
argument-hint: "ISSUE1 ISSUE2 ISSUE3..."
---

# Wave Done - Batch Completion

Batch cleanup for multiple issues when you **skipped** individual `/cleanup:done` calls.

## When to Use

| Scenario | Use |
|----------|-----|
| Normal auto mode | `/cleanup:done` per issue (automatic) |
| Skipped cleanups | `/conductor:wave-done` for batch |
| Just want stats | `wave-summary.sh` directly |

**In `/conductor:auto`**, cleanup happens immediately per-issue. Use this command only if:
- You ran workers manually without auto mode
- Cleanup was skipped/failed for some issues
- You want to batch-process remaining uncleaned issues

## Usage

```
/conductor:wave-done V4V-abc V4V-def V4V-ghi
```

Or collect from events file:

```bash
CLOSED=$(cat /tmp/worker-events.jsonl 2>/dev/null | jq -sr '[.[].issue] | unique | join(" ")')
/conductor:wave-done $CLOSED
```

## What It Does

The completion pipeline runs these steps:

1. **Capture Sessions** - Transcript + token usage + cost (if not already captured)
2. **Kill Terminals** - Stop worker sessions via TabzChrome API
3. **Merge Branches** - Feature branches to main (handles conflicts gracefully)
4. **Cleanup Worktrees** - Remove worktrees and delete merged branches
5. **Wave Summary** - Total costs, git stats, next wave status

## Steps

Add these to your to-dos:

1. **Verify issues are closed** - All workers must be done
2. **Run completion pipeline** - Full cleanup with cost tracking
3. **Sync and push** - Final git operations

---

## Step 1: Verify Issues are Closed

```bash
ISSUES="V4V-abc V4V-def V4V-ghi"

for ISSUE in $ISSUES; do
  STATUS=$(bd show "$ISSUE" --json | jq -r '.[0].status')
  [ "$STATUS" != "closed" ] && echo "WARNING: $ISSUE not closed (status: $STATUS)"
done
```

## Step 2: Run Completion Pipeline

```bash
ISSUES="V4V-abc V4V-def V4V-ghi"

# Find the completion-pipeline.sh script
PIPELINE=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "completion-pipeline.sh" 2>/dev/null | head -1)

# Run with audio notification
AUDIO=1 "$PIPELINE" "$ISSUES"
```

**Environment options:**
- `AUDIO=1` - Enable TTS notification when done
- `SKIP_CAPTURE=1` - Skip session transcript capture
- `SKIP_MERGE=1` - Skip branch merging
- `SKIP_CLEANUP=1` - Skip worktree removal

## Step 3: Sync and Push

```bash
bd sync
git push
```

## Quick Reference

```bash
ISSUES="V4V-abc V4V-def V4V-ghi"

# Full cleanup with audio notification
PIPELINE=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "completion-pipeline.sh" 2>/dev/null | head -1)
AUDIO=1 "$PIPELINE" "$ISSUES"

# Final sync
bd sync && git push
```

## Wave Summary Output

The completion pipeline generates a detailed summary:

```
========================================================================
                         WAVE COMPLETE
========================================================================

Issues Completed (3/3):
------------------------------------------------------------------------
  [x] V4V-abc              Add user authentication ($0.42)
  [x] V4V-def              Fix search pagination ($0.18)
  [x] V4V-ghi              Update API docs ($0.05)

Cost Summary:
------------------------------------------------------------------------
  Input Tokens:       45000
  Cache Write Tokens: 12000
  Cache Read Tokens:  89000
  Output Tokens:      8500
  Tool Calls:         156
  Skill Invocations:  12
  ----------------------------------------
  Total Cost:         $0.65

Git Statistics:
------------------------------------------------------------------------
  Branches merged:    3
  Files changed:      24
  Lines added:        +892
  Lines removed:      -156

Next Steps:
------------------------------------------------------------------------
  5 issues ready for next wave
  Run: /conductor:auto
```

## JSON Output

For automation, use `--json` flag with wave-summary.sh directly:

```bash
SUMMARY=$(find ~/plugins ~/.claude/plugins ~/projects/TabzChrome/plugins -name "wave-summary.sh" 2>/dev/null | head -1)
"$SUMMARY" "$ISSUES" --json | jq '.tokens.total_cost_usd'
```

## Transcripts Location

Session transcripts with cost stats are saved to:
- `.beads/transcripts/<issue-id>.txt`

Stats are also attached to issue notes for later analysis.

## Related Commands

| Command | Purpose |
|---------|---------|
| `/cleanup:done ISSUE` | Single issue cleanup |
| `/conductor:auto` | Autonomous worker loop |
| `/conductor:status` | Check worker status |

## Error Handling

| Scenario | Action |
|----------|--------|
| Issue not closed | Warning, but continues with others |
| Merge conflict | Stops that merge, continues with others, reports at end |
| Session already dead | Skips capture, continues |
| Missing worktree | Skips removal, continues |

If merge conflicts occur, resolve them manually, then re-run:
```bash
"$PIPELINE" "CONFLICTED_ISSUE_ID"
```
