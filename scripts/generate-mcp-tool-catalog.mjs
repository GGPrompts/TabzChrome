#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, '..');
const sourceGitPath = 'extension/shared/mcpTools.ts';
const outputGitPath = 'extension/shared/mcpToolCatalog.json';
const sourcePath = join(repoRoot, sourceGitPath);
const outputPath = join(repoRoot, outputGitPath);

function skipStringLiteral(source, openIndex) {
  const quote = source[openIndex];
  for (let index = openIndex + 1; index < source.length; index++) {
    if (source[index] === '\\') {
      index++;
      continue;
    }
    if (source[index] === quote) return index;
  }
  throw new Error(`Unterminated string literal at index ${openIndex} in mcpTools.ts`);
}

function extractArrayBody(source) {
  const marker = 'export const MCP_TOOLS: McpTool[] = [';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`Could not find "${marker}" in mcpTools.ts`);

  const bodyStart = start + marker.length;
  let depth = 1;
  for (let index = bodyStart; index < source.length; index++) {
    const character = source[index];
    if (character === "'" || character === '"' || character === '`') {
      index = skipStringLiteral(source, index);
      continue;
    }
    if (character === '[') depth++;
    if (character === ']') {
      depth--;
      if (depth === 0) return source.slice(bodyStart, index);
    }
  }
  throw new Error('Unterminated MCP_TOOLS array in mcpTools.ts');
}

function splitObjectLiterals(body) {
  const chunks = [];
  let depth = 0;
  let chunkStart = -1;

  for (let index = 0; index < body.length; index++) {
    const character = body[index];
    if (character === "'" || character === '"' || character === '`') {
      index = skipStringLiteral(body, index);
      continue;
    }
    if (character === '{') {
      if (depth === 0) chunkStart = index;
      depth++;
      continue;
    }
    if (character === '}') {
      depth--;
      if (depth === 0) chunks.push(body.slice(chunkStart, index + 1));
      if (depth < 0) throw new Error('Unbalanced braces in the MCP_TOOLS array');
    }
  }

  if (depth !== 0) throw new Error('Unbalanced braces in the MCP_TOOLS array');
  return chunks;
}

function readField(chunk, field) {
  const match = chunk.match(new RegExp(`(?:^|[{,\\s])${field}:\\s*'([^']*)'`));
  return match ? match[1] : null;
}

export function buildCatalog(source) {
  const chunks = splitObjectLiterals(extractArrayBody(source));
  const catalog = [];
  const seen = new Set();

  for (const chunk of chunks) {
    const id = readField(chunk, 'id');
    const category = readField(chunk, 'category');
    if (!id) throw new Error(`MCP tool entry has no id: ${chunk.slice(0, 120)}`);
    if (!category) throw new Error(`MCP tool "${id}" has no category; every tool must be categorized`);
    if (seen.has(id)) throw new Error(`Duplicate MCP tool id: ${id}`);
    seen.add(id);
    catalog.push({ id, category, locked: /(?:^|[{,\s])locked:\s*true/.test(chunk) });
  }

  if (catalog.length === 0) throw new Error('No MCP tools were read from mcpTools.ts');
  return catalog;
}

export function renderCatalog(source) {
  return Buffer.from(`${JSON.stringify(buildCatalog(source), null, 2)}\n`, 'utf8');
}

export function summarizeCatalogDiff(committed, generated, provenance) {
  const sharedLength = Math.min(committed.length, generated.length);
  let differenceIndex = sharedLength;
  for (let index = 0; index < sharedLength; index++) {
    if (committed[index] !== generated[index]) {
      differenceIndex = index;
      break;
    }
  }
  const scope = provenance ? `${provenance}: ` : '';
  return `${scope}MCP tool catalog is stale: first difference at byte ${differenceIndex + 1}; committed ${committed.length} bytes, generated ${generated.length} bytes. Run npm run generate:mcp-catalog.`;
}

export function assertCatalogCurrent(committed, generated, provenance) {
  if (!committed.equals(generated)) throw new Error(summarizeCatalogDiff(committed, generated, provenance));
}

function readFromHead(gitPath) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['show', `HEAD:${gitPath}`], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) return resolve(Buffer.concat(stdout));
      const detail = Buffer.concat(stderr).toString('utf8').trim();
      reject(new Error(`Could not read HEAD:${gitPath}${detail ? `: ${detail}` : ''}`));
    });
  });
}

function reportCheck(committed, generated, provenance, currentMessage) {
  try {
    assertCatalogCurrent(committed, generated, provenance);
    console.log(currentMessage);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function countTools(generated) {
  return JSON.parse(generated.toString('utf8')).length;
}

async function main() {
  const args = process.argv.slice(2);
  const checkHead = args.includes('--check');
  const checkWorktree = args.includes('--check-worktree');
  if (checkHead && checkWorktree) throw new Error('Pass either --check or --check-worktree, not both');

  if (checkHead) {
    const [headSource, committed] = await Promise.all([
      readFromHead(sourceGitPath),
      readFromHead(outputGitPath)
    ]);
    const generated = renderCatalog(headSource.toString('utf8'));
    reportCheck(
      committed,
      generated,
      `HEAD ${sourceGitPath} against HEAD ${outputGitPath}`,
      `MCP tool catalog is current at HEAD (${countTools(generated)} tools)`
    );
    return;
  }

  const source = readFileSync(sourcePath, 'utf8');
  const generated = renderCatalog(source);
  if (checkWorktree) {
    let onDisk;
    try {
      onDisk = readFileSync(outputPath);
    } catch (error) {
      throw new Error(`Could not read ${outputGitPath}: ${error.message}. Run npm run generate:mcp-catalog.`);
    }
    reportCheck(onDisk, generated, undefined, `MCP tool catalog is current (${countTools(generated)} tools)`);
    return;
  }

  writeFileSync(outputPath, generated);
  console.log(`Generated ${outputGitPath} (${countTools(generated)} tools)`);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
