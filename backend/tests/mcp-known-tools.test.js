import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fsPromises = require('fs').promises;
const apiRouter = require('../routes/api.js');
const {
  LEGACY_MCP_TOOL_IDS,
  mergeKnownTools
} = require('../modules/mcp-known-tools.js');
const { readMcpToolCatalog } = require('../modules/mcp-presets.js');

const CATALOG_IDS = readMcpToolCatalog().map(tool => tool.id);

let server;
let port;
let savedFile;
let writes;

function request(method, route, body) {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: `/api${route}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload === undefined ? {} : { 'Content-Length': Buffer.byteLength(payload) })
      }
    }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }));
    });
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

beforeEach(async () => {
  savedFile = null;
  writes = [];
  vi.spyOn(fsPromises, 'readFile').mockImplementation(async () => {
    if (savedFile === null) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return JSON.stringify(savedFile);
  });
  vi.spyOn(fsPromises, 'writeFile').mockImplementation(async (_path, data) => {
    savedFile = JSON.parse(data);
    writes.push(savedFile);
  });

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise(resolve => server.close(resolve));
});

describe('mergeKnownTools', () => {
  it('preserves legacy disables while discovering catalog additions', () => {
    const enabledTools = ['tabz_list_tabs', 'tabz_open_url'];
    const catalogIds = [...LEGACY_MCP_TOOL_IDS, 'tabz_close_tab', 'tabz_docs'];
    const merged = mergeKnownTools({ enabledTools, catalogIds });

    expect(merged.legacy).toBe(true);
    expect(merged.discovered).toEqual(['tabz_close_tab', 'tabz_docs']);
    expect(merged.enabledTools).toEqual([...enabledTools, 'tabz_close_tab', 'tabz_docs']);
    expect(merged.enabledTools).not.toContain('tabz_fill');
    expect(merged.knownTools).toEqual(catalogIds);
  });

  it('never re-enables an explicitly disabled known tool', () => {
    const merged = mergeKnownTools({
      enabledTools: ['tabz_list_tabs'],
      knownTools: ['tabz_list_tabs', 'tabz_fill'],
      catalogIds: ['tabz_list_tabs', 'tabz_fill', 'tabz_docs']
    });

    expect(merged.enabledTools).toEqual(['tabz_list_tabs', 'tabz_docs']);
    expect(merged.enabledTools).not.toContain('tabz_fill');
    expect(merged.newTools).toEqual(['tabz_docs']);
  });

  it('drops retired ids but prunes nothing when the catalog is unavailable', () => {
    const retired = mergeKnownTools({
      enabledTools: ['tabz_list_tabs', 'retired-tool'],
      knownTools: ['tabz_list_tabs', 'retired-tool'],
      catalogIds: ['tabz_list_tabs']
    });
    expect(retired.retired).toEqual(['retired-tool']);
    expect(retired.enabledTools).toEqual(['tabz_list_tabs']);

    const unavailable = mergeKnownTools({
      enabledTools: ['tabz_list_tabs', 'retired-tool'],
      knownTools: ['tabz_list_tabs', 'retired-tool'],
      catalogIds: []
    });
    expect(unavailable.retired).toEqual([]);
    expect(unavailable.enabledTools).toEqual(['tabz_list_tabs', 'retired-tool']);
  });
});

describe('MCP config routes', () => {
  it('uses compact defaults on a fresh install without writing a config', async () => {
    const response = await request('GET', '/mcp-config');

    expect(response.status).toBe(200);
    expect(response.json.enabledTools.length).toBeLessThan(CATALOG_IDS.length);
    expect(response.json.knownTools).toEqual(CATALOG_IDS);
    expect(response.json.newTools).toEqual([]);
    expect(writes).toHaveLength(0);
  });

  it('upgrades an actual legacy config without re-enabling its disabled tools', async () => {
    savedFile = {
      enabledTools: ['tabz_list_tabs', 'tabz_open_url'],
      allowAllUrls: true,
      customDomains: 'example.test'
    };

    const response = await request('GET', '/mcp-config');

    expect(response.status).toBe(200);
    expect(response.json.enabledTools).not.toContain('tabz_fill');
    expect(response.json.enabledTools).toEqual(expect.arrayContaining(['tabz_close_tab', 'tabz_docs']));
    expect(response.json.newTools).toEqual(expect.arrayContaining(['tabz_close_tab', 'tabz_docs']));
    expect(response.json.knownTools).toEqual(CATALOG_IDS);
    expect(response.json.allowAllUrls).toBe(true);
    expect(response.json.customDomains).toBe('example.test');
    // GET stays read-only so it cannot overwrite a concurrent explicit save.
    expect(writes).toHaveLength(0);
  });

  it('saves the catalog snapshot, keeps core tools and clears new markers', async () => {
    savedFile = { newTools: ['tabz_docs'], unrelated: 'preserved' };
    const response = await request('POST', '/mcp-config', {
      enabledTools: ['tabz_fill'],
      knownTools: ['older-tool', 42, null]
    });

    expect(response.status).toBe(200);
    expect(response.json.enabledTools).toEqual(expect.arrayContaining(['tabz_fill', 'tabz_docs']));
    expect(response.json.knownTools).toEqual(CATALOG_IDS);
    expect(response.json.knownTools).not.toContain('older-tool');
    expect(response.json.newTools).toEqual([]);
    expect(savedFile.unrelated).toBe('preserved');
  });
});
