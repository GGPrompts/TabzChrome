# Download YouTube Video for Terminal Background

Download a YouTube video from the current browser tab and save it as a terminal background.

## Prerequisites

1. **Check if yt-dlp is installed**
   ```bash
   which yt-dlp || ~/.local/bin/yt-dlp --version
   ```

   If not installed:
   ```bash
   # Install via pip (recommended)
   pip install --user yt-dlp

   # Or via pipx (isolated environment)
   pipx install yt-dlp
   ```

2. **Ensure the video folders exist**
   ```bash
   # Check and create default video folder
   [ -d ~/Videos ] || mkdir -p ~/Videos && echo "Created ~/Videos"

   # Create subfolder for terminal backgrounds
   mkdir -p ~/Videos/terminal-backgrounds
   ```

   > **Note:** The default video folder is `~/Videos`. You can change this in TabzChrome Dashboard → Settings → File Picker Defaults.

3. **Check ffmpeg is available** (needed for some format conversions)
   ```bash
   which ffmpeg
   ```

   If not installed:
   ```bash
   # Ubuntu/Debian/WSL
   sudo apt install ffmpeg

   # macOS
   brew install ffmpeg
   ```

## Steps

1. **Get the current tab URL**
   ```bash
   mcp-cli call tabz/tabz_get_page_info '{}'
   ```

2. **List available formats** (optional - to see quality options)
   ```bash
   ~/.local/bin/yt-dlp --list-formats "VIDEO_URL"
   ```

3. **Download as WebM** (video only, no audio - smaller file)
   ```bash
   # 480p - good balance of quality and size (~500MB/hour)
   ~/.local/bin/yt-dlp -f "bestvideo[height<=480][ext=webm]" \
     -o "~/Videos/terminal-backgrounds/%(title)s.%(ext)s" \
     "VIDEO_URL"

   # 720p - higher quality (~1GB/hour)
   ~/.local/bin/yt-dlp -f "bestvideo[height<=720][ext=webm]" \
     -o "~/Videos/terminal-backgrounds/%(title)s.%(ext)s" \
     "VIDEO_URL"

   # 360p - smallest file (~250MB/hour)
   ~/.local/bin/yt-dlp -f "bestvideo[height<=360][ext=webm]" \
     -o "~/Videos/terminal-backgrounds/%(title)s.%(ext)s" \
     "VIDEO_URL"
   ```

4. **Rename to a simpler filename**
   ```bash
   mv ~/Videos/terminal-backgrounds/Long*.webm ~/Videos/terminal-backgrounds/short-name.webm
   ```

5. **Use in profile settings**
   - Media Type: `video`
   - Media Path: `~/Videos/terminal-backgrounds/short-name.webm`
   - Opacity: 30-50% works well for readability

## Notes

- WebM (VP9) is preferred over MP4 - smaller files, native Chrome support
- Video-only (no audio) since terminal backgrounds are muted anyway
- 480p is usually sufficient for a sidebar background
- Combine with a gradient overlay for better text readability
- Hour-long ambient videos work fine - they loop continuously

## Good search terms for backgrounds

- "ambient loop 4k"
- "seamless loop background"
- "live wallpaper nature"
- "trippy visuals loop"
- "fireplace loop"
- "rain window loop"
