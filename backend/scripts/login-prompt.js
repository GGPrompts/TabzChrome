#!/usr/bin/env node
/**
 * Protected terminal fallback for saving a login. The terminal is created by
 * the credential route with the registry's secret capability, and this script
 * writes through the same store API as the extension Logins page. It never
 * prints an entered value.
 */

const readline = require('readline');
const path = require('path');
const { createCredentialStore, resolveStoreDir, CredentialStoreError } = require('../modules/credential-store');

function parseArgs(argv) {
  const args = { host: '', store: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--host') args.host = argv[index + 1] || '';
    if (argv[index] === '--store') args.store = argv[index + 1] || '';
  }
  return args;
}

/** Queue piped input so answers arriving before a question are retained. */
function createLineQueue(rl) {
  const lines = [];
  const waiters = [];
  let closed = false;
  const deliver = () => {
    while (waiters.length > 0 && (lines.length > 0 || closed)) {
      waiters.shift()(lines.length > 0 ? lines.shift() : '');
    }
  };
  rl.on('line', line => {
    lines.push(line);
    deliver();
  });
  rl.on('close', () => {
    closed = true;
    deliver();
  });
  return () => new Promise(resolve => {
    waiters.push(resolve);
    deliver();
  });
}

function ask(rl, question, { hidden = false } = {}) {
  return new Promise(resolve => {
    if (process.stdin.isTTY !== true) {
      process.stdout.write(question);
      rl.nextLine().then(resolve);
      return;
    }
    if (!hidden) {
      rl.question(question, resolve);
      return;
    }
    const output = rl.output;
    const originalWrite = rl._writeToOutput;
    output.write(question);
    rl._writeToOutput = () => {};
    rl.question('', answer => {
      rl._writeToOutput = originalWrite;
      output.write('\n');
      resolve(answer);
    });
  });
}

function safeErrorMessage(error) {
  return error instanceof CredentialStoreError ? error.message : 'The saved login could not be written';
}

async function main() {
  const { host, store: storeArg } = parseArgs(process.argv.slice(2));
  if (!host) {
    process.stderr.write('usage: login-prompt.js --host <hostname> [--store <dir>]\n');
    return 2;
  }

  const storeDir = storeArg ? path.resolve(storeArg) : resolveStoreDir();
  const store = createCredentialStore({ storeDir });
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY === true
  });
  if (process.stdin.isTTY !== true) rl.nextLine = createLineQueue(rl);
  const out = text => process.stdout.write(text);

  out(`Saving the login for ${host} into ${storeDir}\n`);
  out('Values entered here are written only to the local Tabz credential store.\n\n');

  const user = (await ask(rl, 'Username: ')).trim();
  const password = await ask(rl, 'Password (hidden): ', { hidden: true });
  const fields = [];
  const secretFiles = [];

  out('\nExtra fields can hold an organization id or login-type selection.\n');
  out('Type name=value, secret:name for another hidden value, or leave blank to finish.\n');
  for (;;) {
    const line = (await ask(rl, 'Extra field name=value, blank to finish: ')).trim();
    if (!line) break;
    const secretMatch = line.match(/^secret:([^=\s]+)$/);
    if (secretMatch) {
      const value = await ask(rl, `Value for ${secretMatch[1]} (hidden): `, { hidden: true });
      secretFiles.push({ name: secretMatch[1], value });
      continue;
    }
    const equals = line.indexOf('=');
    if (equals <= 0) {
      out('  Use name=value (or secret:name).\n');
      continue;
    }
    fields.push({ name: line.slice(0, equals).trim(), value: line.slice(equals + 1) });
  }
  rl.close();

  try {
    const result = store.saveEntry({ host, user, password, fields, secretFiles });
    const names = ['username', 'password', ...result.fields, ...result.secretFiles];
    out(`\nSaved ${result.host}: ${names.join(', ')}.\nSaved. Close this terminal.\n`);
    return 0;
  } catch (error) {
    out(`\nNot saved: ${safeErrorMessage(error)}\n`);
    return 1;
  }
}

main()
  .then(code => { process.exitCode = code; })
  .catch(error => {
    process.stderr.write(`Not saved: ${safeErrorMessage(error)}\n`);
    process.exitCode = 1;
  });
