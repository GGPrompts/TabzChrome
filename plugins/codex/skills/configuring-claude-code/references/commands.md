# Slash Commands

Create custom commands in Claude Code.

## Command Location

Place commands in `.claude/commands/`:

```
.claude/commands/
├── deploy.md
├── test.md
└── create-component.md
```

## Command Format

### Basic Command

**`.claude/commands/deploy.md`:**
```markdown
---
description: Deploy to production
---

# Deploy

1. Run tests: `npm test`
2. Build: `npm run build`
3. Deploy: `./scripts/deploy.sh`
4. Verify deployment succeeded
```

**Usage:** `/deploy`

### Command with Arguments

Use `$ARGUMENTS` for user input:

**`.claude/commands/create-component.md`:**
```markdown
---
description: Create a new React component
---

Create a React component named $ARGUMENTS:

1. Create file at `src/components/$ARGUMENTS.tsx`
2. Define props interface
3. Implement basic component structure
4. Export as named export
```

**Usage:** `/create-component Button`

### Command with Multiple Sections

```markdown
---
description: Set up a new feature
---

# Feature Setup: $ARGUMENTS

## 1. Create Directory Structure

Create the following structure:
- `src/features/$ARGUMENTS/`
- `src/features/$ARGUMENTS/components/`
- `src/features/$ARGUMENTS/hooks/`

## 2. Create Index File

Create `src/features/$ARGUMENTS/index.ts` with exports.

## 3. Add Route

Add route in `src/routes.tsx`.

## 4. Create Tests

Set up test file at `src/features/$ARGUMENTS/__tests__/`.
```

## Frontmatter Options

```markdown
---
description: Command description shown in /help
allowed_tools: ["Read", "Write", "Bash"]
model: opus
---
```

| Option | Description |
|--------|-------------|
| `description` | Shown when listing commands |
| `allowed_tools` | Restrict which tools can be used |
| `model` | Override model for this command |

## Command Patterns

### Build & Deploy

```markdown
---
description: Build and deploy to staging
---

# Build & Deploy

1. Run lint: `npm run lint`
2. Run tests: `npm test`
3. Build: `npm run build`
4. Deploy to staging: `./scripts/deploy-staging.sh`
5. Report deployment status
```

### Code Generation

```markdown
---
description: Generate API endpoint
---

# Generate API Endpoint: $ARGUMENTS

Create a REST endpoint for $ARGUMENTS:

1. Create route handler in `src/routes/$ARGUMENTS.ts`
2. Define request/response types
3. Implement CRUD operations
4. Add validation middleware
5. Create tests in `src/routes/__tests__/$ARGUMENTS.test.ts`
```

### Documentation

```markdown
---
description: Generate documentation for a module
---

# Document Module: $ARGUMENTS

Generate documentation for the $ARGUMENTS module:

1. Read all files in `src/$ARGUMENTS/`
2. Extract public API and types
3. Create `docs/$ARGUMENTS.md` with:
   - Overview
   - API reference
   - Examples
   - Type definitions
```

### Git Operations

```markdown
---
description: Create PR with conventional commit
---

# Create Pull Request

1. Check git status
2. Stage all changes: `git add .`
3. Create commit with conventional message
4. Push to origin
5. Create PR using `gh pr create`
```

### Testing

```markdown
---
description: Run tests with coverage
---

# Test with Coverage

1. Run tests: `npm test -- --coverage`
2. Check coverage thresholds
3. Report any uncovered lines
4. Suggest tests for uncovered code
```

## Plugin Commands

Commands in plugins use namespaced names:

**`plugins/my-plugin/commands/build.md`:**
```markdown
---
description: Build the project
---

Build steps...
```

**Usage:** `/my-plugin:build`

## Command Discovery

Claude Code discovers commands from:
1. `.claude/commands/` - Project commands
2. `~/.claude/commands/` - Global commands
3. Plugin commands

## Best Practices

### Clear Descriptions
```markdown
---
description: Deploy to production with zero-downtime rollout
---
```

### Step-by-Step Instructions
```markdown
1. First, verify prerequisites
2. Then, build the project
3. Finally, deploy and verify
```

### Include Verification
```markdown
After deployment:
- Verify health check passes
- Check error logs
- Test critical paths
```

### Handle Failures
```markdown
If tests fail:
1. Show failing tests
2. Suggest fixes
3. Re-run after fixes
```

## Troubleshooting

### Command Not Found
- Check file location: `.claude/commands/`
- Verify `.md` extension
- Check frontmatter syntax

### Arguments Not Working
- Use `$ARGUMENTS` (uppercase)
- Provide usage example in description

### Command Too Complex
- Break into smaller commands
- Use skills for complex logic
- Chain commands together
