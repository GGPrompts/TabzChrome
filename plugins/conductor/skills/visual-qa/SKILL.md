---
name: visual-qa
description: "Visual QA checkpoint. Verifies UI changes in the extension/backend via quick smoke flows, screenshots, and console/network checks. Use when: 'visual QA', 'UI looks wrong', 'screenshot', 'verify in Chrome'."
user-invocable: true
model: haiku
allowed-tools: Read, Grep, Glob, Bash
---

# Visual QA Checkpoint

Lightweight visual smoke test for UI-facing changes.

Writes result to `.checkpoints/visual-qa.json`.

## Heuristics (v1)

- If no UI-facing files changed (no changes under `extension/` and no `*.css`, `*.tsx`, `*.jsx`) → PASS (skipped).
- Otherwise → perform a quick smoke test and record PASS/FAIL.

## Workflow

### Step 1: Detect UI-facing Changes

```bash
CHANGED=$( (git diff --name-only main...HEAD 2>/dev/null || true) ; git diff --name-only 2>/dev/null || true ; git diff --cached --name-only 2>/dev/null || true )
CHANGED=$(echo "$CHANGED" | sed '/^$/d' | sort -u)

if echo "$CHANGED" | grep -qE '^(extension/)|(\.tsx$)|(\.jsx$)|(\.css$)'; then
  NEEDS_VISUAL=1
else
  NEEDS_VISUAL=0
fi
```

### Step 2: Run Smoke Test (if needed)

If `NEEDS_VISUAL=1`, do the quickest relevant check:
- Open the extension side panel and ensure it loads
- Trigger the affected UI path
- Check browser console for errors
- Take a screenshot for evidence

If you have Tabz MCP available, you can use it (preferred):
- `tabz_get_console_logs` (errors)
- `tabz_screenshot` (capture)
- `tabz_enable_network_capture` + `tabz_get_network_requests` (API failures)

If Tabz MCP isn’t available, do a manual check and note it.

### Step 3: Write Checkpoint File

```bash
mkdir -p .checkpoints
cat > .checkpoints/visual-qa.json << EOF
{
  "checkpoint": "visual-qa",
  "timestamp": "$(date -Iseconds)",
  "passed": ${PASSED},
  "needs_visual": ${NEEDS_VISUAL},
  "summary": "${SUMMARY}"
}
EOF
```

