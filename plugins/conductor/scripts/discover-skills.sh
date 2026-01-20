#!/bin/bash
# discover-skills.sh - Find installed skills matching keywords
# Usage: discover-skills.sh "keyword1 keyword2 keyword3"
# Output: Matched skills with invocation syntax
#
# NOTE: If running as conductor from the project dir, you already have
# skill visibility in your context (<available_skills>). This script is
# for edge cases like workers in different directories or mid-session
# skill discovery.

KEYWORDS="$1"

if [ -z "$KEYWORDS" ]; then
  echo "Usage: discover-skills.sh 'keyword1 keyword2 ...'"
  exit 1
fi

# Collect all skills: id|description|invocation
ALL_SKILLS=""

# 1. Plugin skills (from API) - API returns id with leading slash already
if curl -s --max-time 2 http://localhost:8129/api/plugins/skills >/dev/null 2>&1; then
  PLUGIN_SKILLS=$(curl -s http://localhost:8129/api/plugins/skills | jq -r '.skills[] | "\(.id)|\(.desc)|\(.id)"' 2>/dev/null)
  ALL_SKILLS="$ALL_SKILLS
$PLUGIN_SKILLS"
fi

# 2. Project skills (.claude/skills/)
if [ -d ".claude/skills" ]; then
  for skill_dir in .claude/skills/*/; do
    [ -d "$skill_dir" ] || continue
    NAME=$(basename "$skill_dir")
    SKILL_FILE="$skill_dir/SKILL.md"
    if [ -f "$SKILL_FILE" ]; then
      DESC=$(grep -E "^description:" "$SKILL_FILE" 2>/dev/null | head -1 | sed 's/description:\s*//' | tr -d '"')
      [ -z "$DESC" ] && DESC="Project skill"
      ALL_SKILLS="$ALL_SKILLS
$NAME|$DESC|/$NAME"
    fi
  done
fi

# 3. User skills (~/.claude/skills/)
if [ -d "$HOME/.claude/skills" ]; then
  for skill_dir in "$HOME/.claude/skills"/*/; do
    [ -d "$skill_dir" ] || continue
    NAME=$(basename "$skill_dir")
    SKILL_FILE="$skill_dir/SKILL.md"
    if [ -f "$SKILL_FILE" ]; then
      DESC=$(grep -E "^description:" "$SKILL_FILE" 2>/dev/null | head -1 | sed 's/description:\s*//' | tr -d '"')
      [ -z "$DESC" ] && DESC="User skill"
      ALL_SKILLS="$ALL_SKILLS
$NAME|$DESC|/$NAME"
    fi
  done
fi

# Match keywords against skill names and descriptions
MATCHES=$(echo "$ALL_SKILLS" | grep -v '^$' | sort -u | while IFS='|' read -r id desc invocation; do
  [ -z "$id" ] && continue

  for kw in $KEYWORDS; do
    if echo "$id $desc" | grep -qi "$kw"; then
      echo "- \`$invocation\` - $desc"
      break
    fi
  done
done)

if [ -n "$MATCHES" ]; then
  echo "## Matched Skills"
  echo ""
  echo "$MATCHES"
else
  echo "## No Exact Matches"
  echo "(Keywords: $KEYWORDS)"
  echo ""
  echo "Available skills:"
  echo "$ALL_SKILLS" | grep -v '^$' | sort -u | head -10 | while IFS='|' read -r id desc invocation; do
    [ -z "$id" ] && continue
    echo "- \`$invocation\` - $desc"
  done
fi
