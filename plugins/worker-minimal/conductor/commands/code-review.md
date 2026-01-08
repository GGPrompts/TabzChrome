---
description: "Code review with confidence-based filtering. Modes: quick (lint+types), standard (Opus), thorough (parallel agents). Auto-fixes ≥95% confidence issues."
---

# Code Review

Review uncommitted changes with confidence-based filtering. Only reports issues with ≥80% confidence. Auto-fixes issues with ≥95% confidence.

## Usage

```bash
/conductor:code-review                    # Standard review (Opus)
/conductor:code-review --quick            # Fast: lint + types + secrets only
/conductor:code-review --thorough         # Deep: parallel specialized reviewers
/conductor:code-review <issue-id>         # Review for specific issue
```

## Review Modes

### Quick Mode (`--quick`)

Fast checks only - use for trivial changes (docs, config, comments):

```bash
echo "=== Quick Code Review ==="

# Lint check
LINT_ERRORS=$(npm run lint 2>&1 | grep -c "error" || echo "0")

# Type check
TYPE_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "error" || echo "0")

# Secret scan
SECRETS=$(grep -rn "api[_-]?key\|secret\|password\|token" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | grep -v "process.env\|import\|type\|interface" | wc -l)

if [ "$LINT_ERRORS" -eq 0 ] && [ "$TYPE_ERRORS" -eq 0 ] && [ "$SECRETS" -eq 0 ]; then
  echo '{"passed": true, "mode": "quick", "summary": "Quick review passed"}'
else
  echo "Lint errors: $LINT_ERRORS, Type errors: $TYPE_ERRORS, Potential secrets: $SECRETS"
  echo '{"passed": false, "mode": "quick", "summary": "Quick checks failed"}'
fi
```

### Standard Mode (default)

Spawns the `conductor:code-reviewer` agent (Opus) for thorough single-agent review:

```markdown
Task(
  subagent_type="conductor:code-reviewer",
  prompt="Review uncommitted changes in $(pwd) for issue ${ISSUE_ID:-unknown}"
)
```

The agent will:
1. Read CLAUDE.md files in affected directories
2. Review all changes against project conventions
3. Score each issue on confidence scale (0-100)
4. Auto-fix issues with ≥95% confidence
5. Flag issues with 80-94% confidence
6. Skip issues with <80% confidence (likely false positives)
7. Return JSON with `passed` boolean

### Thorough Mode (`--thorough`)

Spawns parallel specialized reviewers for comprehensive analysis. Use for:
- Large PRs (>500 lines changed)
- Security-sensitive code
- Critical paths (auth, payments, data handling)

```markdown
## Thorough Review Pipeline

Spawn these agents in PARALLEL (single message with multiple Task calls):

### Agent 1: CLAUDE.md Compliance
Task(
  subagent_type="general-purpose",
  model="haiku",
  prompt="Read all CLAUDE.md files in this repo. Then review the git diff for violations of any explicit rules. Return JSON: {violations: [{file, line, rule, confidence}]}"
)

### Agent 2: Bug Scanner
Task(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="Review git diff HEAD for bugs: null access, race conditions, logic errors, off-by-one. Focus ONLY on changed lines. Return JSON: {bugs: [{file, line, issue, confidence}]}"
)

### Agent 3: Silent Failure Hunter
Task(
  subagent_type="general-purpose",
  model="sonnet",
  prompt="Review git diff HEAD for silent failures: empty catch blocks, swallowed errors, fallbacks that hide problems, missing error logging. Return JSON: {failures: [{file, line, issue, confidence}]}"
)

### Agent 4: Security Scanner
Task(
  subagent_type="general-purpose",
  model="haiku",
  prompt="Review git diff HEAD for security issues: XSS, injection, exposed secrets, insecure patterns. Return JSON: {security: [{file, line, issue, severity, confidence}]}"
)
```

After all agents complete:
1. Merge results
2. Filter to confidence ≥80
3. Deduplicate overlapping issues
4. Return combined JSON

## Confidence Scale

| Score | Meaning | Action |
|-------|---------|--------|
| 0 | False positive, pre-existing issue | Skip |
| 25 | Might be real, can't verify, not in CLAUDE.md | Skip |
| 50 | Real but minor nitpick, low impact | Skip |
| 75 | Likely real, but not certain | Skip |
| **80-94** | Verified OR explicit CLAUDE.md violation | **Flag** |
| **95-100** | Certain - confirmed bug or clear rule | **Auto-fix** |

## False Positives to Ignore

The reviewer will skip these even if they look like issues:

- Pre-existing issues (before this change)
- Lines not modified in the diff
- Linter/typechecker territory (CI catches these)
- Intentional functionality changes
- Style preferences NOT in CLAUDE.md
- General "best practices" not required by project
- Hypothetical bugs without evidence
- Test-only code (mocks, fixtures)
- Silenced lint rules (`// eslint-disable`)

## Output Format

All modes return JSON:

```json
{
  "passed": true,
  "mode": "standard",
  "summary": "Reviewed 5 files. Auto-fixed 2 issues. No blockers.",
  "claude_md_checked": ["CLAUDE.md"],
  "auto_fixed": [
    {"file": "src/utils.ts", "line": 45, "issue": "Unused import", "confidence": 98}
  ],
  "flagged": [
    {"severity": "important", "file": "src/api.ts", "line": 23, "issue": "Missing error handling", "confidence": 85, "rule": "CLAUDE.md requires try-catch"}
  ],
  "blockers": []
}
```

### Blocker Conditions

`passed: false` if ANY of:
- Security vulnerability (XSS, injection, secrets)
- Data loss risk
- Certain crash path
- Critical CLAUDE.md violation

## Composable With

- `/conductor:verify-build` - Run build before review
- `/conductor:run-tests` - Run tests before review
- `/conductor:commit-changes` - Run after review passes
- `/conductor:worker-done` - Full pipeline (includes this)

## Choosing a Mode

| Situation | Mode |
|-----------|------|
| Docs, README, comments | `--quick` |
| Normal feature/fix | (default) |
| Security-sensitive code | `--thorough` |
| Large refactor (>500 lines) | `--thorough` |
| Auth, payments, data handling | `--thorough` |
| Config changes only | `--quick` |
| Adding tests | `--quick` |
