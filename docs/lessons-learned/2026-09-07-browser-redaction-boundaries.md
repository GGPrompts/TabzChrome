# Test the complete browser observation path

A correct redaction helper does not prove that callers use it. During the Glass port, review caught sensitivity metadata attached to click results instead of fill results. Tests now execute the actual injected fill function and inspect its WebSocket metadata, while backend/MCP tests cover result forwarding and error sanitization.

Sanitize sensitive DOM content before serializing or truncating it. An HTML regex applied after truncation can miss a long value whose closing quote was cut off; quoted values and editable descendants also need coverage. Element inspection sanitizes a clone, and the DOM tree walker propagates sensitivity into descendant text. Synthetic tests retain ordinary labels to ensure masking does not erase useful diagnostics.

Apply trust checks to every token endpoint, including legacy aliases. Refuse both a tab's current internal URL and a pending internal URL before DOM/debugger operations. Checking only the current URL can miss an in-progress navigation to the extension's own dashboard.
