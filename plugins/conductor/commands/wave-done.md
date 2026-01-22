---
name: gg-wave-done
description: "Clean up after a wave of workers completes"
argument-hint: "[ISSUE_IDS...]"
---

# Wave Done - Cleanup

Clean up completed workers, worktrees, and sync beads. You handle this directly using MCP tools.

## Quick Cleanup (Single Issue)

```python
ISSUE_ID = "bd-abc"

# 1. Verify issue is closed
issue = mcp__beads__show(issue_id=ISSUE_ID)
if issue[0]['status'] != 'closed':
    print(f"Warning: {ISSUE_ID} not closed yet")
```

```bash
ISSUE_ID="bd-abc"

# 2. Kill worker terminal if still running
TOKEN=$(cat /tmp/tabz-auth-token)
AGENT_ID=$(curl -s http://localhost:8129/api/agents | jq -r --arg name "$ISSUE_ID" '.data[] | select(.name == $name) | .id')
[ -n "$AGENT_ID" ] && curl -s -X DELETE "http://localhost:8129/api/agents/$AGENT_ID" -H "X-Auth-Token: $TOKEN"

# 3. Remove worktree
git worktree remove ".worktrees/$ISSUE_ID" --force 2>/dev/null || true
git branch -d "feature/$ISSUE_ID" 2>/dev/null || true
```

```python
# 4. Announce
tabz_speak(text=f"{ISSUE_ID} cleaned up")
```

---

## Batch Cleanup (Multiple Issues)

```bash
ISSUES="bd-abc bd-def bd-ghi"
TOKEN=$(cat /tmp/tabz-auth-token)

for ISSUE_ID in $ISSUES; do
    echo "Cleaning up $ISSUE_ID..."

    # Kill worker
    AGENT_ID=$(curl -s http://localhost:8129/api/agents | jq -r --arg name "$ISSUE_ID" '.data[] | select(.name == $name) | .id')
    [ -n "$AGENT_ID" ] && curl -s -X DELETE "http://localhost:8129/api/agents/$AGENT_ID" -H "X-Auth-Token: $TOKEN"

    # Remove worktree
    git worktree remove ".worktrees/$ISSUE_ID" --force 2>/dev/null || true
    git branch -d "feature/$ISSUE_ID" 2>/dev/null || true
done

# Sync beads
bd sync

# Push changes
git push
```

---

## Full Wave Cleanup

When all workers are done:

```python
# 1. List all workers
workers = tabz_list_terminals(state="active", response_format="json")

# 2. Find completed ones (check beads status)
completed = []
still_working = []

for w in workers['terminals']:
    name = w['name']
    if not name.startswith(('bd-', 'BD-', 'TabzChrome-', 'V4V-')):
        continue

    try:
        issue = mcp__beads__show(issue_id=name)
        if issue and issue[0]['status'] == 'closed':
            completed.append(name)
            print(f"✓ {name} - ready for cleanup")
        else:
            still_working.append(name)
            print(f"⏳ {name} - still in progress")
    except:
        print(f"? {name} - no matching issue")
```

```bash
# 3. Kill completed workers
TOKEN=$(cat /tmp/tabz-auth-token)
for ISSUE_ID in bd-abc bd-def bd-ghi; do  # Replace with actual completed IDs
    AGENT_ID=$(curl -s http://localhost:8129/api/agents | jq -r --arg name "$ISSUE_ID" '.data[] | select(.name == $name) | .id')
    [ -n "$AGENT_ID" ] && curl -s -X DELETE "http://localhost:8129/api/agents/$AGENT_ID" -H "X-Auth-Token: $TOKEN"
done

# 4. Clean all completed worktrees
for ISSUE_ID in bd-abc bd-def bd-ghi; do
    git worktree remove ".worktrees/$ISSUE_ID" --force 2>/dev/null || true
    git branch -d "feature/$ISSUE_ID" 2>/dev/null || true
done

# 5. Final sync
bd sync
git push
```

```python
# 6. Announce
tabz_speak(text="Wave complete! All cleaned up.")
```

---

## Capture Transcripts (Optional)

Before killing workers, capture their session transcripts:

```python
ISSUE_ID = "bd-abc"

# Capture full output via MCP
output = tabz_capture_terminal(terminal=ISSUE_ID, lines=1000)

# Save to file
with open(f"/tmp/transcript-{ISSUE_ID}.txt", "w") as f:
    f.write(output)
print(f"Saved transcript to /tmp/transcript-{ISSUE_ID}.txt")
```

Or via tmux directly:
```bash
ISSUE_ID="bd-abc"
SESSION=$(curl -s http://localhost:8129/api/agents | jq -r --arg name "$ISSUE_ID" '.data[] | select(.name == $name) | .id')

if [ -n "$SESSION" ]; then
    tmux capture-pane -t "$SESSION" -p -S -10000 > "/tmp/transcript-$ISSUE_ID.txt"
    echo "Saved transcript"
fi
```

---

## Checklist

Before calling wave done:

- [ ] All issues closed in beads (`mcp__beads__show` returns `status: closed`)
- [ ] Changes committed and pushed from worktrees
- [ ] No uncommitted work in any worktree
- [ ] Ready to remove worktrees

After cleanup:

- [ ] All workers killed
- [ ] All worktrees removed
- [ ] Branches deleted
- [ ] Beads synced
- [ ] Git pushed

---

## Notes

- **Capture before kill** if you want transcripts
- **Check status first** - don't kill workers still in progress
- **Force remove** worktrees to handle uncommitted changes
- **Sync beads** before final push to ensure consistency
