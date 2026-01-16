# CLAUDE.md Best Practices

Comprehensive patterns for writing effective CLAUDE.md files.

## Purpose

CLAUDE.md is the primary way to give Claude project context. It's automatically loaded at the start of every conversation.

## Structure Template

```markdown
# Project Name

One-line description of what this project does.

## Overview

| | |
|--|--|
| **Stack** | React, TypeScript, Node.js |
| **Architecture** | Monorepo with packages |
| **Port** | Backend on localhost:3000 |

---

## Architecture

Brief description of key patterns and data flow.

```
src/
├── components/     # React components
├── hooks/          # Custom hooks
├── services/       # API clients
└── utils/          # Helpers
```

---

## Development Rules

### ALWAYS
- Run tests before committing
- Use TypeScript strict mode
- Follow existing patterns

### NEVER
- Commit API keys
- Use `any` type
- Skip error handling

---

## Quick Reference

### Commands
```bash
npm run dev        # Start development
npm test           # Run tests
npm run build      # Production build
```

### Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point |
| `src/config.ts` | Configuration |

---

## AI Assistant Notes

Special instructions for Claude when working on this project.
```

## Best Practices

### Keep It Concise
- Target <500 lines
- Focus on what Claude needs, not general docs
- Use tables for quick reference
- Link to detailed docs instead of embedding

### Include Critical Constraints
```markdown
### NEVER
- Don't modify migration files after deployment
- Don't use inline styles (use Tailwind)
- Don't commit .env files
```

### Provide Runnable Commands
```markdown
### Commands
```bash
npm run dev        # Start development
npm test           # Run tests
./scripts/deploy   # Deploy to staging
```
```

### Document Anti-Patterns
```markdown
### Avoid
- `any` type - use proper types
- Inline SQL - use ORM
- Console.log in production - use logger
```

## Progressive Disclosure

For large projects, use separate documentation:

```markdown
## Documentation

| Topic | Location |
|-------|----------|
| API reference | `docs/API.md` |
| Database schema | `docs/SCHEMA.md` |
| Deployment | `docs/DEPLOY.md` |
```

## Project-Specific Sections

### For React Projects
```markdown
## Component Patterns

- Use functional components with hooks
- Props interface above component
- Styles in separate .css file or Tailwind
```

### For APIs
```markdown
## API Conventions

- RESTful endpoints in `/api/v1/`
- Authentication via Bearer token
- Errors return `{ error: string, code: number }`
```

### For Monorepos
```markdown
## Package Structure

| Package | Purpose |
|---------|---------|
| `@org/core` | Shared utilities |
| `@org/ui` | Component library |
| `@org/api` | Backend services |
```

## Common Mistakes

### Too Long
- CLAUDE.md shouldn't be a full documentation site
- Extract detailed docs to separate files
- Link rather than embed

### Missing Critical Info
- Always include how to run the project
- Include test commands
- Document deployment process

### Outdated Content
- Update when architecture changes
- Remove deprecated patterns
- Keep commands current
