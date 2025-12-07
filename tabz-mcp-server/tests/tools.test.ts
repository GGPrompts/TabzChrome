/**
 * Tests for MCP Tools - Tool registration and input validation
 *
 * These tests verify that tools are properly registered and handle inputs correctly.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Mock the client module
vi.mock('../src/client.js', () => ({
  getConsoleLogs: vi.fn(),
  executeScript: vi.fn(),
  getPageInfo: vi.fn(),
  takeScreenshot: vi.fn(),
  downloadImage: vi.fn(),
  listTabs: vi.fn(),
  switchTab: vi.fn(),
  clickElement: vi.fn(),
  fillInput: vi.fn(),
  getElementInfo: vi.fn(),
  getCdpBrowser: vi.fn()
}));

import * as client from '../src/client.js';
import { registerConsoleTools } from '../src/tools/console.js';
import { registerScriptTools } from '../src/tools/script.js';
import { registerPageTools } from '../src/tools/page.js';
import { registerScreenshotTools } from '../src/tools/screenshot.js';
import { registerTabTools } from '../src/tools/tabs.js';
import { registerInteractionTools } from '../src/tools/interaction.js';
import { registerInspectionTools } from '../src/tools/inspection.js';

describe('Console Tools', () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: Function; schema: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();

    // Create a mock MCP server that captures tool registrations
    server = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.set(name, { handler, schema });
      })
    } as unknown as McpServer;

    registerConsoleTools(server, 'http://localhost:8129');
  });

  it('should register browser_get_console_logs tool', () => {
    expect(server.tool).toHaveBeenCalled();
    expect(registeredTools.has('browser_get_console_logs')).toBe(true);
  });

  it('should return formatted markdown by default', async () => {
    vi.mocked(client.getConsoleLogs).mockResolvedValue({
      logs: [
        { level: 'error', message: 'Test error', timestamp: Date.now(), url: 'http://test.com', tabId: 1 }
      ],
      total: 1
    });

    const tool = registeredTools.get('browser_get_console_logs')!;
    const result = await tool.handler({ level: 'all', limit: 100 });

    expect(result.content[0].text).toContain('# Console Logs');
    expect(result.content[0].text).toContain('Errors');
    expect(result.content[0].text).toContain('Test error');
  });

  it('should return JSON when requested', async () => {
    vi.mocked(client.getConsoleLogs).mockResolvedValue({
      logs: [{ level: 'log', message: 'Test', timestamp: Date.now(), url: 'http://test.com', tabId: 1 }],
      total: 1
    });

    const tool = registeredTools.get('browser_get_console_logs')!;
    const result = await tool.handler({ level: 'all', limit: 100, response_format: 'json' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.logs).toHaveLength(1);
  });

  it('should handle errors gracefully', async () => {
    vi.mocked(client.getConsoleLogs).mockRejectedValue(new Error('Connection refused'));

    const tool = registeredTools.get('browser_get_console_logs')!;
    const result = await tool.handler({ level: 'all', limit: 100 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Connection refused');
  });

  it('should show helpful message when no logs', async () => {
    vi.mocked(client.getConsoleLogs).mockResolvedValue({ logs: [], total: 0 });

    const tool = registeredTools.get('browser_get_console_logs')!;
    const result = await tool.handler({ level: 'all', limit: 100 });

    expect(result.content[0].text).toContain('No console logs captured');
    expect(result.content[0].text).toContain('Make sure');
  });
});

describe('Script Tools', () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: Function; schema: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();

    server = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.set(name, { handler, schema });
      })
    } as unknown as McpServer;

    registerScriptTools(server, 'http://localhost:8129');
  });

  it('should register browser_execute_script tool', () => {
    expect(registeredTools.has('browser_execute_script')).toBe(true);
  });

  it('should execute script and return formatted result', async () => {
    vi.mocked(client.executeScript).mockResolvedValue({
      success: true,
      result: 'Hello World'
    });

    const tool = registeredTools.get('browser_execute_script')!;
    const result = await tool.handler({ code: 'document.title' });

    expect(result.content[0].text).toContain('Script Executed Successfully');
    expect(result.content[0].text).toContain('Hello World');
    expect(result.isError).toBeFalsy();
  });

  it('should handle script errors', async () => {
    vi.mocked(client.executeScript).mockResolvedValue({
      success: false,
      error: 'ReferenceError: undefined is not defined'
    });

    const tool = registeredTools.get('browser_execute_script')!;
    const result = await tool.handler({ code: 'badCode()' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Script Execution Failed');
    expect(result.content[0].text).toContain('ReferenceError');
  });

  it('should format object results as JSON', async () => {
    vi.mocked(client.executeScript).mockResolvedValue({
      success: true,
      result: { foo: 'bar', count: 42 }
    });

    const tool = registeredTools.get('browser_execute_script')!;
    const result = await tool.handler({ code: '({foo: "bar", count: 42})' });

    expect(result.content[0].text).toContain('"foo": "bar"');
    expect(result.content[0].text).toContain('"count": 42');
  });
});

describe('Page Tools', () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: Function; schema: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();

    server = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.set(name, { handler, schema });
      })
    } as unknown as McpServer;

    registerPageTools(server, 'http://localhost:8129');
  });

  it('should register browser_get_page_info tool', () => {
    expect(registeredTools.has('browser_get_page_info')).toBe(true);
  });

  it('should return page info in markdown format', async () => {
    vi.mocked(client.getPageInfo).mockResolvedValue({
      url: 'https://github.com',
      title: 'GitHub',
      tabId: 123
    });

    const tool = registeredTools.get('browser_get_page_info')!;
    const result = await tool.handler({});

    expect(result.content[0].text).toContain('# Current Page');
    expect(result.content[0].text).toContain('GitHub');
    expect(result.content[0].text).toContain('https://github.com');
  });

  it('should return page info in JSON format', async () => {
    vi.mocked(client.getPageInfo).mockResolvedValue({
      url: 'https://github.com',
      title: 'GitHub',
      tabId: 123
    });

    const tool = registeredTools.get('browser_get_page_info')!;
    const result = await tool.handler({ response_format: 'json' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.url).toBe('https://github.com');
    expect(parsed.title).toBe('GitHub');
  });
});

describe('Screenshot Tools', () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: Function; schema: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();

    server = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.set(name, { handler, schema });
      })
    } as unknown as McpServer;

    registerScreenshotTools(server);
  });

  it('should register screenshot tools', () => {
    expect(registeredTools.has('browser_screenshot')).toBe(true);
    expect(registeredTools.has('browser_download_image')).toBe(true);
  });

  it('should return file path on successful screenshot', async () => {
    vi.mocked(client.takeScreenshot).mockResolvedValue({
      success: true,
      filePath: '/home/user/ai-images/screenshot-2024.png'
    });

    const tool = registeredTools.get('browser_screenshot')!;
    const result = await tool.handler({});

    expect(result.content[0].text).toContain('Screenshot Captured');
    expect(result.content[0].text).toContain('/home/user/ai-images/screenshot-2024.png');
    expect(result.content[0].text).toContain('Read tool');
  });

  it('should handle screenshot failure', async () => {
    vi.mocked(client.takeScreenshot).mockResolvedValue({
      success: false,
      error: 'CDP not available'
    });

    const tool = registeredTools.get('browser_screenshot')!;
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Screenshot Failed');
    expect(result.content[0].text).toContain('CDP not available');
  });

  it('should download image by URL', async () => {
    vi.mocked(client.downloadImage).mockResolvedValue({
      success: true,
      filePath: '/home/user/ai-images/image-2024.jpg'
    });

    const tool = registeredTools.get('browser_download_image')!;
    const result = await tool.handler({ url: 'https://example.com/image.jpg' });

    expect(result.content[0].text).toContain('Image Downloaded');
    expect(result.content[0].text).toContain('/home/user/ai-images/image-2024.jpg');
  });
});

describe('Tab Tools', () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: Function; schema: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();

    server = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.set(name, { handler, schema });
      })
    } as unknown as McpServer;

    registerTabTools(server);
  });

  it('should register tab tools', () => {
    expect(registeredTools.has('browser_list_tabs')).toBe(true);
    expect(registeredTools.has('browser_switch_tab')).toBe(true);
  });

  it('should list tabs in markdown format', async () => {
    vi.mocked(client.listTabs).mockResolvedValue({
      tabs: [
        { tabId: 0, url: 'https://google.com', title: 'Google', active: true },
        { tabId: 1, url: 'https://github.com', title: 'GitHub', active: false }
      ]
    });

    const tool = registeredTools.get('browser_list_tabs')!;
    const result = await tool.handler({});

    expect(result.content[0].text).toContain('# Browser Tabs');
    expect(result.content[0].text).toContain('Google');
    expect(result.content[0].text).toContain('GitHub');
    expect(result.content[0].text).toContain('(active)');
  });

  it('should handle no tabs open', async () => {
    vi.mocked(client.listTabs).mockResolvedValue({ tabs: [] });

    const tool = registeredTools.get('browser_list_tabs')!;
    const result = await tool.handler({});

    expect(result.content[0].text).toContain('No web pages currently open');
  });

  it('should switch tab successfully', async () => {
    vi.mocked(client.switchTab).mockResolvedValue({ success: true });

    const tool = registeredTools.get('browser_switch_tab')!;
    const result = await tool.handler({ tabId: 1 });

    expect(result.content[0].text).toContain('Tab Switched');
    expect(result.content[0].text).toContain('tab 1');
  });

  it('should handle invalid tab ID', async () => {
    vi.mocked(client.switchTab).mockResolvedValue({
      success: false,
      error: 'Invalid tab ID: 99'
    });

    const tool = registeredTools.get('browser_switch_tab')!;
    const result = await tool.handler({ tabId: 99 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Tab Switch Failed');
  });
});

describe('Interaction Tools', () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: Function; schema: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();

    server = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.set(name, { handler, schema });
      })
    } as unknown as McpServer;

    registerInteractionTools(server);
  });

  it('should register interaction tools', () => {
    expect(registeredTools.has('browser_click')).toBe(true);
    expect(registeredTools.has('browser_fill')).toBe(true);
  });

  it('should click element successfully', async () => {
    vi.mocked(client.clickElement).mockResolvedValue({ success: true });

    const tool = registeredTools.get('browser_click')!;
    const result = await tool.handler({ selector: 'button#submit' });

    expect(result.content[0].text).toContain('Click Successful');
    expect(result.content[0].text).toContain('button#submit');
  });

  it('should handle click failure', async () => {
    vi.mocked(client.clickElement).mockResolvedValue({
      success: false,
      error: 'Timeout waiting for selector'
    });

    const tool = registeredTools.get('browser_click')!;
    const result = await tool.handler({ selector: 'button#nonexistent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Click Failed');
    expect(result.content[0].text).toContain('Timeout');
  });

  it('should fill input successfully', async () => {
    vi.mocked(client.fillInput).mockResolvedValue({ success: true });

    const tool = registeredTools.get('browser_fill')!;
    const result = await tool.handler({ selector: 'input#email', value: 'test@example.com' });

    expect(result.content[0].text).toContain('Fill Successful');
    expect(result.content[0].text).toContain('test@example.com');
  });

  it('should truncate long values in display', async () => {
    vi.mocked(client.fillInput).mockResolvedValue({ success: true });

    const longValue = 'a'.repeat(100);
    const tool = registeredTools.get('browser_fill')!;
    const result = await tool.handler({ selector: 'textarea', value: longValue });

    expect(result.content[0].text).toContain('...');
    expect(result.content[0].text).not.toContain(longValue);
  });
});

describe('Inspection Tools', () => {
  let server: McpServer;
  let registeredTools: Map<string, { handler: Function; schema: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredTools = new Map();

    server = {
      tool: vi.fn((name: string, description: string, schema: any, handler: Function) => {
        registeredTools.set(name, { handler, schema });
      })
    } as unknown as McpServer;

    registerInspectionTools(server);
  });

  it('should register browser_get_element tool', () => {
    expect(registeredTools.has('browser_get_element')).toBe(true);
  });

  it('should return element info in markdown format', async () => {
    vi.mocked(client.getElementInfo).mockResolvedValue({
      success: true,
      tagName: 'div',
      attributes: { class: 'card', id: 'main-card' },
      bounds: { x: 100, y: 200, width: 300, height: 150, top: 200, right: 400, bottom: 350, left: 100 },
      styles: { display: 'flex', padding: '16px', backgroundColor: '#ffffff' },
      outerHTML: '<div class="card" id="main-card">Content</div>',
      innerText: 'Content',
      parentSelector: 'body',
      childCount: 3
    });

    const tool = registeredTools.get('browser_get_element')!;
    const result = await tool.handler({ selector: '.card' });

    expect(result.content[0].text).toContain('Element: `.card`');
    expect(result.content[0].text).toContain('300px × 150px');
    expect(result.content[0].text).toContain('display: flex');
    expect(result.content[0].text).toContain('class="card"');
  });

  it('should return element info in JSON format', async () => {
    vi.mocked(client.getElementInfo).mockResolvedValue({
      success: true,
      tagName: 'button',
      attributes: { type: 'submit' },
      bounds: { x: 0, y: 0, width: 100, height: 40, top: 0, right: 100, bottom: 40, left: 0 },
      styles: {},
      childCount: 1
    });

    const tool = registeredTools.get('browser_get_element')!;
    const result = await tool.handler({ selector: 'button', response_format: 'json' });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tagName).toBe('button');
    expect(parsed.success).toBe(true);
  });

  it('should handle element not found', async () => {
    vi.mocked(client.getElementInfo).mockResolvedValue({
      success: false,
      error: 'Element not found: .nonexistent'
    });

    const tool = registeredTools.get('browser_get_element')!;
    const result = await tool.handler({ selector: '.nonexistent' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Element Not Found');
    expect(result.content[0].text).toContain('.nonexistent');
  });
});

describe('All Tools Registration', () => {
  it('should register all 10 tools', () => {
    const registeredTools: string[] = [];

    const server = {
      tool: vi.fn((name: string) => {
        registeredTools.push(name);
      })
    } as unknown as McpServer;

    registerConsoleTools(server, 'http://localhost:8129');
    registerScriptTools(server, 'http://localhost:8129');
    registerPageTools(server, 'http://localhost:8129');
    registerScreenshotTools(server);
    registerTabTools(server);
    registerInteractionTools(server);
    registerInspectionTools(server);

    expect(registeredTools).toHaveLength(10);
    expect(registeredTools).toContain('browser_get_console_logs');
    expect(registeredTools).toContain('browser_execute_script');
    expect(registeredTools).toContain('browser_get_page_info');
    expect(registeredTools).toContain('browser_screenshot');
    expect(registeredTools).toContain('browser_download_image');
    expect(registeredTools).toContain('browser_list_tabs');
    expect(registeredTools).toContain('browser_switch_tab');
    expect(registeredTools).toContain('browser_click');
    expect(registeredTools).toContain('browser_fill');
    expect(registeredTools).toContain('browser_get_element');
  });
});
