# Git Worktree Setup for Parallel Workers

Worktrees allow multiple Claude workers to work on the same repo without conflicts.

## Create Worktree (Recommended)

Use `bd worktree create` to automatically set up beads database redirect:

```bash
# From main repo - creates worktree with beads redirect
bd worktree create feature-abc --branch feature/feature-abc
```

This creates a worktree at `../feature-abc` that shares the main repo's beads database.

## Manual Worktree Creation

```bash
# Standard git worktree
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

**Important:** Set `BEADS_WORKING_DIR` so the beads MCP server can find the database:

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
PROJECT_DIR="/home/user/projects/TabzChrome"  # Main repo
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{
    \"name\": \"Feature Worker\",
    \"workingDir\": \"$PROJECT_DIR-worktrees/feature-abc\",
    \"command\": \"BEADS_WORKING_DIR=$PROJECT_DIR claude\"
  }"
```

**Why BEADS_WORKING_DIR?**
- The `bd` CLI auto-discovers the main repo's database from worktrees
- The beads MCP server needs explicit configuration via this env var
- Point it to the main repo, not the worktree

## Best Practices

- One worktree per worker
- Use descriptive branch names matching issue IDs
- Use `bd worktree create` for automatic beads setup
- Clean up after merging
- Workers in worktrees can push their feature branches independently
