---
name: reviewing-code
description: "Code review checkpoint for conductor gates. Calls codex/review MCP tool to analyze code changes. Returns structured result with pass/fail status, issues found, and whether visual QA is needed. Use when: 'code review', 'review changes', 'codex review', 'check my code'."
user-invocable: true
---

# Codex Review Checkpoint

Code review checkpoint that runs a Codex review on the current worktree.

Supports two backends:
1. **Codex MCP** (`mcp-cli call codex/review ...`) if available
2. **Codex CLI** (`codex review ...`) as a reliable fallback

## What This Skill Does

1. Determines what to review (uncommitted changes vs branch diff)
2. Runs Codex review (MCP preferred, CLI fallback)
3. Parses results into structured format
4. Writes result to checkpoint file

## Workflow

### Step 1: Determine Review Scope

Check what needs reviewing:

```bash
# Check for uncommitted changes
git status --porcelain

# If clean, get branch for comparison
git rev-parse --abbrev-ref HEAD
```

### Step 2: Run Codex Review

Prefer Codex MCP (structured). Fall back to Codex CLI if MCP isn't configured.

**Detect MCP availability:**
```bash
mcp-cli info codex/review >/dev/null 2>&1 && echo "codex MCP available" || echo "codex MCP not available"
```

#### Option A: Codex MCP (preferred)

```bash
# For uncommitted changes
mcp-cli call codex/review '{"uncommitted": true, "title": "Checkpoint Review"}'

# For branch diff against main
mcp-cli call codex/review '{"base": "main", "title": "Checkpoint Review"}'
```

#### Option B: Codex CLI (fallback)

```bash
# For uncommitted changes
codex review --uncommitted --title "Checkpoint Review"

# For branch diff against main
codex review --base main --title "Checkpoint Review"
```

### Step 3: Parse and Write Result

After reviewing, create a structured result:

```json
{
  "checkpoint": "codex-review",
  "timestamp": "2026-01-19T12:00:00Z",
  "passed": true,
  "issues": [],
  "needs_visual": false,
  "summary": "No critical issues found"
}
```

**Result Fields:**
- `passed`: true if no blocking issues found
- `issues`: array of `{severity: "error"|"warning"|"info", message: string, file?: string, line?: number}`
- `needs_visual`: true if UI changes detected that require visual QA
- `summary`: brief human-readable summary

### Step 4: Write Checkpoint File

Write result to `.checkpoints/codex-review.json`:

```bash
mkdir -p .checkpoints
cat > .checkpoints/codex-review.json << 'EOF'
{
  "checkpoint": "codex-review",
  "timestamp": "...",
  "passed": true,
  "issues": [],
  "needs_visual": false,
  "summary": "..."
}
EOF
```

## Decision Criteria

**Pass if:**
- No errors in review output
- No security vulnerabilities detected
- No obvious bugs or logic errors

**Fail if:**
- Security issues found
- Critical bugs detected
- Code doesn't compile/type-check

**Needs Visual QA if:**
- Changes touch UI components
- CSS/styling changes detected
- New pages or routes added

## Example Usage

When invoked as `/codex-review`:

```
Running Codex review checkpoint...

Reviewing uncommitted changes...
Found 3 modified files, 1 new file.

Calling codex/review...
Review complete. 2 suggestions, 0 errors.

Result:
{
  "passed": true,
  "issues": [
    {"severity": "info", "message": "Consider adding error handling", "file": "api.ts", "line": 45}
  ],
  "needs_visual": true,
  "summary": "Minor suggestions only. UI changes detected - visual QA recommended."
}

Checkpoint result written to .checkpoints/codex-review.json
```
