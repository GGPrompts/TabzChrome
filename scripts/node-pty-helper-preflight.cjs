#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function inspectNodePtySpawnHelpers({ backendDir, platform = process.platform }) {
  if (platform !== 'darwin') {
    return { status: 'not-applicable', helpers: [] };
  }

  const nodePtyDir = path.resolve(backendDir, 'node_modules', 'node-pty');
  // node-pty 1.x loads Release first, then Debug only when its native module
  // is absent. Do not inspect unrelated prebuilds: they are not the helper
  // the installed loader will execute.
  const candidates = ['Release', 'Debug'].map(buildType => ({
    buildType,
    nativePath: path.join(nodePtyDir, 'build', buildType, 'pty.node'),
    helperPath: path.join(nodePtyDir, 'build', buildType, 'spawn-helper')
  }));
  const active = candidates.find(candidate => fs.existsSync(candidate.nativePath));

  if (!active || !fs.existsSync(active.helperPath)) {
    return { status: 'missing-helper', nodePtyDir, helperPath: active?.helperPath };
  }

  try {
    if ((fs.statSync(active.helperPath).mode & 0o111) === 0) {
      return { status: 'not-executable', helperPath: active.helperPath, buildType: active.buildType };
    }
  } catch {
    return { status: 'missing-helper', nodePtyDir, helperPath: active.helperPath };
  }

  return { status: 'ok', helperPath: active.helperPath, buildType: active.buildType };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\"'\"'")}'`;
}

function runCli({ backendDir = process.argv[2], platform = process.platform } = {}) {
  if (!backendDir) {
    console.error('node-pty helper preflight requires the backend directory');
    return 1;
  }

  const result = inspectNodePtySpawnHelpers({ backendDir, platform });
  if (result.status === 'not-applicable' || result.status === 'ok') return 0;

  if (result.status === 'not-executable') {
    console.error('node-pty spawn-helper is not executable; terminal launches would fail. Run:');
    console.error(`  chmod +x -- ${shellQuote(result.helperPath)}`);
    return 1;
  }

  console.error(`node-pty spawn-helper was not found under ${shellQuote(result.nodePtyDir)}.`);
  console.error(`Install the backend dependencies from ${shellQuote(path.resolve(backendDir))} and retry.`);
  return 1;
}

if (require.main === module) {
  process.exitCode = runCli();
}

module.exports = { inspectNodePtySpawnHelpers, runCli, shellQuote };
