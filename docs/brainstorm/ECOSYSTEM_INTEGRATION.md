# Ecosystem Integration Plan: GGPrompts + TFE + Tabz

**Date:** November 14, 2025
**Status:** Brainstorm / Planning Phase

---

## 🎯 The Vision

You have three interconnected projects that could form a complete AI-assisted development ecosystem:

1. **GGPrompts** - Web-based prompt library with community features
2. **TFE** - Terminal file explorer with built-in prompt templates
3. **Tabz** - Terminal multiplexer coordinating everything

Currently, they work independently. **The opportunity:** Integrate them into a seamless workflow where prompts flow from library → template filling → Claude execution.

---

## 📊 Current State

### GGPrompts
- **Location:** `/home/matt/projects/GGPrompts/GGPrompts`
- **Tech:** React, Supabase, Matrix-themed UI
- **Features:** 97+ prompts, forums, community sharing
- **Status:** Production ready (9.0/10 security, 9.8/10 performance)
- **Domain:** ggprompts.com (owned, 3 years prepaid)

### TFE (Terminal File Explorer)
- **Location:** `/home/matt/projects/TFE`
- **Tech:** Go, Bubbletea TUI
- **Features:** File browsing, `.prompty` templates, fillable fields
- **Prompt System:**
  - F11 → Prompts mode
  - Browse `~/.prompts/` and local `.prompts/`
  - Fill template variables with Tab navigation
  - F5 → Copy rendered prompt to clipboard
- **Format:** Microsoft .prompty format (YAML frontmatter)

### Tabz
- **Location:** `/home/matt/projects/terminal-tabs`
- **Tech:** React frontend, Node backend, tmux sessions
- **Features:** Tab-based terminal multiplexer, multi-window support
- **Backend:** WebSocket + REST API on localhost:8127
- **Spawns:** TFE, Claude Code, Bash, etc.

---

## 🔗 The Integration Opportunity

### Problem: Manual Copy-Paste Workflow

**Current workflow (inefficient):**
```
1. Browse prompts in GGPrompts web UI
2. Copy prompt text
3. Open TFE or Claude manually
4. Paste prompt
5. Fill variables manually
6. Copy filled prompt
7. Paste into Claude
```

**OR:**
```
1. TFE: F11 → Open prompt
2. Fill fields with Tab
3. F5 → Copy to clipboard
4. Switch to Claude session
5. Paste manually
```

### Solution: Direct Integration

**Proposed workflow:**
```
1. GGPrompts: Browse community prompts
   → Click "Send to Claude"
   → Select Claude session
   → Prompt sent via tmux send-keys

OR

1. TFE: F11 → Open prompt
2. Fill template fields
3. F6 (new hotkey) → Send to Claude
   → Auto-detects Claude sessions
   → Sends via tmux send-keys
   → Claude receives immediately
```

---

## 🏗️ Architecture

### Integration Flow

```
┌─────────────────────────────────────────────────┐
│ GGPrompts (Web - ggprompts.com:9323)           │
│ • Browse 97+ community prompts                  │
│ • Share prompts via forums                      │
│ • Export to .prompty format                     │
│ • "Send to Claude" → calls Tabz backend API    │
└─────────────────────────────────────────────────┘
                    ↓ sync/export
┌─────────────────────────────────────────────────┐
│ ~/.prompts/ (Shared Prompt Library)             │
│ • prepare-release.prompty                       │
│ • refactor-auth.prompty                         │
│ • quick-release-notes.prompty                   │
│ • [Community prompts from GGPrompts]            │
└─────────────────────────────────────────────────┘
                    ↓ accessible from
┌─────────────────────────────────────────────────┐
│ TFE (Terminal - Tab 1 in Tabz)                 │
│ • Press F11 → See ~/.prompts/                   │
│ • Select prompt → Fill fields                   │
│ • Press F6 (NEW) → Send to Claude               │
│ • Context-aware (knows current file/directory)  │
└─────────────────────────────────────────────────┘
                    ↓ tmux send-keys
┌─────────────────────────────────────────────────┐
│ Claude Code (Terminal - Tab 2 in Tabz)         │
│ • Receives fully-rendered prompt                │
│ • Has file context from TFE                     │
│ • Works on files, runs commands                 │
└─────────────────────────────────────────────────┘
                    ↑ coordinated by
┌─────────────────────────────────────────────────┐
│ Tabz (Multiplexer - localhost:8127)            │
│ • Manages all terminal sessions                 │
│ • Backend API for cross-app communication       │
│ • Tab 1: TFE browsing files                    │
│ • Tab 2: Claude working                         │
│ • Tab 3: Tests/logs/etc                         │
└─────────────────────────────────────────────────┘
```

---

## 🛠️ Implementation Plan

### Phase 1: Tabz Backend API (Foundation)

**Add prompt-sending endpoint to Tabz:**

```javascript
// backend/routes/api.js
router.post('/api/send-prompt', (req, res) => {
  const { prompt, session } = req.body

  // Escape quotes in prompt
  const escaped = prompt.replace(/"/g, '\\"')

  // Send to tmux using literal mode (-l) + 0.1s delay pattern
  execSync(`tmux send-keys -t ${session} -l "${escaped}"`)

  // CRITICAL: 0.1s delay prevents submission issues
  setTimeout(() => {
    execSync(`tmux send-keys -t ${session} C-m`)
  }, 100)

  res.json({ success: true })
})

// List available Claude sessions
router.get('/api/claude-sessions', (req, res) => {
  const sessions = execSync('tmux ls')
    .toString()
    .split('\n')
    .filter(line => line.includes('tt-cc-') || line.includes('claude'))
    .map(line => {
      const match = line.match(/^([\w-]+):/)
      return match ? match[1] : null
    })
    .filter(Boolean)

  res.json({ sessions })
})
```

**Why this works:**
- ✅ Uses the `sleep 0.1` pattern documented in CLAUDE.md
- ✅ Literal mode (`-l`) preserves formatting
- ✅ Detects Claude sessions automatically
- ✅ Simple REST API both GGPrompts and TFE can call

### Phase 2: TFE "Send to Claude" Feature

**Add new hotkey (F6 or Ctrl+Enter):**

```go
// In TFE's main update() function
case key.Matches(msg, keys.SendToClaude):
    if m.inPromptFillMode {
        // 1. Render prompt with filled variables
        rendered := renderPromptTemplate(m.currentPrompt, m.filledVariables)

        // 2. Detect Claude sessions via Tabz API
        sessions := getClaudeSessions() // curl localhost:8127/api/claude-sessions

        if len(sessions) == 0 {
            m.statusMessage = "⚠ No Claude sessions found"
            return m, nil
        }

        // 3. Send to first active Claude session
        err := sendPromptToTabz(sessions[0], rendered)

        if err != nil {
            m.statusMessage = fmt.Sprintf("❌ Failed to send: %v", err)
        } else {
            m.statusMessage = fmt.Sprintf("✓ Sent to Claude (%s)", sessions[0])
        }
    }
```

**Helper functions:**

```go
func getClaudeSessions() []string {
    resp, err := http.Get("http://localhost:8127/api/claude-sessions")
    if err != nil {
        return []string{}
    }
    defer resp.Body.Close()

    var result struct {
        Sessions []string `json:"sessions"`
    }
    json.NewDecoder(resp.Body).Decode(&result)
    return result.Sessions
}

func sendPromptToTabz(session, prompt string) error {
    data := map[string]string{
        "session": session,
        "prompt":  prompt,
    }

    body, _ := json.Marshal(data)
    resp, err := http.Post(
        "http://localhost:8127/api/send-prompt",
        "application/json",
        bytes.NewBuffer(body),
    )

    if err != nil {
        return err
    }
    defer resp.Body.Close()

    return nil
}
```

**UX improvements:**
- Show confirmation message: "✓ Sent to Claude (session 31)"
- Flash the status bar briefly
- Keep user in prompt fill mode (don't exit)
- Allow sending multiple times with different values

### Phase 3: GGPrompts Web Integration

**Add "Send to Claude" button to prompt cards:**

```jsx
// In GGPrompts prompt card component
function PromptCard({ prompt }) {
  const [claudeSessions, setClaudeSessions] = useState([])
  const [showSendModal, setShowSendModal] = useState(false)

  // Detect if Tabz is running locally
  useEffect(() => {
    fetch('http://localhost:8127/api/claude-sessions')
      .then(r => r.json())
      .then(data => setClaudeSessions(data.sessions))
      .catch(() => setClaudeSessions([]))
  }, [])

  const sendToClaude = async (session) => {
    const rendered = renderPrompt(prompt.template, filledFields)

    await fetch('http://localhost:8127/api/send-prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session,
        prompt: rendered
      })
    })

    showNotification('✓ Sent to Claude!')
  }

  return (
    <div className="prompt-card">
      <h3>{prompt.name}</h3>
      <p>{prompt.description}</p>

      {/* Show button only if Tabz is running */}
      {claudeSessions.length > 0 && (
        <button onClick={() => setShowSendModal(true)}>
          Send to Claude ➤
        </button>
      )}

      {showSendModal && (
        <SendToClaudeModal
          sessions={claudeSessions}
          onSend={sendToClaude}
          onClose={() => setShowSendModal(false)}
        />
      )}
    </div>
  )
}
```

**Features:**
- Only shows "Send to Claude" if Tabz backend detected (localhost:8127)
- Modal shows list of available Claude sessions
- Preview of rendered prompt before sending
- Confirmation notification

### Phase 4: Prompt Sync (GGPrompts ⟷ ~/.prompts/)

**Export prompts from GGPrompts:**

```javascript
// GGPrompts backend endpoint
app.get('/api/prompts/export/:id', async (req, res) => {
  const prompt = await supabase
    .from('prompts')
    .select('*')
    .eq('id', req.params.id)
    .single()

  // Convert to .prompty format
  const prompty = `---
name: ${prompt.name}
description: ${prompt.description}
inputs:
${Object.entries(prompt.variables).map(([key, meta]) => `  ${key}:
    type: ${meta.type}
    description: ${meta.description}`).join('\n')}
---

${prompt.template}
`

  res.setHeader('Content-Type', 'text/plain')
  res.setHeader('Content-Disposition', `attachment; filename="${prompt.name}.prompty"`)
  res.send(prompty)
})
```

**Sync script (optional):**

```bash
#!/bin/bash
# sync-prompts.sh - Download GGPrompts library to ~/.prompts/

mkdir -p ~/.prompts/community

# Fetch user's prompts from GGPrompts
curl http://localhost:9323/api/prompts/my-prompts | \
  jq -r '.[] | .id' | \
  while read id; do
    curl "http://localhost:9323/api/prompts/export/$id" \
      -o ~/.prompts/community/$(echo $id | tr '/' '_').prompty
  done

echo "✓ Synced prompts to ~/.prompts/community/"
```

**Benefits:**
- GGPrompts prompts become available in TFE
- Edit in either location
- Version control in git
- Offline access

---

## 🎨 Shared Prompt Format

**Use Microsoft .prompty format** (TFE already supports this!)

```yaml
---
name: Refactor Authentication
description: Refactor auth module to use modern patterns
inputs:
  file:
    type: filepath
    description: File to refactor (e.g., auth.go)
  pattern:
    type: string
    description: Pattern to use (e.g., JWT, OAuth2, Passkeys)
  framework:
    type: string
    description: Framework context (e.g., Go Fiber, Express, FastAPI)
---

# Refactor Authentication Module

You are refactoring {{file}} to use {{pattern}} authentication.

## Context
- Framework: {{framework}}
- Current file: {{file}}

## Requirements
1. Replace existing auth with {{pattern}}
2. Maintain backward compatibility
3. Add tests for new auth flow
4. Update documentation

## Success Criteria
- All tests pass
- No breaking changes
- Security best practices followed

Please analyze the current code and implement the refactoring.
```

**This format works in:**
- ✅ TFE (native support)
- ✅ GGPrompts (can import/export)
- ✅ Microsoft Prompty tools
- ✅ Any text editor
- ✅ Version control (plain text)

---

## 🚀 Workflow Examples

### Example 1: TFE → Claude (File-Aware Prompts)

```
1. In TFE (Tabz Tab 1):
   - Navigate to ~/projects/myapp/auth.go
   - Press F11 (prompts mode)
   - Select "refactor-auth.prompty"
   - Fill fields:
     {{file}} = "auth.go" (auto-filled from current file!)
     {{pattern}} = "JWT"
     {{framework}} = "Go Fiber"
   - Press F6 → Send to Claude

2. In Claude (Tabz Tab 2):
   - Receives: "Refactor auth.go to use JWT in Go Fiber..."
   - Has full context about file location
   - Works on the file immediately
```

**Key advantage:** TFE knows current file/directory, so templates can be pre-filled with context!

### Example 2: GGPrompts → Claude (Community Prompts)

```
1. In GGPrompts (Browser):
   - Browse community prompts
   - Find "Add GraphQL endpoint"
   - Fill template fields
   - Click "Send to Claude"
   - Select: Claude (session 31)

2. Claude receives prompt instantly
   - No copy-paste
   - No context switching
   - Immediate execution
```

### Example 3: Multi-Session Parallel Execution

```
1. In GGPrompts:
   - Prompt: "Write tests for auth.go"
   - Send to → Claude (session 31)

2. In TFE:
   - Prompt: "Write docs for auth.go"
   - Send to → Claude (session 42)

3. Both Claudes work in parallel!
   - Session 31 writes tests
   - Session 42 writes docs
   - Coordinated via Tabz
```

---

## 🎯 Phase Priorities

### Must Have (MVP)
1. ✅ Tabz backend API (`/api/send-prompt`)
2. ✅ Tabz session detection (`/api/claude-sessions`)
3. ✅ TFE "Send to Claude" hotkey (F6)
4. ✅ Basic tmux send-keys integration

### Nice to Have
5. ⭐ GGPrompts "Send to Claude" button
6. ⭐ Prompt export from GGPrompts
7. ⭐ Multi-session selector UI
8. ⭐ Prompt preview before sending

### Future Ideas
9. 💡 Bi-directional sync (GGPrompts ⟷ ~/.prompts/)
10. 💡 TFE auto-fill variables from file context
11. 💡 Prompt collections/workflows
12. 💡 Response capturing (Claude output → save to file)

---

## 🤔 Open Questions

### 1. Prompt Format Standardization
- Should GGPrompts migrate to .prompty format completely?
- Or support multiple formats (YAML, JSON, .prompty)?
- **Decision:** Use .prompty as canonical format

### 2. Session Selection UX
- Auto-send to first active Claude session?
- Always show selector modal?
- Remember last-used session?
- **Decision:** TFE auto-sends, GGPrompts shows selector

### 3. Error Handling
- What if no Claude sessions running?
- What if Tabz backend not running?
- What if tmux send-keys fails?
- **Decision:** Show clear error messages, graceful degradation

### 4. Cross-Platform Support
- Windows users don't have tmux
- How to handle this?
- **Decision:** Document as Linux/macOS/WSL only for now

---

## 📝 Implementation Checklist

### Tabz Backend
- [ ] Add `/api/send-prompt` endpoint
- [ ] Add `/api/claude-sessions` endpoint
- [ ] Test tmux send-keys with 0.1s delay
- [ ] Handle quote escaping in prompts
- [ ] Add error handling for invalid sessions
- [ ] Document API in README

### TFE
- [ ] Add F6 hotkey definition
- [ ] Implement `getClaudeSessions()` function
- [ ] Implement `sendPromptToTabz()` function
- [ ] Add status message on success/failure
- [ ] Update HOTKEYS.md documentation
- [ ] Test with various prompt templates
- [ ] Handle case when Tabz not running

### GGPrompts
- [ ] Add Tabz detection on page load
- [ ] Add "Send to Claude" button to prompt cards
- [ ] Create session selector modal
- [ ] Implement prompt rendering
- [ ] Add success/error notifications
- [ ] Update UI/UX documentation
- [ ] Test CORS if needed (localhost:9323 → localhost:8127)

### Documentation
- [ ] Update Tabz CLAUDE.md with integration info
- [ ] Update TFE README with "Send to Claude" feature
- [ ] Update GGPrompts README with Tabz integration
- [ ] Create user guide for the full workflow
- [ ] Add troubleshooting section

---

## 💭 Future Vision

**The ultimate workflow:**

```
Developer's Setup:
├── Browser: GGPrompts (ggprompts.com)
│   └── Browse 1000+ community prompts
│
├── Terminal: Tabz (localhost:8127)
│   ├── Tab 1: TFE (file browsing + context-aware prompts)
│   ├── Tab 2: Claude Code (primary development)
│   ├── Tab 3: Claude Code (tests/docs in parallel)
│   └── Tab 4: Logs/monitoring
│
└── Shared: ~/.prompts/
    ├── Personal prompts (version controlled)
    ├── Team prompts (shared via git)
    └── Community prompts (synced from GGPrompts)

Workflow:
1. Browse code in TFE
2. Select relevant prompt (context auto-filled!)
3. Send to Claude (one keypress)
4. Claude works immediately
5. Share successful prompts to GGPrompts community
```

**This becomes a complete ecosystem:**
- **Discover** prompts (GGPrompts web)
- **Organize** prompts (TFE + ~/.prompts/)
- **Execute** prompts (Tabz + Claude)
- **Share** prompts (GGPrompts forums)

---

## 🔗 Related Projects

### Similar Integrations to Study

**Cursor IDE:**
- Built-in prompt library
- Context-aware templates
- Direct Claude execution
- **What we can learn:** Seamless UX, no copy-paste

**Continue.dev:**
- VSCode extension
- Prompt templates
- Multi-file context
- **What we can learn:** Context injection patterns

**Cline:**
- VSCode extension
- Task-based prompts
- Autonomous execution
- **What we can learn:** Workflow automation

**What makes yours unique:**
- Terminal-first (not VSCode-only)
- Multi-session coordination
- Community sharing (GGPrompts)
- Three-tool ecosystem

---

## 📚 Resources

### Code Locations
- **Tabz:** `/home/matt/projects/terminal-tabs`
- **TFE:** `/home/matt/projects/TFE`
- **GGPrompts:** `/home/matt/projects/GGPrompts/GGPrompts`

### Key Files to Review
- `terminal-tabs/CLAUDE.md` - tmux send-keys pattern (line 767)
- `TFE/prompt_parser.go` - .prompty parsing logic
- `TFE/HOTKEYS.md` - Current prompt workflow (F11, F5)
- `GGPrompts/README.md` - Platform architecture

### Documentation
- Microsoft Prompty: https://github.com/microsoft/prompty
- Tmux send-keys: `man tmux` (search for send-keys)
- GGPrompts domain: https://ggprompts.com (owned)

---

## 🎬 Next Steps

### Tomorrow's Tasks

1. **Test Current State**
   - Run GGPrompts locally
   - Run TFE in Tabz
   - Test current prompt workflow

2. **Prototype Tabz API**
   - Add `/api/send-prompt` endpoint
   - Test with manual curl commands
   - Verify tmux send-keys works

3. **Decide on Architecture**
   - Try tmux-first approach in worktree
   - Compare multi-window vs popout models
   - Choose direction for Tabz

4. **Integration Feasibility**
   - Check CORS for GGPrompts → Tabz
   - Verify TFE can make HTTP requests
   - Test end-to-end flow manually

### This Week

- [ ] Implement Tabz backend API
- [ ] Add TFE F6 hotkey
- [ ] Test integration locally
- [ ] Document the workflow

### This Month

- [ ] Add GGPrompts web integration
- [ ] Create prompt sync mechanism
- [ ] Write user documentation
- [ ] Record demo video

---

## 🤝 Community Potential

**If you open source the integration:**

**For TFE users:**
- Instant prompt execution
- No copy-paste workflow
- Context-aware templates

**For GGPrompts users:**
- Direct Claude integration
- Offline prompt library
- Terminal-first workflow

**For Tabz users:**
- Multi-session coordination
- Prompt library integration
- Complete AI workflow tool

**Together:** A complete open-source ecosystem for AI-assisted development that competes with commercial tools like Cursor/Copilot but stays terminal-first and open.

---

**End of Brainstorm - November 14, 2025**

*This document captures the integration vision. Next step: Build a prototype of the Tabz backend API and test the workflow.*
