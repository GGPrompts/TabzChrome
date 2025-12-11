# Demo Setup Command

Orchestrate a multi-Claude demo for recording. Each worker builds a separate section component, then the conductor assembles them into the final page.

## Demo Concept

**Before:** A minimal page at `app/projects/demo-template/page.tsx`
**After:** A fully animated portfolio page assembled from section components

**Workflow:**
1. Workers each build ONE section as a separate component (no conflicts!)
2. Conductor generates images in DALL-E/Copilot while workers are busy
3. Conductor assembles all sections into the final page
4. Page transforms from basic → stunning on screen

## Section Assignments

Based on the GitHub Pages structure at https://ggprompts.github.io/TabzChrome/:

| Worker | Section | Output File |
|--------|---------|-------------|
| Hero | Hero + tagline + badges | `components/demo/HeroSection.tsx` |
| Features | Feature cards grid (MCP tools, Terminal features) | `components/demo/FeaturesSection.tsx` |
| Reference | Quick ref tables + status indicators | `components/demo/ReferenceSection.tsx` |

## Setup Phase

### 1. Reset Demo (if needed)
```bash
cd /home/matt/projects/my-portfolio
git checkout app/projects/demo-template/page.tsx
rm -rf components/demo/  # Clear previous section components
```

### 2. Open Browser Tabs
```bash
mcp-cli call tabz/tabz_open_url '{"url": "https://chatgpt.com/g/g-iLoR8U3iA-dall-e3"}'
mcp-cli call tabz/tabz_open_url '{"url": "https://copilot.microsoft.com/"}'
mcp-cli call tabz/tabz_open_url '{"url": "https://ggprompts.github.io/TabzChrome/"}'
```

**Start the demo on the README page** (this is the source content):
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "ggprompts.github.io"}'
```

### 3. Start Portfolio Dev Server
```bash
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -d '{"name": "Portfolio Dev", "workingDir": "/home/matt/projects/my-portfolio", "command": "npm run dev"}'
```

Wait 3 seconds, then:
```bash
mcp-cli call tabz/tabz_open_url '{"url": "http://localhost:3000/projects/demo-template"}'
```

### 4. Spawn Claude Workers
Each worker uses a different themed profile for visual variety!

```bash
# Worker 1 - Hero Section (MatrixClaude - green)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -d '{"name": "MatrixClaude", "workingDir": "/home/matt/projects/my-portfolio", "command": "claude --dangerously-skip-permissions"}'

# Worker 2 - Features Section (ContrastClaude - cyan)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -d '{"name": "ContrastClaude", "workingDir": "/home/matt/projects/my-portfolio", "command": "claude --dangerously-skip-permissions"}'

# Worker 3 - Reference Section (Claudula - purple/dracula)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -d '{"name": "Claudula", "workingDir": "/home/matt/projects/my-portfolio", "command": "claude --dangerously-skip-permissions"}'
```

### 5. Send Worker Prompts
Wait 4 seconds for Claude to initialize. Get tmux session names from spawn responses.

**To Hero Worker:**
```
Create components/demo/HeroSection.tsx - a hero section component for TabzChrome.

IMPORTANT: The dev server is already running at localhost:3000 - do NOT start it yourself.

Use the ui-styling skill for shadcn/ui components and Tailwind patterns.

Reference:
- Style from app/projects/tabz-chrome/page.tsx (the hero/header part)
- Content from https://ggprompts.github.io/TabzChrome/ (fetch the page)

Include:
- SpaceBackground behind everything
- Animated title with gradient text
- Tagline: "Full Linux terminals in your Chrome sidebar"
- Version badges using shadcn Badge component (v2.7.0, Manifest V3, xterm.js)
- Framer Motion entrance animations
- GitHub button using shadcn Button component

Export as default function HeroSection()
Use Task tool to research the TabzChrome repo for accurate version info.
```

**To Features Worker:**
```
Create components/demo/FeaturesSection.tsx - a features grid component for TabzChrome.

IMPORTANT: The dev server is already running at localhost:3000 - do NOT start it yourself.

Use the ui-styling skill for shadcn/ui components and Tailwind patterns.

Reference:
- Style from app/projects/tabz-chrome/page.tsx (the feature cards)
- Content from https://ggprompts.github.io/TabzChrome/ (the Quick Navigation cards)

Include:
- Two feature grids: "Terminal Features" and "MCP Tools"
- 6 cards per grid using shadcn Card components with icons, titles, descriptions
- Glassmorphism card styling with hover effects
- Staggered Framer Motion animations on scroll
- Accurate MCP tool count (research ~/projects/TabzChrome/tabz-mcp-server)

Export as default function FeaturesSection()
Use Task tool to get the actual MCP tools list and terminal features.
```

**To Reference Worker:**
```
Create components/demo/ReferenceSection.tsx - a quick reference component for TabzChrome.

IMPORTANT: The dev server is already running at localhost:3000 - do NOT start it yourself.

Use the ui-styling skill for shadcn/ui components and Tailwind patterns.

Reference:
- Style from app/projects/tabz-chrome/page.tsx
- Content from https://ggprompts.github.io/TabzChrome/ (keyboard shortcuts, status indicators)

Include:
- Keyboard shortcuts grid with styled <kbd> elements
- Claude Code status indicators (🤖✅ Ready, 🤖⏳ Thinking, 🤖🔧 Tool Use)
- Quick start code block with terminal styling
- Framer Motion fade-in animations
- Use shadcn Card and Badge components where appropriate

Export as default function ReferenceSection()
```

## Conductor Actions During Demo

While workers are building sections:

### 1. Generate images (fire-and-forget style)
Submit prompts and immediately move to the next tab - don't wait for generation to complete!

**DALL-E 3:**
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "dall-e"}'
mcp-cli call tabz/tabz_fill '{"selector": "#prompt-textarea", "value": "A glowing green terminal window floating in space with cyberpunk city in the background, digital art style"}'
mcp-cli call tabz/tabz_click '{"selector": "button[data-testid=\"send-button\"]"}'
```

**Copilot** (move here immediately after submitting DALL-E):
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "copilot"}'
mcp-cli call tabz/tabz_fill '{"selector": "textarea", "value": "Create an image: Multiple robot hands typing on keyboards in a dark room with glowing monitors, digital art, purple and blue color scheme"}'
mcp-cli call tabz/tabz_click '{"selector": "button[aria-label=\"Submit message\"]"}'
```

**Sora** (optional - fill only to save credits):
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "sora"}'
mcp-cli call tabz/tabz_fill '{"selector": "textarea", "value": "A developer leaning back watching robot hands emerge from a browser sidebar to write code, cinematic lighting"}'
```

### 2. Monitor worker progress
```bash
tmux capture-pane -t "Claude: Hero" -p -S -20
tmux capture-pane -t "Claude: Features" -p -S -20
tmux capture-pane -t "Claude: Reference" -p -S -20
```

### 3. Check for completion
Look for "components/demo/*.tsx" files:
```bash
ls -la /home/matt/projects/my-portfolio/components/demo/
```

### 4. Download generated images
Once images are ready, download them to the portfolio public folder:

**From DALL-E 3:**
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "dall-e"}'
# Right-click the generated image and copy the image URL, then:
mcp-cli call tabz/tabz_download_image '{"selector": "img[alt*=\"Image\"]", "filename": "hero-art.png"}'
# Move to portfolio: mv ~/ai-images/hero-art.png /home/matt/projects/my-portfolio/public/images/
```

**From Copilot:**
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "copilot"}'
mcp-cli call tabz/tabz_download_image '{"selector": "img[src*=\"bing\"]", "filename": "features-art.png"}'
# Move to portfolio: mv ~/ai-images/features-art.png /home/matt/projects/my-portfolio/public/images/
```

## Assembly Phase

Once all workers are done, the conductor assembles the page:

### 1. Show the "Before" state
Switch to the demo page tab to show the basic version:
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "demo-template"}'
```

### 2. Assemble the components
```
All section components are ready in components/demo/. Now assemble them into app/projects/demo-template/page.tsx.

IMPORTANT: The dev server is already running - do NOT start it yourself.

Import and render in order:
1. HeroSection
2. FeaturesSection
3. ReferenceSection

Add a footer with GitHub link. Wrap everything in a main container with SpaceBackground.

Also add the downloaded images:
- Use /images/hero-art.png in the HeroSection
- Use /images/features-art.png in the FeaturesSection
```

### 3. Show the "After" state
Refresh the demo page to reveal the transformation:
```bash
mcp-cli call tabz/tabz_switch_tab '{"identifier": "demo-template"}'
mcp-cli call tabz/tabz_execute_script '{"script": "location.reload()"}'
```

### 4. Show off the result
Smooth auto-scroll to showcase the full page (great for demo recordings):
```bash
# Smooth scroll down the entire page over ~8 seconds (see tabz-mcp skill for more options)
mcp-cli call tabz/tabz_execute_script '{"script": "(async () => { const h = document.body.scrollHeight; const d = 8000; const s = performance.now(); const f = () => { const p = Math.min((performance.now() - s) / d, 1); window.scrollTo(0, h * p); if (p < 1) requestAnimationFrame(f); }; f(); })()"}'

# Scroll back to top
mcp-cli call tabz/tabz_execute_script '{"script": "window.scrollTo({top: 0, behavior: \"smooth\"})"}'
```

Or take screenshots:
```bash
mcp-cli call tabz/tabz_screenshot '{}'
mcp-cli call tabz/tabz_screenshot_full '{}'
```

## Cleanup

```bash
# List demo terminals
curl -s http://localhost:8129/api/agents | jq '.data[] | select(.name | contains("Claude:") or contains("Portfolio")) | {id, name}'

# Kill specific terminal
curl -X DELETE http://localhost:8129/api/agents/{terminal-id}

# Kill all Claude workers at once
curl -s http://localhost:8129/api/agents | jq -r '.data[] | select(.name | startswith("Claude:")) | .id' | xargs -I {} curl -X DELETE http://localhost:8129/api/agents/{}
```

## More Image Prompt Ideas

If you want to generate additional images:
- "A futuristic browser window with glowing terminal text, neon purple and green, digital art"
- "AI robots collaborating around multiple computer screens, cyberpunk office, atmospheric lighting"
- "Split screen showing messy code on left transforming into beautiful UI on right, digital art"

---

**Note:** If demo doesn't go perfectly, just kill terminals and re-run `/demo` to start fresh!
