const fs = require('fs');
const path = require('path');
const { createModuleLogger } = require('./logger');
const { normalizeWebOrigin } = require('./ws-identity');

const log = createModuleLogger('Settings');
const DEFAULT_SETTINGS = Object.freeze({
  globalWorkingDir: '~',
  recentDirs: ['~', '~/projects'],
  trustedWebOrigins: []
});

function settingsPath() {
  return process.env.TABZ_SETTINGS_PATH || path.join(__dirname, '..', '.settings.json');
}

function loadSettings() {
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
    log.error('Settings file is not an object; using defaults');
  } catch (error) {
    if (error.code !== 'ENOENT') log.error('Settings failed to load:', error.message);
  }
  return { ...DEFAULT_SETTINGS, recentDirs: [...DEFAULT_SETTINGS.recentDirs], trustedWebOrigins: [] };
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    log.error('Settings failed to save:', error.message);
    return false;
  }
}

function validateTrustedWebOrigins(list) {
  const origins = [];
  const rejected = [];
  for (const entry of Array.isArray(list) ? list : []) {
    const normalized = normalizeWebOrigin(entry);
    if (!normalized) rejected.push(entry);
    else if (!origins.includes(normalized)) origins.push(normalized);
  }
  return { origins, rejected };
}

const warnedEntries = new Set();
function getTrustedWebOrigins() {
  const { origins, rejected } = validateTrustedWebOrigins(loadSettings().trustedWebOrigins);
  for (const entry of rejected) {
    const key = String(entry);
    if (!warnedEntries.has(key)) {
      warnedEntries.add(key);
      log.warn(`trustedWebOrigins entry ignored (not an http(s) origin): ${key}`);
    }
  }
  return origins;
}

function setTrustedWebOrigins(list) {
  const { origins, rejected } = validateTrustedWebOrigins(list);
  const settings = loadSettings();
  settings.trustedWebOrigins = origins;
  return { saved: saveSettings(settings), origins, rejected };
}

module.exports = {
  DEFAULT_SETTINGS,
  settingsPath,
  loadSettings,
  saveSettings,
  validateTrustedWebOrigins,
  getTrustedWebOrigins,
  setTrustedWebOrigins
};
