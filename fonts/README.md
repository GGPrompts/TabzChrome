# Nerd Fonts for Tabz

Pre-bundled Nerd Fonts for the Tabz terminal. These provide icons and better rendering in the terminal.

## Included Fonts

| Font | Files |
|------|-------|
| **JetBrains Mono NF** | Regular, Bold |
| **Fira Code NF** | Regular, Bold |
| **Caskaydia Cove NF** | Regular, Bold |

## Installation

### Windows

1. Select all `.ttf` files in this folder
2. Right-click → **Install** (or "Install for all users")
3. Restart Chrome

### macOS

1. Double-click each `.ttf` file
2. Click **Install Font** in the preview window
3. Restart Chrome

### Linux

```bash
# Copy to user fonts directory
mkdir -p ~/.local/share/fonts
cp *.ttf ~/.local/share/fonts/

# Refresh font cache
fc-cache -fv
```

Then restart Chrome.

## Usage in Tabz

After installing, open Tabz Settings (⚙️) → Edit a profile → Change **Font Family** to one of:
- JetBrains Mono NF
- Fira Code NF
- Caskaydia Cove NF

## License

These fonts are from [Nerd Fonts](https://www.nerdfonts.com/) and are licensed under the SIL Open Font License (OFL).
