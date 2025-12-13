# TabzChrome Pre-Release Audit Report

**Date**: December 12, 2025
**Version Analyzed**: 2.7.3 (package.json) / 2.7.0 (manifest) / 2.7.4 (CHANGELOG)
**Audit Method**: Multi-agent parallel analysis (Security, Functionality, Documentation, UX, Dependencies)

---

## Executive Summary

TabzChrome is a well-architected Chrome extension with solid core functionality and excellent documentation. However, **several critical security issues must be addressed before public release**. The codebase demonstrates good practices in state management, terminal persistence, and developer experience, but has significant gaps in security hardening.

### Overall Assessment

| Category | Grade | Summary |
|----------|-------|---------|
| **Security** | D | 4 CRITICAL vulnerabilities, 4 HIGH severity issues |
| **Functionality** | A- | Solid architecture, 174 tests (2 failing), good patterns |
| **Documentation** | B+ | Excellent CLAUDE.md, version misalignment issue |
| **Usability/UX** | B | Good core UX, accessibility gaps, poor error messaging |
| **Dependencies/Build** | B | 5 transitive vulnerabilities, missing production infrastructure |

### Critical Issues (Must Fix Before Release)

| # | Issue | Severity | Location | Fix Effort |
|---|-------|----------|----------|------------|
| 1 | Arbitrary `eval()` execution | CRITICAL | background.ts:1578 | Medium |
| 2 | Overly broad `<all_urls>` permission | CRITICAL | manifest.json:28 | Low |
| 3 | Command injection in edge-tts | CRITICAL | server.js:177 | Low |
| 4 | Unauthenticated WebSocket | CRITICAL | server.js:294-893 | Medium |
| 5 | Version number misalignment | HIGH | Multiple files | Low |
| 6 | Test failures (fetch mock) | HIGH | useWorkingDirectory.ts | Low |
| 7 | Path traversal in workingDir | HIGH | pty-handler.js:23-33 | Low |
| 8 | Missing ARIA labels | MEDIUM | Various components | Low |

---

## 1. Security Audit

### CRITICAL Severity (Fix Immediately)

#### 1.1 Arbitrary JavaScript Execution via eval()

**Location**: `extension/background/background.ts:1578`

```typescript
func: (code: string) => {
  try {
    return { success: true, result: eval(code) }  // Direct eval()!
  } catch (e) {
    return { success: false, error: (e as Error).message }
  }
}
```

**Risk**: Any attacker who can send messages to the MCP server can execute arbitrary code in the extension context, gaining access to ALL Chrome APIs including:
- Full browser history
- All cookies
- All stored passwords (via debugger API)
- Arbitrary code execution on any website

**Impact**: CRITICAL - Complete extension compromise
**Fix**: Remove eval() entirely. Use the safe predefined operations list that exists elsewhere in the codebase.

---

#### 1.2 Overly Broad Host Permissions

**Location**: `extension/manifest.json:28-32`

```json
"host_permissions": [
  "<all_urls>",
  "http://localhost:8129/*",
  "ws://localhost:8129/*"
]
```

**Risk**: Content script can execute on every website. Combined with the eval() vulnerability (#1.1), this enables:
- Cross-site scripting on any page
- Cookie/session theft from any site
- Keylogging on any website

**Impact**: CRITICAL - Enables attack surface on all websites
**Fix**: Replace with specific required domains:
```json
"host_permissions": [
  "http://localhost:8129/*",
  "ws://localhost:8129/*",
  "http://127.0.0.1:8129/*",
  "ws://127.0.0.1:8129/*",
  "https://github.com/*",
  "https://gitlab.com/*"
]
```

---

#### 1.3 Command Injection in edge-tts

**Location**: `backend/server.js:177`

```javascript
const command = `edge-tts synthesize -v "${voice}" ${rateFlag} -t "${text.replace(/"/g, '\\"')}" -o "${outputBase}"`;
await execAsync(command, { timeout: 10000 });
```

**Risk**: Voice and rate parameters are directly interpolated into shell command.
**Attack Example**: `voice: "en-US; rm -rf /; echo"` executes arbitrary commands.

**Impact**: CRITICAL - Remote code execution on backend server
**Fix**: Use parameterized commands or shell-escape library:
```javascript
const { execFile } = require('child_process');
execFile('edge-tts', ['synthesize', '-v', voice, '-t', text, '-o', outputBase]);
```

---

#### 1.4 Unauthenticated WebSocket Server

**Location**: `backend/server.js:294-893`

**Risk**: WebSocket server at `ws://localhost:8129` has NO authentication. Any local process can:
- Spawn arbitrary terminals
- Execute commands in any terminal
- Read all terminal output
- Control/manipulate existing sessions

**Impact**: CRITICAL - Local privilege escalation vector
**Fix**: Implement token-based authentication:
```javascript
ws.on('connection', (socket, req) => {
  const token = new URL(req.url, 'http://localhost').searchParams.get('token');
  if (!validateToken(token)) {
    socket.close(1008, 'Unauthorized');
    return;
  }
});
```

---

### HIGH Severity

#### 1.5 Path Traversal in Working Directory

**Location**: `backend/modules/pty-handler.js:23-33`

```javascript
function expandTilde(filepath) {
  if (filepath.startsWith('~/')) {
    return filepath.replace(/^~/, os.homedir());
  }
  return filepath;  // Returns unvalidated path!
}
```

**Risk**: Accepts arbitrary paths like `../../../etc/passwd`.
**Fix**: Validate path is within allowed directories:
```javascript
const resolvedPath = path.resolve(expandTilde(filepath));
if (!resolvedPath.startsWith(os.homedir())) {
  throw new Error('Path must be within home directory');
}
```

---

#### 1.6 Externally Connectable Too Broad

**Location**: `extension/manifest.json:132-138`

```json
"externally_connectable": {
  "matches": [
    "http://localhost:*/*",  // Any localhost port!
  ]
}
```

**Risk**: Any localhost site can call extension APIs.
**Fix**: Restrict to `http://localhost:8129/*` only.

---

#### 1.7 Malformed Message Rate Limiting Too Lenient

**Location**: `backend/server.js:324-835`

Current limit: 10 malformed messages per minute.
**Risk**: DoS vector with multiple connections.
**Fix**: Reduce to 3-5 per minute.

---

### MEDIUM Severity

| Issue | Location | Risk | Fix |
|-------|----------|------|-----|
| XSS via innerHTML | content.ts:318-342 | Script injection | Use textContent |
| Missing CORS whitelist | server.js:84 | CSRF-like attacks | Whitelist origins |
| Console logs in memory | server.js:24-33 | Data leak via WS | Add expiration |
| No TLS option | background.ts:8 | MITM on WS | Support wss:// |

---

## 2. Functionality & Code Quality Audit

### Architecture Quality: EXCELLENT ✅

The codebase demonstrates solid engineering principles:

**Hybrid State Management**:
```
┌─────────────────────────────────────┐
│   Chrome Storage (UI State)         │ ← Terminal sessions, profiles
└────────────────┬────────────────────┘
                 │ sync on startup
┌────────────────▼────────────────────┐
│   Backend API (Shared State)        │ ← Working dir, terminal list
└────────────────┬────────────────────┘
                 │ watch list, recovery
┌────────────────▼────────────────────┐
│   Tmux Sessions (Process State)     │ ← Actual terminal processes
└─────────────────────────────────────┘
```

**Key Strengths**:
- Terminal ID prefixing (`ctt-`) for clear session isolation
- WebSocket ownership tracking prevents cross-window contamination
- Grace periods (30s) for PTY disconnection enable HMR
- Recovery completion flag prevents Chrome storage race conditions

### Test Coverage: 174 tests

| Test File | Tests | Status |
|-----------|-------|--------|
| useProfiles.test.ts | 18 | ✅ Pass |
| useWorkingDirectory.test.ts | 21 | ❌ **Failing** |
| useTerminalSessions.test.ts | 30 | ✅ Pass |
| content.test.ts | 66 | ✅ Pass |
| terminal-lifecycle.test.ts | 15 | ✅ Pass |
| profile-inheritance.test.ts | 19 | ✅ Pass |

### Critical Test Failure

**File**: `extension/hooks/useWorkingDirectory.ts:62,86,100`

```typescript
fetch(`${BACKEND_URL}/api/settings/working-dir`, { ... })
  .catch(() => { /* ignore API errors */ })
// TypeError: Cannot read properties of undefined (reading 'catch')
```

**Cause**: Test setup mocks `fetch` without returning a Promise.
**Fix**: Ensure test mocks return Promise-compliant functions.

### Code Quality Issues

| Issue | Files | Priority |
|-------|-------|----------|
| 13 files using `any` type | Various hooks | Medium |
| `expandTilde()` duplicated 3x | Backend modules | Low |
| Silent error swallowing | useWorkingDirectory, useProfiles | Medium |
| No React error boundaries | sidepanel.tsx | Medium |

### Edge Cases Handled Well ✅
- Multiple rapid spawns (rate limiting + deduplication)
- Backend restart during active session (tmux persistence)
- Profile changes while terminals running (snapshot isolation)
- Reconnection during active output (superseded flag pattern)

---

## 3. Documentation Audit

### Version Misalignment (HIGH PRIORITY)

```
package.json:    "2.7.3"
manifest.json:   "2.7.0"  ← 3 minor versions behind!
CHANGELOG.md:    "2.7.4"  ← 1 version ahead!
```

**Fix**: Synchronize all version numbers. Add pre-commit hook to enforce.

### Documentation Quality

| Document | Grade | Notes |
|----------|-------|-------|
| CLAUDE.md | A+ | Excellent architecture reference, comprehensive |
| README.md | A- | Clear setup, but dev section minimal |
| CHANGELOG.md | A- | Good format, needs archive (743 lines > 500 limit) |
| CONTRIBUTING.md | A- | Good flow, testing section sparse |
| LESSONS_LEARNED.md | A | Valuable debugging patterns |
| Code Comments | C+ | JSDoc missing from React components |

### Missing Documentation

- [ ] WebSocket protocol specification
- [ ] Chrome storage schema reference
- [ ] Debugging/troubleshooting guide
- [ ] REST API detailed reference
- [ ] Deployment guide (systemd/PM2/Docker)

### Unused Manifest Permissions

These should be removed or clearly documented:
- `cookies` - Reserved for future, not used
- `history` - Reserved for future, not used
- `bookmarks` - Reserved for future, not used

---

## 4. Usability & UX Audit

### Strengths ✅
- Clear empty state with helpful backend status guidance
- Unified neon green color scheme throughout
- 6 well-curated terminal themes with dark/light toggle
- Consistent button styling and dark theme cohesion

### Accessibility Issues (WCAG)

| Issue | Location | Fix |
|-------|----------|-----|
| Missing ARIA labels | Terminal close button, Ghost badge | Add `aria-label` |
| No keyboard navigation | Profile/Working dir dropdowns | Arrow keys + Enter |
| No focus trap | Settings modal | Implement focus trap |
| Low contrast | Tab text `text-gray-400` on dark | Increase contrast ratio |

### Error Handling UX: POOR ❌

**Current State**:
- Most errors go to `console.error` only - users see nothing
- "Disconnected" badge with no actionable information
- Terminal spawn failures are completely silent
- Import/export uses blocking `alert()` dialogs

**Needed Improvements**:
- Toast notifications for spawn success/failure
- Specific error messages: "Port 8129 in use" vs "Connection refused"
- Replace `alert()` with detailed validation modals

### Missing UX Features
- No loading animations (static "Connecting..." text)
- No spawn confirmation feedback
- No keyboard shortcuts help modal
- Inconsistent save behavior across settings tabs (auto vs manual)

---

## 5. Dependencies, Build & Deployment Audit

### Dependency Vulnerabilities

**5 known vulnerabilities** (all transitive, fixable):

| Package | Severity | Risk Level | Notes |
|---------|----------|------------|-------|
| esbuild ≤0.24.2 | HIGH | Dev only | Request smuggling |
| node-forge ≤1.3.1 | HIGH | Low | Cert/crypto (unused) |
| glob 10.2-10.4 | HIGH | Very low | CLI injection |
| js-yaml <3.14.2 | MODERATE | Low | Prototype pollution |

**Fix**:
```bash
npm audit fix
cd backend && npm audit fix
```

### Build System: EXCELLENT ✅

- Vite config clean and minimal
- TypeScript checks before build
- Clean dev/prod separation
- Reasonable bundle: ~940KB uncompressed, ~200KB gzipped

### Missing Production Infrastructure ❌

| Item | Status | Priority |
|------|--------|----------|
| Health check endpoint | Missing | High |
| Graceful shutdown (SIGTERM) | Missing | High |
| PM2/systemd config | Missing | High |
| Log rotation | Missing | Medium |
| Dockerfile | Missing | Medium |
| Rate limiting | Missing | Medium |
| Metrics endpoint | Missing | Low |

---

## Pre-Release Checklist

### MUST FIX (Before Any Public Release)

- [x] **Remove or restrict eval()** in `background.ts:1578` ✅ *2025-12-12*
- [x] **Restrict `<all_urls>` permission** to specific domains ✅ *2025-12-12*
- [x] **Fix edge-tts command injection** with execFile or shellEscape ✅ *2025-12-12*
- [x] **Add WebSocket authentication** (token-based) ✅ *2025-12-12*
- [x] **Synchronize version numbers** (package.json, manifest.json, CHANGELOG) ✅ *2025-12-12*
- [x] **Fix test failures** in useWorkingDirectory ✅ *2025-12-12*
- [x] **Run `npm audit fix`** in both root and backend ✅ *2025-12-12* (backend: 0 vuln, root: 2 moderate dev-only in esbuild/vite)
- [x] **Restrict `externally_connectable`** to port 8129 only ✅ *2025-12-12*

### HIGH PRIORITY (Before Production Use)

- [x] Add path traversal validation for workingDir ✅ *2025-12-12*
- [x] Add ARIA labels to interactive elements ✅ *2025-12-12*
- [ ] Add health check endpoint (`GET /api/health`)
- [ ] Add graceful shutdown handler (SIGTERM/SIGINT)
- [ ] Create PM2 ecosystem config or systemd unit
- [ ] Add toast notifications for user feedback
- [x] Remove unused permissions (cookies, history, bookmarks) ✅ *2025-12-12*

### MEDIUM PRIORITY (Before Wider Distribution)

- [ ] Add JSDoc to React components
- [x] Create CHANGELOG-archive.md and rotate old entries ✅ *2025-12-12*
- [ ] Add keyboard navigation to dropdowns
- [ ] Add React error boundaries
- [ ] Create deployment documentation
- [ ] Implement log rotation
- [ ] Add rate limiting to REST endpoints

### LOW PRIORITY (Quality Improvements)

- [ ] Extract `expandTilde()` to shared utility
- [ ] Add theme-aware sidebar component colors
- [ ] Create WebSocket protocol documentation
- [ ] Add stress tests for large terminal output
- [ ] Add metrics endpoint

---

## Estimated Remediation Time

| Category | Estimated Time |
|----------|----------------|
| Critical security fixes | 8-16 hours |
| High priority fixes | 4-6 hours |
| Medium priority improvements | 8-12 hours |
| Low priority polish | 4-8 hours |
| **Total** | **24-42 hours** |

---

## Conclusion

### What's Great ✅

TabzChrome has **excellent core architecture**:
- Hybrid state management (Chrome storage + tmux + backend) is well-designed
- Terminal functionality is mature and robust
- Documentation (especially CLAUDE.md) is comprehensive
- Developer experience is good (scripts/dev.sh, browser log forwarding)
- 174 tests cover critical paths

### What Needs Work ❌

**Security is the critical blocker**:
- The `eval()` + `<all_urls>` combination is a severe vulnerability
- Unauthenticated WebSocket enables local privilege escalation
- Command injection in edge-tts is easily exploitable

**Recommendation**: Address the 4 CRITICAL security issues before any public sharing. The fixes are well-defined and achievable in **1-2 days of focused work**.

After security hardening, TabzChrome will be a well-built, maintainable Chrome extension suitable for public distribution.

---

*Report generated by multi-agent codebase analysis - December 12, 2025*
