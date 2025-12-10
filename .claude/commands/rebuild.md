Build the extension and copy to Windows for Chrome reload.

```bash
npm run build && rsync -av --delete dist-extension/ /mnt/c/Users/marci/Desktop/TabzChrome/dist-extension/
```

After running, tell the user to reload the extension in Chrome at `chrome://extensions`.
