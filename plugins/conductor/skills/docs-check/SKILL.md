---
name: docs-check
description: "Docs/changelog checkpoint. Detects whether changes are user-facing and ensures documentation hygiene (CHANGELOG + lessons-learned) is handled or explicitly bypassed. Use when: 'docs check', 'changelog', 'release notes', 'did we update docs?'."
user-invocable: true
model: haiku
allowed-tools: Read, Grep, Glob, Bash
---

# Docs Checkpoint

Ensures documentation hygiene is not missed.

Writes result to `.checkpoints/docs-check.json`.

## Heuristics (v1)

- **Docs-only change** (only `*.md`, `*.txt`, or files under `.claude/`, `.claude-plugin/`, `docs/`, `plugins/`) → PASS
- **Code change** (anything else) → requires one of:
  - `CHANGELOG.md` updated, OR
  - an explicit bypass label on the issue (recommended): `no-changelog`

Why the bypass label? Some changes are internal/refactors and not user-facing. The label makes that decision explicit and searchable.

## Workflow

### Step 1: Identify Issue + Diff

You should be given an issue ID in the prompt (e.g. `TabzChrome-abc`).

Determine changed files:

```bash
git status --porcelain

# If clean, compare to main
git diff --name-only main...HEAD

# If not clean, prefer staged+unstaged
git diff --name-only
git diff --cached --name-only
```

### Step 2: Decide PASS/FAIL

```bash
CHANGED=$( (git diff --name-only main...HEAD 2>/dev/null || true) ; git diff --name-only 2>/dev/null || true ; git diff --cached --name-only 2>/dev/null || true )
CHANGED=$(echo "$CHANGED" | sed '/^$/d' | sort -u)

# Docs-only patterns (v1)
if echo "$CHANGED" | grep -qvE '(\.md|\.markdown|\.txt)$' \
  && echo "$CHANGED" | grep -qvE '^(docs/|plugins/|\.claude/|\.claude-plugin/)'; then
  CODE_CHANGED=1
else
  CODE_CHANGED=0
fi
```

If `CODE_CHANGED=1`, check:

```bash
# Changelog modified?
git diff --name-only main...HEAD 2>/dev/null | grep -q '^CHANGELOG\.md$' && CHANGELOG_OK=1 || CHANGELOG_OK=0

# Issue has bypass label?
LABELS=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].labels[]?' 2>/dev/null || true)
echo "$LABELS" | grep -qx 'no-changelog' && BYPASS=1 || BYPASS=0
```

- If `CHANGELOG_OK=1` OR `BYPASS=1` → PASS
- Else → FAIL and ask for either a `CHANGELOG.md` entry or a `no-changelog` label.

### Step 3: Write Checkpoint File

```bash
mkdir -p .checkpoints
cat > .checkpoints/docs-check.json << EOF
{
  "checkpoint": "docs-check",
  "timestamp": "$(date -Iseconds)",
  "passed": ${PASSED},
  "code_changed": ${CODE_CHANGED},
  "changelog_updated": ${CHANGELOG_OK},
  "bypass_label": ${BYPASS},
  "summary": "${SUMMARY}"
}
EOF
```

