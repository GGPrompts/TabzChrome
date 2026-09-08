/**
 * Guard the metadata actually published by tools/list.
 *
 * Clients account for MCP schemas differently. These character budgets are a
 * reproducible size guard, not a claim about a universal per-turn token cost.
 * Detailed guidance belongs in tabz_docs; compact metadata retains the safety
 * rule needed before a caller chooses a tool.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: vi.fn() } }
  },
  AxiosError: class MockAxiosError extends Error {}
}));

import { ALL_TOOL_IDS, createTabzServer } from '../src/server.js';
import { TOOL_DOCS } from '../src/tools/tool-docs.js';

interface PublishedTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

const DEFAULT_BUDGET = 1_000;

/** Larger schemas need explicit, reviewable exceptions. */
const BUDGETS: Record<string, number> = {
  tabz_act: 4_000,
  tabz_claude_group_status: 1_600,
  tabz_open_url: 1_600,
  // These entry points keep the complete protected-document boundary visible
  // before a caller hands control to a person or asks the backend to type.
  tabz_request_login: 1_800,
  tabz_fill_secret: 2_400,
  tabz_secret_request: 1_600,
  // The supported neural-voice enum is useful executable schema structure.
  tabz_speak: 1_200,
  tabz_notification_show: 1_400,
  // The SDK adds execution metadata to this filter-heavy schema.
  tabz_get_network_requests: 1_300
};

const PARAM_DESCRIPTION_LIMIT = 200;
const MIN_TEXT_ROOM = 150;

// Measured full97 post-pass array: 60,607 characters. Keep about 4% headroom,
// well below the 81,742-character pre-pass surface.
const FULL_SURFACE_BUDGET = 63_000;

function entryChars(tool: PublishedTool): number {
  return JSON.stringify(tool).length;
}

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripDescriptions);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key !== 'description') out[key] = stripDescriptions(nested);
    }
    return out;
  }
  return value;
}

function schemaDescriptions(
  value: unknown,
  path: string[] = [],
  found: Array<{ path: string; text: string }> = []
): Array<{ path: string; text: string }> {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => schemaDescriptions(nested, [...path, String(index)], found));
  } else if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'description' && typeof nested === 'string') {
        found.push({ path: [...path, key].join('.'), text: nested });
      } else {
        schemaDescriptions(nested, [...path, key], found);
      }
    }
  }
  return found;
}

let tools: PublishedTool[] = [];
let instructions = '';

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('synthetic config unavailable')));
  try {
    const { server } = await createTabzServer({
      preset: null,
      backendUrl: 'http://127.0.0.1:1/synthetic'
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'description-budget', version: '1.0.0' });
    try {
      await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    tools = (await client.listTools()).tools as unknown as PublishedTool[];
    instructions = client.getInstructions() ?? '';
    } finally {
      await Promise.allSettled([client.close(), server.close()]);
    }
  } finally {
    vi.unstubAllGlobals();
  }
});

describe('published tool metadata budget', () => {
  it('bounds initialize instructions separately from tool schemas', () => {
    expect(instructions.length).toBeGreaterThan(0);
    expect(instructions.length).toBeLessThanOrEqual(1_300);
  });
  it('covers every current registration without a fixed source-repository count', () => {
    expect(tools.map(tool => tool.name).sort()).toEqual([...ALL_TOOL_IDS].sort());
  });

  it('keeps the current structured-result contract free of published output schemas', () => {
    const names = tools.filter(tool => tool.outputSchema !== undefined).map(tool => tool.name);
    expect(names, `tools publishing outputSchema: ${names.join(', ')}`).toEqual([]);
  });

  it('keeps each complete published entry inside its budget', () => {
    const over = tools
      .map(tool => {
        const chars = entryChars(tool);
        const budget = BUDGETS[tool.name] ?? DEFAULT_BUDGET;
        return { name: tool.name, chars, budget, over: chars - budget };
      })
      .filter(row => row.over > 0)
      .sort((left, right) => right.over - left.over);

    const report = over
      .map(row => `${row.name}: ${row.chars} chars, budget ${row.budget}, over by ${row.over}`)
      .join('\n');
    expect(report, `tools over their full-entry budget:\n${report}`).toBe('');
  });

  it('keeps nested parameter descriptions concise and single-line', () => {
    const over: string[] = [];
    for (const tool of tools) {
      for (const item of schemaDescriptions(tool.inputSchema)) {
        const actionGuidance = tool.name === 'tabz_act' && item.path === 'properties.action.description';
        if (!actionGuidance && item.text.length > PARAM_DESCRIPTION_LIMIT) {
          over.push(`${tool.name}.${item.path}: ${item.text.length} chars`);
        }
        if (item.text.includes('\n')) over.push(`${tool.name}.${item.path}: contains a newline`);
      }
    }
    expect(over, `parameter descriptions over budget:\n${over.join('\n')}`).toEqual([]);
  });

  it('leaves room for useful prose instead of filling budgets with schema structure', () => {
    const cramped = tools
      .map(tool => ({
        name: tool.name,
        structure: JSON.stringify(stripDescriptions(tool)).length,
        budget: BUDGETS[tool.name] ?? DEFAULT_BUDGET
      }))
      .filter(row => row.structure + MIN_TEXT_ROOM > row.budget)
      .map(row => `${row.name}: ${row.structure} structural chars, budget ${row.budget}`);
    expect(cramped, `tool schemas without prose room:\n${cramped.join('\n')}`).toEqual([]);
  });

  it('keeps detailed bundled documentation for every registered tool and pointer', () => {
    const undocumented = ALL_TOOL_IDS.filter(name => !TOOL_DOCS[name]?.trim());
    expect(undocumented, `registered tools missing tabz_docs entries: ${undocumented.join(', ')}`).toEqual([]);

    const badPointers: string[] = [];
    for (const tool of tools) {
      for (const match of tool.description?.matchAll(/See tabz_docs\("([^"]+)"\)\./g) ?? []) {
        if (!TOOL_DOCS[match[1]]) badPointers.push(`${tool.name} -> ${match[1]}`);
      }
    }
    expect(badPointers, `invalid tabz_docs pointers: ${badPointers.join(', ')}`).toEqual([]);
  });

  it('steers the retained legacy page mutations to tabz_act', () => {
    for (const name of ['tabz_click', 'tabz_screenshot', 'tabz_screenshot_full']) {
      const tool = tools.find(candidate => candidate.name === name);
      expect(tool?.description, `${name} compact guidance`).toMatch(/^LEGACY: prefer tabz_act/);
    }
  });

  it('keeps the ownership boundary visible on compact discovery tools', () => {
    for (const name of ['tabz_list_tabs', 'tabz_open_url', 'tabz_claude_group_status', 'tabz_docs']) {
      const tool = tools.find(candidate => candidate.name === name);
      expect(tool?.description, `${name} ownership guidance`).toContain('outside');
    }
  });

  it('keeps the complete tools/list array below the measured full-surface cap', () => {
    const chars = JSON.stringify(tools).length;
    expect(chars, `published full surface is ${chars} chars`).toBeLessThan(FULL_SURFACE_BUDGET);
  });
});
