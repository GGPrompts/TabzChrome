#!/usr/bin/env bash
# verify-checkpoints.sh - Validate required checkpoint JSON files for an issue worktree
#
# Usage:
#   ./verify-checkpoints.sh --issue ISSUE_ID [--worktree PATH]
#
# Rules:
# - Required checkpoints are derived from issue labels (gate:<type>), same as gate-runner.sh.
# - Exits non-zero if any required checkpoint is missing or has `"passed": false`.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

declare -A CHECKPOINT_FILES=(
  ["codex-review"]="codex-review.json"
  ["test-runner"]="test-runner.json"
  ["visual-qa"]="visual-qa.json"
  ["docs-check"]="docs-check.json"
)

usage() {
  echo "Usage: $0 --issue ISSUE_ID [--worktree PATH]" >&2
  exit 2
}

get_worktree_path() {
  local issue_id="$1"
  local workdir
  workdir="$(pwd)"

  if [ -d "$workdir/.worktrees/$issue_id" ]; then
    echo "$workdir/.worktrees/$issue_id"
    return 0
  fi

  local repo_root
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
  if [ -n "$repo_root" ] && [ -d "$repo_root/.worktrees/$issue_id" ]; then
    echo "$repo_root/.worktrees/$issue_id"
    return 0
  fi

  return 1
}

get_required_gates() {
  local issue_id="$1"

  bd show "$issue_id" --json 2>/dev/null | jq -r '
    (.[0].labels // [])[]
    | if startswith("gate:") then sub("^gate:";"") else . end
  ' 2>/dev/null | while read -r label; do
    case "$label" in
      codex-review|test-runner|visual-qa|docs-check)
        echo "$label"
        ;;
    esac
  done | sort -u
}

ISSUE_ID=""
WORKTREE_OVERRIDE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --issue)
      ISSUE_ID="${2:-}"
      shift 2
      ;;
    --worktree)
      WORKTREE_OVERRIDE="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown arg: $1" >&2
      usage
      ;;
  esac
done

[ -z "$ISSUE_ID" ] && usage

WORKTREE="${WORKTREE_OVERRIDE:-$(get_worktree_path "$ISSUE_ID" || true)}"
[ -z "$WORKTREE" ] && { echo "Worktree not found for $ISSUE_ID" >&2; exit 1; }
[ -d "$WORKTREE" ] || { echo "Worktree not found: $WORKTREE" >&2; exit 1; }

REQUIRED="$(get_required_gates "$ISSUE_ID" || true)"
if [ -z "$REQUIRED" ]; then
  echo "No required checkpoints for $ISSUE_ID (no gate:* labels)"
  exit 0
fi

FAILED=0
while read -r gate; do
  [ -z "$gate" ] && continue
  file="${CHECKPOINT_FILES[$gate]:-}"
  if [ -z "$file" ]; then
    echo "Unknown checkpoint type: $gate" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  path="$WORKTREE/.checkpoints/$file"
  if [ ! -f "$path" ]; then
    echo "MISSING: $gate ($path)" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  if ! jq -e '.passed == true' "$path" >/dev/null 2>&1; then
    summary="$(jq -r '.summary // .error // "No summary"' "$path" 2>/dev/null || echo "No summary")"
    echo "FAIL: $gate - $summary ($path)" >&2
    FAILED=$((FAILED + 1))
    continue
  fi

  summary="$(jq -r '.summary // "PASS"' "$path" 2>/dev/null || echo "PASS")"
  echo "PASS: $gate - $summary"
done <<< "$REQUIRED"

if [ "$FAILED" -gt 0 ]; then
  echo "$ISSUE_ID: $FAILED checkpoint(s) failed/missing" >&2
  exit 1
fi

echo "$ISSUE_ID: all required checkpoints passed"
