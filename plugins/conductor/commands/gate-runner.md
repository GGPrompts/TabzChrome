---
name: gg-gate-runner
description: "Run quality checkpoints for a closed issue (codex-review, tests, docs, visual QA)"
argument-hint: "ISSUE_ID"
---

# Gate Runner (Quality Checkpoints)

Runs required quality checkpoints for a beads issue.

**Important:** This command is *not* `bd gate` (beads async gates for external waits). Here “gate” means “quality checkpoint”.

## How It Works (v1)

1. Reads required checkpoints from issue labels:
   - Preferred: `gate:<type>` (e.g. `gate:codex-review`)
   - Legacy: `<type>` (e.g. `codex-review`)
2. Spawns short-lived checkpoint workers (TabzChrome) in the issue worktree.
3. Each worker writes a JSON result to `.checkpoints/<type>.json`.
4. Verifies all required checkpoints passed.

## Usage

```bash
/conductor:gate-runner ISSUE_ID
```

## Required Labels (supported)

- `gate:codex-review` → `/conductor:reviewing-code` → `.checkpoints/codex-review.json`
- `gate:test-runner` → `/conductor:running-tests` → `.checkpoints/test-runner.json`
- `gate:docs-check` → `/conductor:docs-check` → `.checkpoints/docs-check.json`
- `gate:visual-qa` → `/conductor:visual-qa` → `.checkpoints/visual-qa.json`

## Implementation

Use the script:

```bash
./plugins/conductor/scripts/gate-runner.sh --issue ISSUE_ID
```

To only validate existing checkpoint files:

```bash
./plugins/conductor/scripts/verify-checkpoints.sh --issue ISSUE_ID
```

For the full “landing the plane” flow (run checkpoints → verify → merge → cleanup → push):

```bash
./plugins/conductor/scripts/finalize-issue.sh ISSUE_ID
```

