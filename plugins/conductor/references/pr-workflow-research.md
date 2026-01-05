# Worker PR Workflow Research

Research on how workers could create PRs instead of direct merges, with automated code review integration.

## Current Workflow (Direct Merge)

```
Worker completes → code-reviewer → commit → bd close → local merge to main
```

Workers currently:
1. Work in isolated worktrees with feature branches
2. Run `/conductor:worker-done` which triggers code-reviewer subagent
3. Commit directly to their feature branch
4. Close the beads issue
5. Conductor merges locally: `git merge --no-edit feature/issue-id`
6. Push to main

**Limitations:**
- No PR review trail
- No opportunity for human review before merge
- No GitHub Actions integration
- Harder to track what changed per issue

---

## Proposed PR Workflow

```
Worker completes → code-reviewer → commit → push → create PR → auto-review → optional human review → merge
```

### Phase 1: Worker Creates PR

After code-reviewer passes and worker commits:

```bash
ISSUE_ID="TabzChrome-abc"
BRANCH="feature/${ISSUE_ID}"

# Push branch to remote
git push -u origin "$BRANCH"

# Create PR using gh CLI
gh pr create \
  --title "feat: ${ISSUE_TITLE}" \
  --body "$(cat <<EOF
## Summary
Implements ${ISSUE_ID}

${ISSUE_DESCRIPTION}

## Test plan
- [ ] Build passes
- [ ] Tests pass
- [ ] Code review approved

---
Closes #${ISSUE_NUMBER}  # If linked to GitHub Issue

Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --base main \
  --head "$BRANCH"
```

**Key gh pr create flags:**
| Flag | Purpose |
|------|---------|
| `--title` | PR title |
| `--body` | PR description (supports heredoc) |
| `--base` | Target branch (main) |
| `--head` | Source branch (feature/issue-id) |
| `--draft` | Create as draft (for review-first) |
| `--reviewer` | Request review from specific people |
| `--label` | Add labels (e.g., "auto-generated") |

### Phase 2: Automated Code Review on PR

The code-reviewer agent can review PRs instead of local changes:

#### Option A: Review PR Diff Locally

```bash
# Get PR diff
gh pr diff $PR_NUMBER > /tmp/pr-diff.txt

# Or get changed files
gh pr view $PR_NUMBER --json files --jq '.files[].path'

# Review using existing code-reviewer patterns
Task(subagent_type="conductor:code-reviewer",
     prompt="Review PR #$PR_NUMBER diff at /tmp/pr-diff.txt")
```

#### Option B: Add Review Comments via GitHub API

If code-reviewer finds issues, it can add PR review comments:

```bash
# Simple review comment
gh pr review $PR_NUMBER --comment --body "Looks good overall. Minor suggestions below."

# Request changes with body
gh pr review $PR_NUMBER --request-changes --body "Found critical issues that need addressing"

# Approve PR
gh pr review $PR_NUMBER --approve --body "LGTM! Code passes all quality checks."
```

#### Option C: Line-by-Line Comments via API

For detailed code review with inline comments:

```bash
# Create review with inline comments
gh api repos/{owner}/{repo}/pulls/$PR_NUMBER/reviews \
  -f event="REQUEST_CHANGES" \
  -f body="Found some issues that need fixing" \
  --input - <<EOF
{
  "comments": [
    {
      "path": "src/components/Terminal.tsx",
      "line": 45,
      "body": "Potential null reference - add optional chaining"
    },
    {
      "path": "src/hooks/useSession.ts",
      "line": 23,
      "body": "Missing error handling for async operation"
    }
  ]
}
EOF
```

### Phase 3: Merge PR

After review passes (automated or human):

```bash
# Squash merge (recommended for clean history)
gh pr merge $PR_NUMBER --squash --delete-branch

# Or regular merge
gh pr merge $PR_NUMBER --merge --delete-branch

# Or rebase merge
gh pr merge $PR_NUMBER --rebase --delete-branch
```

**Auto-merge option:**
```bash
# Enable auto-merge when checks pass
gh pr merge $PR_NUMBER --auto --squash
```

---

## Updated Worker Pipeline

### Modified `/conductor:worker-done` Skill

```markdown
### Step 4: Push and Create PR

\`\`\`bash
ISSUE_ID="$1"
BRANCH="feature/${ISSUE_ID}"

# Push to remote
git push -u origin "$BRANCH"

# Create PR
PR_URL=$(gh pr create \
  --title "$(bd show $ISSUE_ID --json | jq -r '.title')" \
  --body "Implements $ISSUE_ID" \
  --base main \
  --head "$BRANCH" \
  2>&1)

echo "Created PR: $PR_URL"
\`\`\`

### Step 5: Auto-Review PR

\`\`\`
Task(subagent_type="conductor:code-reviewer",
     prompt="Review PR at $PR_URL and approve or request changes")
\`\`\`

### Step 6: Merge if Approved

\`\`\`bash
if [ "$REVIEW_PASSED" = "true" ]; then
  gh pr merge --squash --delete-branch
  bd close $ISSUE_ID --reason "Merged via PR"
fi
\`\`\`
```

---

## Code-Reviewer PR Integration

### Enhanced Agent Capabilities

The code-reviewer agent would need to:

1. **Fetch PR diff**: `gh pr diff $PR_NUMBER`
2. **Get changed files**: `gh pr view $PR_NUMBER --json files`
3. **Post review**: `gh pr review` with appropriate action
4. **Add inline comments**: `gh api` for line-specific feedback

### Sample Review Flow

```bash
# 1. Get PR info
PR_NUMBER=$(gh pr view --json number --jq '.number')
FILES=$(gh pr view --json files --jq '.files[].path')

# 2. Read changed files and analyze
for FILE in $FILES; do
  # Use existing grep/read patterns to find issues
done

# 3. Post review based on findings
if [ ${#BLOCKERS[@]} -eq 0 ]; then
  gh pr review --approve --body "$(cat <<EOF
## Automated Review Passed

Checks completed:
- Build verification
- Type safety
- Security patterns
- Code conventions

No blockers found.
EOF
)"
else
  gh pr review --request-changes --body "$(cat <<EOF
## Automated Review - Changes Requested

Found ${#BLOCKERS[@]} blocking issues:
$(printf '%s\n' "${BLOCKERS[@]}")
EOF
)"
fi
```

---

## Conductor Swarm Integration

### Modified Completion Pipeline

```bash
# After all workers done
for ISSUE in $ISSUES; do
  PR_NUMBER=$(gh pr list --head "feature/${ISSUE}" --json number --jq '.[0].number')

  if [ -n "$PR_NUMBER" ]; then
    # Wait for checks (GitHub Actions)
    gh pr checks "$PR_NUMBER" --watch

    # Merge if all checks pass
    gh pr merge "$PR_NUMBER" --squash --delete-branch
  fi
done

# Sync beads and push
bd sync
```

### Parallel PR Merges

```bash
# Merge multiple PRs in sequence (avoid conflicts)
for ISSUE in $ISSUES; do
  PR_NUMBER=$(gh pr list --head "feature/${ISSUE}" --json number --jq '.[0].number')

  gh pr merge "$PR_NUMBER" --squash --delete-branch

  # Update local main
  git pull origin main
done
```

---

## Benefits of PR Workflow

| Benefit | Description |
|---------|-------------|
| **Audit Trail** | Every change has a PR with review history |
| **Human Review** | Optional human approval before merge |
| **GitHub Actions** | CI/CD runs on each PR |
| **Conflict Detection** | GitHub shows merge conflicts early |
| **Revert Ease** | Easy to revert a single PR |
| **Discussion** | Comments and threads on specific changes |
| **Branch Protection** | Enforce review requirements |

---

## Considerations

### When to Use Direct Merge vs PR

| Scenario | Recommendation |
|----------|----------------|
| Solo development | Direct merge (faster) |
| Team collaboration | PRs (review trail) |
| Critical features | PRs (human review required) |
| Bug fixes | Direct merge or draft PRs |
| Public project | PRs (transparency) |

### Performance Impact

- PRs add ~10-30 seconds per issue (push + create)
- Merge queue may add latency for many concurrent PRs
- GitHub rate limits: 5000 requests/hour (ample for most workflows)

### Required Setup

1. **GitHub Remote**: Must have push access
2. **gh CLI Auth**: `gh auth login` completed
3. **Branch Protection** (optional): Configure in GitHub settings
4. **Merge Queue** (optional): Enable for serialized merges

---

## Implementation Checklist

- [ ] Update `worker-done` skill to push branch and create PR
- [ ] Add PR number extraction to code-reviewer
- [ ] Implement `gh pr review` commands in code-reviewer
- [ ] Update bd-swarm completion pipeline for PR merges
- [ ] Add flag for direct-merge vs PR mode (`--no-pr` or `--pr`)
- [ ] Handle merge conflicts in PR workflow
- [ ] Add GitHub Actions workflow for automated checks

---

## gh CLI Quick Reference

```bash
# Create PR
gh pr create --title "Title" --body "Body" --base main

# View PR
gh pr view 123 --json state,reviews,files

# Get diff
gh pr diff 123

# Review PR
gh pr review 123 --approve
gh pr review 123 --comment --body "Note"
gh pr review 123 --request-changes --body "Fix X"

# Merge PR
gh pr merge 123 --squash --delete-branch
gh pr merge 123 --auto  # Auto-merge when checks pass

# List PRs
gh pr list --author @me
gh pr list --head feature/issue-123

# Check status
gh pr checks 123
gh pr checks 123 --watch  # Wait for completion

# Add line comments (via API)
gh api repos/{owner}/{repo}/pulls/123/reviews \
  -f event="COMMENT" \
  -f body="Review body" \
  --input comments.json
```
