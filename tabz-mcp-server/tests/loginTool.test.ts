/**
 * Tests for tabz_request_login: the tool hands a tab to the user and waits,
 * returning only status, url, and host. Nothing typed into the page and no
 * page text may reach the result.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_DOCS } from '../src/tools/tool-docs.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } }
  },
  AxiosError: class MockAxiosError extends Error {}
}));

import axios from 'axios';
import { registerLoginTools, isOnLogin, DEFAULT_LOGIN_TIMEOUT_MS, MAX_LOGIN_TIMEOUT_MS } from '../src/tools/login.js';

type Handler = (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

const PAGE_TITLE = 'Acme Payroll: Welcome back, Dana';
const TYPED_SECRET = 'hunter2-typed-by-user';

function loginState(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    tabId: 42,
    tabStatus: 'complete',
    probed: true,
    url: 'https://app.example.com/login',
    host: 'app.example.com',
    authUrl: true,
    hasPasswordField: true,
    hasLoginForm: true,
    // Fields a careless extension build might add; the tool must drop them.
    title: PAGE_TITLE,
    value: TYPED_SECRET,
    ...overrides
  };
}

function signedInState() {
  return loginState({
    url: 'https://app.example.com/dashboard',
    authUrl: false,
    hasPasswordField: false,
    hasLoginForm: false
  });
}

describe('tabz_request_login', () => {
  let registered: Map<string, { description: string; schema: Record<string, unknown>; handler: Handler }>;
  let postCalls: Array<{ url: string; body: Record<string, unknown> }>;
  let loginStates: Array<Record<string, unknown>>;

  function routePosts() {
    vi.mocked(axios.post).mockImplementation(async (url: string, body?: unknown) => {
      postCalls.push({ url, body: (body ?? {}) as Record<string, unknown> });
      if (url.endsWith('/api/browser/open-url')) {
        return { data: { success: true, tabId: 42, url: (body as { url: string }).url } };
      }
      if (url.endsWith('/api/browser/switch-tab')) {
        return { data: { success: true } };
      }
      if (url.endsWith('/api/browser/notification/show')) {
        return { data: { success: true, notificationId: 'notif-1' } };
      }
      if (url.endsWith('/api/browser/notification/clear')) {
        return { data: { success: true } };
      }
      if (url.endsWith('/api/browser/login-state')) {
        if ((body as { beginHandoff?: boolean } | undefined)?.beginHandoff) {
          return { data: { success: true, protected: true, tabId: (body as { tabId?: number }).tabId ?? 42 } };
        }
        if ((body as { completeHandoff?: boolean } | undefined)?.completeHandoff) {
          return { data: { success: true, protected: true, tabId: (body as { tabId?: number }).tabId ?? 42 } };
        }
        const next = loginStates.length > 1 ? loginStates.shift() : loginStates[0];
        return { data: next };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    registered = new Map();
    postCalls = [];
    loginStates = [];

    const server = {
      registerTool: vi.fn((name: string, config: { description: string; inputSchema: { shape: Record<string, unknown> } }, handler: Handler) => {
        registered.set(name, { description: config.description, schema: config.inputSchema.shape, handler });
      })
    } as unknown as McpServer;

    registerLoginTools(server, { pollIntervalMs: 1 });
    routePosts();
  });

  it('registers with the never-ask-for-credentials guidance in its description', () => {
    const tool = registered.get('tabz_request_login');
    expect(tool).toBeDefined();
    expect(tool!.description).toContain('Never ask the user for a password, one-time code, token, or card number');
    expect(tool!.description).toContain('See tabz_docs("tabz_request_login")');
    expect(TOOL_DOCS.tabz_request_login).toContain('signed_in, still_on_login, or pending');
  });

  it('reports signed_in as prompt-absence evidence after two consecutive clear checks', async () => {
    loginStates = [loginState(), loginState(), signedInState(), signedInState()];

    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });

    expect(result.isError).toBe(false);
    const text = result.content[0].text;
    expect(text).toContain('**Status:** signed_in');
    expect(text).toContain('**URL:** https://app.example.com');
    expect(text).toContain('**Host:** app.example.com');
    expect(text).toContain('**Authentication confirmed:** no');
    expect(text).toContain('does not prove the site authenticated the user');
    expect(text).toContain('{"status":"signed_in","evidence":"login_prompt_absent","authenticationConfirmed":false,"handoffProtectionEstablished":true,"url":"https://app.example.com","host":"app.example.com"}');
    const complete = postCalls.find(call => call.url.endsWith('/login-state') && call.body.completeHandoff === true);
    expect(complete?.body.tabId).toBe(42);
  });

  it('never includes page text or typed values in the result', async () => {
    loginStates = [loginState(), signedInState(), signedInState()];

    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });
    const text = result.content[0].text;

    expect(text).not.toContain(PAGE_TITLE);
    expect(text).not.toContain('Dana');
    expect(text).not.toContain(TYPED_SECRET);
    expect(text).not.toContain('title');
  });

  it('returns only the origin while the manual handoff document is protected', async () => {
    const clear = signedInState();
    clear.url = 'https://person:secret@app.example.com/dashboard?token=never#private';
    loginStates = [loginState(), clear, clear];

    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });
    const text = result.content[0].text;
    expect(text).toContain('**URL:** https://app.example.com');
    expect(text).not.toContain('/dashboard');
    expect(text).not.toContain('person');
    expect(text).not.toContain('token=');
    expect(text).not.toContain('#private');
  });

  it('does not count loading or unprobed observations as clear', async () => {
    loginStates = [
      loginState(),
      signedInState(),
      loginState({ probed: false, authUrl: false, hasPasswordField: false, hasLoginForm: false }),
      signedInState(),
      signedInState()
    ];

    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });
    expect(result.content[0].text).toContain('**Status:** signed_in');
    expect(postCalls.filter(call => call.url.endsWith('/login-state') && call.body.beginHandoff !== true && call.body.completeHandoff !== true)).toHaveLength(5);
  });

  it('shows a notification naming the host and clears it afterwards', async () => {
    loginStates = [loginState(), signedInState(), signedInState()];

    await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000, reason: 'To read the billing report.' });

    const show = postCalls.find(call => call.url.endsWith('/notification/show'));
    expect(show?.body.title).toBe('Sign in to app.example.com');
    expect(show?.body.message).toBe('To read the billing report. The agent is waiting.');

    const clear = postCalls.find(call => call.url.endsWith('/notification/clear'));
    expect(clear?.body.notificationId).toBe('notif-1');
  });

  it('opens the url inside the group and focuses the tab before waiting', async () => {
    loginStates = [loginState(), signedInState(), signedInState()];

    await registered.get('tabz_request_login')!.handler({ url: 'app.example.com/login', timeoutMs: 5000 });

    const open = postCalls.find(call => call.url.endsWith('/open-url'));
    expect(open?.body.url).toBe('https://app.example.com/login');
    expect(open?.body.addToClaudeGroup).toBe(true);
    expect(open?.body.newTab).toBe(true);
    expect(open?.body.background).toBe(true);
    expect(open?.body.reuseExisting).toBe(false);

    const switchCall = postCalls.find(call => call.url.endsWith('/switch-tab'));
    expect(switchCall?.body.tabId).toBe(42);

    const beginIndex = postCalls.findIndex(call => call.url.endsWith('/login-state') && call.body.beginHandoff === true);
    const switchIndex = postCalls.findIndex(call => call.url.endsWith('/switch-tab'));
    const notifyIndex = postCalls.findIndex(call => call.url.endsWith('/notification/show'));
    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(beginIndex).toBeLessThan(switchIndex);
    expect(switchIndex).toBeLessThan(notifyIndex);
    const begin = postCalls[beginIndex];
    expect(begin.body.requestTimeoutMs).toEqual(expect.any(Number));
    expect(begin.body.requestTimeoutMs as number).toBeGreaterThan(0);
    expect(begin.body.requestTimeoutMs as number).toBeLessThanOrEqual(9750);

    const probes = postCalls.filter(call => call.url.endsWith('/login-state') && call.body.beginHandoff !== true && call.body.completeHandoff !== true);
    expect(probes.every(call => call.body.tabId === 42)).toBe(true);
  });

  it('completes protection only after two clear observations across a redirect', async () => {
    loginStates = [
      loginState(),
      loginState({ url: 'https://identity.example.test/sso/login', host: 'identity.example.test' }),
      signedInState(),
      signedInState()
    ];

    const result = await registered.get('tabz_request_login')!.handler({ tabId: 42, timeoutMs: 5000 });

    expect(result.isError).toBe(false);
    const lifecycle = postCalls.filter(call => call.url.endsWith('/login-state'));
    const completeIndex = lifecycle.findIndex(call => call.body.completeHandoff === true);
    expect(completeIndex).toBeGreaterThan(0);
    expect(lifecycle[completeIndex].body.requestTimeoutMs).toEqual(expect.any(Number));
    expect(lifecycle[completeIndex].body.requestTimeoutMs as number).toBeGreaterThan(0);
    expect(lifecycle[completeIndex].body.requestTimeoutMs as number).toBeLessThanOrEqual(9750);
    expect(lifecycle.slice(0, completeIndex).filter(call => call.body.beginHandoff !== true)).toHaveLength(4);
    expect(lifecycle.slice(completeIndex + 1)).toHaveLength(0);
  });

  it('keeps the reservation active when final protection cannot be confirmed', async () => {
    loginStates = [loginState(), signedInState(), signedInState()];
    const normalRoute = vi.mocked(axios.post).getMockImplementation();
    vi.mocked(axios.post).mockImplementation(async (url: string, body?: unknown, config?: unknown) => {
      if (url.endsWith('/api/browser/login-state') && (body as { completeHandoff?: boolean } | undefined)?.completeHandoff) {
        postCalls.push({ url, body: (body ?? {}) as Record<string, unknown> });
        return { data: { success: true, protected: false, tabId: 42 } };
      }
      return normalRoute!(url, body, config);
    });

    const result = await registered.get('tabz_request_login')!.handler({ tabId: 42, timeoutMs: 5000 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('final login document could not be protected');
    expect(result.content[0].text).toContain('reservation remains active');
  });

  it('rejects url with tabId before any browser mutation', async () => {
    const result = await registered.get('tabz_request_login')!.handler({ url: 'app.example.com/login', tabId: 7, timeoutMs: 5000 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('either url or tabId');
    expect(postCalls).toHaveLength(0);
  });

  it('refuses to focus or notify unless document protection is confirmed', async () => {
    vi.mocked(axios.post).mockImplementation(async (url: string, body?: unknown) => {
      postCalls.push({ url, body: (body ?? {}) as Record<string, unknown> });
      if (url.endsWith('/api/browser/login-state')) return { data: { success: true, protected: false, tabId: 42 } };
      throw new Error(`Unexpected POST ${url}`);
    });

    const result = await registered.get('tabz_request_login')!.handler({ tabId: 42, timeoutMs: 5000 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('could not be protected');
    expect(postCalls.some(call => call.url.endsWith('/switch-tab'))).toBe(false);
    expect(postCalls.some(call => call.url.endsWith('/notification/show'))).toBe(false);
  });

  it('returns still_on_login when the wait window ends with the form still showing', async () => {
    loginStates = [loginState()];

    const start = Date.now();
    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });
    // 5000 is the schema minimum; the wait must actually elapse.
    expect(Date.now() - start).toBeGreaterThanOrEqual(4400);
    expect(Date.now() - start).toBeLessThan(5100);

    expect(result.isError).toBe(false);
    const text = result.content[0].text;
    expect(text).toContain('**Status:** still_on_login');
    expect(text).toContain('Never ask the user for a password');
    expect(text).toContain('"status":"still_on_login"');
    expect(text).toContain('call tabz_request_login again to keep waiting');
    expect(postCalls.some(call => call.body.completeHandoff === true)).toBe(false);
  }, 15000);

  it('returns pending when the page never settles, and says to call again', async () => {
    loginStates = [loginState({ tabStatus: 'loading', hasPasswordField: false, hasLoginForm: false, authUrl: false })];

    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('**Status:** pending');
    expect(result.content[0].text).toContain('The tab is still open');
    expect(postCalls.some(call => call.body.completeHandoff === true)).toBe(false);
  }, 15000);

  it('waits inside the window MCP hosts allow one call, so a result is never thrown away', async () => {
    // Claude Code cuts one tool call at about 60 seconds; a 5 minute in-tool
    // wait lost results the backend had already produced (live test 2026-09-03).
    expect(DEFAULT_LOGIN_TIMEOUT_MS).toBe(45000);
    expect(MAX_LOGIN_TIMEOUT_MS).toBe(50000);

    // A second call reuses the same tab: no url means nothing is opened.
    loginStates = [loginState(), loginState({ hasPasswordField: false, hasLoginForm: false, authUrl: false })];
    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });
    expect(result.content[0].text).toContain('**Status:** signed_in');
    expect(postCalls.some(call => call.url.endsWith('/open-url'))).toBe(false);
  }, 15000);

  it('errors when the tab is outside the caller group', async () => {
    loginStates = [{ success: false, error: 'Tab 7 is outside your group (group 3); use tabz_claude_group_add or force' }];

    const result = await registered.get('tabz_request_login')!.handler({ tabId: 7, timeoutMs: 5000 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('outside your group');
  });

  it('errors when the login tab disappears mid-wait', async () => {
    loginStates = [
      loginState(),
      { success: false, error: 'No tab with id: 42' },
      { success: false, error: 'No tab with id: 42' },
      { success: false, error: 'No tab with id: 42' }
    ];

    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('unreachable');
    expect(postCalls.some(call => call.url.endsWith('/notification/clear'))).toBe(true);
    expect(postCalls.some(call => call.body.completeHandoff === true)).toBe(false);
  });

  it('clears the notification after an unexpected probe payload', async () => {
    loginStates = [loginState(), null as unknown as Record<string, unknown>];
    const result = await registered.get('tabz_request_login')!.handler({ timeoutMs: 5000 });
    expect(result.isError).toBe(true);
    expect(postCalls.some(call => call.url.endsWith('/notification/clear'))).toBe(true);
  });

  it('rejects a timeout outside the schema range', () => {
    const schema = registered.get('tabz_request_login')!.schema as {
      timeoutMs: { safeParse: (v: unknown) => { success: boolean } };
      tabId: { safeParse: (v: unknown) => { success: boolean } };
    };
    expect(schema.timeoutMs.safeParse(1000).success).toBe(false);
    expect(schema.timeoutMs.safeParse(1_000_000).success).toBe(false);
    expect(schema.timeoutMs.safeParse(300000).success).toBe(false);
    expect(schema.timeoutMs.safeParse(50000).success).toBe(true);
    expect(schema.tabId.safeParse(-1).success).toBe(false);
    expect(schema.tabId.safeParse(42).success).toBe(true);
  });
});

describe('isOnLogin', () => {
  it('treats a form, a password field, or an auth route as still logging in', () => {
    expect(isOnLogin({ success: true, hasLoginForm: true })).toBe(true);
    expect(isOnLogin({ success: true, hasPasswordField: true })).toBe(true);
    expect(isOnLogin({ success: true, authUrl: true })).toBe(true);
    expect(isOnLogin({ success: true, hasLoginForm: false, hasPasswordField: false, authUrl: false })).toBe(false);
  });
});
