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

  # 4. Find latest conductor in plugin cache (any marketplace, not just tabz-chrome)
  local CACHE_DIR="$HOME/.claude/plugins/cache"
  if [ -d "$CACHE_DIR" ]; then
    # Find most recently modified conductor plugin in any marketplace
    local LATEST=$(find "$CACHE_DIR" -type d -name "conductor" 2>/dev/null | head -1)
    if [ -n "$LATEST" ]; then
      # Check if this is a versioned directory structure
      local VERSIONED=$(ls -t "$LATEST" 2>/dev/null | head -1)
      if [ -n "$VERSIONED" ] && [ -d "$LATEST/$VERSIONED" ]; then
        echo "$LATEST/$VERSIONED"
        return 0
      elif [ -f "$LATEST/plugin.json" ]; then
        # Direct plugin directory (no versioning)
        echo "$LATEST"
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
# Format: keyword_pattern|keyword_phrase
# Pattern uses bash regex (extended)
# Add new mappings here - all skills/commands reference this file
#
# IMPORTANT: Output is keyword phrases that help skill-eval hook identify relevant skills.
# The hook (meta plugin UserPromptSubmit) tells Claude to evaluate and activate skills.
# Keywords in prompts help Claude identify WHICH skills are relevant to the task.
# This approach works WITH the hook instead of duplicating explicit invocation.
#
# FORMAT: pattern|skill_name|keyword_phrase|trigger_phrase
# - pattern: regex to match against input text
# - skill_name: the skill ID for natural triggers (e.g., "xterm-js")
# - keyword_phrase: keywords for skill-eval hook activation
# - trigger_phrase: natural language trigger for prompts (e.g., "terminal resize handling")

SKILL_MAPPINGS=(
  # Terminal / TabzChrome
  "terminal|xterm|pty|resize|buffer|fitaddon|websocket.*terminal|xterm-js|xterm.js terminal, resize handling, FitAddon, WebSocket PTY|terminal integration and resize handling"

  # UI / Frontend - shadcn/ui patterns
  "ui|component|modal|dashboard|styling|tailwind|shadcn|form|button|ui-styling|shadcn/ui components, Tailwind CSS styling, Radix UI primitives|UI components and styling patterns"

  # Frontend frameworks
  "react|next|vue|svelte|frontend|frontend-development|React, TypeScript, modern frontend patterns, component architecture|React and frontend architecture"

  # Backend / API
  "backend|api|server|endpoint|express|websocket.*server|backend-development|backend development, REST API, Node.js, Python FastAPI|backend APIs and server patterns"

  # Browser automation / MCP
  "browser|screenshot|click|mcp|tabz_|automation|tabz-mcp|browser automation, MCP tools, screenshots, DOM interaction|browser automation via MCP"

  # Visual QA / UI review
  "visual|qa|regression|console.*error|ui.*test|screenshot.*test|visual-qa|visual QA, UI testing, screenshot comparison, console error detection|visual QA and UI testing"

  # Visual asset generation
  "hero.*image|team.*photo|icon.*generat|poster|dall-e|sora|video.*generat|tabz-artist|DALL-E image generation, Sora video, visual assets, poster design|visual asset generation"

  # Authentication
  "auth|login|oauth|session|token|jwt|backend-development|Better Auth, authentication, OAuth, session management, JWT tokens|authentication patterns"

  # Plugin development
  "plugin|skill|agent|hook|command|frontmatter|plugin-dev|Claude Code plugin development, skill creation, agent patterns, hooks|plugin and skill development"

  # Conductor / orchestration
  "prompt|worker|swarm|conductor|orchestrat|bdc-orchestration|multi-session orchestration, worker coordination, parallel execution|multi-session orchestration"

  # Audio / TTS / Multimodal
  "audio|tts|speech|sound|voice|speak|gemini|media-processing|audio processing, TTS speech synthesis, Gemini multimodal|audio and TTS processing"

  # Media processing
  "image|video|media|ffmpeg|imagemagick|media-processing|FFmpeg video processing, ImageMagick, media manipulation|media processing and conversion"

  # 3D / Three.js (reference, not skill)
  "3d|three|scene|focus.*mode|webgl|frontend-development|Three.js 3D rendering, WebGL, scene management|3D rendering with Three.js"

  # Chrome extension
  "chrome|extension|manifest|sidepanel|background|service.*worker|plugin-dev|Chrome extension development, manifest v3, service workers|Chrome extension development"

  # Databases
  "postgres|mongodb|redis|sql|database|query|database-design|PostgreSQL, MongoDB, Redis, database queries, schema design|database design and queries"

  # Documentation discovery
  "docs|documentation|llms.txt|repomix|docs-seeker|documentation, llms.txt, repomix context generation|documentation discovery"

  # Code review
  "review|pr|pull.*request|lint|code-review|code review, pull request analysis, linting, quality checks|code review and quality checks"

  # Web frameworks
  "nextjs|express|fastapi|django|nest|backend-development|Next.js, Express, FastAPI, Django, NestJS web frameworks|web framework patterns"

  # Testing (general guidance)
  "test|jest|vitest|spec|coverage|debugging|testing patterns, Jest, Vitest, test coverage|testing and test coverage"
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
  "visual|qa|screenshot"
  "auth|security"
  "plugin|skill|conductor"
  "audio|media"
  "assets|image|video"
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
# FORMAT: pattern|skill_name|keyword_phrase|trigger_phrase
# Output modes:
#   text (default): keyword phrases for skill-eval hook
#   json: structured output with all fields
#   triggers: natural language triggers for prompts ("Use the X skill to Y")

match_skills() {
  local INPUT_TEXT="$1"
  local OUTPUT_FORMAT="${2:-text}"  # text, json, or triggers

  if [ -z "$INPUT_TEXT" ]; then
    return 0
  fi

  # Normalize: lowercase, collapse whitespace
  local NORMALIZED=$(echo "$INPUT_TEXT" | tr '[:upper:]' '[:lower:]' | tr -s '[:space:]' ' ')

  local MATCHED_KEYWORDS=""
  local MATCHED_TRIGGERS=""
  local MATCHED_JSON="[]"

  for mapping in "${SKILL_MAPPINGS[@]}"; do
    # Parse 4-field format: pattern|skill_name|keyword_phrase|trigger_phrase
    # Pattern contains | for regex alternation, so parse from the right
    local TRIGGER_PHRASE="${mapping##*|}"
    local WITHOUT_TRIGGER="${mapping%|*}"
    local KEYWORDS="${WITHOUT_TRIGGER##*|}"
    local WITHOUT_KEYWORDS="${WITHOUT_TRIGGER%|*}"
    local SKILL_NAME="${WITHOUT_KEYWORDS##*|}"
    local PATTERN="${WITHOUT_KEYWORDS%|*}"

    # Validate we have all fields (if skill_name looks like pattern, it's old format)
    if [ "$SKILL_NAME" = "$PATTERN" ] || [ -z "$SKILL_NAME" ]; then
      # Old 2-field format (backward compatibility): pattern|keywords
      PATTERN="${mapping%|*}"
      KEYWORDS="${mapping##*|}"
      SKILL_NAME="general"
      TRIGGER_PHRASE="$KEYWORDS"
    fi

    # Check if any keyword matches
    if echo "$NORMALIZED" | grep -qE "$PATTERN"; then
      # Keywords output (for skill-eval hook)
      if [ -n "$MATCHED_KEYWORDS" ]; then
        MATCHED_KEYWORDS="$MATCHED_KEYWORDS "
      fi
      MATCHED_KEYWORDS="$MATCHED_KEYWORDS$KEYWORDS"

      # Natural triggers output (for prompts)
      if [ -n "$MATCHED_TRIGGERS" ]; then
        MATCHED_TRIGGERS="$MATCHED_TRIGGERS
"
      fi
      MATCHED_TRIGGERS="${MATCHED_TRIGGERS}Use the ${SKILL_NAME} skill for ${TRIGGER_PHRASE}."

      # JSON output
      MATCHED_JSON=$(echo "$MATCHED_JSON" | jq \
        --arg skill "$SKILL_NAME" \
        --arg keywords "$KEYWORDS" \
        --arg trigger "Use the ${SKILL_NAME} skill for ${TRIGGER_PHRASE}." \
        '. + [{"skill": $skill, "keywords": $keywords, "trigger": $trigger}]')
    fi
  done

  case "$OUTPUT_FORMAT" in
    json)
      echo "$MATCHED_JSON"
      ;;
    triggers)
      echo "$MATCHED_TRIGGERS"
      ;;
    *)
      echo "$MATCHED_KEYWORDS"
      ;;
  esac
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

  # Try to get from notes first (persisted by bd-plan)
  # bd show returns an array, so use .[0] to get the first element
  local NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')

  # Check new prepared.skills format first, then legacy skills: format
  local PERSISTED_SKILLS=$(echo "$NOTES" | grep -oP '^prepared\.skills:\s*\K.*' | head -1)
  if [ -z "$PERSISTED_SKILLS" ]; then
    PERSISTED_SKILLS=$(echo "$NOTES" | grep -oP '^skills:\s*\K.*' | head -1)
  fi

  if [ -n "$PERSISTED_SKILLS" ]; then
    # Output keyword phrases directly - the skill-eval hook handles activation
    # Keywords help Claude identify which skills are relevant to the task
    for skill in $(echo "$PERSISTED_SKILLS" | tr ',' ' '); do
      skill=$(echo "$skill" | tr -d ' ')
      case "$skill" in
        # Terminal
        xterm-js|xterm|tabz-guide|terminal) echo "xterm.js terminal, resize handling, FitAddon" ;;
        # Browser automation
        tabz-mcp|mcp|browser) echo "browser automation, MCP tools, screenshots" ;;
        # Orchestration
        conductor*|orchestration) echo "multi-session orchestration, worker coordination" ;;
        # Code review
        code-review|review) echo "code review, pull request analysis, quality checks" ;;
        # UI/styling
        ui-styling|ui|shadcn) echo "shadcn/ui components, Tailwind CSS, Radix UI" ;;
        # Backend
        backend*) echo "backend development, REST API, Node.js, FastAPI" ;;
        # Auth
        better-auth|auth) echo "Better Auth, authentication, OAuth, JWT" ;;
        # Plugin dev
        plugin-dev|plugin) echo "Claude Code plugin development, skill creation" ;;
        # Multimodal
        ai-multimodal|audio) echo "audio processing, TTS, Gemini multimodal" ;;
        # Media
        media-processing|media) echo "FFmpeg video, ImageMagick, media processing" ;;
        # Docs
        docs-seeker|docs) echo "documentation, llms.txt, repomix" ;;
        # Frontend
        frontend*) echo "React, TypeScript, frontend patterns" ;;
        # Databases
        databases|postgres|mongodb) echo "PostgreSQL, MongoDB, Redis, database queries" ;;
        # Visual
        visual|qa) echo "visual QA, UI testing, screenshot comparison" ;;
        *)
          # Return the skill name as-is for unknown skills
          echo "$skill"
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
# Used by bd-plan to save skill hints in prepared.* format

persist_skills_to_issue() {
  local ISSUE_ID="$1"
  local SKILLS="$2"  # Comma-separated skill names (e.g., "ui-styling,backend-development")

  if [ -z "$ISSUE_ID" ] || [ -z "$SKILLS" ]; then
    return 1
  fi

  # Get existing notes (bd show returns an array)
  local EXISTING_NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')

  # Remove any existing prepared.skills or legacy skills line
  local CLEAN_NOTES=$(echo "$EXISTING_NOTES" | grep -v '^prepared\.skills:' | grep -v '^skills:')

  # Add new prepared.skills line (consistent with prepared.* schema)
  local NEW_NOTES="${CLEAN_NOTES}
prepared.skills: ${SKILLS}"

  # Update issue
  bd update "$ISSUE_ID" --notes "$NEW_NOTES" 2>/dev/null
}

# Persist full prepared prompt (skills + files + prompt)
persist_prepared_prompt() {
  local ISSUE_ID="$1"
  local SKILLS="$2"    # Comma-separated skill names
  local FILES="$3"     # Comma-separated file paths
  local PROMPT="$4"    # Full worker prompt text

  if [ -z "$ISSUE_ID" ]; then
    return 1
  fi

  # Build notes in prepared.* format
  local NEW_NOTES="prepared.skills: ${SKILLS:-}
prepared.files: ${FILES:-}
prepared.prompt: |
$(echo "${PROMPT:-}" | sed 's/^/  /')"

  # Update issue (replaces all notes)
  bd update "$ISSUE_ID" --notes "$NEW_NOTES" 2>/dev/null
}

# ============================================================================
# BATCH PERSISTENCE
# ============================================================================
# Used by bd-plan "Group Tasks" to group issues into batches

# Persist batch ID to issue notes
persist_batch_to_issue() {
  local ISSUE_ID="$1"
  local BATCH_ID="$2"
  local POSITION="${3:-1}"  # Position within batch (1, 2, or 3)

  if [ -z "$ISSUE_ID" ] || [ -z "$BATCH_ID" ]; then
    return 1
  fi

  # Get existing notes (bd show returns an array)
  local EXISTING_NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')

  # Remove any existing batch.* lines
  local CLEAN_NOTES=$(echo "$EXISTING_NOTES" | grep -v '^batch\.')

  # Add new batch info
  local NEW_NOTES="${CLEAN_NOTES}
batch.id: ${BATCH_ID}
batch.position: ${POSITION}"

  # Update issue
  bd update "$ISSUE_ID" --notes "$NEW_NOTES" 2>/dev/null
}

# Get batch ID from issue notes
get_batch_from_issue() {
  local ISSUE_ID="$1"

  if [ -z "$ISSUE_ID" ]; then
    return 1
  fi

  local NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')
  echo "$NOTES" | grep -oP '^batch\.id:\s*\K.*' | head -1
}

# Get all issues in a batch
get_batch_issues() {
  local BATCH_ID="$1"

  if [ -z "$BATCH_ID" ]; then
    return 1
  fi

  # Search all ready issues for this batch ID
  for ISSUE_ID in $(bd ready --json 2>/dev/null | jq -r '.[].id'); do
    local NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')
    local ISSUE_BATCH=$(echo "$NOTES" | grep -oP '^batch\.id:\s*\K.*' | head -1)
    if [ "$ISSUE_BATCH" = "$BATCH_ID" ]; then
      local POSITION=$(echo "$NOTES" | grep -oP '^batch\.position:\s*\K.*' | head -1)
      echo "${POSITION:-1}:$ISSUE_ID"
    fi
  done | sort -n | cut -d: -f2
}

# Get unique batch IDs from ready issues
get_all_batches() {
  for ISSUE_ID in $(bd ready --json 2>/dev/null | jq -r '.[].id'); do
    local NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')
    echo "$NOTES" | grep -oP '^batch\.id:\s*\K.*' | head -1
  done | grep -v '^$' | sort -u
}

# ============================================================================
# FILE OVERLAP DETECTION
# ============================================================================
# Detect issues that may touch same files to prevent merge conflicts

# Extract potential file paths/patterns from issue
# Sources: prepared.files, title keywords, description patterns
get_issue_files() {
  local ISSUE_ID="$1"

  local ISSUE_JSON=$(bd show "$ISSUE_ID" --json 2>/dev/null)
  if [ -z "$ISSUE_JSON" ]; then
    return 1
  fi

  local NOTES=$(echo "$ISSUE_JSON" | jq -r '.[0].notes // ""')
  local TITLE=$(echo "$ISSUE_JSON" | jq -r '.[0].title // ""')
  local DESC=$(echo "$ISSUE_JSON" | jq -r '.[0].description // ""')

  # 1. Explicit prepared.files from notes
  local EXPLICIT_FILES=$(echo "$NOTES" | grep -oP '^prepared\.files:\s*\K.*' | head -1)
  if [ -n "$EXPLICIT_FILES" ]; then
    echo "$EXPLICIT_FILES" | tr ',' '\n' | sed 's/^\.\///' | sort -u
  fi

  # 2. Extract file-like patterns from title/description
  # Look for: Component names (PascalCase), file paths, .tsx/.ts/.md extensions
  local TEXT="$TITLE $DESC"

  # PascalCase component names -> likely .tsx files
  echo "$TEXT" | grep -oE '\b[A-Z][a-z]+([A-Z][a-z]+)+\b' | while read -r COMPONENT; do
    echo "$COMPONENT.tsx"
    echo "$COMPONENT.ts"
  done

  # Explicit file paths mentioned
  echo "$TEXT" | grep -oE '[a-zA-Z0-9_/-]+\.(tsx?|jsx?|md|json|sh|css|scss)' | sort -u

  # Common patterns: "X component" -> X.tsx, "X file" -> X.*
  echo "$TEXT" | grep -oiE '([a-zA-Z]+)\s+(component|file|page|hook|util)' | \
    sed -E 's/\s+(component|file|page|hook|util)$//' | \
    while read -r NAME; do
      echo "${NAME}.tsx"
    done
}

# Get skills from issue for overlap heuristic
get_issue_skills_raw() {
  local ISSUE_ID="$1"

  local NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.[0].notes // ""')

  # Check prepared.skills first, then legacy skills:
  local SKILLS=$(echo "$NOTES" | grep -oP '^prepared\.skills:\s*\K.*' | head -1)
  if [ -z "$SKILLS" ]; then
    SKILLS=$(echo "$NOTES" | grep -oP '^skills:\s*\K.*' | head -1)
  fi

  echo "$SKILLS" | tr ',' '\n' | tr -d ' ' | sort -u
}

# Check if two issues have file overlap
check_file_overlap() {
  local ISSUE1="$1"
  local ISSUE2="$2"

  local FILES1=$(get_issue_files "$ISSUE1" 2>/dev/null | sort -u)
  local FILES2=$(get_issue_files "$ISSUE2" 2>/dev/null | sort -u)

  # Check for exact file matches
  local COMMON=$(comm -12 <(echo "$FILES1") <(echo "$FILES2") 2>/dev/null)

  if [ -n "$COMMON" ]; then
    echo "file:$(echo "$COMMON" | head -1)"
    return 0
  fi

  # Check for skill overlap (heuristic - same frontend/backend skill = potential conflict)
  local SKILLS1=$(get_issue_skills_raw "$ISSUE1" 2>/dev/null | sort -u)
  local SKILLS2=$(get_issue_skills_raw "$ISSUE2" 2>/dev/null | sort -u)

  local SKILL_COMMON=$(comm -12 <(echo "$SKILLS1") <(echo "$SKILLS2") 2>/dev/null | head -1)

  if [ -n "$SKILL_COMMON" ]; then
    echo "skill:$SKILL_COMMON"
    return 0
  fi

  return 1
}

# Detect overlapping issue pairs from a list of issue IDs
# Output format: issue1|issue2|reason (one per line)
detect_file_overlap() {
  local ISSUE_IDS="$1"  # Space-separated issue IDs

  if [ -z "$ISSUE_IDS" ]; then
    return 0
  fi

  # Convert to array
  local IDS=($ISSUE_IDS)
  local COUNT=${#IDS[@]}

  if [ "$COUNT" -lt 2 ]; then
    return 0
  fi

  # Compare all pairs
  local i=0
  while [ $i -lt $((COUNT - 1)) ]; do
    local j=$((i + 1))
    while [ $j -lt $COUNT ]; do
      local ID1="${IDS[$i]}"
      local ID2="${IDS[$j]}"

      local REASON=$(check_file_overlap "$ID1" "$ID2" 2>/dev/null)
      if [ -n "$REASON" ]; then
        echo "$ID1|$ID2|$REASON"
      fi

      ((j++))
    done
    ((i++))
  done
}

# Get overlap groups - issues that should be grouped together
# Returns clusters of issues that have transitive overlap
get_overlap_groups() {
  local ISSUE_IDS="$1"

  local OVERLAPS=$(detect_file_overlap "$ISSUE_IDS")

  if [ -z "$OVERLAPS" ]; then
    # No overlaps - each issue is its own group
    for ID in $ISSUE_IDS; do
      echo "$ID"
    done
    return 0
  fi

  # Build groups using union-find (simplified)
  declare -A PARENT

  # Initialize each issue as its own parent
  for ID in $ISSUE_IDS; do
    PARENT["$ID"]="$ID"
  done

  # Find root of a set
  find_root() {
    local ID="$1"
    while [ "${PARENT[$ID]}" != "$ID" ]; do
      ID="${PARENT[$ID]}"
    done
    echo "$ID"
  }

  # Union overlapping pairs
  while IFS='|' read -r ID1 ID2 REASON; do
    [ -z "$ID1" ] && continue
    local ROOT1=$(find_root "$ID1")
    local ROOT2=$(find_root "$ID2")
    if [ "$ROOT1" != "$ROOT2" ]; then
      PARENT["$ROOT1"]="$ROOT2"
    fi
  done <<< "$OVERLAPS"

  # Collect groups
  declare -A ISSUE_GROUPS
  for ID in $ISSUE_IDS; do
    local ROOT=$(find_root "$ID")
    if [ -n "${ISSUE_GROUPS[$ROOT]}" ]; then
      ISSUE_GROUPS["$ROOT"]="${ISSUE_GROUPS[$ROOT]} $ID"
    else
      ISSUE_GROUPS["$ROOT"]="$ID"
    fi
  done

  # Output groups (one per line, space-separated IDs)
  for ROOT in "${!ISSUE_GROUPS[@]}"; do
    echo "${ISSUE_GROUPS[$ROOT]}"
  done
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
      echo "  --json            Output as JSON array with skill, keywords, and trigger"
      echo "  --triggers        Output natural trigger phrases for prompts"
      echo "                    (e.g., 'Use the xterm-js skill for terminal handling.')"
      echo "  --issue ID        Match from beads issue ID"
      echo "  --verify          Match AND verify skills are available (runtime check)"
      echo "  --available       List all currently available skill IDs"
      echo "  --available-full  List skills with descriptions (for prompt crafting)"
      echo "  --available-json  List skills as JSON array with descriptions"
      echo "  --persist ID SK   Store skills in issue notes (prepared.skills format)"
      echo ""
      echo "Batch Operations:"
      echo "  --persist-batch ID BATCH [POS]  Store batch ID in issue notes"
      echo "  --get-batch ID                  Get batch ID from issue notes"
      echo "  --batch-issues BATCH            Get all issues in a batch (sorted by position)"
      echo "  --all-batches                   List unique batch IDs from ready issues"
      echo ""
      echo "Overlap Detection (prevent merge conflicts):"
      echo "  --detect-overlap 'ID1 ID2 ...'  Find overlapping issue pairs"
      echo "  --issue-files ID                List potential files an issue may touch"
      echo "  --overlap-groups 'ID1 ID2 ...'  Group issues by overlap (same group = sequential)"
      echo ""
      echo "Notes Format (prepared.* schema):"
      echo "  prepared.skills: ui-styling,backend-development"
      echo "  prepared.files: src/Button.tsx,src/utils.ts"
      echo "  prepared.prompt: |"
      echo "    Full worker prompt here..."
      echo ""
      echo "Batch Format:"
      echo "  batch.id: batch-001"
      echo "  batch.position: 1"
      echo ""
      echo "Examples:"
      echo "  match-skills.sh 'fix terminal resize bug'"
      echo "  match-skills.sh --triggers 'add React dashboard component'"
      echo "  match-skills.sh --json 'create Claude Code plugin'"
      echo "  match-skills.sh --verify 'add dashboard component'"
      echo "  match-skills.sh --issue TabzChrome-abc"
      echo "  match-skills.sh --available-full"
      echo "  match-skills.sh --persist TabzChrome-abc 'ui-styling,backend-development'"
      echo "  match-skills.sh --persist-batch TabzChrome-abc batch-001 2"
      echo "  match-skills.sh --batch-issues batch-001"
      echo "  match-skills.sh --detect-overlap 'issue-1 issue-2 issue-3'"
      echo "  match-skills.sh --overlap-groups 'issue-1 issue-2 issue-3'"
      ;;
    --json)
      shift
      match_skills "$*" "json"
      ;;
    --triggers)
      shift
      match_skills "$*" "triggers"
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
    --persist-batch)
      shift
      persist_batch_to_issue "$1" "$2" "${3:-1}"
      ;;
    --get-batch)
      shift
      get_batch_from_issue "$1"
      ;;
    --batch-issues)
      shift
      get_batch_issues "$1"
      ;;
    --all-batches)
      get_all_batches
      ;;
    --detect-overlap)
      shift
      OVERLAPS=$(detect_file_overlap "$*")
      if [ -z "$OVERLAPS" ]; then
        echo "No overlapping issues detected"
      else
        echo "Overlapping issue pairs (may conflict during merge):"
        echo ""
        while IFS='|' read -r ID1 ID2 REASON; do
          [ -z "$ID1" ] && continue
          echo "  $ID1 <-> $ID2 ($REASON)"
        done <<< "$OVERLAPS"
      fi
      ;;
    --issue-files)
      shift
      FILES=$(get_issue_files "$1" 2>/dev/null | sort -u)
      if [ -z "$FILES" ]; then
        echo "No files detected for $1"
      else
        echo "Potential files for $1:"
        echo "$FILES" | sed 's/^/  /'
      fi
      ;;
    --overlap-groups)
      shift
      OVERLAP_RESULT=$(get_overlap_groups "$*")
      echo "Issue groups (issues in same group should run sequentially):"
      echo ""
      GROUP_NUM=1
      while read -r GROUP_LINE; do
        [ -z "$GROUP_LINE" ] && continue
        COUNT=$(echo "$GROUP_LINE" | wc -w)
        if [ "$COUNT" -gt 1 ]; then
          echo "  Group $GROUP_NUM (overlapping - run sequentially): $GROUP_LINE"
        else
          echo "  Group $GROUP_NUM (isolated): $GROUP_LINE"
        fi
        ((GROUP_NUM++))
      done <<< "$OVERLAP_RESULT"
      ;;
    *)
      match_skills "$*"
      ;;
  esac
fi
