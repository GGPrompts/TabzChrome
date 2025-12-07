/**
 * Tests for client.ts - Core browser interaction functions
 *
 * These tests mock puppeteer-core and axios to test the client logic
 * without needing a real browser or backend.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing client
vi.mock('puppeteer-core', () => ({
  default: {
    connect: vi.fn()
  }
}));

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  },
  AxiosError: class AxiosError extends Error {
    code?: string;
    config?: { baseURL?: string };
    response?: { status: number; statusText: string; data?: { error?: string } };
    constructor(message: string) {
      super(message);
    }
  }
}));

// Import mocked modules
import axios from 'axios';
import puppeteer from 'puppeteer-core';

// Track the cached browser for cleanup
let cachedBrowser: any = null;

describe('Client - Console Logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should fetch console logs from backend', async () => {
    const mockLogs = {
      logs: [
        { level: 'log', message: 'Test log', timestamp: Date.now(), url: 'http://test.com', tabId: 1 }
      ],
      total: 1
    };

    vi.mocked(axios.get).mockResolvedValue({ data: mockLogs });

    const { getConsoleLogs } = await import('../src/client.js');
    const result = await getConsoleLogs('http://localhost:8129', { limit: 100 });

    expect(result).toEqual(mockLogs);
    expect(axios.get).toHaveBeenCalledWith(
      'http://localhost:8129/api/browser/console-logs',
      expect.objectContaining({
        params: expect.objectContaining({ limit: 100 })
      })
    );
  });

  it('should handle backend connection errors', async () => {
    const { AxiosError } = await import('axios');
    const error = new AxiosError('Connection refused');
    error.code = 'ECONNREFUSED';

    vi.mocked(axios.get).mockRejectedValue(error);

    const { getConsoleLogs } = await import('../src/client.js');

    await expect(getConsoleLogs('http://localhost:8129', {}))
      .rejects
      .toThrow('Cannot connect to backend');
  });

  it('should filter by log level', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: { logs: [], total: 0 } });

    const { getConsoleLogs } = await import('../src/client.js');
    await getConsoleLogs('http://localhost:8129', { level: 'error' });

    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        params: expect.objectContaining({ level: 'error' })
      })
    );
  });

  it('should handle timeout errors', async () => {
    const { AxiosError } = await import('axios');
    const error = new AxiosError('Timeout');
    error.code = 'ETIMEDOUT';

    vi.mocked(axios.get).mockRejectedValue(error);

    const { getConsoleLogs } = await import('../src/client.js');

    await expect(getConsoleLogs('http://localhost:8129', {}))
      .rejects
      .toThrow('timed out');
  });

  it('should handle HTTP errors', async () => {
    const { AxiosError } = await import('axios');
    const error = new AxiosError('Not Found');
    error.response = { status: 404, statusText: 'Not Found' };

    vi.mocked(axios.get).mockRejectedValue(error);

    const { getConsoleLogs } = await import('../src/client.js');

    await expect(getConsoleLogs('http://localhost:8129', {}))
      .rejects
      .toThrow('404');
  });
});

describe('Client - CDP Connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should return null when CDP connection fails', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));

    const { getCdpBrowser } = await import('../src/client.js');
    const browser = await getCdpBrowser();

    expect(browser).toBeNull();
  });

  it('should connect when Chrome debugging port is available', async () => {
    const mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue([])
    };

    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc123' }
    });

    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser as any);

    const { getCdpBrowser } = await import('../src/client.js');
    const browser = await getCdpBrowser();

    expect(browser).toBe(mockBrowser);
    expect(puppeteer.connect).toHaveBeenCalledWith({
      browserWSEndpoint: 'ws://localhost:9222/devtools/browser/abc123',
      defaultViewport: null
    });
  });
});

describe('Client - Execute Script', () => {
  let mockPage: any;
  let mockBrowser: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockPage = {
      url: vi.fn().mockReturnValue('http://test.com'),
      evaluate: vi.fn(),
      title: vi.fn().mockResolvedValue('Test Page')
    };

    mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue([mockPage])
    };
  });

  it('should execute script via CDP when available', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);
    mockPage.evaluate.mockResolvedValue('Hello World');

    const { executeScript } = await import('../src/client.js');
    const result = await executeScript('http://localhost:8129', { code: 'document.title' });

    expect(result.success).toBe(true);
    expect(result.result).toBe('Hello World');
  });

  it('should fall back to backend when CDP unavailable', async () => {
    // All CDP attempts fail
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(axios.post).mockResolvedValue({
      data: { success: true, result: 'Backend result' }
    });

    const { executeScript } = await import('../src/client.js');
    const result = await executeScript('http://localhost:8129', { code: 'test' });

    expect(result.success).toBe(true);
    expect(result.result).toBe('Backend result');
  });

  it('should handle script execution errors', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);
    mockPage.evaluate.mockRejectedValue(new Error('Script error: undefined is not a function'));

    const { executeScript } = await import('../src/client.js');
    const result = await executeScript('http://localhost:8129', { code: 'bad.code()' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Script error');
  });
});

describe('Client - Page Info', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('should get page info via CDP', async () => {
    const mockPage = {
      url: vi.fn().mockReturnValue('http://test.com/page'),
      title: vi.fn().mockResolvedValue('Test Page Title')
    };

    const mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue([mockPage])
    };

    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser as any);

    const { getPageInfo } = await import('../src/client.js');
    const result = await getPageInfo('http://localhost:8129');

    expect(result.url).toBe('http://test.com/page');
    expect(result.title).toBe('Test Page Title');
  });

  it('should skip chrome:// pages when finding active page', async () => {
    const chromePage = {
      url: vi.fn().mockReturnValue('chrome://extensions'),
      title: vi.fn().mockResolvedValue('Extensions')
    };
    const normalPage = {
      url: vi.fn().mockReturnValue('http://test.com'),
      title: vi.fn().mockResolvedValue('Test')
    };

    const mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue([chromePage, normalPage])
    };

    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser as any);

    const { getPageInfo } = await import('../src/client.js');
    const result = await getPageInfo('http://localhost:8129');

    expect(result.url).toBe('http://test.com');
  });
});

describe('Client - Tab Management', () => {
  let mockBrowser: any;
  let mockPages: any[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockPages = [
      { url: vi.fn().mockReturnValue('chrome://extensions'), title: vi.fn().mockResolvedValue('Extensions'), bringToFront: vi.fn() },
      { url: vi.fn().mockReturnValue('http://google.com'), title: vi.fn().mockResolvedValue('Google'), bringToFront: vi.fn() },
      { url: vi.fn().mockReturnValue('http://github.com'), title: vi.fn().mockResolvedValue('GitHub'), bringToFront: vi.fn() }
    ];

    mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue(mockPages)
    };
  });

  it('should list non-chrome tabs', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);

    const { listTabs } = await import('../src/client.js');
    const result = await listTabs();

    expect(result.tabs).toHaveLength(2); // Excludes chrome:// page
    expect(result.tabs[0].url).toBe('http://google.com');
    expect(result.tabs[1].url).toBe('http://github.com');
  });

  it('should switch to valid tab', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);

    const { switchTab } = await import('../src/client.js');
    const result = await switchTab(1);

    expect(result.success).toBe(true);
  });

  it('should reject invalid tab ID', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);

    const { switchTab } = await import('../src/client.js');
    const result = await switchTab(99);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid tab ID');
  });

  it('should return error when CDP unavailable for list tabs', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));

    const { listTabs } = await import('../src/client.js');
    const result = await listTabs();

    expect(result.tabs).toHaveLength(0);
    expect(result.error).toContain('CDP not available');
  });
});

describe('Client - DOM Interaction', () => {
  let mockPage: any;
  let mockBrowser: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockPage = {
      url: vi.fn().mockReturnValue('http://test.com'),
      waitForSelector: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      evaluate: vi.fn(),
      $: vi.fn()
    };

    mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue([mockPage])
    };
  });

  it('should click element successfully', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);
    mockPage.waitForSelector.mockResolvedValue(true);
    mockPage.click.mockResolvedValue(undefined);

    const { clickElement } = await import('../src/client.js');
    const result = await clickElement('button#submit');

    expect(result.success).toBe(true);
    expect(mockPage.waitForSelector).toHaveBeenCalledWith('button#submit', { timeout: 5000 });
    expect(mockPage.click).toHaveBeenCalledWith('button#submit');
  });

  it('should handle element not found for click', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);
    mockPage.waitForSelector.mockRejectedValue(new Error('Timeout waiting for selector'));

    const { clickElement } = await import('../src/client.js');
    const result = await clickElement('button#nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Timeout');
  });

  it('should fill input successfully', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);
    mockPage.waitForSelector.mockResolvedValue(true);
    mockPage.evaluate.mockResolvedValue(undefined);
    mockPage.type.mockResolvedValue(undefined);

    const { fillInput } = await import('../src/client.js');
    const result = await fillInput('input#email', 'test@example.com');

    expect(result.success).toBe(true);
    expect(mockPage.type).toHaveBeenCalledWith('input#email', 'test@example.com');
  });

  it('should return error when CDP unavailable for click', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));

    const { clickElement } = await import('../src/client.js');
    const result = await clickElement('button#submit');

    expect(result.success).toBe(false);
    expect(result.error).toContain('CDP not available');
  });
});

describe('Client - Screenshot', () => {
  let mockPage: any;
  let mockBrowser: any;
  let mockElement: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockElement = {
      screenshot: vi.fn().mockResolvedValue(undefined)
    };

    mockPage = {
      url: vi.fn().mockReturnValue('http://test.com'),
      screenshot: vi.fn().mockResolvedValue(undefined),
      $: vi.fn().mockResolvedValue(mockElement)
    };

    mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue([mockPage])
    };
  });

  it('should take viewport screenshot', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);

    const { takeScreenshot } = await import('../src/client.js');
    const result = await takeScreenshot({});

    expect(result.success).toBe(true);
    expect(result.filePath).toMatch(/screenshot-.*\.png$/);
    expect(mockPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ fullPage: false })
    );
  });

  it('should take full page screenshot', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);

    const { takeScreenshot } = await import('../src/client.js');
    const result = await takeScreenshot({ fullPage: true });

    expect(result.success).toBe(true);
    expect(mockPage.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ fullPage: true })
    );
  });

  it('should screenshot specific element', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);

    const { takeScreenshot } = await import('../src/client.js');
    const result = await takeScreenshot({ selector: '#main-content' });

    expect(result.success).toBe(true);
    expect(mockPage.$).toHaveBeenCalledWith('#main-content');
    expect(mockElement.screenshot).toHaveBeenCalled();
  });

  it('should handle element not found for screenshot', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);
    mockPage.$.mockResolvedValue(null);

    const { takeScreenshot } = await import('../src/client.js');
    const result = await takeScreenshot({ selector: '#nonexistent' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Element not found');
  });

  it('should fail gracefully when CDP unavailable', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));

    const { takeScreenshot } = await import('../src/client.js');
    const result = await takeScreenshot({});

    expect(result.success).toBe(false);
    expect(result.error).toContain('CDP not available');
  });
});

describe('Client - Element Info', () => {
  let mockPage: any;
  let mockBrowser: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    mockPage = {
      url: vi.fn().mockReturnValue('http://test.com'),
      evaluate: vi.fn()
    };

    mockBrowser = {
      connected: true,
      pages: vi.fn().mockResolvedValue([mockPage])
    };
  });

  it('should get element info successfully', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);

    mockPage.evaluate.mockResolvedValue({
      found: true,
      html: '<span>Content</span>',
      outerHTML: '<div class="card"><span>Content</span></div>',
      innerText: 'Content',
      tagName: 'div',
      attributes: { class: 'card' },
      bounds: { x: 100, y: 200, width: 300, height: 150, top: 200, right: 400, bottom: 350, left: 100 },
      styles: { display: 'flex', padding: '16px' },
      parentSelector: 'body',
      childCount: 1
    });

    const { getElementInfo } = await import('../src/client.js');
    const result = await getElementInfo('.card');

    expect(result.success).toBe(true);
    expect(result.tagName).toBe('div');
    expect(result.attributes).toEqual({ class: 'card' });
    expect(result.bounds?.width).toBe(300);
    expect(result.styles?.display).toBe('flex');
  });

  it('should handle element not found', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { webSocketDebuggerUrl: 'ws://localhost:9222/devtools/browser/abc' }
    });
    vi.mocked(puppeteer.connect).mockResolvedValue(mockBrowser);
    mockPage.evaluate.mockResolvedValue({ found: false });

    const { getElementInfo } = await import('../src/client.js');
    const result = await getElementInfo('.nonexistent');

    expect(result.success).toBe(false);
    expect(result.error).toContain('Element not found');
  });

  it('should return CDP unavailable error when no connection', async () => {
    vi.mocked(axios.get).mockRejectedValue(new Error('ECONNREFUSED'));

    const { getElementInfo } = await import('../src/client.js');
    const result = await getElementInfo('.card');

    expect(result.success).toBe(false);
    expect(result.error).toContain('CDP not available');
  });
});
