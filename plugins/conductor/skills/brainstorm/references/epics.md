# Epics in Beads

Epics group related work into a logical feature or milestone.

## Creating an Epic

```bash
# Create the epic
bd create "User Authentication" --type epic --priority 1

# Create subtasks under it
bd create "Design auth flow" --parent EPIC-ID
bd create "Implement login" --parent EPIC-ID
bd create "Add logout" --parent EPIC-ID
bd create "Write tests" --parent EPIC-ID
```

## Epic Properties

- Epics can have subtasks (children)
- Epic status reflects child completion
- Closing all children doesn't auto-close epic (intentional - for review)

## When to Use Epics

| Scenario | Use Epic? |
|----------|-----------|
| 3+ related tasks | Yes |
| Feature spanning multiple sessions | Yes |
| Work that needs a summary/review | Yes |
| Quick standalone fix | No |
| Unrelated tasks | No |

## Epic Structure Patterns

### Simple Feature
```
Epic: Add Dark Mode
|-- Add theme context
|-- Create CSS variables
|-- Build toggle component
+-- Add system preference detection
```

### Feature with Dependencies
```
Epic: Payment Integration
|-- Research payment providers (P1)
|-- Set up Stripe account (blocked by research)
|-- Implement checkout API (blocked by Stripe setup)
|-- Build payment UI (blocked by API)
+-- Add tests (blocked by UI)
```

### Phased Rollout
```
Epic: Database Migration
|-- Phase 1: Schema changes
|-- Phase 2: Data migration scripts
|-- Phase 3: Application updates
+-- Phase 4: Cleanup old tables
```

## Viewing Epic Progress

```bash
# Show epic with children
bd show EPIC-ID

# List children
bd list --parent EPIC-ID

# JSON for progress calculation
bd list --parent EPIC-ID --json | jq '[.[] | .status] | group_by(.) | map({(.[0]): length})'
```

## Closing Epics

```bash
# Close children first
bd close CHILD-1 --reason "done"
bd close CHILD-2 --reason "done"

# Then close epic with summary
bd close EPIC-ID --reason "Feature complete - all auth flows working"
```

## Converting to Molecules

If you find yourself creating similar epics repeatedly:

```bash
# Extract pattern from completed epic
bd mol distill EPIC-ID

# Creates a reusable template
# See references/molecules.md
```
