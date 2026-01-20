# Molecules in Beads

Molecules are reusable workflow templates. Create them from patterns you repeat.

## Concept

- **Distill**: Extract a template from completed work
- **Pour**: Create persistent instance from template
- **Wisp**: Create ephemeral instance (no audit trail)

## Creating a Molecule

### From Existing Epic

```bash
# Complete an epic with good structure
bd close EPIC-ID --reason "done"

# Extract as template
bd mol distill EPIC-ID --name "feature-workflow"
```

### Manually

Create `.beads/formulas/feature-workflow.yaml`:

```yaml
name: feature-workflow
description: Standard feature development workflow
variables:
  - name: feature
    description: Feature name
    required: true
tasks:
  - title: "Design {{feature}}"
    type: task
    priority: 1
  - title: "Implement {{feature}}"
    type: task
    priority: 1
    depends_on: ["Design {{feature}}"]
  - title: "Test {{feature}}"
    type: task
    priority: 2
    depends_on: ["Implement {{feature}}"]
  - title: "Document {{feature}}"
    type: task
    priority: 3
    depends_on: ["Implement {{feature}}"]
```

## Using Molecules

### Pour (Persistent)

```bash
# Create instance with full audit trail
bd mol pour feature-workflow --var feature="dark-mode"
```

Creates:
- Design dark-mode
- Implement dark-mode (blocked by design)
- Test dark-mode (blocked by implement)
- Document dark-mode (blocked by implement)

### Wisp (Ephemeral)

```bash
# Create instance without audit trail (for quick work)
bd mol wisp feature-workflow --var feature="quick-fix"
```

## Listing Molecules

```bash
# See available templates
bd mol list

# Show template details
bd mol show feature-workflow
```

## Common Molecule Patterns

### Code Review Workflow
```yaml
name: code-review
tasks:
  - title: "Review {{pr}} implementation"
  - title: "Check {{pr}} test coverage"
  - title: "Verify {{pr}} docs updated"
```

### Bug Fix Workflow
```yaml
name: bug-fix
tasks:
  - title: "Reproduce {{bug}}"
  - title: "Write failing test for {{bug}}"
    depends_on: ["Reproduce {{bug}}"]
  - title: "Fix {{bug}}"
    depends_on: ["Write failing test for {{bug}}"]
  - title: "Verify fix for {{bug}}"
    depends_on: ["Fix {{bug}}"]
```

### Feature Launch
```yaml
name: feature-launch
tasks:
  - title: "{{feature}} - final testing"
  - title: "{{feature}} - update changelog"
  - title: "{{feature}} - deploy to staging"
    depends_on: ["{{feature}} - final testing"]
  - title: "{{feature}} - deploy to production"
    depends_on: ["{{feature}} - deploy to staging"]
```

## When to Create Molecules

| Signal | Action |
|--------|--------|
| Created similar epic 3+ times | Distill into molecule |
| Team has standard process | Create molecule |
| Onboarding new contributors | Create molecule for common tasks |
| Complex multi-step workflow | Document as molecule |

## Tips

- Keep molecules focused (5-10 tasks max)
- Use clear variable names
- Include dependencies in template
- Use wisp for throwaway work, pour for tracked work
