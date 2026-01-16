# Skill Development Patterns

Create effective Claude Code skills with progressive disclosure.

## Skill Structure

```
.claude/skills/my-skill/
├── SKILL.md              # Main instructions (required)
├── references/           # Detailed documentation
│   ├── patterns.md
│   └── api-docs.md
├── scripts/              # Executable helpers
│   └── generator.py
└── assets/               # Templates and files
    └── template.tsx
```

## SKILL.md Format

```markdown
---
name: my-skill
description: "Clear trigger criteria for when to use this skill"
---

# Skill Name

Brief description of what this skill enables.

## When to Use

Use this skill when:
- Specific scenario 1
- Specific scenario 2
- User asks about X

## Instructions

Step-by-step guidance:

1. First, do X
2. Then, do Y
3. Finally, verify Z

## Quick Reference

| Task | Command/Pattern |
|------|-----------------|
| Task 1 | `command` |
| Task 2 | Pattern |

## References

For detailed X, see `references/x.md`
```

## Progressive Disclosure

Keep SKILL.md concise (<200 lines). Move details to references.

**SKILL.md (concise):**
```markdown
## Database Queries

Use parameterized queries to prevent SQL injection.

For query patterns, see `references/query-patterns.md`
```

**references/query-patterns.md (detailed):**
```markdown
# Query Patterns

## Select with Joins
```sql
SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.created_at > $1
```

## Pagination
```sql
SELECT * FROM items
ORDER BY created_at DESC
LIMIT $1 OFFSET $2
```
...
```

## Activation Criteria

Write specific, actionable descriptions:

**Good:**
```yaml
description: "Use when creating React components with TypeScript and Tailwind CSS styling"
```

**Bad:**
```yaml
description: "Use for frontend development"
```

## Including Scripts

For deterministic tasks, include executable scripts:

**scripts/generate-component.sh:**
```bash
#!/bin/bash
NAME=$1
cat > "src/components/${NAME}.tsx" << EOF
interface ${NAME}Props {
  // props
}

export function ${NAME}({ }: ${NAME}Props) {
  return <div></div>
}
EOF
```

**Reference in SKILL.md:**
```markdown
## Creating Components

Run `scripts/generate-component.sh ComponentName` to scaffold.
```

## Including Assets

Provide templates in `assets/`:

**assets/component-template.tsx:**
```typescript
interface {{NAME}}Props {
  className?: string
}

export function {{NAME}}({ className }: {{NAME}}Props) {
  return (
    <div className={className}>
      {{NAME}}
    </div>
  )
}
```

**Reference in SKILL.md:**
```markdown
Use the template in `assets/component-template.tsx` as a starting point.
```

## Best Practices

### Concise Instructions
Focus on essential information:

**Good:**
```markdown
1. Create component in src/components/
2. Define TypeScript interface for props
3. Export as named export
```

**Bad:**
```markdown
First, you should think about where to put the component.
Generally, components go in the components folder, but
sometimes they might go elsewhere...
```

### Clear Examples

Include input/output examples:

```markdown
## Examples

**Input:** "Create a Button component"

**Output:**
- Creates `src/components/Button.tsx`
- Defines `ButtonProps` interface
- Implements base styling with Tailwind
```

### Scope Limitation

Keep skills focused on specific domains:

**Good:**
- `api-testing` - Testing REST APIs
- `db-migrations` - Database migrations
- `react-components` - React component patterns

**Bad:**
- `general-development` - Too broad

## Skill Discovery

Claude discovers skills from:
1. `.claude/skills/` - Project skills
2. `~/.claude/skills/` - Global skills
3. Plugin skills

Skills activate when:
- Task matches description
- User explicitly requests
- Context suggests relevance

## Testing Skills

Test activation:
```bash
claude "task that should trigger skill"
```

Verify skill loaded in response.

## Common Patterns

### API Documentation Skill
```
api-docs/
├── SKILL.md
└── references/
    ├── endpoints.md
    ├── authentication.md
    └── error-codes.md
```

### Code Generation Skill
```
generator/
├── SKILL.md
├── scripts/
│   └── generate.py
└── assets/
    └── templates/
```

### Testing Skill
```
testing/
├── SKILL.md
├── references/
│   └── patterns.md
└── scripts/
    └── run-tests.sh
```
