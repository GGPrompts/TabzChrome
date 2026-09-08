/**
 * Tests for the credential store tools: tabz_secret_request waits for the
 * user to save a login and tabz_fill_secret types it. Both results carry
 * status, host, hasUsername, and field names only; a value the backend might accidentally add can
 * never reach the conversation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } }
  },
  AxiosError: class MockAxiosError extends Error {}
}));

import axios from 'axios';
import { registerSecretTools, DEFAULT_SECRET_TIMEOUT_MS, MAX_SECRET_TIMEOUT_MS } from '../src/tools/secrets.js';

type Handler = (params: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;

const LEAKED_VALUE = 'never-show-this-value';
const LEAKED_USERNAME = 'saved-username-must-not-be-returned';

describe('credential store tools', () => {
  let registered: Map<string, { description: string; schema: Record<string, unknown>; handler: Handler }>;
  let postCalls: Array<{ url: string; body: Record<string, unknown> }>;
  let statuses: Array<Record<string, unknown>>;
  let requestResponse: Record<string, unknown>;
  let fillResponse: { status: number; data: Record<string, unknown> };

  function routePosts() {
    vi.mocked(axios.post).mockImplementation(async (url: string, body?: unknown) => {
      postCalls.push({ url, body: (body ?? {}) as Record<string, unknown> });
      if (url.endsWith('/api/browser/secret-request')) return { data: requestResponse };
      if (url.endsWith('/api/browser/secret-status')) {
        const next = statuses.length > 1 ? statuses.shift() : statuses[0];
        return { data: next };
      }
      if (url.endsWith('/api/browser/notification/show')) return { data: { success: true, notificationId: 'notif-1' } };
      if (url.endsWith('/api/browser/notification/clear')) return { data: { success: true } };
      if (url.endsWith('/api/browser/fill-secret')) return { status: fillResponse.status, data: fillResponse.data };
      throw new Error(`Unexpected POST ${url}`);
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    registered = new Map();
    postCalls = [];
    statuses = [];
    requestResponse = { success: true, status: 'pending', host: 'app.example.com', hasUsername: false, created: true, value: LEAKED_VALUE };
    fillResponse = { status: 200, data: { filled: true, verified: true, protected: true, host: 'app.example.com', hasUsername: true, field: 'password', value: LEAKED_VALUE, actualValue: LEAKED_VALUE, actualLength: LEAKED_VALUE.length, count: 1, error: LEAKED_VALUE } };
    vi.mocked(axios.get).mockResolvedValue({ data: { tabId: 42, protectedFillVersion: 1 } });

    const server = {
      registerTool: vi.fn((name: string, config: { description: string; inputSchema: { shape: Record<string, unknown> } }, handler: Handler) => {
        registered.set(name, { description: config.description, schema: config.inputSchema.shape, handler });
      })
    } as unknown as McpServer;

    registerSecretTools(server, { pollIntervalMs: 1 });
    routePosts();
  });

  it('registers all three tools with the credential and store guidance', () => {
    for (const name of ['tabz_secret_request', 'tabz_secret_status', 'tabz_fill_secret']) {
      const tool = registered.get(name);
      expect(tool, name).toBeDefined();
      expect(tool!.description).toContain('Never ask the user for a password');
      expect(tool!.description).toContain('tabz_fill_secret');
      expect(tool!.description).toContain('Never read, list, or edit ~/.tabzchrome');
    }
  });

  describe('tabz_secret_request', () => {
    it('polls until the key file is filled and returns metadata without a username value', async () => {
      statuses = [
        { success: true, status: 'pending', host: 'app.example.com', hasUsername: false },
        { success: true, status: 'ready', host: 'app.example.com', hasUsername: true, user: LEAKED_USERNAME, value: LEAKED_VALUE }
      ];

      const result = await registered.get('tabz_secret_request')!.handler({ host: 'APP.EXAMPLE.COM', reason: 'nightly export', timeoutMs: 5000 });

      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('**Status:** ready');
      expect(text).toContain('**Host:** app.example.com');
      expect(text).toContain('**Username saved:** yes');
      expect(text).toContain('{"status":"ready","host":"app.example.com","hasUsername":true,"patterns":[],"fields":[],"secretFiles":[],"surface":"page"}');
      expect(text).toContain('**Fields:** username, password');
      expect(text).not.toContain(LEAKED_VALUE);
      expect(text).not.toContain(LEAKED_USERNAME);

      const request = postCalls.find(call => call.url.endsWith('/secret-request'));
      expect(request?.body).toMatchObject({ host: 'app.example.com', reason: 'nightly export' });
      const show = postCalls.find(call => call.url.endsWith('/notification/show'));
      expect(show?.body.title).toBe('Save the login for app.example.com');
      expect(String(show?.body.message)).toContain('nightly export');
      expect(postCalls.some(call => call.url.endsWith('/notification/clear'))).toBe(true);
    });

    it('reports the Host patterns the entry matched through and strips a :port from the host', async () => {
      requestResponse = { success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: ['*.example.com'], created: false };
      statuses = [{ success: true, status: 'ready', host: 'app.example.com', hasUsername: true, patterns: ['*.example.com'] }];

      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com:8443', timeoutMs: 5000 });

      const text = result.content[0].text;
      expect(text).toContain('**Patterns:** *.example.com');
      expect(text).toContain('matched Host pattern: *.example.com');
      expect(text).toContain('"patterns":["*.example.com"]');
      const request = postCalls.find(call => call.url.endsWith('/secret-request'));
      expect(request?.body.host).toBe('app.example.com');
    });

    it('returns ready at once when the entry is already saved, without a notification', async () => {
      requestResponse = { success: true, status: 'ready', host: 'app.example.com', hasUsername: true, created: false };

      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });

      expect(result.content[0].text).toContain('**Status:** ready');
      expect(postCalls.some(call => call.url.endsWith('/notification/show'))).toBe(false);
      expect(postCalls.some(call => call.url.endsWith('/secret-status'))).toBe(false);
    });

    it('returns pending when the key file stays empty, pointing at tabz_secret_status', async () => {
      statuses = [{ success: true, status: 'pending', host: 'app.example.com', hasUsername: false }];

      const start = Date.now();
      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });
      expect(Date.now() - start).toBeGreaterThanOrEqual(4400);
      expect(Date.now() - start).toBeLessThan(5100);

      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('**Status:** pending');
      expect(text).toContain('"status":"pending"');
      expect(text).toContain('tabz_secret_status');
      expect(text).toContain('the same surface is reused');
      expect(text).toContain('Never ask the user for a password');
    }, 15000);

    it('waits inside the window MCP hosts allow one call, so a pending result is never thrown away', () => {
      // Claude Code cuts one tool call at about 60 seconds; a longer wait lost
      // a result the backend had already produced (live test 2026-09-03).
      expect(DEFAULT_SECRET_TIMEOUT_MS).toBe(45000);
      expect(MAX_SECRET_TIMEOUT_MS).toBe(50000);

      const schema = registered.get('tabz_secret_request')!.schema as {
        timeoutMs: { safeParse: (v: unknown) => { success: boolean }; parse: (v: unknown) => unknown };
      };
      expect(schema.timeoutMs.safeParse(50000).success).toBe(true);
      expect(schema.timeoutMs.safeParse(50001).success).toBe(false);
      expect(schema.timeoutMs.safeParse(300000).success).toBe(false);
      expect(schema.timeoutMs.parse(undefined)).toBe(45000);
    });

    it('a second call reuses the open editor: one request per call, and it reports ready once saved', async () => {
      requestResponse = { success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: [], created: true, terminalId: 'ctt-secret-1' };
      statuses = [{ success: true, status: 'pending', host: 'app.example.com', hasUsername: false }];

      const first = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });
      expect(first.content[0].text).toContain('**Status:** pending');
      expect(postCalls.filter(call => call.url.endsWith('/secret-request'))).toHaveLength(1);

      // The backend reuses the terminal it already spawned (editorReused), so
      // calling again keeps waiting on the same editor instead of stacking one.
      requestResponse = { success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: [], created: false, terminalId: 'ctt-secret-1', editorReused: true };
      statuses = [{ success: true, status: 'ready', host: 'app.example.com', hasUsername: true }];

      const second = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });
      expect(second.content[0].text).toContain('**Status:** ready');
      expect(postCalls.filter(call => call.url.endsWith('/secret-request'))).toHaveLength(2);
      expect(postCalls.filter(call => call.url.endsWith('/secret-request')).every(call => call.body.host === 'app.example.com')).toBe(true);
    }, 15000);

    it('returns bad_mode with the chmod for the user when the key file mode is wrong, without waiting', async () => {
      requestResponse = { success: true, status: 'pending', host: 'app.example.com', hasUsername: true, patterns: ['*.example.com'], created: false };
      statuses = [{ success: true, status: 'bad_mode', host: 'app.example.com', hasUsername: true, patterns: ['*.example.com'], fix: "chmod 600 '/home/me/.tabzchrome/keys/example'", keyMode: '644', value: LEAKED_VALUE }];

      const start = Date.now();
      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });
      expect(Date.now() - start).toBeLessThan(2000);

      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('**Status:** bad_mode');
      expect(text).toContain("chmod 600 '/home/me/.tabzchrome/keys/example'");
      expect(text).toContain('Ask the user to run this');
      expect(text).toContain('Do not run it yourself');
      expect(text).toContain('"status":"bad_mode"');
      expect(text).not.toContain(LEAKED_VALUE);
      expect(postCalls.some(call => call.url.endsWith('/notification/clear'))).toBe(true);
    });

    it('returns bad_mode at once when the request itself reports it', async () => {
      requestResponse = { success: true, status: 'bad_mode', host: 'app.example.com', hasUsername: true, fix: "chmod 600 '/tmp/k'", created: false };
      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });
      expect(result.content[0].text).toContain("**Fix (user runs it):** `chmod 600 '/tmp/k'`");
      expect(postCalls.some(call => call.url.endsWith('/secret-status'))).toBe(false);
    });

    it('errors when the backend refuses the request', async () => {
      requestResponse = { success: false, error: 'host must be a hostname such as app.example.com' };

      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('host must be a hostname');
    });

    it('errors when the backend stops answering mid-wait', async () => {
      statuses = [
        { success: false, error: 'connect ECONNREFUSED' },
        { success: false, error: 'connect ECONNREFUSED' },
        { success: false, error: 'connect ECONNREFUSED' }
      ];

      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('stopped answering');
      expect(postCalls.some(call => call.url.endsWith('/notification/clear'))).toBe(true);
    });

    it('clears the notification after an unexpected status payload', async () => {
      statuses = [undefined as unknown as Record<string, unknown>];
      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });
      expect(result.isError).toBe(true);
      expect(postCalls.some(call => call.url.endsWith('/notification/clear'))).toBe(true);
    });

    it('returns deferred at once when an editor holds the config open: no notification, no polling', async () => {
      requestResponse = {
        success: true, status: 'pending', host: 'new.example.com', hasUsername: false, patterns: [], created: false, configEditDeferred: true,
        message: 'No Host block exists for new.example.com yet and a credential editor is open on the config; ask the user to finish and close that editor, then call again.',
        value: LEAKED_VALUE
      };
      statuses = [{ success: true, status: 'pending', host: 'new.example.com', hasUsername: false }];

      const start = Date.now();
      const result = await registered.get('tabz_secret_request')!.handler({ host: 'new.example.com', timeoutMs: 5000 });
      expect(Date.now() - start).toBeLessThan(1000);

      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('**Status:** deferred');
      expect(text).toContain('finish and close that editor');
      expect(text).toContain('Do not poll');
      expect(text).toContain('{"status":"deferred","host":"new.example.com","hasUsername":false,"patterns":[]}');
      expect(text).not.toContain(LEAKED_VALUE);
      expect(postCalls.some(call => call.url.endsWith('/notification/show'))).toBe(false);
      expect(postCalls.some(call => call.url.endsWith('/secret-status'))).toBe(false);
      expect(registered.get('tabz_secret_request')!.description).toContain('status deferred');
    });

    it('rejects URLs and out-of-range timeouts in the schema', () => {
      const schema = registered.get('tabz_secret_request')!.schema as {
        host: { safeParse: (v: unknown) => { success: boolean } };
        timeoutMs: { safeParse: (v: unknown) => { success: boolean } };
      };
      expect(schema.host.safeParse('https://app.example.com/login').success).toBe(false);
      expect(schema.host.safeParse('app.example.com').success).toBe(true);
      expect(schema.timeoutMs.safeParse(1000).success).toBe(false);
      expect(schema.timeoutMs.safeParse(45000).success).toBe(true);
    });
  });

  describe('tabz_secret_status', () => {
    it('reads the status without spawning an editor or waiting', async () => {
      statuses = [{ success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: ['*.example.com'], value: LEAKED_VALUE }];

      const start = Date.now();
      const result = await registered.get('tabz_secret_status')!.handler({ host: 'APP.EXAMPLE.COM:8443' });
      expect(Date.now() - start).toBeLessThan(1000);

      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('**Status:** pending');
      expect(text).toContain('**Patterns:** *.example.com');
      expect(text).toContain('{"status":"pending","host":"app.example.com","hasUsername":false,"patterns":["*.example.com"],"fields":[],"secretFiles":[]}');
      expect(text).not.toContain(LEAKED_VALUE);

      // The whole point of this tool: it can never stack credential editors.
      expect(postCalls.some(call => call.url.endsWith('/secret-request'))).toBe(false);
      expect(postCalls.some(call => call.url.endsWith('/notification/show'))).toBe(false);
      const status = postCalls.filter(call => call.url.endsWith('/secret-status'));
      expect(status).toHaveLength(1);
      expect(status[0].body).toEqual({ host: 'app.example.com' });
    });

    it('renders related saved patterns for a pending hostname without leaking backend extras', async () => {
      statuses = [{
        success: true,
        status: 'pending',
        host: 'portal.example.net',
        hasUsername: false,
        patterns: [],
        nearMiss: ['app.example.com'],
        value: LEAKED_VALUE
      }];

      const result = await registered.get('tabz_secret_status')!.handler({ host: 'portal.example.net' });
      const text = result.content[0].text;

      expect(result.isError).toBe(false);
      expect(text).toContain('**Near-miss patterns:** app.example.com');
      expect(text).toContain('No saved login matches portal.example.net. A block exists for app.example.com; ask the user to re-save it for this host on the Logins page (tabz_secret_request).');
      expect(text).toContain('{"status":"pending","host":"portal.example.net","hasUsername":false,"patterns":[],"fields":[],"secretFiles":[],"nearMiss":["app.example.com"]}');
      expect(text).not.toContain(LEAKED_VALUE);
    });

    it('reports ready with the fill next step, and bad_mode with the chmod', async () => {
      statuses = [{ success: true, status: 'ready', host: 'app.example.com', hasUsername: true, patterns: [], nearMiss: ['stale.example.com'] }];
      let result = await registered.get('tabz_secret_status')!.handler({ host: 'app.example.com' });
      expect(result.content[0].text).toContain('**Status:** ready');
      expect(result.content[0].text).toContain('tabz_fill_secret');
      expect(result.content[0].text).not.toContain('stale.example.com');

      statuses = [{ success: true, status: 'bad_mode', host: 'app.example.com', hasUsername: false, patterns: [], nearMiss: ['stale.example.com'], fix: "chmod 600 '/tmp/k'" }];
      result = await registered.get('tabz_secret_status')!.handler({ host: 'app.example.com' });
      expect(result.content[0].text).toContain('**Status:** bad_mode');
      expect(result.content[0].text).toContain("chmod 600 '/tmp/k'");
      expect(result.content[0].text).toContain('Do not run it yourself');
      expect(result.content[0].text).not.toContain('stale.example.com');
    });

    it('errors when the backend is unreachable, and takes no timeout argument', async () => {
      statuses = [{ success: false, error: 'connect ECONNREFUSED' }];
      const result = await registered.get('tabz_secret_status')!.handler({ host: 'app.example.com' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('connect ECONNREFUSED');

      const schema = registered.get('tabz_secret_status')!.schema as Record<string, unknown>;
      expect(Object.keys(schema)).toEqual(['host']);
    });
  });

  describe('tabz_fill_secret', () => {
    it('reports verified metadata and explains the persistent document boundary', async () => {
      const result = await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password', tabId: 42 });

      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('**Field:** password');
      expect(text).toContain('**Verified:** yes');
      expect(text).toContain('**Host:** app.example.com');
      expect(text).toContain('**Username saved:** yes');
      expect(text).toContain('{"filled":true,"verified":true,"protected":true,"field":"password","host":"app.example.com","hasUsername":true}');
      expect(text).not.toContain(LEAKED_VALUE);
      expect(text).not.toContain('actualValue');
      expect(text).not.toContain('actualLength');
      expect(text).not.toContain('count');
      expect(text).toContain('same-document SPA changes');
      expect(text).toContain('fresh document navigation');

      const fill = postCalls.find(call => call.url.endsWith('/fill-secret'));
      expect(fill?.body).toEqual({ selector: '#password', field: 'password', tabId: 42, host: undefined, trusted: false });
    });

    it('accepts trusted and carries it to the backend', async () => {
      const tool = registered.get('tabz_fill_secret')!;
      const schema = tool.schema as { trusted: { description?: string; safeParse: (v: unknown) => { success: boolean } } };
      expect(schema.trusted.safeParse(true).success).toBe(true);
      expect(schema.trusted.description).toContain('whole tab until it closes');

      const result = await tool.handler({ selector: '#password', field: 'password', trusted: true });
      const fill = postCalls.find(call => call.url.endsWith('/fill-secret'));
      expect(fill?.body).toMatchObject({ trusted: true });
      expect(result.content[0].text).toContain('whole tab until it closes');
      expect(result.content[0].text).toContain('fresh navigation stays blocked');
      expect(result.content[0].text).toContain('"trusted":true');
    });

    it('mentions normalized when the backend stripped whitespace, and points at the chmod on a mode refusal', async () => {
      fillResponse = { status: 200, data: { filled: true, verified: true, protected: true, host: 'app.example.com', hasUsername: true, field: 'password', normalized: true } };
      let result = await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password' });
      expect(result.content[0].text).toContain('surrounding whitespace');
      expect(result.content[0].text).toContain('"normalized":true');

      fillResponse = { status: 409, data: { filled: false, error: "Refusing key file /tmp/k: mode is 644, expected 600. Run: chmod 600 '/tmp/k'" } };
      result = await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Ask the user to run the chmod 600 command');
    });

    it('refuses a backend success that lacks a verified verdict', async () => {
      fillResponse = { status: 200, data: { filled: true, verified: false, host: 'app.example.com', hasUsername: true, actualValue: LEAKED_VALUE, actualLength: LEAKED_VALUE.length, count: 1, error: LEAKED_VALUE } };

      const result = await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Fill Secret Refused');
      expect(result.content[0].text).toContain('**Verified:** no');
      expect(result.content[0].text).toContain('was not verified');
      expect(result.content[0].text).toContain('Partial typing may have occurred');
      expect(result.content[0].text).toContain('filled=false is not proof');
      expect(result.content[0].text).toContain('Do not automatically retry or replay');
      expect(result.content[0].text).not.toContain(LEAKED_VALUE);
      expect(result.content[0].text).not.toContain('actualLength');
      expect(result.content[0].text).not.toContain('count');
    });

    it('refuses a verified fill unless persistent document protection is confirmed', async () => {
      fillResponse = { status: 200, data: {
        filled: true, verified: true, protected: false, host: 'app.example.com',
        hasUsername: true, field: 'password', value: LEAKED_VALUE
      } };

      const result = await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('did not confirm document protection');
      expect(result.content[0].text).not.toContain(LEAKED_VALUE);
    });

    it('does not request a saved value when the backend/extension protection marker is missing', async () => {
      vi.mocked(axios.get).mockResolvedValue({ data: { tabId: 42 } });

      const result = await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('document protection is unavailable');
      expect(result.content[0].text).toContain('reload the TabzChrome extension');
      expect(postCalls.some(call => call.url.endsWith('/fill-secret'))).toBe(false);
    });

    it('strips a :port from the disambiguating host', async () => {
      await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password', host: 'APP.EXAMPLE.COM:8443' });
      const fill = postCalls.find(call => call.url.endsWith('/fill-secret'));
      expect(fill?.body.host).toBe('app.example.com');
    });

    it('turns a refusal into an error naming the reason and the fix', async () => {
      fillResponse = { status: 409, data: { filled: false, error: 'No saved login for evil.example.com. Ask the user to add one with tabz_secret_request.', value: LEAKED_VALUE } };

      const result = await registered.get('tabz_fill_secret')!.handler({ selector: '#password', field: 'password' });

      expect(result.isError).toBe(true);
      const text = result.content[0].text;
      expect(text).toContain('Fill Secret Refused');
      expect(text).toContain('No saved login for evil.example.com');
      expect(text).toContain('Call tabz_secret_request');
      expect(text).not.toContain(LEAKED_VALUE);
    });

    it('points at the form when the extension refuses the target', async () => {
      fillResponse = { status: 409, data: { filled: false, host: 'app.example.com', hasUsername: true, error: 'Refused: a saved password only goes into an input of type="password"' } };

      const result = await registered.get('tabz_fill_secret')!.handler({ selector: '#search', field: 'password' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('type="password"');
      expect(result.content[0].text).toContain('tabz_get_dom_tree');
    });

    it('accepts username, password, or a saved field name, never a path-shaped field', () => {
      const schema = registered.get('tabz_fill_secret')!.schema as { field: { safeParse: (v: unknown) => { success: boolean } } };
      expect(schema.field.safeParse('../keys').success).toBe(false);
      expect(schema.field.safeParse('bad name').success).toBe(false);
      expect(schema.field.safeParse('username').success).toBe(true);
      expect(schema.field.safeParse('org_id').success).toBe(true);
    });

    it('reports a picked <select> option for a named Field and never the value', async () => {
      fillResponse = { status: 200, data: { filled: true, verified: true, protected: true, host: 'app.example.com', hasUsername: true, field: 'login_type', kind: 'field', selected: true, value: LEAKED_VALUE } };
      const result = await registered.get('tabz_fill_secret')!.handler({ selector: '#login_type', field: 'login_type' });
      expect(result.isError).toBe(false);
      const text = result.content[0].text;
      expect(text).toContain('**Field:** login_type (field)');
      expect(text).toContain('**Selected:**');
      expect(text).toContain('"kind":"field","selected":true');
      expect(text).not.toContain(LEAKED_VALUE);
    });

    it('explains an unknown field and a select with no matching option', async () => {
      fillResponse = { status: 400, data: { filled: false, error: 'The app.example.com entry has no field "cvv" (it has: username, password, org_id).' } };
      let result = await registered.get('tabz_fill_secret')!.handler({ selector: '#x', field: 'cvv' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Use one of the names listed');

      fillResponse = { status: 409, data: { filled: false, error: 'Refused: no option in the <select> (3 options) matches the saved value by value or label' } };
      result = await registered.get('tabz_fill_secret')!.handler({ selector: '#x', field: 'login_type' });
      expect(result.content[0].text).toContain('check the saved field on the Logins page');
    });
  });

  describe('surfaces and field names (ogl-18x)', () => {
    it('passes surface through, points the notification at the Logins page, and lists saved field names', async () => {
      requestResponse = { success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: [], fields: [], secretFiles: [], surface: 'page', loginsUrl: 'chrome-extension://abc/dashboard/index.html#/logins?host=app.example.com' };
      statuses = [
        { success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: [], fields: [], secretFiles: [] },
        { success: true, status: 'ready', host: 'app.example.com', hasUsername: true, patterns: ['app.example.com'], fields: ['org_id', 'login_type'], secretFiles: ['api_token'], value: LEAKED_VALUE }
      ];

      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', surface: 'page', timeoutMs: 5000 });
      const text = result.content[0].text;
      expect(text).toContain('**Status:** ready');
      expect(text).toContain('**Fields:** username, password, org_id, login_type, api_token');
      expect(text).toContain('**Surface:** page (chrome-extension://abc/dashboard/index.html#/logins?host=app.example.com)');
      expect(text).toContain('field="org_id", field="login_type", field="api_token"');
      expect(text).toContain('"fields":["org_id","login_type"],"secretFiles":["api_token"],"surface":"page","loginsUrl":"chrome-extension://abc/dashboard/index.html#/logins?host=app.example.com"');
      expect(text).not.toContain(LEAKED_VALUE);

      const request = postCalls.find(call => call.url.endsWith('/secret-request'));
      expect(request?.body).toMatchObject({ host: 'app.example.com', surface: 'page' });
      const show = postCalls.find(call => call.url.endsWith('/notification/show'));
      expect(String(show?.body.message)).toContain('Logins page');
      expect(String(show?.body.message)).toContain('#/logins?host=app.example.com');
    });

    it('describes the terminal prompt when the backend fell back to it', async () => {
      requestResponse = { success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: ['app.example.com'], fields: [], secretFiles: [], surface: 'terminal', terminalId: 'ctt-1' };
      statuses = [{ success: true, status: 'pending', host: 'app.example.com', hasUsername: false, patterns: ['app.example.com'] }];

      const result = await registered.get('tabz_secret_request')!.handler({ host: 'app.example.com', timeoutMs: 5000 });
      const text = result.content[0].text;
      expect(text).toContain('**Surface:** terminal');
      expect(text).toContain('guided prompt is open in a TabzChrome terminal');
      const show = postCalls.find(call => call.url.endsWith('/notification/show'));
      expect(String(show?.body.message)).toContain('Answer the prompts in the TabzChrome terminal');
      const request = postCalls.find(call => call.url.endsWith('/secret-request'));
      expect(request?.body.surface).toBeUndefined();
    });

    it('tabz_secret_status lists the field names', async () => {
      statuses = [{ success: true, status: 'ready', host: 'app.example.com', hasUsername: true, patterns: ['app.example.com'], fields: ['org_id'], secretFiles: [] }];
      const result = await registered.get('tabz_secret_status')!.handler({ host: 'app.example.com' });
      const text = result.content[0].text;
      expect(text).toContain('**Fields:** username, password, org_id');
      expect(text).toContain('"fields":["org_id"],"secretFiles":[]');
    });
  });
});
