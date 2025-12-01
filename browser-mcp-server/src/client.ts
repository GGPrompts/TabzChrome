/**
 * HTTP Client for Backend Communication
 *
 * Communicates with TabzChrome backend to access browser data
 * Also supports direct CDP (Chrome DevTools Protocol) for CSP-bypassing script execution
 */

import axios, { AxiosError } from "axios";
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";
import os from "os";
import type { ConsoleLogsResponse, ScriptResult, PageInfo, ConsoleLogLevel } from "./types.js";

// Screenshot cleanup configuration
const SCREENSHOT_MAX_AGE_HOURS = 24;
const SCREENSHOT_MAX_FILES = 50;

/**
 * Clean up old screenshots from ai-images directory
 * - Deletes files older than SCREENSHOT_MAX_AGE_HOURS
 * - Keeps only SCREENSHOT_MAX_FILES most recent files
 */
async function cleanupScreenshots(): Promise<void> {
  try {
    const screenshotDir = path.join(os.homedir(), 'ai-images');

    if (!fs.existsSync(screenshotDir)) {
      return;
    }

    const files = fs.readdirSync(screenshotDir)
      .filter(f => f.startsWith('screenshot-') || f.startsWith('image-'))
      .map(f => ({
        name: f,
        path: path.join(screenshotDir, f),
        mtime: fs.statSync(path.join(screenshotDir, f)).mtime.getTime()
      }))
      .sort((a, b) => b.mtime - a.mtime); // Newest first

    const now = Date.now();
    const maxAge = SCREENSHOT_MAX_AGE_HOURS * 60 * 60 * 1000;
    let deletedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const age = now - file.mtime;

      // Delete if older than max age OR beyond max file count
      if (age > maxAge || i >= SCREENSHOT_MAX_FILES) {
        try {
          fs.unlinkSync(file.path);
          deletedCount++;
        } catch {
          // Ignore deletion errors (file in use, etc.)
        }
      }
    }

    if (deletedCount > 0) {
      console.error(`[browser-mcp] Cleaned up ${deletedCount} old screenshot(s)`);
    }
  } catch {
    // Ignore cleanup errors - non-critical
  }
}

// CDP connection cache
let cdpBrowser: Awaited<ReturnType<typeof puppeteer.connect>> | null = null;

/**
 * Resolve hostname to IP address (needed because Chrome DevTools rejects non-IP Host headers)
 */
async function resolveHostToIp(hostname: string): Promise<string | null> {
  try {
    const dns = await import('dns');
    return new Promise((resolve) => {
      dns.lookup(hostname, (err, address) => {
        if (err) resolve(null);
        else resolve(address);
      });
    });
  } catch {
    return null;
  }
}

/**
 * Try to connect to Chrome via CDP (requires Chrome started with --remote-debugging-port=9222)
 * Tries multiple connection methods for WSL2 compatibility
 */
async function getCdpBrowser(): Promise<typeof cdpBrowser> {
  if (cdpBrowser && cdpBrowser.connected) {
    return cdpBrowser;
  }

  try {
    let wsEndpoint: string | null = null;

    // Build list of hosts to try (localhost first for Windows, then 127.0.0.1, then WSL2 host)
    const hostsToTry: string[] = ['localhost', '127.0.0.1'];

    // Resolve host.docker.internal for WSL2 -> Windows
    const dockerHostIp = await resolveHostToIp('host.docker.internal');
    if (dockerHostIp && dockerHostIp !== '127.0.0.1') {
      hostsToTry.push(dockerHostIp);
    }

    // Try each host
    for (const host of hostsToTry) {
      try {
        console.error(`[CDP] Trying ${host}:9222...`);
        const response = await axios.get(`http://${host}:9222/json/version`, { timeout: 3000 });
        wsEndpoint = response.data.webSocketDebuggerUrl;
        console.error(`[CDP] Found Chrome at ${host}:9222, wsEndpoint: ${wsEndpoint}`);
        break;
      } catch (err) {
        console.error(`[CDP] Failed to connect to ${host}:9222:`, err instanceof Error ? err.message : err);
        // Try next host
      }
    }

    // If direct connection failed, try via PowerShell (WSL2 -> Windows localhost)
    if (!wsEndpoint) {
      try {
        const { execSync } = await import('child_process');
        const result = execSync(
          `powershell.exe -Command "(Invoke-WebRequest 'http://localhost:9222/json/version' -UseBasicParsing | ConvertFrom-Json).webSocketDebuggerUrl"`,
          { timeout: 5000, encoding: 'utf8' }
        );
        wsEndpoint = result.trim().replace(/\r\n/g, '');
        // PowerShell returns localhost URL, but we need to connect via Windows IP from WSL2
        if (wsEndpoint && dockerHostIp && wsEndpoint.includes('localhost')) {
          wsEndpoint = wsEndpoint.replace('localhost', dockerHostIp);
        }
        console.error('[CDP] Got endpoint via PowerShell:', wsEndpoint);
      } catch {
        // PowerShell not available or Chrome debugging not enabled
      }
    }

    if (wsEndpoint) {
      cdpBrowser = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        defaultViewport: null  // Don't resize browser windows
      });
      console.error('[CDP] Connected to Chrome via DevTools Protocol');
      return cdpBrowser;
    }
  } catch (err) {
    console.error('[CDP] Connection failed:', err instanceof Error ? err.message : err);
    // CDP not available, will fall back to extension method
  }
  return null;
}

/**
 * Get filtered non-chrome pages from CDP browser
 */
async function getNonChromePages(): Promise<import('puppeteer-core').Page[] | null> {
  const browser = await getCdpBrowser();
  if (!browser) return null;

  const pages = await browser.pages();
  return pages.filter(p =>
    !p.url().startsWith('chrome://') && !p.url().startsWith('chrome-extension://')
  );
}

/**
 * Get a specific page by tabId (index in non-chrome pages array)
 */
async function getPageByTabId(tabId?: number): Promise<import('puppeteer-core').Page | null> {
  const pages = await getNonChromePages();
  if (!pages || pages.length === 0) return null;

  // Tab IDs are 1-based for user clarity, convert to 0-based index
  if (tabId !== undefined && tabId >= 1 && tabId <= pages.length) {
    return pages[tabId - 1];
  }
  // Default to first page if no tabId specified
  return pages[0];
}

/**
 * Execute script via CDP (bypasses CSP)
 */
async function executeScriptViaCdp(code: string, tabId?: number): Promise<ScriptResult | null> {
  try {
    const page = await getPageByTabId(tabId);

    if (!page) {
      return { success: false, error: 'No active page found' };
    }

    const result = await page.evaluate((script) => {
      try {
        // eslint-disable-next-line no-eval
        return eval(script);
      } catch (e) {
        throw e;
      }
    }, code);

    return { success: true, result };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Get page info via CDP
 */
async function getPageInfoViaCdp(tabId?: number): Promise<PageInfo | null> {
  try {
    const page = await getPageByTabId(tabId);

    if (!page) {
      return { url: '', title: '', tabId: -1, error: 'No active page' };
    }

    // Find the index of this page in the non-chrome pages list
    const pages = await getNonChromePages();
    const pageIndex = pages?.findIndex(p => p === page) ?? -1;

    return {
      url: page.url(),
      title: await page.title(),
      tabId: pageIndex >= 0 ? pageIndex + 1 : -1 // 1-based for user clarity
    };
  } catch {
    return null;
  }
}

/**
 * Get console logs from the browser via backend
 */
export async function getConsoleLogs(
  backendUrl: string,
  options: {
    level?: ConsoleLogLevel | 'all';
    limit?: number;
    since?: number;
    tabId?: number;
  }
): Promise<ConsoleLogsResponse> {
  try {
    const response = await axios.get<ConsoleLogsResponse>(
      `${backendUrl}/api/browser/console-logs`,
      {
        params: {
          level: options.level,
          limit: options.limit,
          since: options.since,
          tabId: options.tabId
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get console logs");
  }
}

/**
 * Execute JavaScript in the browser via backend
 * Tries CDP first (bypasses CSP), falls back to extension method
 */
export async function executeScript(
  backendUrl: string,
  options: {
    code: string;
    tabId?: number;
    allFrames?: boolean;
  }
): Promise<ScriptResult> {
  // Try CDP first (bypasses CSP)
  const cdpResult = await executeScriptViaCdp(options.code, options.tabId);
  if (cdpResult !== null) {
    return cdpResult;
  }

  // Fall back to extension method
  try {
    const response = await axios.post<ScriptResult>(
      `${backendUrl}/api/browser/execute-script`,
      {
        code: options.code,
        tabId: options.tabId,
        allFrames: options.allFrames
      },
      { timeout: 30000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to execute script");
  }
}

/**
 * Get current page info from the browser via backend
 * Tries CDP first, falls back to extension method
 */
export async function getPageInfo(
  backendUrl: string,
  tabId?: number
): Promise<PageInfo> {
  // Try CDP first
  const cdpResult = await getPageInfoViaCdp(tabId);
  if (cdpResult !== null) {
    return cdpResult;
  }

  // Fall back to extension method
  try {
    const response = await axios.get<PageInfo>(
      `${backendUrl}/api/browser/page-info`,
      {
        params: { tabId },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get page info");
  }
}

/**
 * Handle API errors with helpful messages
 */
function handleApiError(error: unknown, context: string): Error {
  if (error instanceof AxiosError) {
    if (error.code === "ECONNREFUSED") {
      return new Error(
        `${context}: Cannot connect to backend at ${error.config?.baseURL || "unknown"}. ` +
        "Make sure the TabzChrome backend is running (cd backend && npm start)."
      );
    }
    if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      return new Error(
        `${context}: Request timed out. The browser may not be responding. ` +
        "Check if Chrome is open and the TabzChrome extension is installed."
      );
    }
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.response.statusText;
      return new Error(`${context}: ${status} - ${message}`);
    }
  }
  return new Error(`${context}: ${error instanceof Error ? error.message : String(error)}`);
}

// Re-export getCdpBrowser for use by other modules
export { getCdpBrowser };

/**
 * Screenshot result type
 */
export interface ScreenshotResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Take a screenshot via CDP
 */
export async function takeScreenshot(options: {
  selector?: string;
  fullPage?: boolean;
  outputPath?: string;
  tabId?: number;
}): Promise<ScreenshotResult> {
  try {
    const page = await getPageByTabId(options.tabId);

    if (!page) {
      return { success: false, error: 'No active page found. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    // Clean up old screenshots before taking new one
    await cleanupScreenshots();

    // Ensure output directory exists
    const defaultDir = path.join(os.homedir(), 'ai-images');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-${timestamp}.png`;
    const outputPath = options.outputPath || path.join(defaultDir, filename);

    // Ensure output directory exists for custom path
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    if (options.selector) {
      // Screenshot specific element
      const element = await page.$(options.selector);
      if (!element) {
        return { success: false, error: `Element not found: ${options.selector}` };
      }
      await element.screenshot({ path: outputPath });
    } else {
      // Full page or viewport screenshot
      await page.screenshot({
        path: outputPath,
        fullPage: options.fullPage ?? false
      });
    }

    return { success: true, filePath: outputPath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Download image result type
 */
export interface DownloadImageResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Download an image from the page via CDP
 */
export async function downloadImage(options: {
  selector?: string;
  url?: string;
  outputPath?: string;
  tabId?: number;
}): Promise<DownloadImageResult> {
  try {
    const page = await getPageByTabId(options.tabId);

    if (!page) {
      return { success: false, error: 'No active page found. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    let imageUrl = options.url;

    // If selector provided, extract the image URL from the element
    if (options.selector && !imageUrl) {
      const extractedUrl = await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        if (el.tagName === 'IMG') {
          return (el as HTMLImageElement).src;
        }
        // Check for background-image
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none') {
          const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
          return match ? match[1] : null;
        }
        return null;
      }, options.selector);

      if (!extractedUrl) {
        return { success: false, error: `Could not find image URL from selector: ${options.selector}` };
      }
      imageUrl = extractedUrl;
    }

    if (!imageUrl) {
      return { success: false, error: 'Either selector or url parameter is required' };
    }

    // Fetch the image
    const response = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const reader = new FileReader();
        return new Promise<string>((resolve, reject) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        throw e;
      }
    }, imageUrl);

    // Clean up old images before saving new one
    await cleanupScreenshots();

    // Save to file
    const defaultDir = path.join(os.homedir(), 'ai-images');
    if (!fs.existsSync(defaultDir)) {
      fs.mkdirSync(defaultDir, { recursive: true });
    }

    // Extract extension from URL or default to png
    const urlPath = new URL(imageUrl).pathname;
    const ext = path.extname(urlPath) || '.png';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `image-${timestamp}${ext}`;
    const outputPath = options.outputPath || path.join(defaultDir, filename);

    // Ensure output directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Convert data URL to buffer and save
    const base64Data = response.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(outputPath, buffer);

    return { success: true, filePath: outputPath };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Tab info type
 */
export interface TabInfo {
  tabId: number;
  url: string;
  title: string;
  customName?: string;  // User-assigned name (stored by URL)
  active: boolean;
}

/**
 * Storage for custom tab names (keyed by URL)
 * This is session-based - names persist while MCP server is running
 */
const customTabNames: Map<string, string> = new Map();

/**
 * Rename a tab (assign a custom name)
 * The name is stored by URL so it persists even if tab order changes
 */
export async function renameTab(tabId: number, name: string): Promise<{ success: boolean; error?: string }> {
  try {
    const pages = await getNonChromePages();
    if (!pages) {
      return { success: false, error: 'CDP not available. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    // Tab IDs are 1-based for user clarity
    if (tabId < 1 || tabId > pages.length) {
      return { success: false, error: `Invalid tab ID: ${tabId}. Available tabs: 1-${pages.length}` };
    }

    const url = pages[tabId - 1].url(); // Convert to 0-based index

    if (name.trim() === '') {
      // Empty name clears the custom name
      customTabNames.delete(url);
    } else {
      customTabNames.set(url, name.trim());
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * List all open browser tabs via CDP
 * Note: tabId is the index in the filtered (non-chrome) pages array.
 * Use this tabId with other functions like executeScript, clickElement, etc.
 */
export async function listTabs(): Promise<{ tabs: TabInfo[]; error?: string }> {
  try {
    const pages = await getNonChromePages();
    if (!pages) {
      return { tabs: [], error: 'CDP not available. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    const tabs: TabInfo[] = [];

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const url = page.url();
      const customName = customTabNames.get(url);

      tabs.push({
        tabId: i + 1, // 1-based for user clarity (Tab 1, Tab 2, etc.)
        url: url,
        title: await page.title(),
        customName: customName,
        active: false // CDP can't reliably detect active tab - removed misleading marker
      });
    }

    return { tabs };
  } catch (error) {
    return { tabs: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Switch to a specific tab via CDP
 */
export async function switchTab(tabId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const pages = await getNonChromePages();
    if (!pages) {
      return { success: false, error: 'CDP not available. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    // Tab IDs are 1-based for user clarity
    if (tabId < 1 || tabId > pages.length) {
      return { success: false, error: `Invalid tab ID: ${tabId}. Available tabs: 1-${pages.length}` };
    }

    await pages[tabId - 1].bringToFront(); // Convert to 0-based index
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Click an element via CDP
 */
export async function clickElement(selector: string, tabId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const page = await getPageByTabId(tabId);

    if (!page) {
      return { success: false, error: 'No active page found. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    // Wait for element and click
    await page.waitForSelector(selector, { timeout: 5000 });
    await page.click(selector);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Fill an input field via CDP
 */
export async function fillInput(selector: string, value: string, tabId?: number): Promise<{ success: boolean; error?: string }> {
  try {
    const page = await getPageByTabId(tabId);

    if (!page) {
      return { success: false, error: 'No active page found. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    // Wait for element, clear it, and type
    await page.waitForSelector(selector, { timeout: 5000 });

    // Clear existing value
    await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      if (el) el.value = '';
    }, selector);

    // Type new value
    await page.type(selector, value);

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Element info result type
 */
export interface ElementInfo {
  success: boolean;
  error?: string;
  html?: string;
  outerHTML?: string;
  innerText?: string;
  tagName?: string;
  attributes?: Record<string, string>;
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  styles?: Record<string, string>;
  parentSelector?: string;
  childCount?: number;
}

/**
 * Get detailed information about an element via CDP
 */
export async function getElementInfo(
  selector: string,
  options: {
    includeStyles?: boolean;
    styleProperties?: string[];
    tabId?: number;
  } = {}
): Promise<ElementInfo> {
  try {
    const page = await getPageByTabId(options.tabId);

    if (!page) {
      return { success: false, error: 'No active page found. Make sure Chrome is running with --remote-debugging-port=9222' };
    }

    // Default style properties to extract (most useful for recreation)
    const defaultStyleProps = [
      // Layout
      'display', 'position', 'top', 'right', 'bottom', 'left',
      'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
      'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
      'padding', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'boxSizing', 'overflow', 'overflowX', 'overflowY',
      // Flexbox
      'flexDirection', 'flexWrap', 'justifyContent', 'alignItems', 'alignContent',
      'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'gap',
      // Grid
      'gridTemplateColumns', 'gridTemplateRows', 'gridColumn', 'gridRow', 'gridGap',
      // Typography
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
      'textAlign', 'textDecoration', 'textTransform', 'letterSpacing', 'color',
      // Background
      'background', 'backgroundColor', 'backgroundImage', 'backgroundSize', 'backgroundPosition',
      // Border
      'border', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius',
      'borderTop', 'borderRight', 'borderBottom', 'borderLeft',
      // Effects
      'boxShadow', 'opacity', 'transform', 'transition', 'zIndex',
      'cursor', 'pointerEvents'
    ];

    const styleProps = options.styleProperties || defaultStyleProps;
    const includeStyles = options.includeStyles !== false; // Default true

    const result = await page.evaluate((sel: string, props: string[], getStyles: boolean) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };

      const rect = el.getBoundingClientRect();

      // Get all attributes
      const attributes: Record<string, string> = {};
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i];
        attributes[attr.name] = attr.value;
      }

      // Get computed styles
      let styles: Record<string, string> = {};
      if (getStyles) {
        const computed = window.getComputedStyle(el);
        for (const prop of props) {
          const value = computed.getPropertyValue(
            prop.replace(/([A-Z])/g, '-$1').toLowerCase()
          );
          if (value && value !== 'none' && value !== 'normal' && value !== 'auto' && value !== '0px' && value !== 'rgba(0, 0, 0, 0)') {
            styles[prop] = value;
          }
        }
      }

      // Try to build a parent selector for context
      let parentSelector = '';
      const parent = el.parentElement;
      if (parent) {
        if (parent.id) {
          parentSelector = `#${parent.id}`;
        } else if (parent.className) {
          parentSelector = `.${parent.className.split(' ')[0]}`;
        } else {
          parentSelector = parent.tagName.toLowerCase();
        }
      }

      return {
        found: true,
        html: el.innerHTML,
        outerHTML: el.outerHTML,
        innerText: (el as HTMLElement).innerText?.slice(0, 500), // Limit text
        tagName: el.tagName.toLowerCase(),
        attributes,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left)
        },
        styles,
        parentSelector,
        childCount: el.children.length
      };
    }, selector, styleProps, includeStyles);

    if (!result.found) {
      return { success: false, error: `Element not found: ${selector}` };
    }

    return {
      success: true,
      html: result.html,
      outerHTML: result.outerHTML,
      innerText: result.innerText,
      tagName: result.tagName,
      attributes: result.attributes,
      bounds: result.bounds,
      styles: result.styles,
      parentSelector: result.parentSelector,
      childCount: result.childCount
    };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
