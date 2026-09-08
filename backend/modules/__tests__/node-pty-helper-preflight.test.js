import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { inspectNodePtySpawnHelpers, shellQuote } = require('../../../scripts/node-pty-helper-preflight.cjs');
const temporaryRoots = [];

function createHelperFixture(mode = 0o755, buildType = 'Release') {
  const backendDir = mkdtempSync(join(tmpdir(), 'tabz-node-pty-preflight-'));
  temporaryRoots.push(backendDir);
  const buildDir = join(backendDir, 'node_modules', 'node-pty', 'build', buildType);
  const helperPath = join(buildDir, 'spawn-helper');
  mkdirSync(join(helperPath, '..'), { recursive: true });
  writeFileSync(join(buildDir, 'pty.node'), 'synthetic native module');
  writeFileSync(helperPath, '#!/bin/sh\n');
  chmodSync(helperPath, mode);
  return { backendDir, helperPath };
}

afterEach(() => {
  while (temporaryRoots.length > 0) rmSync(temporaryRoots.pop(), { recursive: true, force: true });
});

describe('node-pty spawn-helper preflight', () => {
  it('does nothing outside macOS', () => {
    expect(inspectNodePtySpawnHelpers({ backendDir: '/unused', platform: 'linux' }))
      .toEqual({ status: 'not-applicable', helpers: [] });
  });

  it('accepts an executable helper in a synthetic macOS package tree', () => {
    const { backendDir, helperPath } = createHelperFixture(0o755);

    expect(inspectNodePtySpawnHelpers({ backendDir, platform: 'darwin' }))
      .toMatchObject({ status: 'ok', helperPath, buildType: 'Release' });
  });

  it('reports the exact non-executable helper without changing it', () => {
    const { backendDir, helperPath } = createHelperFixture(0o644);

    expect(inspectNodePtySpawnHelpers({ backendDir, platform: 'darwin' }))
      .toMatchObject({ status: 'not-executable', helperPath, buildType: 'Release' });
  });

  it('reports a missing helper from the supplied backend root', () => {
    const backendDir = mkdtempSync(join(tmpdir(), 'tabz-node-pty-preflight-'));
    temporaryRoots.push(backendDir);

    expect(inspectNodePtySpawnHelpers({ backendDir, platform: 'darwin' }))
      .toMatchObject({ status: 'missing-helper' });
  });

  it('uses Debug only when Release has no native module', () => {
    const { backendDir, helperPath } = createHelperFixture(0o755, 'Debug');

    expect(inspectNodePtySpawnHelpers({ backendDir, platform: 'darwin' }))
      .toMatchObject({ status: 'ok', helperPath, buildType: 'Debug' });
  });

  it('quotes local repair paths safely for Bash', () => {
    expect(shellQuote("/tmp/Tabz Chrome/$worker's helper")).toBe("'/tmp/Tabz Chrome/$worker'\"'\"'s helper'");
  });

  it('runs the macOS preflight after dependency recovery and before tmux launch', () => {
    const devScript = readFileSync(new URL('../../../scripts/dev.sh', import.meta.url), 'utf8');
    const backendInstall = devScript.indexOf('Installing backend dependencies...');
    const preflight = devScript.indexOf('node-pty-helper-preflight.cjs');
    const tmuxLaunch = devScript.indexOf('tmux -f "$TMUX_CONFIG" new-session');

    expect(backendInstall).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeGreaterThan(backendInstall);
    expect(tmuxLaunch).toBeGreaterThan(preflight);
  });
});
