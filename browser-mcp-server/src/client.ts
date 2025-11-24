/**
 * HTTP Client for Backend Communication
 *
 * Communicates with TabzChrome backend to access browser data
 * Also supports direct CDP (Chrome DevTools Protocol) for CSP-bypassing script execution
 */

import axios, { AxiosError } from "axios";
import puppeteer from "puppeteer-core";
import type { ConsoleLogsResponse, ScriptResult, PageInfo, ConsoleLogLevel } from "./types.js";

// CDP connection cache
let cdpBrowser: Awaited<ReturnType<typeof puppeteer.connect>> | null = null;

/**
 * Try to connect to Chrome via CDP (requires Chrome started with --remote-debugging-port=9222)
 * Uses PowerShell on WSL2 to access Windows Chrome debugging endpoint
 */
async function getCdpBrowser(): Promise<typeof cdpBrowser> {
  if (cdpBrowser && cdpBrowser.connected) {
    return cdpBrowser;
  }

  try {
    let wsEndpoint: string | null = null;

    // First try direct connection (works on native Linux/macOS or if port is forwarded)
    try {
      const response = await axios.get('http://127.0.0.1:9222/json/version', { timeout: 2000 });
      wsEndpoint = response.data.webSocketDebuggerUrl;
    } catch {
      // Try via PowerShell for WSL2 -> Windows Chrome
      try {
        const { execSync } = await import('child_process');
        const result = execSync(
          `powershell.exe -Command "(Invoke-WebRequest 'http://localhost:9222/json/version' -UseBasicParsing | ConvertFrom-Json).webSocketDebuggerUrl"`,
          { timeout: 5000, encoding: 'utf8' }
        );
        wsEndpoint = result.trim().replace(/\r\n/g, '');
      } catch {
        // PowerShell not available or Chrome debugging not enabled
      }
    }

    if (wsEndpoint) {
      cdpBrowser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
      console.error('[CDP] Connected to Chrome via DevTools Protocol');
      return cdpBrowser;
    }
  } catch {
    // CDP not available, will fall back to extension method
  }
  return null;
}

/**
 * Execute script via CDP (bypasses CSP)
 */
async function executeScriptViaCdp(code: string): Promise<ScriptResult | null> {
  try {
    const browser = await getCdpBrowser();
    if (!browser) return null;

    const pages = await browser.pages();
    const page = pages.find(p => !p.url().startsWith('chrome://')) || pages[0];

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
async function getPageInfoViaCdp(): Promise<PageInfo | null> {
  try {
    const browser = await getCdpBrowser();
    if (!browser) return null;

    const pages = await browser.pages();
    const page = pages.find(p => !p.url().startsWith('chrome://')) || pages[0];

    if (!page) {
      return { url: '', title: '', tabId: -1, error: 'No active page' };
    }

    return {
      url: page.url(),
      title: await page.title(),
      tabId: -1 // CDP doesn't have tab IDs
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
  const cdpResult = await executeScriptViaCdp(options.code);
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
  // Try CDP first (if no specific tabId requested)
  if (!tabId) {
    const cdpResult = await getPageInfoViaCdp();
    if (cdpResult !== null) {
      return cdpResult;
    }
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
