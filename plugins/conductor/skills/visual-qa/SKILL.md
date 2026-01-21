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

### Step 2: Tab Group Isolation (MANDATORY)

BEFORE any browser work, create YOUR OWN tab group with a random 3-digit suffix.

This is mandatory because:
- User can switch tabs at any time - active tab is unreliable
- Multiple Claude workers may run simultaneously
- Your operations target YOUR tabs, not the user's browsing

```bash
# 1. Generate random ID
SESSION_ID="Claude-$(shuf -i 100-999 -n 1)"

# 2. Create group
mcp-cli call tabz/tabz_create_group '{"title": "'$SESSION_ID'", "color": "cyan"}'
# Returns: {"groupId": 123, ...}

# 3. Open URLs into YOUR group (use returned groupId)
mcp-cli call tabz/tabz_open_url '{"url": "https://example.com", "groupId": 123}'

# 4. Always use explicit tabId from your group - NEVER rely on active tab
```

### Step 3: Run Smoke Test (if needed)

If `NEEDS_VISUAL=1`, do the quickest relevant check:
- Open the extension side panel and ensure it loads
- Trigger the affected UI path
- Check browser console for errors
- Take a screenshot for evidence

If you have Tabz MCP available, you can use it (preferred):
- `tabz_get_console_logs` (errors)
- `tabz_screenshot` (capture)
- `tabz_enable_network_capture` + `tabz_get_network_requests` (API failures)

**Always pass explicit `tabId`** - never rely on "active tab":
```bash
# Get your tab's ID from your group
mcp-cli call tabz/tabz_screenshot '{"tabId": YOUR_TAB_ID}'
mcp-cli call tabz/tabz_get_console_logs '{"tabId": YOUR_TAB_ID}'
```

If Tabz MCP isn't available, do a manual check and note it.

### Step 4: Write Checkpoint File

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

