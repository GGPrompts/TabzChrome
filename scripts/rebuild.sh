#!/usr/bin/env bash
# Shared /rebuild implementation. No backend restart or Chrome reload.
fail() { printf 'REBUILD FAILED: %s\n' "$*" >&2; exit 1; }
local_only=false
case "${1:-}" in
    '') ;;
    --local-only) local_only=true ;;
    *) fail 'usage: bash scripts/rebuild.sh [--local-only]' ;;
esac
[ "$#" -le 1 ] || fail 'too many arguments'

rebuild_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)" || fail 'repository path'
cd "$rebuild_root" || fail 'entering repository'
source scripts/windows-sync.sh || fail 'loading Windows sync helper'
npm run build || fail 'extension build'
npm --prefix tabz-mcp-server run build || fail 'MCP build'
mkdir -p plugins/tabz/tabz-mcp-server/src plugins/tabz/tabz-mcp-server/dist || fail 'plugin directories'
cp -R tabz-mcp-server/src/. plugins/tabz/tabz-mcp-server/src/ || fail 'MCP source copy'
cp -R tabz-mcp-server/dist/. plugins/tabz/tabz-mcp-server/dist/ || fail 'MCP distribution copy'
node scripts/check-tabz-mcp-sync.mjs || fail 'MCP parity'
printf 'Local extension and MCP builds: passed\n'

if [ "$local_only" = true ]; then
    printf 'Windows sync: skipped (--local-only)\n'
elif [ -d /mnt/c ]; then
    rebuild_destination="$(tabz_windows_extension_dir)" || fail 'Windows destination unresolved; set TABZ_WIN_PATH to the exact Chrome load directory'
    [ -n "$rebuild_destination" ] || fail 'Windows destination is empty'
    sync_tabz_extension dist-extension "$rebuild_destination" || fail 'Windows extension sync'
else
    printf 'Windows sync: skipped (no Windows mount; load dist-extension from this repository)\n'
fi
printf 'Backend restart: not performed\nChrome reload: not performed\n'
