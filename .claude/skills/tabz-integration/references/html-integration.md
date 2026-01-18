# HTML Data Attributes Integration

Static "Run in Terminal" buttons on documentation or tool pages.

## Usage

Add the `data-terminal-command` attribute to any HTML element:

```html
<!-- Simple button -->
<button data-terminal-command="npm run dev">Start Dev Server</button>

<!-- Link style -->
<a href="#" data-terminal-command="git status">Check Git Status</a>

<!-- Code block with run option -->
<code data-terminal-command="npm install express">npm install express</code>
```

## Behavior

1. Click opens TabzChrome sidebar and populates chat input
2. User selects which terminal tab to send the command to
3. Visual feedback: "Queued!" with green background for 1 second

## Requirements

- No auth required (uses content script)
- Works on dynamically added elements (MutationObserver)
- Extension must be installed
- Backend running on `localhost:8129`

## Example: Documentation Page

```html
<div class="code-example">
  <pre><code>npm install my-package</code></pre>
  <button data-terminal-command="npm install my-package">
    Run in Terminal
  </button>
</div>
```

## Styling Suggestions

```css
[data-terminal-command] {
  cursor: pointer;
}

[data-terminal-command]:hover {
  background: rgba(0, 255, 0, 0.1);
}

[data-terminal-command].queued {
  background: rgba(0, 255, 0, 0.3);
  transition: background 0.3s;
}
```
