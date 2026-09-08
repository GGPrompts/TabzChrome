const presetDefinitions = require('../../extension/shared/mcpPresetDefinitions.json');
// Committed build input generated from extension/shared/mcpTools.ts. Requiring
// it directly makes a stale or missing catalog fail during startup instead of
// deriving different presets from a loose runtime TypeScript parser.
const toolCatalog = require('../../extension/shared/mcpToolCatalog.json');

const CUSTOM_COLLISION_SUFFIX = '-custom';

function readMcpToolCatalog() {
  return toolCatalog.map(tool => ({ ...tool }));
}

function deriveBuiltInMcpPresets(tools = toolCatalog) {
  const catalogIds = new Set(tools.map(tool => tool.id));

  return Object.fromEntries(
    Object.entries(presetDefinitions).map(([slug, definition]) => {
      const explicitTools = Array.isArray(definition.tools) ? definition.tools : null;
      const selectedTools = explicitTools || tools
        .filter(tool => definition.categories?.includes(tool.category))
        .map(tool => tool.id);

      if (explicitTools) {
        const unknown = explicitTools.filter(tool => !catalogIds.has(tool));
        const duplicates = explicitTools.filter((tool, index) => explicitTools.indexOf(tool) !== index);
        if (unknown.length > 0 || duplicates.length > 0) {
          throw new Error(
            `Invalid built-in MCP preset "${slug}":` +
            `${unknown.length > 0 ? ` unknown tools ${unknown.join(', ')}` : ''}` +
            `${duplicates.length > 0 ? ` duplicate tools ${[...new Set(duplicates)].join(', ')}` : ''}`
          );
        }
      }

      return [slug, {
        ...definition,
        tools: [...selectedTools],
        builtIn: true,
        readOnly: true
      }];
    })
  );
}

function mergeMcpPresets(customPresets = {}) {
  const builtIns = deriveBuiltInMcpPresets();
  const entries = customPresets && typeof customPresets === 'object' && !Array.isArray(customPresets)
    ? Object.entries(customPresets)
    : [];
  const presets = {};
  const shadowed = [];

  for (const [slug, preset] of entries) {
    if (!builtIns[slug]) presets[slug] = preset;
  }

  for (const [slug, preset] of entries) {
    if (!builtIns[slug]) continue;
    shadowed.push(slug);

    let alias = `${slug}${CUSTOM_COLLISION_SUFFIX}`;
    let counter = 2;
    while (presets[alias] || builtIns[alias]) {
      alias = `${slug}${CUSTOM_COLLISION_SUFFIX}-${counter}`;
      counter++;
    }
    presets[alias] = { ...preset, shadowedBuiltIn: slug };
  }

  return { presets: { ...presets, ...builtIns }, shadowed };
}

function listMcpPresetSlugs(customPresets = {}) {
  return Object.keys(mergeMcpPresets(customPresets).presets);
}

module.exports = {
  CUSTOM_COLLISION_SUFFIX,
  deriveBuiltInMcpPresets,
  listMcpPresetSlugs,
  mergeMcpPresets,
  readMcpToolCatalog
};
