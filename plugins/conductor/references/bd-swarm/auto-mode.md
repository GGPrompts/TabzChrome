# Auto Mode - BD Swarm

Fully autonomous backlog completion. Runs until `bd ready` returns empty.

**Invoke with:** `/conductor:bd-swarm --auto`

**Sets `AUTO_MODE=true`** - Workers receive `MODE: AUTONOMOUS` marker and will not ask questions.

## Wave Loop

```bash
WAVE=1
while true; do
  READY=$(bd ready --json | jq -r '.[].id')
  [ -z "$READY" ] && break

  echo "=== Wave $WAVE: $(echo "$READY" | wc -l) issues ==="

  # PHASE 1: Initialize ALL worktrees in parallel (deps included)
  for ISSUE in $READY; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo "Skipping invalid: $ISSUE" >&2; continue; }
    plugins/conductor/scripts/setup-worktree.sh "$ISSUE" &
  done
  wait  # Block until all worktrees ready with deps
  echo "All worktrees initialized for wave $WAVE"

  # PHASE 2: Spawn workers (worktrees already have deps)
  for ISSUE in $READY; do
    [[ "$ISSUE" =~ ^[a-zA-Z0-9_-]+$ ]] || continue
    spawn_worker "$ISSUE"
  done

  # Monitor until wave complete
  monitor_wave "$READY"

  # Merge wave results
  plugins/conductor/scripts/completion-pipeline.sh "$READY"

  # Audio announcement for wave completion
  ISSUE_COUNT=$(echo "$READY" | wc -w)
  curl -s -X POST http://localhost:8129/api/audio/speak \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg text "Wave $WAVE complete. $ISSUE_COUNT issues merged. Starting next wave." \
      '{text: $text, voice: "en-GB-SoniaNeural", rate: "+15%", priority: "high"}')" \
    > /dev/null 2>&1 &

  WAVE=$((WAVE + 1))
done

# Final completion with audio
bd sync && git push origin main
curl -s -X POST http://localhost:8129/api/audio/speak \
  -H "Content-Type: application/json" \
  -d '{"text": "Backlog complete! All waves finished and pushed to main.", "voice": "en-GB-SoniaNeural", "rate": "+15%", "priority": "high"}' \
  > /dev/null 2>&1 &
echo "Backlog complete!"
```

## Auto Mode vs Interactive

| Aspect | Interactive | Auto |
|--------|-------------|------|
| Worker count | Ask user | All ready issues |
| Waves | One wave | Repeat until empty |
| Decisions | AskUserQuestion | Reasonable defaults |
| Context check | Manual | Auto /wipe at 75% |

## Prompt Header for Autonomous Workers

```markdown
**MODE: AUTONOMOUS**

Do NOT use AskUserQuestion. Make reasonable defaults for any ambiguity.
If truly blocked, close issue with reason 'needs-clarification' and create follow-up.
```

## Context Recovery

If conductor hits 75% context:

```bash
# Save state
echo "$WAVE" > /tmp/conductor:bd-swarm-wave.txt

# Trigger /wipe with handoff
# Resume with: /conductor:bd-swarm --auto --resume
```
