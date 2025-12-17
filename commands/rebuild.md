---
description: Build the TabzChrome extension and copy to Windows for Chrome reload
---

Build the extension and copy to Windows for Chrome reload.

```bash
# Auto-detect Windows username using parameter expansion (avoids if/then which Claude Code mangles)
WIN_DEST="${TABZ_WIN_PATH:-/mnt/c/Users/$(ls /mnt/c/Users/ 2>/dev/null | grep -vE '^(Default|Default User|Public|All Users|WsiAccount|desktop.ini)$' | head -1)/Desktop/TabzChrome/dist-extension/}" && npm run build && rsync -av --delete dist-extension/ "$WIN_DEST"
```

After running, tell the user to reload the extension in Chrome at `chrome://extensions`.

If the path doesn't exist, suggest the user set `TABZ_WIN_PATH` in their shell config:
```bash
export TABZ_WIN_PATH="/mnt/c/Users/YourUsername/path/to/TabzChrome/dist-extension/"
```
