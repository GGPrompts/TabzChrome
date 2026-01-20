# Dependencies in Beads

Dependencies control the order of work and what shows up in `bd ready`.

## Basic Usage

```bash
# A is blocked by B (B must complete first)
bd dep add A B

# Remove dependency
bd dep remove A B

# See what's blocking an issue
bd dep list ID
```

## How It Works

- `bd ready` only shows issues with NO open blockers
- When you close a blocker, dependent issues become ready
- Creates natural "waves" of parallelizable work

## Example: Feature with Dependencies

```bash
# Create issues
bd create "Design auth flow" --priority 1
bd create "Implement login API" --priority 1
bd create "Build login UI" --priority 1
bd create "Add tests" --priority 2

# Wire dependencies
bd dep add IMPL-ID DESIGN-ID     # API blocked by design
bd dep add UI-ID DESIGN-ID       # UI blocked by design
bd dep add TESTS-ID IMPL-ID      # Tests blocked by API
bd dep add TESTS-ID UI-ID        # Tests blocked by UI
```

This creates:
```
Wave 1: Design (ready now)
Wave 2: API + UI (ready after design)
Wave 3: Tests (ready after API + UI)
```

## Checking Status

```bash
# What's blocked and why
bd blocked
# Output: ID | Title | Blocked By

# What's ready to work on
bd ready

# JSON for scripting
bd blocked --json | jq '.[] | "\(.id) blocked by \(.blockedBy)"'
```

## Common Patterns

### Sequential Work
```bash
bd dep add step2 step1
bd dep add step3 step2
# Creates: step1 -> step2 -> step3
```

### Fan-out (one blocks many)
```bash
bd dep add taskA setup
bd dep add taskB setup
bd dep add taskC setup
# Creates: setup -> (taskA, taskB, taskC in parallel)
```

### Fan-in (many block one)
```bash
bd dep add final taskA
bd dep add final taskB
bd dep add final taskC
# Creates: (taskA, taskB, taskC) -> final
```

### Diamond Pattern
```bash
bd dep add middle1 start
bd dep add middle2 start
bd dep add end middle1
bd dep add end middle2
# Creates: start -> (middle1, middle2) -> end
```

## Tips

- Don't over-depend - only add when order truly matters
- Use for merge conflict prevention (issues touching same files)
- Blockers can be external gates (CI, review, etc.)
