#!/bin/bash
# match-skills.sh - Single source of truth for issue-to-skill matching
#
# Usage:
#   source ${CLAUDE_PLUGIN_ROOT}/scripts/match-skills.sh
#   SKILLS=$(match_skills "terminal resize buffer")
#
# Or as standalone:
#   ./match-skills.sh "terminal resize buffer"
#   ./match-skills.sh --json "terminal resize buffer"
#
# Returns natural trigger language that activates skills in Claude prompts.
# Based on TabzChrome-dhz: consolidating skill mappings from 6 locations.

# ============================================================================
# SELF-LOCATING: Find conductor plugin regardless of where we're running
# ============================================================================
find_conductor_root() {
  # 1. If CLAUDE_PLUGIN_ROOT is set (running as plugin), use it
  if [ -n "$CLAUDE_PLUGIN_ROOT" ]; then
    echo "$CLAUDE_PLUGIN_ROOT"
    return 0
  fi

  # 2. If this script is being sourced/run, find relative to script location
  local SCRIPT_DIR
  if [ -n "${BASH_SOURCE[0]}" ]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [ -f "$SCRIPT_DIR/match-skills.sh" ]; then
      echo "$(dirname "$SCRIPT_DIR")"  # Parent of scripts/
      return 0
    fi
  fi

  # 3. Check if we're in TabzChrome project
  if [ -d "./plugins/conductor/scripts" ]; then
    echo "./plugins/conductor"
    return 0
  fi

  # 4. Find latest conductor in plugin cache
  local CACHE_DIR="$HOME/.claude/plugins/cache"
  if [ -d "$CACHE_DIR" ]; then
    # Find most recently modified conductor plugin
    local LATEST=$(find "$CACHE_DIR" -type d -name "conductor" -path "*/tabz-chrome/*" 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      # Get the versioned subdirectory
      local VERSIONED=$(ls -t "$LATEST" 2>/dev/null | head -1)
      if [ -n "$VERSIONED" ] && [ -d "$LATEST/$VERSIONED" ]; then
        echo "$LATEST/$VERSIONED"
        return 0
      fi
    fi
  fi

  # 5. Last resort - return empty (caller should handle)
  echo ""
  return 1
}

CONDUCTOR_ROOT=$(find_conductor_root)

# ============================================================================
# SKILL MAPPINGS - Single Source of Truth
# ============================================================================
# Format: keyword_pattern|skill_invocation_command
# Pattern uses bash regex (extended)
# Add new mappings here - all skills/commands reference this file
#
# IMPORTANT: Output is explicit invocation commands (e.g., "/xterm-js")
# Workers need explicit /skill-name commands to actually load skills.
# "Use the X skill" is interpreted as guidance, not invocation.

SKILL_MAPPINGS=(
  # Terminal / TabzChrome (project-specific skill)
  "terminal|xterm|pty|resize|buffer|fitaddon|websocket.*terminal|/tabz-guide"

  # UI / Frontend
  "ui|component|modal|dashboard|styling|tailwind|shadcn|form|button|/ui-styling"

  # Frontend frameworks
  "react|next|vue|svelte|frontend|/frontend-development"

  # Backend / API
  "backend|api|server|database|endpoint|express|websocket.*server|/backend-development"

  # Browser automation / MCP (direct tool use, not a skill)
  "browser|screenshot|click|mcp|tabz_|automation|# Use tabz_* MCP tools directly"

  # Authentication
  "auth|login|oauth|session|token|jwt|/better-auth"

  # Plugin development
  "plugin|skill|agent|hook|command|frontmatter|/plugin-dev"

  # Conductor / orchestration
  "prompt|worker|swarm|conductor|orchestrat|/conductor:orchestration"

  # Audio / TTS / Multimodal
  "audio|tts|speech|sound|voice|speak|gemini|/ai-multimodal"

  # Media processing
  "image|video|media|ffmpeg|imagemagick|/media-processing"

  # 3D / Three.js (project-specific reference - not a skill)
  "3d|three|scene|focus.*mode|webgl|# Reference extension/3d/ for Three.js patterns"

  # Chrome extension (project-specific reference)
  "chrome|extension|manifest|sidepanel|background|service.*worker|/tabz-guide"

  # Databases
  "postgres|mongodb|redis|sql|database|query|/databases"

  # Documentation discovery
  "docs|documentation|llms.txt|repomix|/docs-seeker"

  # Code review
  "review|pr|pull.*request|lint|/code-review"

  # Web frameworks
  "nextjs|express|fastapi|django|nest|/web-frameworks"

  # Testing (general guidance, not a specific skill)
  "test|jest|vitest|spec|coverage|# Check existing test files for testing conventions"
)

# ============================================================================
# LABEL TO SKILL MAPPINGS
# ============================================================================
# Labels on beads issues can also trigger skills

LABEL_MAPPINGS=(
  "xterm|terminal"
  "ui|frontend|styling"
  "backend|api|server"
  "mcp|browser|automation"
  "auth|security"
  "plugin|skill|conductor"
  "audio|media"
)

# ============================================================================
# RUNTIME SKILL DISCOVERY
# ============================================================================
# Get list of actually available skills (for verification)

get_available_skills() {
  local AVAILABLE=""

  # 1. Plugin skills (from TabzChrome API if running)
  if curl -s --max-time 2 http://localhost:8129/api/plugins/skills >/dev/null 2>&1; then
    local PLUGIN_SKILLS=$(curl -s http://localhost:8129/api/plugins/skills 2>/dev/null | jq -r '.skills[].id' 2>/dev/null)
    AVAILABLE="$AVAILABLE $PLUGIN_SKILLS"
  fi

  # 2. Project skills (.claude/skills/)
  if [ -d ".claude/skills" ]; then
    for skill_dir in .claude/skills/*/; do
      [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ] && AVAILABLE="$AVAILABLE $(basename "$skill_dir")"
    done
  fi

  # 3. User skills (~/.claude/skills/)
  if [ -d "$HOME/.claude/skills" ]; then
    for skill_dir in "$HOME/.claude/skills"/*/; do
      [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ] && AVAILABLE="$AVAILABLE $(basename "$skill_dir")"
    done
  fi

  # 4. Common plugin skills (conductor, plugin-dev, etc.) - check plugin dirs
  for plugin_dir in "$HOME/.claude/plugins"/*/ ".claude/plugins"/*/; do
    [ -d "$plugin_dir" ] || continue
    [ -d "$plugin_dir/skills" ] || continue
    for skill_dir in "$plugin_dir/skills"/*/; do
      [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ] && AVAILABLE="$AVAILABLE $(basename "$skill_dir")"
    done
  done 2>/dev/null

  echo "$AVAILABLE" | tr ' ' '\n' | grep -v '^$' | sort -u | tr '\n' ' '
}

# Get available skills WITH descriptions (for prompt crafting)
# Output format: id|description (one per line)
get_available_skills_with_desc() {
  local OUTPUT=""

  # 1. Plugin skills (from TabzChrome API if running) - already has descriptions
  if curl -s --max-time 2 http://localhost:8129/api/plugins/skills >/dev/null 2>&1; then
    local API_SKILLS=$(curl -s http://localhost:8129/api/plugins/skills 2>/dev/null | jq -r '.skills[] | "\(.id)|\(.desc)"' 2>/dev/null)
    OUTPUT="$OUTPUT
$API_SKILLS"
  fi

  # 2. Project skills (.claude/skills/) - extract description from SKILL.md
  if [ -d ".claude/skills" ]; then
    for skill_dir in .claude/skills/*/; do
      [ -d "$skill_dir" ] || continue
      local SKILL_FILE="$skill_dir/SKILL.md"
      if [ -f "$SKILL_FILE" ]; then
        local NAME=$(basename "$skill_dir")
        local DESC=$(grep -E "^description:" "$SKILL_FILE" 2>/dev/null | head -1 | sed 's/description:\s*//' | tr -d '"' | cut -c1-100)
        [ -z "$DESC" ] && DESC="Project skill"
        OUTPUT="$OUTPUT
$NAME|$DESC"
      fi
    done
  fi

  # 3. User skills (~/.claude/skills/)
  if [ -d "$HOME/.claude/skills" ]; then
    for skill_dir in "$HOME/.claude/skills"/*/; do
      [ -d "$skill_dir" ] || continue
      local SKILL_FILE="$skill_dir/SKILL.md"
      if [ -f "$SKILL_FILE" ]; then
        local NAME=$(basename "$skill_dir")
        local DESC=$(grep -E "^description:" "$SKILL_FILE" 2>/dev/null | head -1 | sed 's/description:\s*//' | tr -d '"' | cut -c1-100)
        [ -z "$DESC" ] && DESC="User skill"
        OUTPUT="$OUTPUT
$NAME|$DESC"
      fi
    done
  fi

  echo "$OUTPUT" | grep -v '^$' | sort -u
}

# Check if a skill name is available
is_skill_available() {
  local SKILL_NAME="$1"
  local AVAILABLE=$(get_available_skills)

  # Normalize skill name (strip plugin prefix if present)
  local NORMALIZED=$(echo "$SKILL_NAME" | sed 's/.*://')

  echo "$AVAILABLE" | grep -qw "$NORMALIZED"
}

# ============================================================================
# MATCH FUNCTION
# ============================================================================

match_skills() {
  local INPUT_TEXT="$1"
  local OUTPUT_FORMAT="${2:-text}"  # text or json

  if [ -z "$INPUT_TEXT" ]; then
    return 0
  fi

  # Normalize: lowercase, collapse whitespace
  local NORMALIZED=$(echo "$INPUT_TEXT" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ')

  local MATCHED_SKILLS=""
  local MATCHED_JSON="[]"

  for mapping in "${SKILL_MAPPINGS[@]}"; do
    # Split on last |
    local PATTERN="${mapping%|*}"
    local TRIGGER="${mapping##*|}"

    # Convert | to regex alternation
    local REGEX_PATTERN=$(echo "$PATTERN" | sed 's/|/\\|/g')

    # Check if any keyword matches
    if echo "$NORMALIZED" | grep -qE "$PATTERN"; then
      if [ -n "$MATCHED_SKILLS" ]; then
        MATCHED_SKILLS="$MATCHED_SKILLS "
      fi
      MATCHED_SKILLS="$MATCHED_SKILLS$TRIGGER"

      # For JSON output
      local SKILL_NAME=$(echo "$TRIGGER" | grep -oE '[a-z]+-[a-z]+' | head -1)
      [ -z "$SKILL_NAME" ] && SKILL_NAME="general"
      MATCHED_JSON=$(echo "$MATCHED_JSON" | jq --arg skill "$SKILL_NAME" --arg trigger "$TRIGGER" '. + [{"skill": $skill, "trigger": $trigger}]')
    fi
  done

  if [ "$OUTPUT_FORMAT" = "json" ]; then
    echo "$MATCHED_JSON"
  else
    echo "$MATCHED_SKILLS"
  fi
}

# ============================================================================
# MATCH WITH LABELS
# ============================================================================
# Enhanced matching that includes beads issue labels

match_skills_with_labels() {
  local TITLE="$1"
  local DESCRIPTION="$2"
  local LABELS="$3"  # Space-separated list of labels

  # Combine all text sources
  local ALL_TEXT="$TITLE $DESCRIPTION $LABELS"

  match_skills "$ALL_TEXT"
}

# ============================================================================
# GET SKILLS FROM BEADS ISSUE
# ============================================================================
# Extracts skill hints from a beads issue (checks notes first, then matches)

get_issue_skills() {
  local ISSUE_ID="$1"

  # Try to get from notes first (persisted by plan-backlog)
  # bd show returns an array, so use .[0] to get the first element
  local NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')
  local PERSISTED_SKILLS=$(echo "$NOTES" | grep -oP 'skills?:\s*\K.*' | head -1)

  if [ -n "$PERSISTED_SKILLS" ]; then
    # Convert comma-separated skill names to explicit invocation commands
    for skill in $(echo "$PERSISTED_SKILLS" | tr ',' ' '); do
      skill=$(echo "$skill" | tr -d ' ')
      case "$skill" in
        xterm-js|xterm|tabz-guide) echo "/tabz-guide" ;;
        ui-styling|ui) echo "/ui-styling" ;;
        backend*) echo "/backend-development" ;;
        tabz-mcp|mcp|browser) echo "# Use tabz_* MCP tools directly" ;;
        better-auth|auth) echo "/better-auth" ;;
        plugin-dev|plugin) echo "/plugin-dev" ;;
        conductor*|orchestration) echo "/conductor:orchestration" ;;
        ai-multimodal|audio) echo "/ai-multimodal" ;;
        media-processing|media) echo "/media-processing" ;;
        docs-seeker|docs) echo "/docs-seeker" ;;
        code-review|review) echo "/code-review" ;;
        *)
          # For unknown skills, output as invocation if it looks like a skill name
          if [[ "$skill" =~ ^[a-z]+(-[a-z]+)*$ ]]; then
            echo "/$skill"
          fi
          ;;
      esac
    done
    return 0
  fi

  # Fall back to matching from issue content
  # bd show returns an array, so use .[0] to get the first element
  local ISSUE_JSON=$(bd show "$ISSUE_ID" --json 2>/dev/null)
  if [ -z "$ISSUE_JSON" ]; then
    return 1
  fi

  local TITLE=$(echo "$ISSUE_JSON" | jq -r '.[0].title // ""')
  local DESC=$(echo "$ISSUE_JSON" | jq -r '.[0].description // ""')
  local LABELS=$(echo "$ISSUE_JSON" | jq -r '.[0].labels[]? // ""' | tr '\n' ' ')

  match_skills_with_labels "$TITLE" "$DESC" "$LABELS"
}

# ============================================================================
# VERIFIED MATCHING (Runtime Check)
# ============================================================================
# Match skills AND verify they're actually available

match_skills_verified() {
  local INPUT_TEXT="$1"

  # Get candidate matches (fast, static)
  local CANDIDATES=$(match_skills "$INPUT_TEXT")

  if [ -z "$CANDIDATES" ]; then
    return 0
  fi

  # Get available skills (runtime discovery)
  local AVAILABLE=$(get_available_skills)

  if [ -z "$AVAILABLE" ]; then
    # Can't verify, return all candidates with warning
    echo "# Note: Could not verify skill availability (API unreachable)"
    echo "$CANDIDATES"
    return 0
  fi

  # Filter to only available skills
  local VERIFIED=""
  while IFS= read -r trigger; do
    [ -z "$trigger" ] && continue

    # Extract skill name from trigger text (e.g., "xterm-js" from "Use the xterm-js skill...")
    local SKILL_NAME=$(echo "$trigger" | grep -oE '[a-z]+-[a-z]+(-[a-z]+)?' | head -1)

    if [ -z "$SKILL_NAME" ]; then
      # Non-skill trigger (like "Reference CLAUDE.md..."), include it
      VERIFIED="$VERIFIED$trigger "
    elif echo "$AVAILABLE" | grep -qw "$SKILL_NAME"; then
      # Skill is available
      VERIFIED="$VERIFIED$trigger "
    fi
    # Skip unavailable skills silently
  done <<< "$CANDIDATES"

  echo "$VERIFIED"
}

# ============================================================================
# PERSIST SKILLS TO BEADS
# ============================================================================
# Used by plan-backlog to save skill hints

persist_skills_to_issue() {
  local ISSUE_ID="$1"
  local SKILLS="$2"  # Comma-separated skill names (e.g., "xterm-js, ui-styling")

  if [ -z "$ISSUE_ID" ] || [ -z "$SKILLS" ]; then
    return 1
  fi

  # Get existing notes (bd show returns an array)
  local EXISTING_NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')

  # Remove any existing skills line
  local CLEAN_NOTES=$(echo "$EXISTING_NOTES" | grep -v '^skills:')

  # Add new skills line
  local NEW_NOTES="${CLEAN_NOTES}
skills: ${SKILLS}"

  # Update issue
  bd update "$ISSUE_ID" --notes "$NEW_NOTES" 2>/dev/null
}

# ============================================================================
# CLI MODE
# ============================================================================

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  # Running as script, not sourced
  case "$1" in
    --help|-h)
      echo "Usage: match-skills.sh [OPTIONS] 'text to match'"
      echo ""
      echo "Options:"
      echo "  --json            Output as JSON array"
      echo "  --issue ID        Match from beads issue ID"
      echo "  --verify          Match AND verify skills are available (runtime check)"
      echo "  --available       List all currently available skill IDs"
      echo "  --available-full  List skills with descriptions (for prompt crafting)"
      echo "  --available-json  List skills as JSON array with descriptions"
      echo "  --persist ID SK   Persist skills to issue: --persist ISSUE-ID 'skill1, skill2'"
      echo ""
      echo "Examples:"
      echo "  match-skills.sh 'fix terminal resize bug'"
      echo "  match-skills.sh --verify 'add dashboard component'"
      echo "  match-skills.sh --issue TabzChrome-abc"
      echo "  match-skills.sh --available-full"
      echo "  match-skills.sh --persist TabzChrome-abc 'ui-styling, backend-development'"
      ;;
    --json)
      shift
      match_skills "$*" "json"
      ;;
    --verify)
      shift
      match_skills_verified "$*"
      ;;
    --available)
      echo "Available skills (use --available-full for descriptions):"
      get_available_skills | tr ' ' '\n' | grep -v '^$' | sort | sed 's/^/  - /'
      ;;
    --available-full)
      echo "Available skills with descriptions:"
      echo ""
      get_available_skills_with_desc | while IFS='|' read -r id desc; do
        [ -z "$id" ] && continue
        printf "  %-40s %s\n" "$id" "$desc"
      done
      ;;
    --available-json)
      get_available_skills_with_desc | jq -R 'split("|") | {id: .[0], description: .[1]}' | jq -s '.'
      ;;
    --issue)
      shift
      get_issue_skills "$1"
      ;;
    --persist)
      shift
      persist_skills_to_issue "$1" "$2"
      ;;
    *)
      match_skills "$*"
      ;;
  esac
fi
