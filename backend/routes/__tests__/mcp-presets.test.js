import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fsPromises = require('fs').promises;
const apiRouter = require('../api.js');
const {
  deriveBuiltInMcpPresets,
  mergeMcpPresets,
  readMcpToolCatalog
} = require('../../modules/mcp-presets.js');

function routeHandler(path, method) {
  const layer = apiRouter.stack.find(candidate => candidate.route?.path === path && candidate.route.methods[method]);
  if (!layer) throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  return layer.route.stack[0].handle;
}

function invoke(handler, req = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
        return this;
      }
    };
    handler(req, res, reject);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('built-in MCP presets', () => {
  it('derives built-ins from the generated canonical catalog', () => {
    const catalog = readMcpToolCatalog();
    const presets = deriveBuiltInMcpPresets(catalog);

    expect(Object.keys(presets)).toEqual(expect.arrayContaining(['page-agent', 'browser-qa', 'chrome-ops', 'tabz-ops']));
    expect(presets['page-agent'].tools.every(id => catalog.some(tool => tool.id === id))).toBe(true);
    expect(Object.values(presets).every(preset => preset.builtIn && preset.readOnly)).toBe(true);
  });

  it('surfaces custom presets that collide with built-in slugs', () => {
    const custom = {
      'page-agent': { name: 'Old Page Agent', tools: ['tabz_list_tabs'] },
      'page-agent-custom': { name: 'Existing Alias', tools: ['tabz_fill'] }
    };
    const { presets, shadowed } = mergeMcpPresets(custom);

    expect(shadowed).toEqual(['page-agent']);
    expect(presets['page-agent'].builtIn).toBe(true);
    expect(presets['page-agent-custom-2'].shadowedBuiltIn).toBe('page-agent');
    expect(presets['page-agent-custom'].name).toBe('Existing Alias');
  });

  it('ignores a malformed custom-preset file shape', () => {
    expect(mergeMcpPresets(null).presets['page-agent'].builtIn).toBe(true);
    expect(mergeMcpPresets([]).shadowed).toEqual([]);
  });
});

describe('MCP preset routes', () => {
  it('returns built-ins when no custom preset file exists', async () => {
    vi.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const response = await invoke(routeHandler('/mcp-presets', 'get'));

    expect(response.statusCode).toBe(200);
    expect(response.body.presets['page-agent'].readOnly).toBe(true);
  });

  it('refuses overwrite and deletion of a built-in', async () => {
    vi.spyOn(fsPromises, 'readFile').mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));

    const create = await invoke(routeHandler('/mcp-presets', 'post'), {
      body: { name: 'Page Agent', tools: ['tabz_list_tabs'] }
    });
    const remove = await invoke(routeHandler('/mcp-presets/:slug', 'delete'), {
      params: { slug: 'page-agent' }
    });

    expect(create.statusCode).toBe(409);
    expect(remove.statusCode).toBe(409);
  });

  it('deletes a shadowed custom preset through its displayed alias', async () => {
    vi.spyOn(fsPromises, 'readFile').mockResolvedValueOnce(JSON.stringify({
      'page-agent': { name: 'Old Page Agent', tools: ['tabz_list_tabs'] }
    }));
    const writeFile = vi.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined);

    const response = await invoke(routeHandler('/mcp-presets/:slug', 'delete'), {
      params: { slug: 'page-agent-custom' }
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(writeFile.mock.calls[0][1])).toEqual({});
  });

  it('does not guess a collision alias that was never displayed', async () => {
    vi.spyOn(fsPromises, 'readFile').mockResolvedValueOnce(JSON.stringify({
      'page-agent': { name: 'Old Page Agent', tools: ['tabz_list_tabs'] }
    }));
    const writeFile = vi.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined);

    const response = await invoke(routeHandler('/mcp-presets/:slug', 'delete'), {
      params: { slug: 'page-agent-custom-99' }
    });

    expect(response.statusCode).toBe(404);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('rejects a name that cannot produce a preset slug', async () => {
    vi.spyOn(fsPromises, 'readFile').mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    const response = await invoke(routeHandler('/mcp-presets', 'post'), {
      body: { name: '---', tools: ['tabz_list_tabs'] }
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects empty and unknown custom tool lists', async () => {
    const handler = routeHandler('/mcp-presets', 'post');
    const empty = await invoke(handler, { body: { name: 'Empty', tools: [] } });
    const unknown = await invoke(handler, { body: { name: 'Unknown', tools: ['not-a-tabz-tool'] } });

    expect(empty.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
  });
});
