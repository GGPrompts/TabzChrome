#!/bin/bash
# Claude Code Diagnostic Script
# Checks common configuration issues

set -e

echo "=== Claude Code Diagnostics ==="
echo

# Version
echo "## Version"
claude --version 2>/dev/null || echo "Claude CLI not found in PATH"
echo

# Check config files
echo "## Configuration Files"
echo

echo "### User Settings (~/.claude/settings.json)"
if [ -f ~/.claude/settings.json ]; then
    echo "  Status: EXISTS"
    if jq empty ~/.claude/settings.json 2>/dev/null; then
        echo "  JSON: VALID"
    else
        echo "  JSON: INVALID - Parse error!"
    fi
else
    echo "  Status: NOT FOUND"
fi
echo

echo "### User Local Settings (~/.claude/settings.local.json)"
if [ -f ~/.claude/settings.local.json ]; then
    echo "  Status: EXISTS"
    if jq empty ~/.claude/settings.local.json 2>/dev/null; then
        echo "  JSON: VALID"
    else
        echo "  JSON: INVALID - Parse error!"
    fi
else
    echo "  Status: NOT FOUND (optional)"
fi
echo

echo "### Home MCP Config (~/.mcp.json)"
if [ -f ~/.mcp.json ]; then
    echo "  Status: EXISTS"
    if jq empty ~/.mcp.json 2>/dev/null; then
        content=$(cat ~/.mcp.json)
        if [ "$content" = "{}" ]; then
            echo "  WARNING: Empty object - may cause errors, consider removing"
        else
            echo "  JSON: VALID"
        fi
    else
        echo "  JSON: INVALID - Parse error!"
    fi
else
    echo "  Status: NOT FOUND (normal)"
fi
echo

echo "### Project Settings (.claude/settings.json)"
if [ -f .claude/settings.json ]; then
    echo "  Status: EXISTS"
    if jq empty .claude/settings.json 2>/dev/null; then
        echo "  JSON: VALID"
    else
        echo "  JSON: INVALID - Parse error!"
    fi
else
    echo "  Status: NOT FOUND (optional)"
fi
echo

echo "### Project MCP Config (.mcp.json)"
if [ -f .mcp.json ]; then
    echo "  Status: EXISTS"
    if jq empty .mcp.json 2>/dev/null; then
        echo "  JSON: VALID"
        # Check for mcpServers wrapper
        if jq -e '.mcpServers' .mcp.json >/dev/null 2>&1; then
            echo "  Schema: Has mcpServers wrapper (correct)"
        else
            echo "  WARNING: Missing mcpServers wrapper - may cause schema errors"
        fi
    else
        echo "  JSON: INVALID - Parse error!"
    fi
else
    echo "  Status: NOT FOUND (optional)"
fi
echo

# Plugin registry
echo "## Plugins"
echo

echo "### Installed Plugins"
if [ -f ~/.claude/plugins/installed_plugins.json ]; then
    count=$(jq '.plugins | keys | length' ~/.claude/plugins/installed_plugins.json 2>/dev/null || echo "0")
    echo "  Count: $count plugins"

    # Check for orphaned plugins
    orphaned=$(jq -r '.plugins | to_entries[] | select(.value[0].installPath | (. != null and (. | test("tabz-chrome") or test("conductor") or test("state-tracker")))) | .key' ~/.claude/plugins/installed_plugins.json 2>/dev/null || true)
    if [ -n "$orphaned" ]; then
        echo "  WARNING: Potentially stale plugin entries:"
        echo "$orphaned" | sed 's/^/    /'
    fi
else
    echo "  Registry not found"
fi
echo

echo "### Marketplaces"
if [ -f ~/.claude/plugins/known_marketplaces.json ]; then
    jq -r 'keys[]' ~/.claude/plugins/known_marketplaces.json 2>/dev/null | sed 's/^/  - /'
else
    echo "  No marketplaces configured"
fi
echo

# MCP servers
echo "## MCP Servers"
echo
echo "Checking MCP server health..."
claude mcp list 2>&1 | sed 's/^/  /'
echo

# Environment
echo "## Environment"
echo
echo "### Claude Environment Variables"
env | grep -i "^CLAUDE" | sed 's/^/  /' || echo "  None set"
echo
echo "### Tool Search Setting"
if [ -n "$ENABLE_TOOL_SEARCH" ]; then
    echo "  ENABLE_TOOL_SEARCH=$ENABLE_TOOL_SEARCH"
else
    echo "  ENABLE_TOOL_SEARCH not set (default: auto)"
fi
echo

echo "=== Diagnostics Complete ==="
