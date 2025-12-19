# Prompts Section Design Spec

## Overview

A prompt library for TabzChrome dashboard that mirrors the ggprompts-next UX pattern. Users can browse saved prompts, fill in template fields inline, and send to any active terminal session.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Prompts                                           [+ New] [⚙]  │
│  Saved prompt templates for quick actions                       │
├─────────────────────────────────────────────────────────────────┤
│  [🔍 Search prompts...]        [Category ▼]  [Sort: Recent ▼]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │ 📝 Summarize Code   │  │ 🔧 Fix Bug          │               │
│  │                     │  │                     │               │
│  │ Summarize the code  │  │ Fix the following   │               │
│  │ in {{file:path}}... │  │ bug: {{desc:...}}   │               │
│  │                     │  │                     │               │
│  │ [Copy] [Send ▼]     │  │ [Copy] [Send ▼]     │               │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                 │
│  ┌─────────────────────┐  ┌─────────────────────┐               │
│  │ 📊 Explain Function │  │ ✨ Refactor         │               │
│  │ ...                 │  │ ...                 │               │
│  └─────────────────────┘  └─────────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prompt Card (Collapsed)

```
┌────────────────────────────────────────────────────┐
│ 📝 Summarize Code                        [⋮ menu] │
│                                                    │
│ Summarize the code in [file path] and explain...  │
│                                                    │
│ ┌────────┐  ┌──────────────────────────────────┐  │
│ │  Copy  │  │ Send to ▼  │ Current Tab │ Send │  │
│ └────────┘  └──────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

**Card elements:**
- Icon + Title
- Preview of content (truncated, fields shown as `[hint]`)
- Copy button (copies filled content to clipboard)
- Send dropdown + mode + button (like ChatInputBar)

---

## Prompt Card (Expanded / Modal)

When clicking a card, expand inline or open modal:

```
┌────────────────────────────────────────────────────────────────┐
│ 📝 Summarize Code                              [Edit] [Delete] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Summarize the code in [src/components/App.tsx] and explain   │
│                        ↑ click to edit                         │
│  the main functionality. Focus on:                             │
│                                                                │
│  - Key functions and their purpose                             │
│  - Dependencies and imports                                    │
│  - [any specific areas to focus on]                            │
│     ↑ click to edit                                            │
│                                                                │
│  Keep the explanation [concise/detailed] and suitable for      │
│                        ↑ dropdown: concise, detailed           │
│  [junior/senior] developers.                                   │
│   ↑ dropdown: junior, mid-level, senior                        │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Preview:                                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Summarize the code in src/components/App.tsx and explain │  │
│  │ the main functionality. Focus on:                        │  │
│  │ - Key functions and their purpose...                     │  │
│  └──────────────────────────────────────────────────────────┘  │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌────────┐  Target: [Current Tab ▼]  Mode: [Execute ▼]  [Send]│
│  │  Copy  │         └─ dropdown with all terminals             │
│  └────────┘                                                    │
└────────────────────────────────────────────────────────────────┘
```

---

## Template Field Syntax

Following ggprompts-next pattern:

```
{{field_id:hint text}}
```

**Examples:**
- `{{file:path to file}}` → text input
- `{{level:concise|detailed}}` → dropdown (pipe-separated options)
- `{{focus:areas to focus on}}` → text input with hint
- `{{include_tests:yes|no}}` → dropdown

**Field Types (inferred from hint):**
- Contains `|` → dropdown with options
- Otherwise → text input

---

## Target Terminal Dropdown

Reuses pattern from ChatInputBar:

```
┌─────────────────────────────────┐
│ ● Current Tab                   │  ← sends to active terminal
├─────────────────────────────────┤
│ ☐ 🤖 Amber Claude              │  ← individual terminals
│ ☐ 🤖 API Health Worker         │     with Claude status
│ ☐    bash-1                    │
│ ☐    htop                      │
├─────────────────────────────────┤
│ Select All / Deselect All       │
└─────────────────────────────────┘
```

**Behavior:**
- Default: "Current Tab" (send to whichever tab is active in sidebar)
- Can select multiple specific terminals
- Shows 🤖 for terminals running Claude Code

---

## Send Mode

```
┌─────────────┐
│ Execute   ▼ │
├─────────────┤
│ Execute     │  ← sends content + Enter (runs command)
│ Send        │  ← sends content only (for AI prompts)
└─────────────┘
```

---

## Data Model

```typescript
interface PromptTemplate {
  id: string
  title: string
  icon?: string                    // emoji
  content: string                  // raw content with {{field:hint}} placeholders
  category?: string                // for filtering
  description?: string             // optional subtitle
  createdAt: string
  updatedAt: string
}

interface TemplateField {
  id: string                       // "file", "level", etc.
  hint: string                     // "path to file", "concise|detailed"
  type: 'text' | 'dropdown'        // inferred from hint
  options?: string[]               // for dropdown type
  startIndex: number
  endIndex: number
  fullMatch: string                // "{{file:path to file}}"
}
```

---

## Default Prompts

```typescript
const DEFAULT_PROMPTS: PromptTemplate[] = [
  {
    id: 'summarize-code',
    title: 'Summarize Code',
    icon: '📝',
    content: 'Summarize the code in {{file:path to file}} and explain the main functionality.',
    category: 'Code Review',
  },
  {
    id: 'fix-bug',
    title: 'Fix Bug',
    icon: '🔧',
    content: 'Fix the following bug: {{description:describe the bug}}\n\nRelevant file: {{file:path to file}}',
    category: 'Debugging',
  },
  {
    id: 'explain-function',
    title: 'Explain Function',
    icon: '📊',
    content: 'Explain the {{function:function name}} function in {{file:path to file}}. Include:\n- Purpose\n- Parameters\n- Return value\n- Example usage',
    category: 'Code Review',
  },
  {
    id: 'refactor',
    title: 'Refactor Code',
    icon: '✨',
    content: 'Refactor {{file:path to file}} to improve {{aspect:readability|performance|maintainability}}. Keep the same functionality.',
    category: 'Refactoring',
  },
  {
    id: 'write-tests',
    title: 'Write Tests',
    icon: '🧪',
    content: 'Write {{type:unit|integration|e2e}} tests for {{file:path to file}}. Use {{framework:jest|vitest|mocha}}.',
    category: 'Testing',
  },
  {
    id: 'quick-command',
    title: 'Quick Command',
    icon: '⚡',
    content: '{{command:enter command}}',
    category: 'Utility',
  },
]
```

---

## Inline Field Editor

When user clicks a field in the template:

**Text field:**
```
...code in [src/App.tsx|] and explain...
           ↑ cursor, typing replaces placeholder
```

**Dropdown field:**
```
...improve [readability ▼] Keep the...
           ├─ readability  ← selected
           ├─ performance
           └─ maintainability
```

**Keyboard navigation:**
- Tab → next field
- Shift+Tab → previous field
- Enter → confirm and move to next
- Escape → cancel edit

---

## Storage

Prompts stored in Chrome storage:

```typescript
chrome.storage.local.get(['savedPrompts'])
chrome.storage.local.set({ savedPrompts: prompts })
```

---

## Integration with Backend

**For "Send" action:**

1. Get target terminal(s) from dropdown
2. Fill template with field values
3. Send via existing mechanisms:
   - If "Current Tab" → use Chrome messaging to sidebar
   - If specific terminal(s) → use WebSocket or tmux send-keys API

**API endpoints to use:**
- `GET /api/agents` → list of active terminals
- `POST /api/tmux/send-keys` → send content to specific session
- WebSocket `QUEUE_COMMAND` → queue to chat input

---

## Component Structure

```
extension/dashboard/sections/Prompts.tsx
├── PromptsHeader (title, new button, settings)
├── PromptsSearch (search, category filter, sort)
├── PromptsGrid
│   └── PromptCard (collapsed view with quick send)
├── PromptModal (expanded view for editing/filling)
│   ├── TemplateRenderer (inline field editing)
│   ├── PreviewPane (filled content preview)
│   └── SendBar (target dropdown, mode, send button)
└── PromptEditor (create/edit prompt modal)
```

---

## Questions to Resolve

1. **Create/Edit UI**: Full modal editor or inline editing?
2. **Categories**: Predefined list or user-defined tags?
3. **Import/Export**: Support sharing prompts as JSON?
4. **Sync**: Sync prompts across devices via Chrome sync storage?

---

## Implementation Priority

1. **Phase 1**: Basic grid with default prompts, inline field editing, copy button
2. **Phase 2**: Target terminal dropdown, send functionality
3. **Phase 3**: Create/edit prompts, categories, search
4. **Phase 4**: Import/export, sync
