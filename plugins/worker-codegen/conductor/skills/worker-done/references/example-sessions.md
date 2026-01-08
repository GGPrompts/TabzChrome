# Example Sessions - Worker Done

Example output from `/conductor:worker-done` for different scenarios.

## Feature Implementation

```
> /conductor:worker-done TabzChrome-hyo

=== Step 1: Build Verification ===
Build passed

=== Step 2: Test Verification ===
Tests passed (42 tests)

=== Step 3: Code Review ===
Spawning code-reviewer subagent...
Review result: { passed: true, summary: "No issues found" }

=== Step 4: Commit ===
[feature/TabzChrome-hyo abc1234] feat(sidebar): show bookmarked profiles
 2 files changed, 150 insertions(+)

=== Step 5: Follow-up Tasks ===
No follow-up tasks identified

=== Step 6: Documentation Check ===
Added to CLAUDE.md: BookmarkProfileCard component
Documentation updated

=== Step 7: Close Issue ===
Closed TabzChrome-hyo

=== Task Complete ===
Issue TabzChrome-hyo closed
Branch ready for merge: feature/TabzChrome-hyo
Follow-up tasks: none
Documentation: CLAUDE.md
```

## Research Task (creates follow-ups)

```
> /conductor:worker-done TabzChrome-abc

=== Step 1: Build Verification ===
Build passed (no code changes, research only)

=== Step 2: Test Verification ===
No test script found, skipping

=== Step 3: Code Review ===
Review result: { passed: true, summary: "Research docs look good" }

=== Step 4: Commit ===
[feature/TabzChrome-abc def5678] docs: research YouTube API integration
 1 file changed, 150 insertions(+)

=== Step 5: Follow-up Tasks ===
Created: TabzChrome-xyz "Implement YouTube search API" (P2)
Created: TabzChrome-uvw "Add YouTube player component" (P2)
Created: TabzChrome-rst "Cache YouTube API responses" (P3)

=== Step 6: Documentation Check ===
Research doc created: docs/research/youtube-api.md

=== Step 7: Close Issue ===
Closed TabzChrome-abc

=== Task Complete ===
Issue TabzChrome-abc closed
Follow-up tasks: TabzChrome-xyz, TabzChrome-uvw, TabzChrome-rst
Documentation: docs/research/youtube-api.md
```

## Bug Fix with Test Failures

```
> /conductor:worker-done TabzChrome-bug

=== Step 1: Build Verification ===
Build passed

=== Step 2: Test Verification ===
FAILED: 2 tests failing
  - src/utils.test.ts: parseUrl should handle empty string
  - src/api.test.ts: fetchData should retry on failure

Pipeline stopped. Fix test failures and re-run.
```

## Code Review Blockers

```
> /conductor:worker-done TabzChrome-feature

=== Step 1: Build Verification ===
Build passed

=== Step 2: Test Verification ===
Tests passed (15 tests)

=== Step 3: Code Review ===
Spawning code-reviewer subagent...
Review result: { passed: false, blockers: [
  "Missing error handling in fetchData()",
  "Hardcoded API key should use env variable"
]}

Pipeline stopped. Fix blockers and re-run.
```
