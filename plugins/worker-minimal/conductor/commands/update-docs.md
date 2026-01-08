---
description: "Check and update documentation for LLM consumption."
---

# Update Docs

Check if documentation needs updating and apply minimal LLM-friendly updates. This is a standalone atomic command.

## Usage

```
/conductor:update-docs
```

## When to Use

Run after implementing changes that:
- Add new API routes
- Create new components/hooks
- Change configuration
- Add environment variables
- Introduce breaking changes

## Philosophy

**For-LLMs documentation style:**
- One-liner descriptions, not paragraphs
- File paths over explanations
- Example usage over theory
- What changed, not why

## Execute

### 1. Analyze Changes

```bash
echo "=== Documentation Check ==="

echo "Files changed:"
git diff HEAD~1 --name-only 2>/dev/null || git diff --cached --name-only
echo ""
```

### 2. Determine What Needs Documenting

| Change Type | Documentation Action |
|-------------|---------------------|
| New API route | Add to API section in CLAUDE.md or docs/ |
| New component | Add to component list with file path |
| New hook | Add to hooks section with usage example |
| Config change | Update config documentation |
| New env var | Add to environment setup docs |
| Breaking change | Add migration note |

### 3. Check if CLAUDE.md Exists

```bash
if [ -f "CLAUDE.md" ]; then
  echo "CLAUDE.md found - checking if updates needed"
else
  echo "No CLAUDE.md - checking docs/ folder"
  ls -la docs/ 2>/dev/null || echo "No docs/ folder"
fi
```

### 4. Apply Updates (if needed)

**Example additions to CLAUDE.md:**

```markdown
## New in this PR

### API Routes
- `POST /api/thing/action` - Description (app/api/thing/action/route.ts)

### Components
- `ThingComponent` - Description (components/ThingComponent.tsx)

### Hooks
- `useThing()` - Description (hooks/useThing.ts)

### Environment Variables
- `THING_API_KEY` - Description (required for X feature)
```

### 5. Stage Doc Changes

```bash
if git diff --name-only | grep -E "CLAUDE.md|docs/|README.md"; then
  echo "Documentation files modified"
  git add CLAUDE.md docs/ README.md 2>/dev/null
  echo '{"updated": true, "files": ["CLAUDE.md"]}'
else
  echo "No documentation updates required"
  echo '{"updated": false}'
fi
```

## Output Format

```json
{"updated": true, "files": ["CLAUDE.md", "docs/API.md"]}
{"updated": false}
```

## What NOT to Document

- Internal implementation details
- Obvious code patterns
- Temporary workarounds
- Debug/development aids

## Composable With

- `/conductor:commit-changes` - Doc updates included in commit
- `/conductor:create-followups` - Run before or after
- `/conductor:close-issue` - Run before closing
- `/conductor:worker-done` - Full pipeline that includes this
