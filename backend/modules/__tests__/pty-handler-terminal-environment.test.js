import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('module');
const originalLoad = Module._load;
const originalTmux = process.env.TMUX;
const originalTmuxPane = process.env.TMUX_PANE;
const originalShell = process.env.SHELL;

let execCalls = [];
let ptyCalls = [];
let sourceFileFails = false;
let launchFails = false;
let sessionExists = false;
let attachFails = false;

const fakePty = {
  spawn(command, args, options) {
    ptyCalls.push({ command, args, options });
    if (command === 'tmux' && attachFails) throw new Error('attach failed');
    return {
      pid: 4242,
      killed: false,
      onData: () => {},
      onExit: () => {},
      write: () => {},
      kill: () => {}
    };
  }
};

const fakeChildProcess = {
  execFileSync(command, args, options) {
    execCalls.push({ command, args, options });
    if (args.includes('has-session')) {
      if (sessionExists) return '';
      throw new Error('session not found');
    }
    if (args.includes('new-session') && launchFails) throw new Error('new-session failed');
    if (args.includes('source-file') && sourceFileFails) {
      const error = new Error('optional config feature is unavailable');
      error.stderr = Buffer.from('missing optional plugin');
      throw error;
    }
    return '';
  }
};

Module._load = function loadTerminalDependencies(request, parent, isMain) {
  if (request === 'node-pty') return fakePty;
  if (request === 'child_process' || request === 'node:child_process') return fakeChildProcess;
  return originalLoad.call(this, request, parent, isMain);
};

delete require.cache[require.resolve('../pty-handler')];
const ptyHandler = require('../pty-handler');

beforeEach(() => {
  execCalls = [];
  ptyCalls = [];
  sourceFileFails = false;
  launchFails = false;
  sessionExists = false;
  attachFails = false;
  ptyHandler.processes.clear();
  ptyHandler.autoExecuteCommand = vi.fn();
});

afterAll(() => {
  Module._load = originalLoad;
  delete require.cache[require.resolve('../pty-handler')];
  if (originalTmux === undefined) delete process.env.TMUX; else process.env.TMUX = originalTmux;
  if (originalTmuxPane === undefined) delete process.env.TMUX_PANE; else process.env.TMUX_PANE = originalTmuxPane;
  if (originalShell === undefined) delete process.env.SHELL; else process.env.SHELL = originalShell;
});

function createTmuxTerminal(overrides = {}) {
  return ptyHandler.createPTY({
    id: 'ctt-terminal-test',
    name: 'Terminal Test',
    terminalType: 'bash',
    useTmux: true,
    workingDir: '/tmp/Tabz Terminal Workspace',
    ...overrides
  });
}

describe('PTY terminal environment boundaries', () => {
  it("uses tmux's loaded config path and a conditional TPM initializer", () => {
    const tmuxConfig = readFileSync(new URL('../../../.tmux-terminal-tabs.conf', import.meta.url), 'utf8');

    expect(tmuxConfig).toContain('source-file "#{config_files}"');
    expect(tmuxConfig).not.toContain('~/projects/TabzChrome/.tmux-terminal-tabs.conf');
    expect(tmuxConfig).toContain('if-shell "test -f ~/.tmux/plugins/tpm/tpm"');
  });

  it('switches the current tmux client instead of creating a nested attach', () => {
    const devScript = readFileSync(new URL('../../../scripts/dev.sh', import.meta.url), 'utf8');

    expect(devScript).toContain('if [ -n "${TMUX:-}" ]; then');
    expect(devScript).toContain('tmux switch-client -t "$SESSION_NAME"');
  });

  it('removes inherited tmux identity before attaching a terminal', () => {
    process.env.TMUX = '/tmp/tmux-100/default,123,0';
    process.env.TMUX_PANE = '%9';

    createTmuxTerminal();

    const attach = ptyCalls.find(call => call.command === 'tmux');
    expect(attach.args).toEqual(['attach-session', '-t', '=ctt-terminal-test']);
    expect(attach.options.cwd).toBe('/tmp/Tabz Terminal Workspace');
    expect(attach.options.env).not.toHaveProperty('TMUX');
    expect(attach.options.env).not.toHaveProperty('TMUX_PANE');
    expect(execCalls.find(call => call.args.includes('new-session')).args)
      .toEqual(expect.arrayContaining(['-c', '/tmp/Tabz Terminal Workspace']));
  });

  it('continues after an optional tmux config source failure', () => {
    sourceFileFails = true;

    const terminal = createTmuxTerminal();

    expect(terminal.tmuxSession).toBe('ctt-terminal-test');
    expect(ptyCalls).toHaveLength(1);
    expect(execCalls.some(call => call.args.join(' ') ===
      'set-option -t =ctt-terminal-test remain-on-exit off')).toBe(true);
  });

  it('still reports a real tmux launch failure', () => {
    launchFails = true;

    expect(() => createTmuxTerminal()).toThrow('Failed to create PTY process: Failed to create tmux session: new-session failed');
    expect(ptyCalls).toHaveLength(0);
  });

  it('still reports a real tmux attach failure', () => {
    attachFails = true;

    expect(() => createTmuxTerminal()).toThrow('Failed to create PTY process: attach failed');
    expect(ptyCalls).toHaveLength(1);
  });

  it('uses the cleaned environment when reconnecting to an existing session', () => {
    process.env.TMUX = '/tmp/tmux-100/default,123,0';
    process.env.TMUX_PANE = '%9';
    sessionExists = true;

    const terminal = createTmuxTerminal({ sessionName: 'existing terminal' });

    expect(terminal.tmuxSession).toBe('existing terminal');
    expect(execCalls.some(call => call.args.includes('new-session'))).toBe(false);
    expect(ptyCalls[0].options.env).not.toHaveProperty('TMUX');
    expect(ptyCalls[0].options.env).not.toHaveProperty('TMUX_PANE');
  });

  it('keeps Bash as the non-tmux shell even when SHELL names another shell', () => {
    process.env.SHELL = '/bin/zsh';

    ptyHandler.createPTY({
      id: 'ctt-bash-test',
      name: 'Bash Test',
      terminalType: 'bash',
      useTmux: false,
      workingDir: '/tmp/Tabz Terminal Workspace'
    });

    expect(ptyCalls).toHaveLength(1);
    expect(ptyCalls[0].command).toBe('bash');
    expect(ptyCalls[0].args).toEqual(['-i']);
    expect(ptyCalls[0].options.cwd).toBe('/tmp/Tabz Terminal Workspace');
  });
});
