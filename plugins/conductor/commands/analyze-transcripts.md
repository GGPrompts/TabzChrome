---
description: "Analyze worker session transcripts to find patterns, missed opportunities, and improvement areas"
---

# Analyze Transcripts

Review captured worker session transcripts to identify:
- Skills/agents that were or weren't used
- Patterns of confusion or getting stuck
- Follow-up work that was missed
- Workflow improvements

## Usage

```bash
# Analyze all transcripts
/conductor:analyze-transcripts

# Analyze specific issue(s)
/conductor:analyze-transcripts TabzChrome-abc TabzChrome-def

# Analyze recent transcripts (last N)
/conductor:analyze-transcripts --recent 5
```

## Transcript Location

Transcripts are saved to `.beads/transcripts/<issue-id>.txt` by wave-done before sessions are killed.

## Analysis Steps

### 1. Find Transcripts

```bash
echo "=== Finding Transcripts ==="

TRANSCRIPT_DIR=".beads/transcripts"
if [ ! -d "$TRANSCRIPT_DIR" ]; then
  echo "No transcripts found at $TRANSCRIPT_DIR"
  exit 0
fi

# List available transcripts
ls -la "$TRANSCRIPT_DIR"/*.txt 2>/dev/null | head -20
```

### 2. Read and Analyze

For each transcript, analyze:

#### a) Skill Usage
```bash
# Check if skills were invoked
grep -E "^/[a-z]+-[a-z]+|Skill\(" "$TRANSCRIPT_FILE" || echo "No skill invocations found"
```

**Look for:**
- `/skill-name:skill-name` invocations
- `Skill(...)` tool calls
- References to skill content being loaded

#### b) Confusion Patterns
```bash
# Look for signs of confusion or retries
grep -iE "error|failed|retry|stuck|confused|unclear|not sure" "$TRANSCRIPT_FILE" | head -10
```

**Patterns indicating issues:**
- Multiple retries of same action
- "I'm not sure how to..."
- Build/test failures requiring multiple fixes
- Long pauses before action

#### c) Missed Follow-ups
```bash
# Look for TODOs, FIXMEs mentioned but not tracked
grep -E "TODO|FIXME|should also|need to|later|follow.?up" "$TRANSCRIPT_FILE" | head -10
```

**Check if worker:**
- Mentioned future work but didn't create issues
- Found edge cases but didn't track them
- Noted improvements but moved on

#### d) Tool Usage
```bash
# Check which tools were used
grep -E "Read|Write|Edit|Bash|Glob|Grep" "$TRANSCRIPT_FILE" | wc -l
```

### 3. Generate Report

```markdown
## Transcript Analysis: ISSUE-ID

### Skill Usage
- [ ] Skills invoked at start: (list)
- [ ] Skills used during work: (list)
- [ ] Skills that should have been used: (list)

### Worker Effectiveness
- Time to first action: ~X minutes
- Build/test retries: N
- Confusion points: (describe)

### Missed Opportunities
- Follow-ups not created: (list)
- TODOs left untracked: (list)

### Recommendations
1. ...
2. ...
```

## Batch Analysis

For analyzing patterns across multiple transcripts:

```bash
echo "=== Batch Analysis ==="

# Count skill usage across all transcripts
echo "Skill invocation frequency:"
grep -rh "^/[a-z]" .beads/transcripts/ 2>/dev/null | sort | uniq -c | sort -rn | head -10

# Common errors
echo ""
echo "Common errors:"
grep -rhi "error\|failed" .beads/transcripts/ 2>/dev/null | sort | uniq -c | sort -rn | head -10

# Workers that didn't use skills
echo ""
echo "Transcripts with no skill invocations:"
for f in .beads/transcripts/*.txt; do
  if ! grep -qE "^/[a-z]+-[a-z]+" "$f" 2>/dev/null; then
    basename "$f" .txt
  fi
done
```

## AI-Assisted Analysis

For deeper analysis, use Codex:

```bash
# Analyze transcript with Codex
TRANSCRIPT=$(cat .beads/transcripts/ISSUE-ID.txt)

mcp-cli call codex/review "$(jq -n --arg content "$TRANSCRIPT" '{
  prompt: "Analyze this Claude worker session transcript. Identify: 1) Were skills properly used? 2) What caused confusion? 3) What follow-up work was missed? 4) How could the prompt have been better?",
  content: $content
}')"
```

## Improvement Actions

Based on analysis, update:

| Finding | Action |
|---------|--------|
| Skills not invoked | Update prompt template to be more explicit |
| Same errors repeated | Add to worker-done error handling |
| Follow-ups missed | Strengthen create-followups step |
| Confusion on X | Add guidance to bd-swarm prompts |

## Related

- `/conductor:wave-done` - Captures transcripts before killing sessions
- `/conductor:create-followups` - Track discovered work
- `.beads/transcripts/` - Transcript storage location
