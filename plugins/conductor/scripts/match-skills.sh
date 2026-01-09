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
# SKILL MAPPINGS - Single Source of Truth
# ============================================================================
# Format: keyword_pattern|skill_trigger_text
# Pattern uses bash regex (extended)
# Add new mappings here - all skills/commands reference this file

SKILL_MAPPINGS=(
  # Terminal / TabzChrome (project-specific skill)
  "terminal|xterm|pty|resize|buffer|fitaddon|websocket.*terminal|Use the tabz-guide skill for TabzChrome terminal patterns."

  # UI / Frontend
  "ui|component|modal|dashboard|styling|tailwind|shadcn|form|button|Use the ui-styling skill for shadcn/ui components and Tailwind CSS."

  # Frontend frameworks
  "react|next|vue|svelte|frontend|Use the frontend-development skill for React and frontend patterns."

  # Backend / API
  "backend|api|server|database|endpoint|express|websocket.*server|Use the backend-development skill for API and server patterns."

  # Browser automation / MCP
  "browser|screenshot|click|mcp|tabz_|automation|Use the tabz-mcp skill for browser automation tools."

  # Authentication
  "auth|login|oauth|session|token|jwt|Use the better-auth skill for authentication patterns."

  # Plugin development
  "plugin|skill|agent|hook|command|frontmatter|Use the plugin-dev skills for plugin/skill/agent structure."

  # Conductor / orchestration
  "prompt|worker|swarm|conductor|orchestrat|Use the conductor:orchestration skill for multi-session coordination."

  # Audio / TTS / Multimodal
  "audio|tts|speech|sound|voice|speak|gemini|Use the ai-multimodal skill for audio and media processing."

  # Media processing
  "image|video|media|ffmpeg|imagemagick|Use the media-processing skill for multimedia handling."

  # 3D / Three.js (project-specific reference)
  "3d|three|scene|focus.*mode|webgl|Reference extension/3d/ for Three.js and React Three Fiber patterns."

  # Chrome extension (project-specific reference)
  "chrome|extension|manifest|sidepanel|background|service.*worker|Use the tabz-guide skill for Chrome extension patterns."

  # Databases
  "postgres|mongodb|redis|sql|database|query|Use the databases skill for database operations."

  # Documentation discovery
  "docs|documentation|llms.txt|repomix|Use the docs-seeker skill to find documentation."

  # Code review
  "review|pr|pull.*request|lint|Use the code-review skill for review best practices."

  # Web frameworks
  "nextjs|express|fastapi|django|nest|Use the web-frameworks skill for framework guidance."

  # Testing (general guidance, not a specific skill)
  "test|jest|vitest|spec|coverage|Check existing test files for testing conventions."
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
    # Convert comma-separated skill names to trigger text
    for skill in $(echo "$PERSISTED_SKILLS" | tr ',' ' '); do
      skill=$(echo "$skill" | tr -d ' ')
      case "$skill" in
        xterm-js|xterm) echo "Use the xterm-js skill for terminal rendering and resize handling." ;;
        ui-styling|ui) echo "Use the ui-styling skill for shadcn/ui components and Tailwind CSS." ;;
        backend*) echo "Use the backend-development skill for API and server patterns." ;;
        tabz-mcp|mcp|browser) echo "Use MCP browser automation tools (tabz_*) for testing." ;;
        better-auth|auth) echo "Use the better-auth skill for authentication patterns." ;;
        plugin-dev|plugin) echo "Use the plugin-dev skills for plugin/skill/agent structure." ;;
        conductor) echo "Follow conductor orchestration patterns." ;;
        ai-multimodal|audio) echo "Use the ai-multimodal skill for audio processing." ;;
        media-processing|media) echo "Use the media-processing skill for multimedia handling." ;;
        *) echo "Use the $skill skill." ;;
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
      echo "  --json       Output as JSON array"
      echo "  --issue      Match from beads issue ID"
      echo "  --verify     Match AND verify skills are available (runtime check)"
      echo "  --available  List all currently available skills"
      echo "  --persist    Persist skills to issue: --persist ISSUE-ID 'skill1, skill2'"
      echo ""
      echo "Examples:"
      echo "  match-skills.sh 'fix terminal resize bug'"
      echo "  match-skills.sh --verify 'add dashboard component'"
      echo "  match-skills.sh --issue TabzChrome-abc"
      echo "  match-skills.sh --available"
      echo "  match-skills.sh --persist TabzChrome-abc 'xterm-js, ui-styling'"
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
      echo "Available skills:"
      get_available_skills | tr ' ' '\n' | grep -v '^$' | sort | sed 's/^/  - /'
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
