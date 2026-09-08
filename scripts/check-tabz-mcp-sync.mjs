import { constants } from 'node:fs'
import { access, readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const projectRoot = process.cwd()
const sourceRoot = path.join(projectRoot, 'tabz-mcp-server')
const pluginRoot = path.join(projectRoot, 'plugins', 'tabz', 'tabz-mcp-server')

async function exists(target) {
  try {
    await access(target, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function listFiles(root, relativeDir = '') {
  const directory = path.join(root, relativeDir)
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = path.join(relativeDir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, relativePath))
    } else if (entry.isFile()) {
      files.push(relativePath.split(path.sep).join('/'))
    } else {
      throw new Error(`Unsupported entry in MCP copy: ${path.join(root, relativePath)}`)
    }
  }

  return files
}

async function compareDirectory(scope) {
  const source = path.join(sourceRoot, scope)
  const plugin = path.join(pluginRoot, scope)
  const sourceExists = await exists(source)
  const pluginExists = await exists(plugin)

  if (!sourceExists && !pluginExists && scope === 'dist') {
    return { scope, skipped: true, files: 0 }
  }

  if (!sourceExists || !pluginExists) {
    throw new Error(`${scope}/ exists in only one MCP tree`)
  }

  const sourceFiles = await listFiles(source)
  const pluginFiles = await listFiles(plugin)
  const allPaths = [...new Set([...sourceFiles, ...pluginFiles])].sort()
  const differences = []

  for (const relativePath of allPaths) {
    if (!sourceFiles.includes(relativePath)) {
      differences.push(`only in plugin ${scope}/: ${relativePath}`)
      continue
    }
    if (!pluginFiles.includes(relativePath)) {
      differences.push(`only in root ${scope}/: ${relativePath}`)
      continue
    }

    const [sourceContents, pluginContents] = await Promise.all([
      readFile(path.join(source, relativePath)),
      readFile(path.join(plugin, relativePath)),
    ])
    if (!sourceContents.equals(pluginContents)) {
      differences.push(`content differs in ${scope}/: ${relativePath}`)
    }
  }

  if (differences.length > 0) {
    throw new Error(`MCP copy is out of sync:\n${differences.map((item) => `  ${item}`).join('\n')}`)
  }

  return { scope, skipped: false, files: sourceFiles.length }
}

try {
  const results = []
  for (const scope of ['src', 'dist']) {
    results.push(await compareDirectory(scope))
  }

  for (const file of ['package.json', 'package-lock.json', 'tsconfig.json']) {
    const [source, plugin] = await Promise.all([
      readFile(path.join(sourceRoot, file)), readFile(path.join(pluginRoot, file)),
    ])
    if (!source.equals(plugin)) throw new Error(`MCP copy is out of sync: ${file}`)
  }

  const summary = results
    .map(({ scope, skipped, files }) => skipped ? `${scope}/ not built` : `${scope}/ ${files} files`)
    .join(', ')
  console.log(`Tabz MCP copy is in sync (${summary}).`)
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
