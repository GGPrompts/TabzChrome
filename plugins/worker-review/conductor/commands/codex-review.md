---
description: "Run Codex code review (read-only, cheaper). Uses GPT model for analysis."
---

# Codex Review (Read-Only)

Run a fast, read-only code review using the Codex MCP server. Cheaper and faster than Opus review, but no auto-fixes.

## Usage

```
/conductor:codex-review
/conductor:codex-review <issue-id>
```

## When to Use

- Quick review of small changes
- When you don't need auto-fixes
- Cost-conscious workflows
- As a second opinion

**For thorough review with auto-fix:** Use `/conductor:code-review` instead.

## Execute

```bash
echo "=== Codex Code Review ==="

# Get the diff
DIFF=$(git diff HEAD --stat && echo "---" && git diff HEAD)

if [ -z "$DIFF" ] || [ "$DIFF" = "---" ]; then
  DIFF=$(git diff --cached --stat && echo "---" && git diff --cached)
fi

if [ -z "$DIFF" ] || [ "$DIFF" = "---" ]; then
  echo "No changes to review"
  echo '{"passed": true, "skipped": true, "reason": "no changes"}'
  exit 0
fi

echo "Changes to review:"
git diff HEAD --stat 2>/dev/null || git diff --cached --stat
echo ""
```

Then call Codex MCP (check schema first with `mcp-cli info codex/review`):

```bash
# Review uncommitted changes in current directory
mcp-cli call codex/review '{
  "uncommitted": true,
  "prompt": "Check for bugs, security issues, and code quality problems. Focus on the diff only.",
  "title": "Review for '"${ISSUE_ID:-unknown}"'"
}'
```

**Note:** The `codex/review` tool accepts:
- `uncommitted: true` - Reviews working tree changes
- `base: "main"` - Reviews against a branch
- `commit: "abc123"` - Reviews a specific commit
- `prompt` - Custom review instructions
- `workingDirectory` - Path to repository

## Output Format

Returns JSON:

```json
{
  "passed": true,
  "issues": [],
  "summary": "No issues found"
}
```

Or with issues:

```json
{
  "passed": false,
  "issues": [
    {"severity": "critical", "file": "src/api.ts", "line": 42, "issue": "SQL injection risk"}
  ],
  "summary": "1 critical issue found"
}
```

## Error Handling

If `passed: false`:
1. Review the issues listed
2. Fix critical/important issues
3. Re-run `/conductor:codex-review`

## Limitations

Unlike `/conductor:code-review`:
- No auto-fixes (read-only)
- Less context about project conventions
- May miss subtle issues

## Composable With

- `/conductor:verify-build` - Run build before review
- `/conductor:run-tests` - Run tests before review
- `/conductor:commit-changes` - Run after review passes
- `/conductor:worker-done` - Can use this instead of code-review
