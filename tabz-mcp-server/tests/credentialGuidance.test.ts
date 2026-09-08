/**
 * The never-ask-for-credentials rule must appear in every copy a host can see:
 * the initialize instructions (stdio hosts) and the tool descriptions and docs
 * of tabz_fill, tabz_open_url, tabz_docs, and tabz_request_login (stateless
 * Streamable HTTP hosts only read tools/list). The old secret123 example that
 * taught the wrong move must stay gone.
 */

import { describe, it, expect, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } }
  },
  AxiosError: class MockAxiosError extends Error {}
}));

import { CREDENTIAL_GUIDANCE, PROTECTED_LOGIN_DOCUMENT_GUIDANCE } from '../src/shared.js';
import { SERVER_INSTRUCTIONS, TABZ_DOCS_DESCRIPTION } from '../src/server.js';
import { TOOL_DOCS } from '../src/tools/tool-docs.js';
import { registerInteractionTools } from '../src/tools/interaction.js';
import { registerOmniboxTools } from '../src/tools/omnibox.js';
import { registerLoginTools } from '../src/tools/login.js';
import { registerSecretTools } from '../src/tools/secrets.js';

const NEVER_ASK = 'Never ask the user for a password, one-time code, token, or card number, in chat or through a form.';
const CALL_LOGIN = 'On a login page call tabz_request_login and wait; the user signs in in their own browser.';
const SAVED_LOGIN = 'For a saved login use tabz_fill_secret; to add one use tabz_secret_request.';
const NEVER_READ_STORE = 'Never read, list, or edit ~/.tabzchrome';

function collectDescriptions(register: (server: McpServer) => void): Map<string, string> {
  const descriptions = new Map<string, string>();
  const server = {
    registerTool: vi.fn((name: string, config: { description: string }) => {
      descriptions.set(name, config.description);
    })
  } as unknown as McpServer;
  register(server);
  return descriptions;
}

describe('credential guidance', () => {
  it('is one sentence triple, spelled the same everywhere', () => {
    expect(CREDENTIAL_GUIDANCE).toBe(`${NEVER_ASK} ${CALL_LOGIN} ${SAVED_LOGIN}`);
  });

  it('rides the server instructions for stdio hosts, with the store rule', () => {
    expect(SERVER_INSTRUCTIONS).toContain(NEVER_ASK);
    expect(SERVER_INSTRUCTIONS).toContain(CALL_LOGIN);
    expect(SERVER_INSTRUCTIONS).toContain(SAVED_LOGIN);
    expect(SERVER_INSTRUCTIONS).toContain(NEVER_READ_STORE);
  });

  it('is in the tool descriptions stateless hosts read via tools/list', () => {
    const interaction = collectDescriptions(server => registerInteractionTools(server));
    const navigation = collectDescriptions(server => registerOmniboxTools(server));
    const login = collectDescriptions(server => registerLoginTools(server));

    expect(interaction.get('tabz_fill')).toContain(NEVER_ASK);
    expect(navigation.get('tabz_open_url')).toContain(NEVER_ASK);
    expect(login.get('tabz_request_login')).toContain(NEVER_ASK);
    expect(TABZ_DOCS_DESCRIPTION).toContain(NEVER_ASK);

    const secrets = collectDescriptions(server => registerSecretTools(server));
    for (const name of ['tabz_secret_request', 'tabz_secret_status', 'tabz_fill_secret']) {
      expect(secrets.get(name), name).toContain(NEVER_ASK);
      expect(secrets.get(name), name).toContain(SAVED_LOGIN);
      expect(secrets.get(name), name).toContain(NEVER_READ_STORE);
    }
  });

  it('is in the tabz_docs entries for the same tools', () => {
    for (const name of ['tabz_fill', 'tabz_open_url', 'tabz_docs', 'tabz_request_login', 'tabz_secret_request', 'tabz_secret_status', 'tabz_fill_secret']) {
      expect(TOOL_DOCS[name], name).toContain(NEVER_ASK);
      expect(TOOL_DOCS[name], name).toContain(CALL_LOGIN);
      expect(TOOL_DOCS[name], name).toContain(SAVED_LOGIN);
    }
    for (const name of ['tabz_secret_request', 'tabz_secret_status', 'tabz_fill_secret']) {
      expect(TOOL_DOCS[name], name).toContain(NEVER_READ_STORE);
    }
  });

  it('no longer teaches filling a password with an example secret', () => {
    const allDocs = Object.values(TOOL_DOCS).join('\n');
    expect(allDocs).not.toContain('secret123');
    expect(TOOL_DOCS.tabz_fill).not.toMatch(/Fill password: selector=/);
    expect(TOOL_DOCS.tabz_fill).toContain('call tabz_request_login instead');
  });

  it('documents the persistent document boundary for both credential-entry paths', () => {
    const login = collectDescriptions(server => registerLoginTools(server));
    const secrets = collectDescriptions(server => registerSecretTools(server));
    expect(login.get('tabz_request_login')).toContain(PROTECTED_LOGIN_DOCUMENT_GUIDANCE);
    expect(secrets.get('tabz_fill_secret')).toContain(PROTECTED_LOGIN_DOCUMENT_GUIDANCE);
    expect(TOOL_DOCS.tabz_request_login).toContain('same-document login flow');
    expect(TOOL_DOCS.tabz_request_login).toContain('SSO redirects');
    expect(TOOL_DOCS.tabz_fill_secret).toContain('same-document/SPA changes');
    expect(TOOL_DOCS.tabz_fill_secret).toContain('fresh document navigation');
    expect(TOOL_DOCS.tabz_fill_secret).toContain('whole tab until it closes');
    expect(PROTECTED_LOGIN_DOCUMENT_GUIDANCE).toContain('across every MCP connection and browser agent');
    expect(PROTECTED_LOGIN_DOCUMENT_GUIDANCE).toContain('prepublished element reference');
    expect(PROTECTED_LOGIN_DOCUMENT_GUIDANCE).toContain('ask the user to submit or navigate');
    expect(PROTECTED_LOGIN_DOCUMENT_GUIDANCE).toContain('Arbitrary selector clicks are refused');
    expect(PROTECTED_LOGIN_DOCUMENT_GUIDANCE).not.toContain('Click or navigate');
  });
});
