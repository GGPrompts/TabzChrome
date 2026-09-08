/**
 * Local credential store, modelled on ~/.ssh.
 *
 * Layout (outside the repo, default ~/.tabzchrome, override with
 * TABZ_HOME):
 *
 *   config          ssh_config style: Host blocks with User and IdentityFile,
 *                   plus `Field <name> <value>` lines for ordinary saved parts
 *                   of a login (an org id, a login-type select value) and
 *                   `SecretFile <name> <path>` lines for extra secrets
 *   keys/<name>     the secret alone, mode 0600 (one file per secret)
 *
 * Nothing in the store is ever read back to a caller, org ids included:
 * everything in it is FILLED into a page, nothing is disclosed. Listings carry
 * field NAMES only.
 *
 * The backend plays the ssh-agent role: it USES a secret on request (the
 * fill relay types it into the page) and never discloses it. No function in
 * this module hands a secret to a route handler except `fillSecretInto`, which
 * only the fill-secret relay may call, and nothing here logs a value.
 *
 * Refusals mirror ssh: a key file whose mode is not 0600, or a config that is
 * not 0600 or 0644, is refused with an error naming the file and the chmod to
 * run. That mode check is the enforced part of "keep this private".
 *
 * Honest limit: this module cannot stop another process running as the same
 * operating-system user from reading the directory. A separate process or
 * shell-permission boundary is required for that isolation.
 *
 * Pattern breadth: a wildcard (`*`, `?`) matches within ONE hostname label
 * only (it never crosses a dot), so `*.example.com` covers `us3.example.com`
 * but not `a.b.example.com`; a pattern that uses wildcards must keep at least
 * a literal suffix containing a registrable owner domain (`*`, `*.com`, and
 * `*example.com` are refused) and may not put a wildcard in its LAST label
 * (`login.example.*`, `*.github.io`, `*.co.uk` are refused). No pattern may
 * carry a `:port` (fill matches on URL.hostname, which has no port). Blocks
 * that break these rules are logged once per config revision and skipped on
 * every load, so no fill and no readiness check can resolve through them.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { parse: parseDomain } = require('tldts');
const { createModuleLogger } = require('./logger');

const log = createModuleLogger('CredentialStore');

const KEY_MODE = 0o600;
const CONFIG_MODES = new Set([0o600, 0o644]);
const DIR_MODE = 0o700;
const DEFAULT_DIR_NAME = '.tabzchrome';
const DEFAULT_KEY_FILE_PREFIX = '~/.tabzchrome/keys/';

/**
 * The two built-in fields every entry has: `username` is the block's User,
 * `password` is its IdentityFile. Any other name is a `Field` (an ordinary
 * saved value, which may also select an option) or a `SecretFile` (a second key file, password
 * inputs only) declared in the block.
 */
const FIELDS = ['username', 'password'];
const BUILTIN_FIELDS = new Set(FIELDS);
/** A field name: short, one token, safe as a key-file suffix. */
const FIELD_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const MAX_FIELD_VALUE_LENGTH = 4096;
const MAX_FIELDS_PER_ENTRY = 32;

function isValidFieldName(name) {
  return typeof name === 'string' && FIELD_NAME_PATTERN.test(name);
}

/** Why a caller-supplied field name is unusable, or '' when it is fine. */
function fieldNameProblem(name) {
  if (!isValidFieldName(name)) return 'field names are one token of letters, digits, _ . - (max 64 chars)';
  if (BUILTIN_FIELDS.has(name.toLowerCase())) return `${name} is a built-in field (pass it as user or password)`;
  return '';
}

/**
 * A hostname as it appears in a URL: labels of letters, digits, and hyphens.
 * A `:port` suffix is accepted on input and stripped by `normalizeHost`, so a
 * request for `app.example.com:8443` is handled as `app.example.com`, the
 * value URL.hostname yields for the tab. Wildcards are only valid in config
 * patterns.
 */
const HOSTNAME_PATTERN = /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*(:\d{1,5})?$/i;

function isValidHostname(value) {
  return typeof value === 'string' && HOSTNAME_PATTERN.test(value.trim());
}

/** Trim, lowercase, and drop any `:port`; the hostname alone is what matches. */
function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/:\d{1,5}$/, '');
}

/**
 * Why a Host pattern is refused, or '' when it is acceptable. A negated
 * pattern (`!...`) can only narrow a block, so breadth is not checked for
 * it; a port is refused on every pattern because no tab hostname has one.
 */
function patternProblem(pattern) {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  if (!body) return 'is empty';
  if (/:\d{1,5}$/.test(body)) return 'carries a :port (fill matches URL.hostname, which has no port)';
  if (negated) return '';
  if (!/[*?]/.test(body)) return isValidHostname(body) ? '' : 'is not a hostname';
  const labels = body.split('.');
  if (labels.some(label => !label || !/^[a-z0-9*?](?:[a-z0-9*?-]{0,61}[a-z0-9*?])?$/i.test(label))) {
    return 'contains an invalid hostname label';
  }
  if (/[*?]/.test(labels[labels.length - 1])) {
    return 'has a wildcard in its last label (the public-suffix position)';
  }
  // Everything right of the last wildcard label must contain a registrable
  // owner domain. Private suffixes matter here: *.github.io and
  // *.workers.dev would otherwise cross tenant boundaries.
  let lastWild = -1;
  labels.forEach((label, index) => { if (/[*?]/.test(label)) lastWild = index; });
  const suffix = labels.slice(lastWild + 1).join('.').toLowerCase();
  const parsed = parseDomain(suffix, { allowPrivateDomains: true });
  if (!parsed.domain || (!parsed.isIcann && !parsed.isPrivate)) {
    return `does not keep a registrable owner domain to the right of its wildcard (${suffix} is a public, private, or unknown suffix boundary)`;
  }
  return '';
}

/** True when every pattern in the block passes `patternProblem`. */
function isUsableBlock(block) {
  return block.patterns.length > 0 && block.patterns.every(pattern => !patternProblem(pattern));
}

/**
 * Skipped-block warnings already emitted, keyed by config path, config mtime,
 * and pattern. secret-status is polled every 1.5 s and every poll re-reads
 * the config, so without this each bad block would warn on every poll. A
 * config edit (new mtime) warns again once. Bounded so it cannot grow
 * without limit.
 */
const warnedPatterns = new Set();
const MAX_WARNED_PATTERNS = 500;

function warnOnce(key, message) {
  if (key) {
    if (warnedPatterns.has(key)) return;
    if (warnedPatterns.size >= MAX_WARNED_PATTERNS) warnedPatterns.clear();
    warnedPatterns.add(key);
  }
  log.warn(message);
}

/**
 * Drop blocks with an over-broad or ported pattern. `revision` (the config
 * path plus mtime, supplied by readConfig) makes the warning fire once per
 * pattern per config revision; without it every call warns. Both
 * `fillSecretInto` and the readiness checks read through this, so a `Host *`
 * block can never resolve a fill or report a login as saved.
 */
function usableBlocks(blocks, revision = '') {
  return blocks.filter(block => {
    for (const pattern of block.patterns) {
      const problem = patternProblem(pattern);
      if (problem) {
        warnOnce(
          revision ? `${revision}|${block.line}|${pattern}` : '',
          `Skipping Host block at config line ${block.line}: pattern "${pattern}" ${problem}`
        );
        return false;
      }
    }
    return block.patterns.length > 0;
  });
}

/**
 * Compile one ssh-style Host pattern into a case-insensitive RegExp. Unlike
 * ssh, `*` and `?` match within a single label: `*` is any run of non-dot
 * characters and `?` one non-dot character, so a wildcard never crosses a
 * dot and `*.example.com` cannot reach `a.b.example.com`. `!` negates.
 */
function compilePattern(pattern) {
  const negated = pattern.startsWith('!');
  const body = negated ? pattern.slice(1) : pattern;
  const escaped = body
    .split('')
    .map(ch => {
      if (ch === '*') return '[^.]*';
      if (ch === '?') return '[^.]';
      return ch.replace(/[.+^${}()|[\]\\/-]/g, '\\$&');
    })
    .join('');
  return { negated, regex: new RegExp(`^${escaped}$`, 'i') };
}

/**
 * THE ONE value normalisation: leading and trailing whitespace and newlines
 * are stripped, for readiness and for the fill alike. `normalized` is true
 * when that removed more than an editor's trailing newline(s), so the route
 * can say so (never the value).
 */
function normalizeSecretValue(content) {
  const text = String(content || '');
  const value = text.trim();
  const trailingOnly = text.replace(/(\r?\n)+$/, '');
  return { value, ready: value.length > 0, normalized: value !== trailingOnly };
}

/** How to fix a key file mode, as the user should type it. */
function chmodFix(filePath) {
  return `chmod 600 ${shellQuote(filePath)}`;
}

/**
 * ssh semantics: a host matches a block when at least one non-negated pattern
 * matches and no negated pattern matches.
 */
function blockMatches(block, hostname) {
  const host = normalizeHost(hostname);
  if (!host) return false;
  let positive = false;
  for (const pattern of block.patterns) {
    const { negated, regex } = compilePattern(pattern);
    if (regex.test(host)) {
      if (negated) return false;
      positive = true;
    }
  }
  return positive;
}

/**
 * Tolerant ssh_config parser. Recognises `Host`, `User`, `IdentityFile`,
 * `Field <name> <value>`, and `SecretFile <name> <path>` (case-insensitive
 * keywords, `Key value` or `Key=value`), skips blanks and comment lines
 * (a `#` at line start after optional whitespace, as in ssh_config; a `#`
 * anywhere else is part of the value, so `Field pin A#42` reads back as
 * written), and ignores unknown keywords so a hand-edited file with extra
 * lines still loads. Lines before the first Host block are ignored. A Field or
 * SecretFile whose name is malformed or shadows a built-in is ignored. Each
 * block records its first line (`line`) and the line after its last
 * (`endLine`, exclusive) so an editor can replace it byte-exactly.
 */
/** A comment line: `#` first, after optional whitespace. Nothing else is a comment. */
function isCommentLine(line) {
  return /^\s*#/.test(line);
}

/** Blank, or a comment line (with or without its terminator). */
function isBlankOrCommentLine(line) {
  return /^\s*$/.test(line) || isCommentLine(line);
}

function parseConfig(text) {
  const blocks = [];
  let current = null;
  const lines = String(text || '').split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    if (isCommentLine(rawLine)) return;
    const line = rawLine.trim();
    if (!line) return;

    const match = line.match(/^(\S+?)(?:\s*=\s*|\s+)(.+)$/);
    if (!match) return;
    const keyword = match[1].toLowerCase();
    const value = match[2].trim();

    if (keyword === 'host') {
      if (current) current.endLine = index + 1;
      current = { patterns: value.split(/\s+/).filter(Boolean), user: '', identityFile: '', fields: {}, secretFiles: {}, line: index + 1, endLine: lines.length + 1 };
      blocks.push(current);
      return;
    }
    if (!current) return;
    if (keyword === 'user') current.user = stripQuotes(value);
    if (keyword === 'identityfile') current.identityFile = stripQuotes(value);
    if (keyword === 'field' || keyword === 'secretfile') {
      const pair = value.match(/^(\S+)\s+(.+)$/);
      if (!pair || fieldNameProblem(pair[1])) return;
      const target = keyword === 'field' ? current.fields : current.secretFiles;
      target[pair[1]] = stripQuotes(pair[2]);
    }
  });

  // Trailing blank lines belong to the file, not to the last block.
  if (current) {
    let end = lines.length;
    while (end > current.line && lines[end - 1].trim() === '') end -= 1;
    current.endLine = end + 1;
  }
  return blocks;
}

/** Field names declared on a block, never values. */
function fieldNamesOf(block) {
  return {
    fields: Object.keys(block.fields || {}),
    secretFiles: Object.keys(block.secretFiles || {})
  };
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** First matching block wins, as in ssh. */
function matchHost(blocks, hostname) {
  return blocks.find(block => blockMatches(block, hostname)) || null;
}

/** Every block matching the hostname, in config order. */
function matchAllHosts(blocks, hostname) {
  return blocks.filter(block => blockMatches(block, hostname));
}

/**
 * The registrable domain and its owner-controlled label according to bundled
 * public/private suffix data. This describes matching relationships; it does
 * not prove domain ownership.
 */
function domainIdentity(value) {
  const body = normalizeHost(String(value || '').replace(/^!/, ''));
  const literal = body.split('.').filter(label => label && !/[*?]/.test(label)).join('.');
  const parsed = parseDomain(literal, { allowPrivateDomains: true });
  return {
    registrableDomain: parsed.domain || literal,
    secondLevelLabel: parsed.domainWithoutSuffix || ''
  };
}

/** Related saved patterns that still do not authorize a fill for hostname. */
function nearMissPatterns(blocks, hostname) {
  const target = domainIdentity(hostname);
  const seen = new Set();
  const nearMiss = [];
  for (const block of blocks) {
    for (const pattern of block.patterns) {
      if (pattern.startsWith('!')) continue;
      const candidate = domainIdentity(pattern);
      const related = candidate.registrableDomain === target.registrableDomain ||
        (candidate.secondLevelLabel && candidate.secondLevelLabel === target.secondLevelLabel);
      const key = normalizeHost(pattern);
      if (related && !seen.has(key)) {
        seen.add(key);
        nearMiss.push(pattern);
      }
    }
  }
  return nearMiss;
}

function slugForHost(hostname) {
  return normalizeHost(hostname)
    .replace(/:\d+$/, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/\.+/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '') || 'host';
}

function modeOf(stat) {
  return stat.mode & 0o777;
}

function octal(mode) {
  return mode.toString(8).padStart(3, '0');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

class CredentialStoreError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'CredentialStoreError';
    this.code = code;
  }
}

/**
 * Build a store bound to one directory. `homeDir` is what `~` expands to in
 * IdentityFile values and what the default stub path is written relative to;
 * tests point both at a temp dir so nothing touches the real home. Without
 * `storeDir`, TABZ_HOME wins over `<homeDir>/.tabzchrome`, the
 * same rule as `getDefaultStore`, so a test that sets the env var can never
 * reach the real store through this constructor either.
 */
function createCredentialStore(options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'linux' && platform !== 'darwin') {
    throw new CredentialStoreError(
      'The Tabz credential store requires POSIX owner and mode enforcement. Native Windows is unsupported; run the backend in WSL and keep TABZ_HOME on its Linux filesystem (for example, under /home), not a Windows-mounted drive.',
      'UNSUPPORTED_PLATFORM'
    );
  }
  const expectedUid = Object.prototype.hasOwnProperty.call(options, 'uid')
    ? options.uid
    : (typeof process.getuid === 'function' ? process.getuid() : null);
  if (!Number.isInteger(expectedUid)) {
    throw new CredentialStoreError('Cannot verify ownership for the Tabz credential store on this platform.', 'OWNERSHIP_UNAVAILABLE');
  }
  const homeDir = options.homeDir || os.homedir();
  const storeDir = options.storeDir || resolveStoreDir(process.env, homeDir);
  const configPath = path.join(storeDir, 'config');
  const keysDir = path.join(storeDir, 'keys');
  const isWsl = Object.prototype.hasOwnProperty.call(options, 'isWsl')
    ? Boolean(options.isWsl)
    : Boolean(process.env.WSL_DISTRO_NAME || /microsoft/i.test(os.release()));
  if (isWsl && /^\/mnt\/[a-z](?:\/|$)/i.test(path.resolve(storeDir))) {
    throw new CredentialStoreError(
      `Refusing TABZ_HOME ${storeDir}: a Windows-mounted WSL path cannot provide the required credential permission boundary. Use the WSL Linux filesystem (for example, under /home).`,
      'UNSAFE_WSL_PATH'
    );
  }

  function permissionFailure(target, mode, error) {
    const detail = error && error.code ? ` (${error.code})` : '';
    return new CredentialStoreError(
      `Cannot enforce mode ${octal(mode)} on ${target}${detail}. Keep TABZ_HOME on a POSIX filesystem; under WSL use the Linux filesystem (for example, /home), not a Windows-mounted drive.`,
      'PERMISSION_UNSUPPORTED'
    );
  }

  function lstatMaybe(target) {
    try {
      return fs.lstatSync(target);
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  function assertOwned(stat, target) {
    if (stat.uid !== expectedUid) {
      throw new CredentialStoreError(`Refusing ${target}: it is owned by uid ${stat.uid}, expected uid ${expectedUid}.`, 'BAD_OWNER');
    }
  }

  function assertPrivateDirectory(target) {
    const stat = lstatMaybe(target);
    if (!stat) return false;
    if (stat.isSymbolicLink()) throw new CredentialStoreError(`Refusing ${target}: directory is a symbolic link.`, 'PATH_SYMLINK');
    if (!stat.isDirectory()) throw new CredentialStoreError(`Refusing ${target}: expected a directory.`, 'PATH_NOT_DIRECTORY');
    assertOwned(stat, target);
    if (modeOf(stat) !== DIR_MODE) {
      throw new CredentialStoreError(`Refusing ${target}: mode is ${octal(modeOf(stat))}, expected 700. Run: chmod 700 ${shellQuote(target)}`, 'DIRECTORY_MODE');
    }
    return true;
  }

  function createPrivateDirectory(target) {
    if (assertPrivateDirectory(target)) return;
    fs.mkdirSync(target, { recursive: true, mode: DIR_MODE });
    try {
      fs.chmodSync(target, DIR_MODE);
    } catch (error) {
      throw permissionFailure(target, DIR_MODE, error);
    }
    try {
      assertPrivateDirectory(target);
    } catch (error) {
      if (error instanceof CredentialStoreError && error.code === 'DIRECTORY_MODE') {
        throw permissionFailure(target, DIR_MODE);
      }
      throw error;
    }
  }

  let permissionCapabilityVerified = false;

  /**
   * Verify that the existing keys filesystem enforces owner-only mode changes,
   * rather than merely reporting a fixed 0600 mode. The exclusive probe is
   * owned by this call and is always removed; a missing keys directory stays
   * read-only and is not created by metadata access.
   */
  function assertPermissionCapability() {
    if (permissionCapabilityVerified || !lstatMaybe(keysDir)) return;
    const probePath = path.join(keysDir, `.permission-probe-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
    let fd = null;
    let created = false;
    let failure = null;
    const assertProbe = expectedMode => {
      const stat = fs.lstatSync(probePath);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new CredentialStoreError(`Cannot verify credential permissions on ${keysDir}: the capability probe is not a regular file.`, 'PERMISSION_UNSUPPORTED');
      }
      assertOwned(stat, probePath);
      if (modeOf(stat) !== expectedMode) throw permissionFailure(keysDir, expectedMode);
    };
    try {
      fd = fs.openSync(probePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, KEY_MODE);
      created = true;
      fs.closeSync(fd);
      fd = null;
      assertProbe(KEY_MODE);
      try { fs.chmodSync(probePath, 0o400); } catch (error) { throw permissionFailure(keysDir, 0o400, error); }
      assertProbe(0o400);
      try { fs.chmodSync(probePath, KEY_MODE); } catch (error) { throw permissionFailure(keysDir, KEY_MODE, error); }
      assertProbe(KEY_MODE);
    } catch (error) {
      failure = error;
    } finally {
      if (fd !== null) try { fs.closeSync(fd); } catch {}
      if (created) {
        try {
          fs.rmSync(probePath, { force: true });
        } catch (error) {
          if (!failure) {
            failure = new CredentialStoreError(`Cannot remove credential permission probe ${probePath}: ${error.message}`, 'PERMISSION_PROBE_CLEANUP');
          }
        }
      }
    }
    if (failure) throw failure;
    permissionCapabilityVerified = true;
  }

  function assertExistingLayout() {
    const storeStat = lstatMaybe(storeDir);
    if (!storeStat) return;
    assertPrivateDirectory(storeDir);
    if (lstatMaybe(keysDir)) {
      assertPrivateDirectory(keysDir);
      assertPermissionCapability();
    }
  }

  function expandPath(value) {
    if (!value) return '';
    if (value === '~') return homeDir;
    if (value.startsWith('~/')) return path.join(homeDir, value.slice(2));
    if (path.isAbsolute(value)) return value;
    return path.join(storeDir, value);
  }

  /** Render a key path the way the stub writes it: `~/...` when under home. */
  function displayPath(absolute) {
    const relative = path.relative(homeDir, absolute);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      return `~/${relative.split(path.sep).join('/')}`;
    }
    return absolute;
  }

  function ensureStore() {
    createPrivateDirectory(storeDir);
    createPrivateDirectory(keysDir);
    if (!lstatMaybe(configPath)) {
      fs.writeFileSync(configPath, '', { mode: KEY_MODE, flag: 'wx' });
      try {
        fs.chmodSync(configPath, KEY_MODE);
      } catch (error) {
        try { fs.rmSync(configPath, { force: true }); } catch {}
        throw permissionFailure(configPath, KEY_MODE, error);
      }
    }
    assertConfigMode();
    return { storeDir, configPath, keysDir };
  }

  function assertConfigMode() {
    assertPrivateDirectory(storeDir);
    const stat = fs.lstatSync(configPath);
    if (stat.isSymbolicLink()) throw new CredentialStoreError(`Refusing config ${configPath}: it is a symbolic link.`, 'PATH_SYMLINK');
    if (!stat.isFile()) throw new CredentialStoreError(`Refusing config ${configPath}: it is not a regular file.`, 'CONFIG_NOT_FILE');
    assertOwned(stat, configPath);
    const mode = modeOf(stat);
    if (!CONFIG_MODES.has(mode)) {
      throw new CredentialStoreError(
        `Refusing config ${configPath}: mode is ${octal(mode)}, expected 600 or 644. Run: chmod 600 ${shellQuote(configPath)}`,
        'CONFIG_MODE'
      );
    }
  }

  function assertKeyMode(keyPath) {
    assertStoreKeyPath(keyPath, 'key file');
    let stat;
    try {
      stat = fs.lstatSync(keyPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new CredentialStoreError(`Key file ${keyPath} does not exist. Run tabz_secret_request for this host.`, 'KEY_MISSING');
      }
      throw error;
    }
    if (stat.isSymbolicLink()) {
      throw new CredentialStoreError(`Key file ${keyPath} is a symbolic link.`, 'PATH_SYMLINK');
    }
    if (!stat.isFile()) {
      throw new CredentialStoreError(`Key file ${keyPath} is not a regular file.`, 'KEY_NOT_FILE');
    }
    assertOwned(stat, keyPath);
    const mode = modeOf(stat);
    if (mode !== KEY_MODE) {
      throw new CredentialStoreError(
        `Refusing key file ${keyPath}: mode is ${octal(mode)}, expected 600. Run: chmod 600 ${shellQuote(keyPath)}`,
        'KEY_MODE'
      );
    }
  }

  /**
   * Parsed, usable blocks, or an empty list when the config does not exist
   * yet. Blocks with an over-broad or ported pattern are skipped (and
   * logged); `readRawConfig` keeps them for callers that edit the file.
   */
  function readConfig() {
    assertExistingLayout();
    if (!lstatMaybe(configPath)) return [];
    const stat = fs.lstatSync(configPath);
    const blocks = usableBlocks(readRawConfig(), `${configPath}|${stat.mtimeMs}`);
    for (const block of blocks) assertBlockKeyPaths(block);
    return blocks;
  }

  function readRawConfig() {
    assertExistingLayout();
    if (!lstatMaybe(configPath)) return [];
    assertConfigMode();
    return parseConfig(fs.readFileSync(configPath, 'utf8'));
  }

  function keyPathFor(block) {
    return block.identityFile ? expandPath(block.identityFile) : '';
  }

  /** Apply the store-owned, no-symlink boundary to every path a block names. */
  function assertBlockKeyPaths(block) {
    const identityFile = keyPathFor(block);
    if (identityFile) assertStoreKeyPath(identityFile, 'IdentityFile');
    for (const [name, value] of Object.entries(block.secretFiles)) {
      assertStoreKeyPath(expandPath(value), `SecretFile ${name}`);
    }
  }

  /**
   * THE ONE readiness predicate: a key file is ready when it is a regular
   * file of mode 0600 whose normalised content is non-empty. secret-status,
   * secret-request, and fill all decide through this, so a newline-only or
   * whitespace-only file is "not saved yet" and a 0644 file is `bad_mode` for
   * every caller alike; the fill can never refuse a file status called ready.
   * Returns the normalised value for `fillSecretInto` only.
   */
  function readKeyFile(keyPath) {
    assertKeyMode(keyPath);
    return normalizeSecretValue(fs.readFileSync(keyPath, 'utf8'));
  }

  /**
   * Key file state for a block: `status` is one of `ready`, `empty`,
   * `missing`, `not_file`, `bad_mode` (with `fix`, the chmod to run), or
   * `no_key` (the block has no IdentityFile). `hasKey` is true only for
   * `ready`. Never content.
   */
  function keyPresence(block) {
    return presenceOfKeyFile(keyPathFor(block));
  }

  /** `keyPresence` for any key path (the IdentityFile or a SecretFile). */
  function presenceOfKeyFile(keyPath) {
    if (!keyPath) return { hasKey: false, keyMode: null, status: 'no_key' };
    assertStoreKeyPath(keyPath, 'key file');
    let stat;
    try {
      stat = fs.lstatSync(keyPath);
    } catch {
      return { hasKey: false, keyMode: null, status: 'missing' };
    }
    if (stat.isSymbolicLink()) throw new CredentialStoreError(`Key file ${keyPath} is a symbolic link.`, 'PATH_SYMLINK');
    assertOwned(stat, keyPath);
    const keyMode = octal(modeOf(stat));
    if (!stat.isFile()) return { hasKey: false, keyMode, status: 'not_file' };
    if (modeOf(stat) !== KEY_MODE) {
      return { hasKey: false, keyMode, status: 'bad_mode', fix: chmodFix(keyPath) };
    }
    let ready = false;
    try {
      ready = readKeyFile(keyPath).ready;
    } catch {
      return { hasKey: false, keyMode, status: 'missing' };
    }
    return { hasKey: ready, keyMode, status: ready ? 'ready' : 'empty' };
  }

  /**
   * Names, patterns, username presence, and key presence. Never a value or path
   * outside the store's own naming.
   */
  function listEntries() {
    return readConfig().map(block => {
      const keyPath = keyPathFor(block);
      const presence = keyPresence(block);
      return {
        name: keyPath ? path.basename(keyPath) : '',
        patterns: [...block.patterns],
        hasUsername: Boolean(block.user),
        hasKey: presence.hasKey,
        keyMode: presence.keyMode,
        keyStatus: presence.status,
        ...(presence.fix ? { fix: presence.fix } : {}),
        ...fieldNamesOf(block)
      };
    });
  }

  /**
   * The hostname asked about, whether it has a username, the patterns it
   * matched through, and the names of its extra fields (never their values).
   */
  function describe(block, host) {
    return { host, hasUsername: Boolean(block.user), patterns: [...block.patterns], ...fieldNamesOf(block) };
  }

  function uniqueSlug(base) {
    let slug = base;
    let counter = 2;
    while (fs.existsSync(path.join(keysDir, slug))) {
      slug = `${base}-${counter}`;
      counter += 1;
    }
    return slug;
  }

  function createEmptyKey(keyPath) {
    writeFreshSecretFile(keyPath, '');
    return keyPath;
  }

  /**
   * Give a matched block that has no IdentityFile one: insert the line right
   * after its Host line and create the empty 0600 key. Only that one line is
   * added; every other byte of the file, including its line endings (LF or
   * CRLF, even mixed), is written back exactly as read. Without this the
   * editor would open on an empty filename and the status would stay pending
   * forever.
   */
  function assignIdentityFile(block) {
    const slug = uniqueSlug(slugForHost(block.patterns.find(p => !/[*?!]/.test(p)) || block.patterns[0]));
    const keyPath = path.join(keysDir, slug);
    createEmptyKey(keyPath);
    try {
      // Split keeping each line's own terminator so nothing is re-encoded.
      const lines = configLines();
      const hostIndex = block.line - 1;
      const hostLine = lines[hostIndex] || '';
      if (!/^\s*host\b/i.test(hostLine)) {
        throw new CredentialStoreError(`Config line ${block.line} is no longer a Host line; refusing to edit ${configPath}`, 'CONFIG_CHANGED');
      }
      const previous = hostIndex > 0 ? lines[hostIndex - 1] : '';
      const eol = /\r\n$/.test(hostLine) ? '\r\n' : /\n$/.test(hostLine) ? '\n' : (/\r\n$/.test(previous) ? '\r\n' : '\n');
      const inserted = `  IdentityFile ${displayPath(keyPath)}${eol}`;
      if (!/\n$/.test(hostLine)) lines[hostIndex] = `${hostLine}${eol}`;
      lines.splice(hostIndex + 1, 0, inserted);
      writeConfigLines(lines);
      block.identityFile = displayPath(keyPath);
      return keyPath;
    } catch (error) {
      try { removeStoreKey(keyPath); } catch {}
      throw error;
    }
  }

  /**
   * Make sure a Host block exists for `hostname` (any `:port` is dropped
   * first). Idempotent: an existing match is returned as is, except that a
   * block without an IdentityFile gets one assigned; otherwise a stub block
   * is appended to the config and an empty 0600 key file is created for the
   * user to fill in.
   *
   * `options.deferConfigEdit`: when a credential editor may hold the config
   * open, the caller passes true and the config is NOT written: neither a
   * missing IdentityFile on a matched block nor a stub block for a new host.
   * The result then carries `keyPath: ''` and `configEditDeferred: true`
   * (with `patterns: []` for a host that has no block yet), and the next call
   * without the flag does the write.
   */
  function ensureEntry(hostname, options = {}) {
    if (!isValidHostname(hostname)) {
      throw new CredentialStoreError(`"${hostname}" is not a hostname`, 'BAD_HOST');
    }
    const host = normalizeHost(hostname);
    ensureStore();
    const existing = matchHost(readConfig(), host);
    if (existing) {
      let keyPath = keyPathFor(existing);
      if (!keyPath) {
        if (options.deferConfigEdit) {
          return { created: false, ...describe(existing, host), keyPath: '', configEditDeferred: true };
        }
        keyPath = assignIdentityFile(existing);
      } else {
        assertStoreKeyPath(keyPath, 'IdentityFile');
      }
      if (keyPath && !lstatMaybe(keyPath)) {
        createEmptyKey(keyPath);
      }
      return { created: false, ...describe(existing, host), keyPath };
    }

    if (options.deferConfigEdit) {
      return { created: false, host, hasUsername: false, patterns: [], keyPath: '', configEditDeferred: true };
    }

    const slug = uniqueSlug(slugForHost(host));
    const keyPath = path.join(keysDir, slug);
    createEmptyKey(keyPath);
    try {
      const current = configLines().join('');
      const separator = current.length === 0 || current.endsWith('\n\n') ? '' : current.endsWith('\n') ? '\n' : '\n\n';
      const stub = `${separator}Host ${host}\n  User \n  IdentityFile ${displayPath(keyPath)}\n`;
      writeConfigLines([current, stub]);
      return { created: true, host, hasUsername: false, patterns: [host], keyPath };
    } catch (error) {
      try { removeStoreKey(keyPath); } catch {}
      throw error;
    }
  }

  /**
   * Resolve the block for a tab hostname. `preferredHost` only disambiguates
   * among blocks that already match the tab; one that does not match the tab
   * is rejected rather than trusted.
   */
  function resolveBlock(tabHostname, preferredHost) {
    if (!isValidHostname(tabHostname)) {
      throw new CredentialStoreError('The tab has no usable hostname', 'BAD_HOST');
    }
    const host = normalizeHost(tabHostname);
    const blocks = readConfig();
    const matches = matchAllHosts(blocks, host);
    if (matches.length === 0) {
      const nearMiss = nearMissPatterns(blocks, host);
      const message = nearMiss.length > 0
        ? `No saved login matches ${host}. A block exists for ${nearMiss.join(', ')}; ask the user to re-save it for this host on the Logins page (tabz_secret_request).`
        : `No saved login for ${host}. Ask the user to add one with tabz_secret_request.`;
      const error = new CredentialStoreError(message, 'NO_MATCH');
      error.nearMiss = nearMiss;
      throw error;
    }
    if (preferredHost) {
      // Accept the tab hostname itself or a pattern spelled exactly as it
      // appears in a block that already matches the tab.
      const wanted = normalizeHost(preferredHost);
      const chosen = matches.find(block => block.patterns.some(p => normalizeHost(p) === wanted)) ||
        (wanted === host ? matches[0] : null);
      if (!chosen) {
        throw new CredentialStoreError(`host "${preferredHost}" does not match the tab (${host})`, 'HOST_MISMATCH');
      }
      return { block: chosen, host };
    }
    return { block: matches[0], host };
  }

  /** The readiness record for one block, as `isReady` reports it. Never content. */
  function readinessOf(block, host) {
    const presence = keyPresence(block);
    const status = presence.status === 'ready' ? 'ready' : presence.status === 'bad_mode' ? 'bad_mode' : 'pending';
    return {
      ready: presence.hasKey,
      status,
      keyStatus: presence.status,
      ...(presence.fix ? { fix: presence.fix, keyMode: presence.keyMode } : {}),
      ...describe(block, host)
    };
  }

  /**
   * Readiness of the matching entry. `ready` is true only for a 0600 key file
   * with content; `status` is `ready`, `pending` (empty, missing, or no
   * IdentityFile yet), or `bad_mode` (wrong file mode, with `fix` naming the
   * chmod to run). Never returns content.
   */
  function isReady(hostname) {
    try {
      const { block, host } = resolveBlock(hostname);
      return readinessOf(block, host);
    } catch (error) {
      if (error instanceof CredentialStoreError && error.code === 'NO_MATCH') {
        const nearMiss = Array.isArray(error.nearMiss) ? error.nearMiss : [];
        return {
          ready: false,
          status: 'pending',
          keyStatus: 'no_match',
          host: normalizeHost(hostname),
          hasUsername: false,
          patterns: [],
          fields: [],
          secretFiles: [],
          ...(nearMiss.length > 0 ? { nearMiss } : {})
        };
      }
      throw error;
    }
  }

  /**
   * THE ONLY FUNCTION THAT RETURNS A SECRET. Callable by the fill-secret relay
   * alone; the value goes straight into a WebSocket frame to the extension and
   * must never be copied into an HTTP response, a log line, or an MCP result.
   */
  function fillSecretInto(tabHostname, field, options = {}) {
    if (!isValidFieldName(field)) {
      throw new CredentialStoreError('field must be username, password, or the name of a Field or SecretFile declared for the host', 'BAD_FIELD');
    }
    const { block, host } = resolveBlock(tabHostname, options.host);
    const user = block.user;

    if (field === 'username') {
      if (!user) {
        throw new CredentialStoreError(`The ${host} entry has no User yet. Ask the user to fill it in with tabz_secret_request.`, 'NO_USER');
      }
      return { host, user, kind: 'username', value: user, normalized: false };
    }

    if (field === 'password') {
      const keyPath = keyPathFor(block);
      if (!keyPath) {
        throw new CredentialStoreError(`The ${host} entry has no IdentityFile.`, 'NO_KEY');
      }
      return { host, user, kind: 'password', ...readSecretFile(keyPath, `Key file for ${host}`) };
    }

    if (Object.prototype.hasOwnProperty.call(block.fields, field)) {
      const value = block.fields[field];
      if (!value) {
        throw new CredentialStoreError(`Field ${field} for ${host} is empty.`, 'FIELD_EMPTY');
      }
      return { host, user, kind: 'field', value, normalized: false };
    }

    if (Object.prototype.hasOwnProperty.call(block.secretFiles, field)) {
      const keyPath = expandPath(block.secretFiles[field]);
      return { host, user, kind: 'secretfile', ...readSecretFile(keyPath, `SecretFile ${field} for ${host}`) };
    }

    const { fields, secretFiles } = fieldNamesOf(block);
    const known = ['username', 'password', ...fields, ...secretFiles];
    throw new CredentialStoreError(`The ${host} entry has no field "${field}" (it has: ${known.join(', ')}).`, 'UNKNOWN_FIELD');
  }

  /** Mode-checked, normalised read of one key file; `label` names it in refusals. */
  function readSecretFile(keyPath, label) {
    assertKeyMode(keyPath);
    const { value, ready, normalized } = readKeyFile(keyPath);
    if (!ready) {
      throw new CredentialStoreError(`${label} is empty. Run tabz_secret_request so the user can fill it in.`, 'KEY_EMPTY');
    }
    // The same normalisation readiness used: surrounding whitespace and
    // newlines are stripped, so "\nvalue\n" types "value", never a newline.
    return { value, normalized };
  }

  /** Lines of the config with their own terminators, so a rewrite re-encodes nothing. */
  function configLines() {
    const text = lstatMaybe(configPath) ? (assertConfigMode(), fs.readFileSync(configPath, 'utf8')) : '';
    return text.match(/[^\n]*\n|[^\n]+$/g) || [];
  }

  function writeConfigLines(lines) {
    ensureStore();
    const tempPath = path.join(storeDir, `.config.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`);
    let fd = null;
    let created = false;
    try {
      fd = fs.openSync(tempPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, KEY_MODE);
      created = true;
      fs.writeFileSync(fd, lines.join(''));
      fs.closeSync(fd);
      fd = null;
      try {
        fs.chmodSync(tempPath, KEY_MODE);
      } catch (error) {
        throw permissionFailure(tempPath, KEY_MODE, error);
      }
      const stat = fs.lstatSync(tempPath);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new CredentialStoreError(`Refusing staged config ${tempPath}: expected a regular file.`, 'CONFIG_NOT_FILE');
      assertOwned(stat, tempPath);
      if (modeOf(stat) !== KEY_MODE) throw permissionFailure(tempPath, KEY_MODE);
      // rename(2) replaces the config atomically on supported POSIX filesystems.
      // The temp file is in the same directory so this cannot cross devices.
      fs.renameSync(tempPath, configPath);
    } catch (error) {
      if (fd !== null) try { fs.closeSync(fd); } catch {}
      if (created) try { fs.rmSync(tempPath, { force: true }); } catch {}
      throw error;
    }
  }

  /** The block, if any, whose patterns include `host` spelled exactly. */
  function findExactBlock(blocks, host) {
    const wanted = normalizeHost(host);
    return blocks.find(block => block.patterns.some(p => normalizeHost(p) === wanted)) || null;
  }

  /** Text of a NEW Host block from its parts, one directive per line. */
  function renderBlock({ host, user, identityFile, fields, secretFiles }, eol) {
    const lines = [`Host ${host}`, `  User ${user}`, `  IdentityFile ${identityFile}`];
    for (const [name, value] of Object.entries(fields)) lines.push(`  Field ${name} ${value}`);
    for (const [name, file] of Object.entries(secretFiles)) lines.push(`  SecretFile ${name} ${file}`);
    return lines.map(line => `${line}${eol}`).join('');
  }

  /** A line's own terminator, or '' for an unterminated last line. */
  function eolOf(line) {
    const match = String(line).match(/\r?\n$/);
    return match ? match[0] : '';
  }

  /**
   * The lines a block OWNS, as `[start, end)` indexes into `lines`: its Host
   * line through its last directive, comment, or unknown line. Trailing
   * blank lines and the comment lines right before the next Host belong to
   * whatever follows (a comment above `Host c` describes c), so an edit or a
   * delete of this block leaves them alone.
   */
  function blockRange(block, lines) {
    const start = block.line - 1;
    if (!/^\s*host\b/i.test(lines[start] || '')) {
      throw new CredentialStoreError(`Config line ${block.line} is no longer a Host line; refusing to edit ${configPath}`, 'CONFIG_CHANGED');
    }
    let end = Math.min(block.endLine - 1, lines.length);
    while (end > start + 1 && isBlankOrCommentLine(lines[end - 1])) end -= 1;
    return { start, end };
  }

  /**
   * One directive line as the rewrite sees it: `{ keyword, indent, name }`
   * for a User, IdentityFile, Field, or SecretFile line the parser would
   * honour, null for everything else (blank, comment, unknown keyword, a
   * Field with a malformed name), which is kept byte for byte.
   */
  function parseDirectiveLine(line) {
    if (isCommentLine(line)) return null;
    const body = String(line).replace(/\r?\n$/, '');
    const match = body.match(/^(\s*)(\S+?)(?:\s*=\s*|\s+)(.+)$/);
    if (!match) return null;
    const [, indent, rawKeyword, rawValue] = match;
    const keyword = rawKeyword.toLowerCase();
    if (keyword === 'user' || keyword === 'identityfile') return { keyword, indent, name: '' };
    if (keyword === 'field' || keyword === 'secretfile') {
      const pair = rawValue.trim().match(/^(\S+)\s+(.+)$/);
      if (!pair || fieldNameProblem(pair[1])) return null;
      return { keyword, indent, name: pair[1] };
    }
    return null;
  }

  /**
   * Rewrite an existing block IN PLACE: each User, IdentityFile, Field, and
   * SecretFile line is replaced where it stands (or dropped when the field
   * is gone), directives the block lacks are added after its last directive
   * line, and every other line inside the block (comments, unknown
   * directives such as a ProxyJump someone added by hand) is written back
   * exactly as read, as is everything outside the block. The Host line and
   * its patterns are untouched. Line endings follow the lines they replace.
   */
  function rewrittenBlockText(block, parts) {
    const lines = configLines();
    const { start, end } = blockRange(block, lines);
    const hostLine = lines[start];
    const defaultEol = eolOf(hostLine) || eolOf(lines[start - 1] || '') || '\n';

    const wanted = new Map();
    wanted.set('user', `User ${parts.user}`);
    wanted.set('identityfile', `IdentityFile ${parts.identityFile}`);
    for (const [name, value] of Object.entries(parts.fields)) wanted.set(`field:${name}`, `Field ${name} ${value}`);
    for (const [name, file] of Object.entries(parts.secretFiles)) wanted.set(`secretfile:${name}`, `SecretFile ${name} ${file}`);

    const emitted = new Set();
    const out = [];
    let lastDirective = -1;
    let indent = '  ';
    for (const line of lines.slice(start + 1, end)) {
      const directive = parseDirectiveLine(line);
      if (!directive) {
        out.push(line);
        continue;
      }
      const key = directive.name ? `${directive.keyword}:${directive.name}` : directive.keyword;
      indent = directive.indent || indent;
      // A removed field, or a duplicate of a directive already rewritten, goes.
      if (!wanted.has(key) || emitted.has(key)) continue;
      emitted.add(key);
      out.push(`${directive.indent}${wanted.get(key)}${eolOf(line) || defaultEol}`);
      lastDirective = out.length - 1;
    }
    const additions = [];
    for (const [key, text] of wanted) {
      if (!emitted.has(key)) additions.push(`${indent}${text}${defaultEol}`);
    }
    out.splice(lastDirective + 1, 0, ...additions);

    // A Host line that was the unterminated last line gets a terminator.
    if (!eolOf(hostLine) && out.length > 0) lines[start] = `${hostLine}${defaultEol}`;
    lines.splice(start + 1, end - (start + 1), ...out);
    return lines.join('');
  }

  function rewriteBlock(block, parts) {
    writeConfigLines([rewrittenBlockText(block, parts)]);
  }

  /**
   * Remove the lines of `block` (see `blockRange`: its Host line through its
   * last directive, comment, or unknown line); every other byte of the file
   * is written back as read.
   */
  function configWithoutBlock(block) {
    const lines = configLines();
    const { start, end } = blockRange(block, lines);
    lines.splice(start, end - start);
    return lines.join('');
  }

  function removeBlockText(block) {
    writeConfigLines([configWithoutBlock(block)]);
  }

  /**
   * New blocks go FIRST: ssh picks the first matching block, so a login
   * saved for an exact host must sit ahead of any wildcard block that also
   * covers it.
   */
  function prependedBlockText(text) {
    const current = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const separator = current.length === 0 || current.startsWith('\n') ? '' : '\n';
    return [text, separator, current].join('');
  }

  function prependBlockText(text) {
    writeConfigLines([prependedBlockText(text)]);
  }

  function writeFreshSecretFile(keyPath, value) {
    assertStoreKeyPath(keyPath, 'key file');
    let fd = null;
    let created = false;
    try {
      fd = fs.openSync(keyPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, KEY_MODE);
      created = true;
      fs.writeFileSync(fd, value ? `${value}\n` : '');
      fs.closeSync(fd);
      fd = null;
      fs.chmodSync(keyPath, KEY_MODE);
    } catch (error) {
      if (fd !== null) try { fs.closeSync(fd); } catch {}
      if (created) try { fs.rmSync(keyPath, { force: true }); } catch {}
      if (error && ['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) {
        throw permissionFailure(keyPath, KEY_MODE, error);
      }
      throw error;
    }
    try {
      assertKeyMode(keyPath);
    } catch (error) {
      try { fs.rmSync(keyPath, { force: true }); } catch {}
      if (error instanceof CredentialStoreError && error.code === 'KEY_MODE') throw permissionFailure(keyPath, KEY_MODE);
      throw error;
    }
    return keyPath;
  }

  /** True when `filePath` lives inside the store's keys directory. */
  function isStoreKeyPath(filePath) {
    const relative = path.relative(path.resolve(keysDir), path.resolve(filePath));
    return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
  }

  /**
   * Refuse to read, write, or delete a key path that is not under the store's
   * keys directory. A hand-edited
   * IdentityFile pointing at, say, `~/.ssh/id_ed25519` would otherwise be
   * truncated and chmod'ed by a rotate. The error names the file so the user
   * can move it or edit the config by hand.
   */
  function assertStoreKeyPath(filePath, what) {
    if (!isStoreKeyPath(filePath)) {
      throw new CredentialStoreError(
        `Refusing ${what} ${filePath}: it is outside the store's keys directory ${keysDir}. Move it under that directory before using the credential store.`,
        'KEY_OUTSIDE_STORE'
      );
    }
    assertPrivateDirectory(storeDir);
    assertPrivateDirectory(keysDir);
    assertPermissionCapability();
    const relative = path.relative(path.resolve(keysDir), path.resolve(filePath));
    const parts = relative.split(path.sep);
    let current = keysDir;
    for (const part of parts.slice(0, -1)) {
      current = path.join(current, part);
      if (!assertPrivateDirectory(current)) {
        throw new CredentialStoreError(`Refusing ${what} ${filePath}: intermediate directory ${current} does not exist.`, 'PATH_NOT_DIRECTORY');
      }
    }
    const finalStat = lstatMaybe(path.resolve(filePath));
    if (finalStat && finalStat.isSymbolicLink()) {
      throw new CredentialStoreError(`Refusing ${what} ${filePath}: it is a symbolic link.`, 'PATH_SYMLINK');
    }
    if (finalStat) assertOwned(finalStat, filePath);
  }

  function removeStoreKey(filePath) {
    if (!filePath) return false;
    assertStoreKeyPath(filePath, 'key file');
    const stat = lstatMaybe(filePath);
    if (!stat) return false;
    if (!stat.isFile()) throw new CredentialStoreError(`Refusing key file ${filePath}: it is not a regular file.`, 'KEY_NOT_FILE');
    try {
      fs.rmSync(filePath);
      return true;
    } catch (error) {
      throw new CredentialStoreError(`Could not remove key file ${filePath}: ${error.message}`, 'KEY_REMOVE_FAILED');
    }
  }

  function referencedKeyPaths(blocks = readRawConfig()) {
    const referenced = new Set();
    for (const block of blocks) {
      if (block.identityFile) referenced.add(path.resolve(expandPath(block.identityFile)));
      for (const file of Object.values(block.secretFiles || {})) {
        referenced.add(path.resolve(expandPath(file)));
      }
    }
    return referenced;
  }

  /**
   * Validate the non-value shape of a save request: host, user, field and
   * secret names, value lengths. Values are only length-checked, never
   * inspected or echoed.
   */
  function validateSaveInput(input) {
    const host = normalizeHost(input.host);
    // A hostname, or a Host pattern naming an existing block (checked by
    // saveEntry against the config); either way one token, no whitespace.
    if (!host || host.length > 253 || /\s/.test(host)) throw new CredentialStoreError('host must be a hostname such as app.example.com', 'BAD_HOST');
    const user = typeof input.user === 'string' ? input.user.trim() : '';
    if (user.length > 256 || /[\r\n]/.test(user)) throw new CredentialStoreError('user must be one line of at most 256 characters', 'BAD_USER');
    const password = input.password === undefined || input.password === null ? '' : String(input.password);
    if (password.length > MAX_FIELD_VALUE_LENGTH) throw new CredentialStoreError('password is too long', 'BAD_VALUE');
    const fields = {};
    const secretFiles = {};
    const seen = new Set();
    const take = (list, into, secret) => {
      for (const item of Array.isArray(list) ? list : []) {
        const name = item && typeof item.name === 'string' ? item.name.trim() : '';
        const problem = fieldNameProblem(name);
        if (problem) throw new CredentialStoreError(`Field "${name}": ${problem}`, 'BAD_FIELD');
        if (seen.has(name.toLowerCase())) throw new CredentialStoreError(`Field "${name}" is listed twice`, 'BAD_FIELD');
        seen.add(name.toLowerCase());
        const value = item.value === undefined || item.value === null ? '' : String(item.value);
        if (value.length > MAX_FIELD_VALUE_LENGTH) throw new CredentialStoreError(`Field "${name}" is too long`, 'BAD_VALUE');
        if (!secret && /[\r\n]/.test(value)) throw new CredentialStoreError(`Field "${name}" must be one line`, 'BAD_VALUE');
        // A blank ordinary Field means "keep the saved one" for an existing
        // block (saveEntry resolves it) and is an error for a new one.
        into[name] = secret ? value : value.trim();
      }
    };
    take(input.fields, fields, false);
    take(input.secretFiles, secretFiles, true);
    if (seen.size > MAX_FIELDS_PER_ENTRY) throw new CredentialStoreError(`At most ${MAX_FIELDS_PER_ENTRY} extra fields per login`, 'BAD_FIELD');
    return { host, user, password, fields, secretFiles };
  }

  /**
   * Write a whole login at once: the Host block (User, IdentityFile, Field
   * and SecretFile lines) and the 0600 key files. `host` is a hostname, or
   * for a rotate the Host pattern of an existing block spelled as in the
   * config (`*.example.com` rotates that block in place; a pattern that
   * names no block is refused). The block whose patterns name `host` exactly
   * is rewritten in place (its comments, unknown lines, and patterns kept);
   * otherwise one is added at the top of the config (ahead of any wildcard
   * block that also covers it). For an existing block an empty password
   * keeps the key file, an empty secret keeps its file, and an empty
   * ordinary Field keeps its saved value; a SecretFile named before but
   * not now is removed with its key file. Every key file written must live
   * under the store's keys directory (a hand-edited IdentityFile elsewhere
   * refuses the whole save before anything is touched). The caller must
   * make sure no credential editor holds the config open. Returns names and
   * readiness only, never a value. On an existing entry, a blank username
   * keeps the saved username because metadata-only editors cannot read it.
   */
  function saveEntry(input) {
    const wanted = validateSaveInput(input);
    ensureStore();
    const existing = findExactBlock(readRawConfig(), wanted.host);
    if (!existing && !isValidHostname(wanted.host)) {
      throw new CredentialStoreError('host must be a hostname such as app.example.com (a Host pattern only names an existing login)', 'BAD_HOST');
    }
    if (existing && patternProblem(wanted.host)) {
      throw new CredentialStoreError(`Host pattern "${wanted.host}" ${patternProblem(wanted.host)}`, 'BAD_HOST_PATTERN');
    }

    // Validate every old reference before writing anything. Reads, rotations,
    // and deletes all apply the same store-owned, no-symlink boundary.
    const oldKeyPath = existing && existing.identityFile ? expandPath(existing.identityFile) : '';
    if (oldKeyPath) assertStoreKeyPath(oldKeyPath, 'IdentityFile');
    const previous = existing ? existing.secretFiles : {};
    const oldSecretPaths = Object.fromEntries(Object.entries(previous).map(([name, file]) => {
      const filePath = expandPath(file);
      assertStoreKeyPath(filePath, `SecretFile ${name}`);
      return [name, filePath];
    }));

    const baseSlug = slugForHost(wanted.host);
    let keyPath = oldKeyPath;
    const fresh = [];
    if (wanted.password.trim()) {
      keyPath = path.join(keysDir, uniqueSlug(baseSlug));
      fresh.push({ filePath: keyPath, value: wanted.password.trim() });
    } else if (!keyPath) {
      keyPath = path.join(keysDir, uniqueSlug(baseSlug));
      fresh.push({ filePath: keyPath, value: '' });
    } else if (!lstatMaybe(keyPath)) {
      fresh.push({ filePath: keyPath, value: '' });
    } else {
      assertKeyMode(keyPath);
    }

    const secretPlan = [];
    for (const [name, value] of Object.entries(wanted.secretFiles)) {
      const oldPath = oldSecretPaths[name] || '';
      const filePath = value.trim()
        ? path.join(keysDir, uniqueSlug(`${baseSlug}.${name}`))
        : oldPath || path.join(keysDir, uniqueSlug(`${baseSlug}.${name}`));
      assertStoreKeyPath(filePath, `SecretFile ${name}`);
      if (value.trim()) {
        fresh.push({ filePath, value: value.trim() });
      } else if (!lstatMaybe(filePath)) {
        fresh.push({ filePath, value: '' });
      } else {
        assertKeyMode(filePath);
      }
      secretPlan.push({ name, filePath, rendered: oldPath === filePath ? previous[name] : displayPath(filePath) });
    }
    const fields = {};
    for (const [name, value] of Object.entries(wanted.fields)) {
      if (value !== '') {
        fields[name] = value;
        continue;
      }
      const kept = existing && Object.prototype.hasOwnProperty.call(existing.fields, name) ? existing.fields[name] : '';
      if (!kept) throw new CredentialStoreError(`Field "${name}" is empty`, 'BAD_VALUE');
      fields[name] = kept;
    }

    const secretFiles = {};
    for (const { name, rendered } of secretPlan) {
      secretFiles[name] = rendered;
    }

    const identityFile = oldKeyPath === keyPath && existing?.identityFile ? existing.identityFile : displayPath(keyPath);
    const effectiveUser = wanted.user || existing?.user || '';
    const parts = { host: wanted.host, user: effectiveUser, identityFile, fields, secretFiles };
    const nextConfig = existing
      ? rewrittenBlockText(existing, parts)
      : prependedBlockText(renderBlock(parts, '\n'));

    const createdPaths = [];
    try {
      for (const item of fresh) {
        writeFreshSecretFile(item.filePath, item.value);
        createdPaths.push(item.filePath);
      }
      // Only after every fresh key is complete and verified do we publish a
      // config that refers to it.
      writeConfigLines([nextConfig]);
    } catch (error) {
      for (const filePath of createdPaths.reverse()) {
        try { removeStoreKey(filePath); } catch {}
      }
      throw error;
    }

    const obsolete = [];
    if (oldKeyPath && oldKeyPath !== keyPath) obsolete.push(oldKeyPath);
    for (const [name, oldPath] of Object.entries(oldSecretPaths)) {
      const current = secretPlan.find(item => item.name === name)?.filePath;
      if (oldPath !== current) obsolete.push(oldPath);
    }
    const stillReferenced = referencedKeyPaths();
    const cleanupPending = [];
    for (const filePath of obsolete) {
      if (stillReferenced.has(path.resolve(filePath))) continue;
      try { removeStoreKey(filePath); } catch { cleanupPending.push(path.basename(filePath)); }
    }

    const saved = findExactBlock(readConfig(), wanted.host);
    if (!saved) {
      return { created: !existing, ready: false, status: 'pending', keyStatus: 'no_match', host: wanted.host, hasUsername: Boolean(effectiveUser), patterns: [], fields: [], secretFiles: [] };
    }
    return {
      created: !existing,
      ...readinessOf(saved, wanted.host),
      ...(cleanupPending.length > 0 ? { cleanupPending } : {})
    };
  }

  /**
   * Remove the block whose patterns include `hostOrPattern` exactly, plus its
   * key files when they live under the store's keys directory and are not
   * referenced by another block. An external or symlinked path refuses the
   * whole operation. Never matches through a wildcard: deleting
   * `*.example.com` takes that pattern, not a host it covers.
   */
  function deleteEntry(hostOrPattern) {
    const wanted = normalizeHost(hostOrPattern);
    if (!wanted || /[\s]/.test(wanted)) throw new CredentialStoreError('host must be a Host pattern spelled as in the config', 'BAD_HOST');
    const block = findExactBlock(readRawConfig(), wanted);
    if (!block) throw new CredentialStoreError(`No saved login has the Host pattern ${wanted}`, 'NO_MATCH');
    const keyPath = keyPathFor(block);
    const keyPaths = [keyPath, ...Object.values(block.secretFiles).map(file => expandPath(file))].filter(Boolean);
    for (const filePath of keyPaths) assertStoreKeyPath(filePath, 'key file');

    // Publish the config removal first. If that atomic replacement fails, the
    // old config and all referenced keys remain intact.
    writeConfigLines([configWithoutBlock(block)]);

    const stillReferenced = referencedKeyPaths();
    const removed = [];
    const cleanupPending = [];
    for (const filePath of keyPaths) {
      if (stillReferenced.has(path.resolve(filePath))) continue;
      try {
        if (removeStoreKey(filePath)) removed.push(path.basename(filePath));
      } catch {
        cleanupPending.push(path.basename(filePath));
      }
    }
    return {
      deleted: true,
      patterns: [...block.patterns],
      removedKeys: removed,
      ...(cleanupPending.length > 0 ? { cleanupPending } : {})
    };
  }

  return {
    storeDir,
    configPath,
    keysDir,
    ensureStore,
    readConfig,
    readRawConfig,
    listEntries,
    ensureEntry,
    saveEntry,
    deleteEntry,
    isReady,
    fillSecretInto,
    expandPath,
    displayPath
  };
}

function resolveStoreDir(env = process.env, homeDir = os.homedir()) {
  const override = env && env.TABZ_HOME && env.TABZ_HOME.trim();
  return override ? path.resolve(override) : path.join(homeDir, DEFAULT_DIR_NAME);
}

/** The process default store; re-resolved per call so an env override applies. */
function getDefaultStore() {
  return createCredentialStore({ storeDir: resolveStoreDir() });
}

module.exports = {
  FIELDS,
  FIELD_NAME_PATTERN,
  isValidFieldName,
  fieldNameProblem,
  fieldNamesOf,
  KEY_MODE,
  DEFAULT_KEY_FILE_PREFIX,
  CredentialStoreError,
  createCredentialStore,
  getDefaultStore,
  resolveStoreDir,
  parseConfig,
  isCommentLine,
  matchHost,
  blockMatches,
  compilePattern,
  patternProblem,
  isUsableBlock,
  usableBlocks,
  normalizeSecretValue,
  chmodFix,
  warnedPatterns,
  slugForHost,
  isValidHostname,
  normalizeHost,
  shellQuote
};
