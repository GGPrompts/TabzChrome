#!/bin/bash
# Terminal Theme Color Tester
# Run this in TabzChrome to preview how your theme renders ANSI colors

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎨 Terminal Theme Color Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Success messages (Green)
echo -e "✅ \033[1;32mSUCCESS MESSAGES (Bold Green)\033[0m"
echo -e "   \033[32m✓ File written successfully to disk\033[0m"
echo -e "   \033[32m✓ Build completed: 142 files, 0 errors\033[0m"
echo -e "   \033[1;32m✓ All tests passed (327/327)\033[0m"
echo ""

# Warnings (Yellow)
echo -e "⚠️  \033[1;33mWARNING MESSAGES (Bold Yellow)\033[0m"
echo -e "   \033[33m⚠ File already exists, overwriting\033[0m"
echo -e "   \033[33m⚠ Large file detected (2.3MB)\033[0m"
echo -e "   \033[1;33mNote: This operation may take several seconds\033[0m"
echo ""

# Errors (Red)
echo -e "❌ \033[1;31mERROR MESSAGES (Bold Red)\033[0m"
echo -e "   \033[31m✗ Error: File not found at path\033[0m"
echo -e "   \033[31m✗ Build failed with 3 errors, 2 warnings\033[0m"
echo -e "   \033[1;31mTypeError: Cannot read property 'theme'\033[0m"
echo ""

# File paths (Blue)
echo -e "📁 \033[1;34mFILE PATHS & REFERENCES (Blue)\033[0m"
echo -e "   \033[34msrc/components/Terminal.tsx:456\033[0m"
echo -e "   \033[34m/home/user/projects/terminal-tabs/README.md\033[0m"
echo -e "   \033[1;34mhttps://docs.example.com/api/reference\033[0m"
echo ""

# Tool names (Magenta)
echo -e "🔧 \033[1;35mTOOL NAMES & FUNCTIONS (Magenta)\033[0m"
echo -e "   \033[35mCalling: Read tool\033[0m"
echo -e "   \033[35mExecuting: npm install\033[0m"
echo -e "   \033[1;35mFunction: handleThemeChange()\033[0m"
echo ""

# Headers (Cyan)
echo -e "📊 \033[1;36mHEADERS & SECTIONS (Cyan)\033[0m"
echo -e "   \033[36m━━━ Terminal Output ━━━\033[0m"
echo -e "   \033[1;36m## Build Results\033[0m"
echo -e "   \033[36mStatus: Running...\033[0m"
echo ""

# Metadata (Bright Black / Gray)
echo -e "⏰ \033[1;90mMETADATA & TIMESTAMPS (Dim)\033[0m"
echo -e "   \033[90m[14:23:45] Request started\033[0m"
echo -e "   \033[90mPID: 12345 | Session: abc123def\033[0m"
echo -e "   \033[90mDuration: 2.34s | Memory: 45.2MB\033[0m"
echo ""

# Mixed example (realistic Claude Code output)
echo -e "\033[1;36m━━━ Realistic Claude Code Output ━━━\033[0m"
echo ""
echo -e "\033[90m[14:23:45]\033[0m \033[35mRead\033[0m tool called"
echo -e "Reading file: \033[34msrc/SimpleTerminalApp.tsx\033[0m"
echo -e "\033[32m✓ File read successfully (1,234 lines)\033[0m"
echo ""
echo -e "\033[90m[14:23:46]\033[0m \033[35mEdit\033[0m tool called"
echo -e "Editing: \033[34msrc/SimpleTerminalApp.css:584\033[0m"
echo -e "\033[33m⚠ Backup created before editing\033[0m"
echo -e "\033[32m✓ Changes applied successfully\033[0m"
echo ""
echo -e "\033[90m[14:23:47]\033[0m \033[35mBash\033[0m tool called"
echo -e "Running: \033[1mnpm run build\033[0m"
echo -e "\033[32m✓ Build completed in 3.2s\033[0m"
echo -e "\033[32m✓ 0 errors, 0 warnings\033[0m"
echo ""
echo -e "\033[90m[14:23:51]\033[0m Task completed"
echo -e "\033[1;32m✓ All operations successful\033[0m"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 Pro tip: Compare this output across different terminal themes"
echo "   to see which color palette works best for you!"
echo ""
