/**
 * Unified Structured Logging for Terminal Tabs Backend
 *
 * All logs (backend + browser) go to logs/unified.log with consistent format:
 * [HH:MM:SS] LEVEL  [Module] message
 *
 * Console output: Only errors/warnings (keeps backend terminal clean)
 * Full logs: View via Logs profile in TabzChrome (lnav or tail -f)
 *
 * lnav filtering: :filter-in \[Server\], :filter-in ERROR, :filter-in \[Browser:
 */

const { createConsola } = require('consola');
const fs = require('fs');
const path = require('path');

// Unified log file - all logs go here
const UNIFIED_LOG_PATH = path.resolve(__dirname, '../logs/unified.log');
const logDir = path.dirname(UNIFIED_LOG_PATH);

// Ensure logs directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Clear/initialize unified log on startup
fs.writeFileSync(UNIFIED_LOG_PATH, `--- Unified Log Started: ${new Date().toISOString()} ---\n`);

// Create write stream for unified log file
const logStream = fs.createWriteStream(UNIFIED_LOG_PATH, { flags: 'a' });

// Format timestamp consistently: HH:MM:SS
const formatTime = (date = new Date()) => {
  return date.toLocaleTimeString('en-US', { hour12: false });
};

// Map consola levels to simple level names
const LEVEL_NAMES = {
  fatal: 'FATAL',
  error: 'ERROR',
  warn: 'WARN ',
  info: 'INFO ',
  success: 'INFO ',
  start: 'INFO ',
  ready: 'INFO ',
  debug: 'DEBUG',
  trace: 'TRACE',
};

// Write to unified log file with consistent format
const writeToLog = (level, moduleName, args) => {
  const time = formatTime();
  const levelTag = LEVEL_NAMES[level] || 'INFO ';
  const message = args.map(arg =>
    typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
  ).join(' ');
  const line = `[${time}] ${levelTag} [${moduleName}] ${message}\n`;
  logStream.write(line);
};

// Create logger instance for console output
// Consola log levels: 0=silent, 1=error, 2=warn, 3=info, 4=debug, 5=trace
const logger = createConsola({
  level: parseInt(process.env.LOG_LEVEL) || 3,
  fancy: false,
  formatOptions: {
    colors: true,
    compact: true,
  },
});

// Levels that should output to console (keeps backend terminal clean)
// Everything still goes to unified.log
const CONSOLE_LEVELS = new Set(['fatal', 'error', 'warn', 'ready', 'success']);

// Create module logger that writes to file, with selective console output
const createModuleLogger = (moduleName) => {
  const createLogMethod = (level, consolaMethod) => {
    return (...args) => {
      // Always write to unified log file
      writeToLog(level, moduleName, args);
      // Only write to console for important levels (errors, warnings, ready)
      if (CONSOLE_LEVELS.has(level)) {
        consolaMethod(`[${moduleName}]`, ...args);
      }
    };
  };

  return {
    info: createLogMethod('info', logger.info.bind(logger)),
    success: createLogMethod('success', logger.success.bind(logger)),
    warn: createLogMethod('warn', logger.warn.bind(logger)),
    error: createLogMethod('error', logger.error.bind(logger)),
    debug: createLogMethod('debug', logger.debug.bind(logger)),
    fatal: createLogMethod('fatal', logger.fatal.bind(logger)),
    start: createLogMethod('start', logger.start.bind(logger)),
    ready: createLogMethod('ready', logger.ready.bind(logger)),
  };
};

/**
 * Append browser console logs to unified log
 * Called from /api/console-log endpoint
 * @param {Array} logs - Array of {level, message, source, timestamp}
 */
const appendBrowserLogs = (logs) => {
  logs.forEach(({ level, message, source, timestamp }) => {
    const time = formatTime(new Date(timestamp));
    const levelTag = (level || 'LOG').toUpperCase().padEnd(5);
    // Use Browser:source as the module name for easy filtering
    const moduleName = source ? `Browser:${source}` : 'Browser';
    const line = `[${time}] ${levelTag} [${moduleName}] ${message}\n`;
    logStream.write(line);
  });
};

// Export logger, factory, and browser log appender
module.exports = {
  logger,
  createModuleLogger,
  appendBrowserLogs,
  UNIFIED_LOG_PATH,
};
