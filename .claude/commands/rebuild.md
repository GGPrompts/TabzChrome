Build the extension and copy to Windows for Chrome reload.

```bash
# Auto-detect Windows username (WSL user often differs from Windows user)
if [ -n "$TABZ_WIN_PATH" ]; then
    WIN_DEST="$TABZ_WIN_PATH"
elif [ -d "/mnt/c/Users" ]; then
    # Find likely Windows user (not Default, Public, or system accounts)
    WIN_USER=$(ls /mnt/c/Users/ | grep -vE '^(Default|Public|All Users|Default User)$' | head -1)
    WIN_DEST="/mnt/c/Users/$WIN_USER/Desktop/TabzChrome/dist-extension/"
else
    WIN_DEST="/mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/"
fi

npm run build && rsync -av --delete dist-extension/ "$WIN_DEST"
```

After running, tell the user to reload the extension in Chrome at `chrome://extensions`.

If the path doesn't exist, suggest the user set `TABZ_WIN_PATH` in their shell config:
```bash
export TABZ_WIN_PATH="/mnt/c/Users/YourUsername/path/to/TabzChrome/dist-extension/"
```
