# Conductor Command Usage Analysis

Generated: 2026-01-14

## Human Entry Points (5 commands)

These are the commands users should invoke directly:

| Command | Purpose | In PRIME.md? |
|---------|---------|--------------|
| `/conductor:bd-status` | Show beads issue tracker overview | ✅ YES |
| `/conductor:plan-backlog` | Groom and organize issues into parallelizable waves | ✅ YES |
| `/conductor:bd-work` | Pick top issue, spawn one worker | ✅ YES |
| `/conductor:bd-swarm` | Spawn parallel workers for multiple issues | ✅ YES |
| `/conductor:bd-swarm-auto` | Fully autonomous until backlog empty | ✅ YES |

## Worker Commands (1 command)

Commands that spawned workers invoke:

| Command | Purpose | In PRIME.md? |
|---------|---------|--------------|
| `/conductor:worker-done` | Complete worker task (8-step pipeline) | ✅ YES (detailed) |

## Atomic Pipeline Commands (6 commands)

Composable commands used by worker-done and standalone workflows:

| Command | Purpose | Used By | In PRIME.md? |
|---------|---------|---------|--------------|
| `/conductor:verify-build` | Run build, report errors | worker-done (step 2), standalone | ✅ YES |
| `/conductor:run-tests` | Run tests if available | worker-done (step 3) | ❌ NO (implicit in worker-done) |
| `/conductor:commit-changes` | Stage + commit | worker-done (step 4), standalone | ✅ YES |
| `/conductor:create-followups` | Create follow-up issues | worker-done (step 5) | ❌ NO (implicit in worker-done) |
| `/conductor:update-docs` | Update documentation | worker-done (step 6) | ❌ NO (implicit in worker-done) |
| `/conductor:close-issue` | Close beads issue | worker-done (step 7), standalone | ✅ YES |
| `/conductor:code-review` | Code review (3 modes) | standalone, conductor | ✅ YES |
| `/conductor:codex-review` | Codex review (cheaper) | optional alternative | ❌ NO |

## Orchestration Helpers (3 commands)

Commands that help set up conductor workflows:

| Command | Purpose | In PRIME.md? |
|---------|---------|--------------|
| `/conductor:orchestration` | Load spawn patterns, tmux commands | ✅ YES (prerequisite) |
| `/conductor:wave-done` | Complete wave: merge branches, review, cleanup | ❌ NO |
| `/conductor:analyze-transcripts` | Analyze worker session transcripts | ❌ NO |

## Worker Optimization (1 command)

Self-service command for workers:

| Command | Purpose | In PRIME.md? |
|---------|---------|--------------|
| `/conductor:worker-init` | Self-optimize worker context before starting | ❌ NO |

## Project Setup (1 command)

| Command | Purpose | In PRIME.md? |
|---------|---------|--------------|
| `/conductor:new-project` | Multi-phase project scaffolding | ❌ NO |

## Missing from PRIME.md (Should They Be Added?)

### Commands Referenced in PRIME.md Prerequisites
- ✅ `/conductor:engineering-prompts` - Listed in prerequisites, now exists as a skill
  - **Action:** Reference updated to use new skill name

### Commands Not in PRIME.md but Important
- `/conductor:wave-done` - Critical for parallel workflows (bd-swarm completion)
  - **Action:** Should be added to "After spawning workers" section

- `/conductor:worker-init` - Useful for workers to self-optimize
  - **Action:** Could add to worker PRIME.md, not main PRIME.md

- `/conductor:analyze-transcripts` - Post-mortem analysis tool
  - **Action:** Advanced feature, probably not needed in PRIME.md

- `/conductor:new-project` - Project setup tool
  - **Action:** Standalone utility, not part of normal workflow

- `/conductor:codex-review` - Alternative to code-review
  - **Action:** Add as optional alternative in code review section?

## Recommendations

### 1. Add wave-done to PRIME.md
```markdown
**After workers complete:**
- `/conductor:wave-done` - Merge branches, unified review, cleanup, push
```

### 2. ~~Clarify prompt-engineer prerequisite~~ ✅ DONE
Renamed to engineering-prompts skill.

### 3. Consider adding codex-review as alternative
```markdown
**Code review options:**
- `/conductor:code-review` - Full Opus review (--quick, default, --thorough)
- `/conductor:codex-review` - Faster GPT-based review (read-only, cheaper)
```

### 4. Worker PRIME.md could mention worker-init
For self-service context optimization before starting work.

## Command Categorization Summary

```
Human Entry Points (5)
├─ bd-status          (overview)
├─ plan-backlog       (planning)
├─ bd-work            (spawn 1 worker)
├─ bd-swarm           (spawn N workers)
└─ bd-swarm-auto      (autonomous loop)

Worker Workflows (1)
└─ worker-done        (8-step completion pipeline)
    ├─ verify-build
    ├─ run-tests
    ├─ commit-changes
    ├─ create-followups
    ├─ update-docs
    ├─ close-issue
    └─ notify conductor

Standalone Workflows
├─ verify-build
├─ code-review / codex-review
├─ commit-changes
└─ close-issue

Orchestration
├─ orchestration      (setup spawn patterns)
├─ wave-done          (cleanup after parallel work)
└─ analyze-transcripts (post-mortem)

Utilities
├─ worker-init        (worker self-optimization)
└─ new-project        (project scaffolding)
```
