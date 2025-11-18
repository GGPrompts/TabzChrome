# Extension Icons

This directory should contain the following icon files:

- `icon16.png` - 16x16 pixels (toolbar, DevTools tab)
- `icon48.png` - 48x48 pixels (extension management page)
- `icon128.png` - 128x128 pixels (Chrome Web Store listing)

## Design Guidelines

- **Theme**: Terminal/console icon
- **Colors**:
  - Primary: `#4CAF50` (green) - matches Terminal theme
  - Alternative: `#FFA000` (amber) - matches Retro Amber theme
- **Style**: Modern, flat design
- **Symbol**: Terminal prompt (`>_`), keyboard, or monitor icon
- **Text**: Optional "Tab" indicator or badge

## Quick Creation Methods

### Option 1: Use Figma/Canva
1. Create 128x128 artboard
2. Add terminal icon (>_) or similar
3. Export as PNG
4. Resize to 48x48 and 16x16

### Option 2: Use AI Image Generator
Prompt: "Minimalist terminal icon, green color #4CAF50, flat design, 128x128"

### Option 3: Use Existing Icon Library
- Material Icons: `terminal` or `console`
- Lucide React: `Terminal` icon
- Heroicons: `CommandLine`

## Temporary Placeholders

Until proper icons are created, you can use base64 data URIs or generate simple SVG icons:

```javascript
// Example: Generate simple SVG icon
const svg = `
<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="16" fill="#4CAF50"/>
  <text x="50%" y="50%" text-anchor="middle" fill="white" font-family="monospace" font-size="48" dy=".3em">&gt;_</text>
</svg>
`
```

## File Structure

Once created, the directory should look like:

```
icons/
├── icon16.png
├── icon48.png
├── icon128.png
└── README.md (this file)
```

## Chrome Web Store Requirements

For Chrome Web Store submission, you'll also need:

- **Promotional images** (optional but recommended):
  - Small: 440x280
  - Marquee: 1400x560
  - Screenshots: 1280x800 or 640x400

These can be created later when preparing for store submission.
