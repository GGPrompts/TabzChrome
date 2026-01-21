# Git Worktree Setup for Parallel Workers

Worktrees allow multiple Claude workers to work on the same repo without conflicts.

## Create Worktree

```bash
# From main repo
git worktree add ../TabzChrome-feature feature-branch

# Or create new branch
git worktree add -b new-feature ../TabzChrome-feature main
```

## List Worktrees

```bash
git worktree list
```

## Remove Worktree

```bash
# After merging
git worktree remove ../TabzChrome-feature
```

## Spawn Worker in Worktree

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "name": "Feature Worker",
    "workingDir": "/home/user/projects/TabzChrome-feature",
    "command": "claude --dangerously-skip-permissions"
  }'
```

## Best Practices

- One worktree per worker
- Use descriptive branch names
- Clean up after merging
- Workers in worktrees can push independently
