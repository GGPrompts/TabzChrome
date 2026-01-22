---
name: gg-status
description: "Show status of workers, issues, and system health"
---

# Status Dashboard

View the current state of workers, issues, and the conductor system.

## Quick Status

```python
# Get workers
workers = tabz_list_terminals(state="active", response_format="json")

# Get beads stats
stats = mcp__beads__stats()

print(f"Workers: {workers.get('total', 0)}")
print(f"Ready: {stats.get('ready', 0)}")
print(f"In Progress: {stats.get('in_progress', 0)}")
print(f"Blocked: {stats.get('blocked', 0)}")
```

## Detailed Worker Status

```python
workers = tabz_list_terminals(state="active", response_format="json")

for w in workers['terminals']:
    if w['name'].startswith(('bd-', 'BD-', 'TabzChrome-', 'V4V-')):
        # Get last output
        output = tabz_capture_terminal(terminal=w['name'], lines=10)
        last_line = output.strip().split('\n')[-1] if output else "No output"

        # Check beads status
        try:
            issue = mcp__beads__show(issue_id=w['name'])
            status = issue[0]['status'] if issue else 'unknown'
        except:
            status = 'not found'

        print(f"• {w['name']}: beads={status}, last='{last_line[:50]}...'")
```

## Summary Table

```python
workers = tabz_list_terminals(state="active", response_format="json")

print("| Worker | Beads Status | Last Activity |")
print("|--------|--------------|---------------|")

for w in workers['terminals']:
    name = w['name']
    if not name.startswith(('bd-', 'BD-', 'TabzChrome-', 'V4V-')):
        continue

    # Beads status
    try:
        issue = mcp__beads__show(issue_id=name)
        beads_status = issue[0]['status']
    except:
        beads_status = '?'

    # Output check
    output = tabz_capture_terminal(terminal=name, lines=5)
    if "bd close" in output:
        activity = "completing"
    elif "error" in output.lower():
        activity = "⚠ error"
    elif output.strip():
        activity = "working"
    else:
        activity = "idle"

    print(f"| {name} | {beads_status} | {activity} |")
```

## Ready Queue

```python
ready = mcp__beads__ready()

print("Ready for workers:")
for issue in ready:
    print(f"  • {issue['id']}: {issue['title']}")
```

## Health Checks

```python
# Check for stale workers (in beads but no terminal)
in_progress = mcp__beads__list(status="in_progress")
workers = tabz_list_terminals(state="active", response_format="json")
worker_names = {w['name'] for w in workers.get('terminals', [])}

for issue in in_progress:
    if issue['id'] not in worker_names:
        print(f"⚠ Stale: {issue['id']} is in_progress but no worker running")

# Check for orphan workers (terminal but not in beads)
for w in workers.get('terminals', []):
    name = w['name']
    if name.startswith(('bd-', 'BD-', 'TabzChrome-', 'V4V-')):
        try:
            issue = mcp__beads__show(issue_id=name)
            if issue[0]['status'] == 'closed':
                print(f"⚠ Orphan: {name} worker still running but issue closed")
        except:
            print(f"⚠ Unknown: {name} worker with no matching issue")
```

## System Health

```bash
# TabzChrome backend
curl -sf http://localhost:8129/api/health && echo "TabzChrome: OK" || echo "TabzChrome: DOWN"

# Beads daemon
bd daemon status >/dev/null 2>&1 && echo "Beads daemon: Running" || echo "Beads daemon: Stopped"
```

## CLI Alternative

```bash
echo "=== Workers ==="
curl -s http://localhost:8129/api/agents | jq -r '.data[] | "\(.name): \(.state)"'

echo ""
echo "=== Beads ==="
bd stats

echo ""
echo "=== Ready Work ==="
bd ready --json | jq -r '.[] | "\(.id): \(.title)"'

echo ""
echo "=== In Progress ==="
bd list --status in_progress --json | jq -r '.[] | "\(.id): \(.title)"'
```
