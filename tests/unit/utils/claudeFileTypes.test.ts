import { describe, it, expect } from 'vitest'
import {
  getClaudeFileType,
  shouldAlwaysShow,
  getSpecialFileEmoji,
  getClaudeFileColorClass,
  getClaudeFileColor,
  isPromptFile,
  isClaudeFile,
  claudeFileColors,
  filterDefinitions,
  ClaudeFileType,
} from '../../../extension/dashboard/utils/claudeFileTypes'

describe('claudeFileTypes', () => {
  describe('getClaudeFileType', () => {
    describe('CLAUDE.md files', () => {
      it('should detect CLAUDE.md as claude-config', () => {
        expect(getClaudeFileType('CLAUDE.md', '/project/CLAUDE.md')).toBe('claude-config')
      })

      it('should detect CLAUDE.local.md as claude-config', () => {
        expect(getClaudeFileType('CLAUDE.local.md', '/project/CLAUDE.local.md')).toBe('claude-config')
      })

      it('should detect case-insensitively', () => {
        expect(getClaudeFileType('claude.md', '/project/claude.md')).toBe('claude-config')
        expect(getClaudeFileType('Claude.MD', '/project/Claude.MD')).toBe('claude-config')
      })
    })

    describe('.claude directory', () => {
      it('should detect .claude directory as claude-config', () => {
        expect(getClaudeFileType('.claude', '/project/.claude')).toBe('claude-config')
      })

      it('should detect settings.json in .claude as claude-config', () => {
        expect(getClaudeFileType('settings.json', '/project/.claude/settings.json')).toBe('claude-config')
      })

      it('should not detect settings.json outside .claude', () => {
        expect(getClaudeFileType('settings.json', '/project/settings.json')).toBeNull()
      })
    })

    describe('.claude subdirectories', () => {
      it('should detect files in agents directory as agent', () => {
        expect(getClaudeFileType('code-review.md', '/project/.claude/agents/code-review.md')).toBe('agent')
      })

      it('should detect files in skills directory as skill', () => {
        expect(getClaudeFileType('git.md', '/project/.claude/skills/git.md')).toBe('skill')
      })

      it('should detect files in hooks directory as hook', () => {
        expect(getClaudeFileType('pre-commit.sh', '/project/.claude/hooks/pre-commit.sh')).toBe('hook')
      })

      it('should detect files in commands directory as command', () => {
        expect(getClaudeFileType('deploy.md', '/project/.claude/commands/deploy.md')).toBe('command')
      })
    })

    describe('MCP files', () => {
      it('should detect .mcp.json as mcp', () => {
        expect(getClaudeFileType('.mcp.json', '/project/.mcp.json')).toBe('mcp')
      })
    })

    describe('AGENTS.md', () => {
      it('should detect AGENTS.md as agent', () => {
        expect(getClaudeFileType('AGENTS.md', '/project/AGENTS.md')).toBe('agent')
      })
    })

    describe('.prompts', () => {
      it('should detect .prompts directory as prompt', () => {
        expect(getClaudeFileType('.prompts', '/home/user/.prompts')).toBe('prompt')
      })

      it('should detect .prompty files as prompt', () => {
        expect(getClaudeFileType('greeting.prompty', '/project/greeting.prompty')).toBe('prompt')
        expect(getClaudeFileType('test.PROMPTY', '/project/test.PROMPTY')).toBe('prompt')
      })

      it('should not color files inside .prompts directory', () => {
        // Files inside .prompts use normal colors (only .prompts folder itself is pink)
        expect(getClaudeFileType('my-prompt.md', '/project/.prompts/my-prompt.md')).toBeNull()
      })
    })

    describe('plugins', () => {
      it('should detect plugins directory as plugin', () => {
        expect(getClaudeFileType('plugins', '/project/plugins')).toBe('plugin')
      })

      it('should detect plugin.json in plugins as plugin', () => {
        expect(getClaudeFileType('plugin.json', '/project/plugins/my-plugin/plugin.json')).toBe('plugin')
      })

      it('should not detect plugin.json outside plugins', () => {
        expect(getClaudeFileType('plugin.json', '/project/plugin.json')).toBeNull()
      })
    })

    describe('Docker files', () => {
      it('should detect Dockerfile as docker', () => {
        expect(getClaudeFileType('Dockerfile', '/project/Dockerfile')).toBe('docker')
      })

      it('should detect Dockerfile.dev as docker', () => {
        expect(getClaudeFileType('Dockerfile.dev', '/project/Dockerfile.dev')).toBe('docker')
      })

      it('should detect docker-compose.yml as docker', () => {
        expect(getClaudeFileType('docker-compose.yml', '/project/docker-compose.yml')).toBe('docker')
      })

      it('should detect docker-compose.yaml as docker', () => {
        expect(getClaudeFileType('docker-compose.yaml', '/project/docker-compose.yaml')).toBe('docker')
      })

      it('should detect docker-compose.dev.yml as docker', () => {
        expect(getClaudeFileType('docker-compose.dev.yml', '/project/docker-compose.dev.yml')).toBe('docker')
      })

      it('should detect .dockerignore as docker', () => {
        expect(getClaudeFileType('.dockerignore', '/project/.dockerignore')).toBe('docker')
      })
    })

    describe('.gitignore', () => {
      it('should detect .gitignore as gitignore', () => {
        expect(getClaudeFileType('.gitignore', '/project/.gitignore')).toBe('gitignore')
      })
    })

    describe('environment files', () => {
      it('should detect .env as env', () => {
        expect(getClaudeFileType('.env', '/project/.env')).toBe('env')
      })

      it('should detect .env.local as env', () => {
        expect(getClaudeFileType('.env.local', '/project/.env.local')).toBe('env')
      })

      it('should detect .env.production as env', () => {
        expect(getClaudeFileType('.env.production', '/project/.env.production')).toBe('env')
      })

      it('should detect .env.development.local as env', () => {
        expect(getClaudeFileType('.env.development.local', '/project/.env.development.local')).toBe('env')
      })
    })

    describe('secrets/credentials files', () => {
      it('should detect .pem files as secrets', () => {
        expect(getClaudeFileType('private.pem', '/project/private.pem')).toBe('secrets')
      })

      it('should detect .key files as secrets', () => {
        expect(getClaudeFileType('server.key', '/project/server.key')).toBe('secrets')
      })

      it('should detect .crt files as secrets', () => {
        expect(getClaudeFileType('cert.crt', '/project/cert.crt')).toBe('secrets')
      })

      it('should detect .cer files as secrets', () => {
        expect(getClaudeFileType('cert.cer', '/project/cert.cer')).toBe('secrets')
      })

      it('should detect .pfx files as secrets', () => {
        expect(getClaudeFileType('cert.pfx', '/project/cert.pfx')).toBe('secrets')
      })

      it('should detect .p12 files as secrets', () => {
        expect(getClaudeFileType('cert.p12', '/project/cert.p12')).toBe('secrets')
      })

      it('should detect credentials file as secrets', () => {
        expect(getClaudeFileType('credentials', '/project/credentials')).toBe('secrets')
      })

      it('should detect secrets file as secrets', () => {
        expect(getClaudeFileType('secrets', '/project/secrets')).toBe('secrets')
      })

      it('should detect .secrets file as secrets', () => {
        expect(getClaudeFileType('.secrets', '/project/.secrets')).toBe('secrets')
      })

      it('should detect credentials.json as secrets', () => {
        expect(getClaudeFileType('credentials.json', '/project/credentials.json')).toBe('secrets')
      })
    })

    describe('non-claude files', () => {
      it('should return null for regular files', () => {
        expect(getClaudeFileType('index.ts', '/project/src/index.ts')).toBeNull()
        expect(getClaudeFileType('package.json', '/project/package.json')).toBeNull()
        expect(getClaudeFileType('README.md', '/project/README.md')).toBeNull()
      })
    })
  })

  describe('shouldAlwaysShow', () => {
    it('should always show .claude directory', () => {
      expect(shouldAlwaysShow('.claude', '/project/.claude')).toBe(true)
    })

    it('should always show .prompts directory', () => {
      expect(shouldAlwaysShow('.prompts', '/home/user/.prompts')).toBe(true)
    })

    it('should always show .obsidian directory', () => {
      expect(shouldAlwaysShow('.obsidian', '/vault/.obsidian')).toBe(true)
    })

    it('should always show .env files', () => {
      expect(shouldAlwaysShow('.env', '/project/.env')).toBe(true)
      expect(shouldAlwaysShow('.env.local', '/project/.env.local')).toBe(true)
      expect(shouldAlwaysShow('.env.production', '/project/.env.production')).toBe(true)
    })

    it('should always show .gitignore', () => {
      expect(shouldAlwaysShow('.gitignore', '/project/.gitignore')).toBe(true)
    })

    it('should always show .dockerignore', () => {
      expect(shouldAlwaysShow('.dockerignore', '/project/.dockerignore')).toBe(true)
    })

    it('should always show secrets files', () => {
      expect(shouldAlwaysShow('private.pem', '/project/private.pem')).toBe(true)
      expect(shouldAlwaysShow('server.key', '/project/server.key')).toBe(true)
      expect(shouldAlwaysShow('cert.crt', '/project/cert.crt')).toBe(true)
    })

    it('should not always show regular hidden files', () => {
      expect(shouldAlwaysShow('.eslintrc', '/project/.eslintrc')).toBe(false)
      expect(shouldAlwaysShow('.prettierrc', '/project/.prettierrc')).toBe(false)
      expect(shouldAlwaysShow('.git', '/project/.git')).toBe(false)
    })
  })

  describe('getSpecialFileEmoji', () => {
    it('should return docker emoji for docker files', () => {
      expect(getSpecialFileEmoji('Dockerfile', '/project/Dockerfile')).toBe('🐳')
      expect(getSpecialFileEmoji('docker-compose.yml', '/project/docker-compose.yml')).toBe('🐳')
    })

    it('should return lock emoji for env files', () => {
      expect(getSpecialFileEmoji('.env', '/project/.env')).toBe('🔒')
    })

    it('should return key emoji for secrets files', () => {
      expect(getSpecialFileEmoji('private.pem', '/project/private.pem')).toBe('🔑')
      expect(getSpecialFileEmoji('credentials', '/project/credentials')).toBe('🔑')
    })

    it('should return null for other files', () => {
      expect(getSpecialFileEmoji('CLAUDE.md', '/project/CLAUDE.md')).toBeNull()
      expect(getSpecialFileEmoji('.claude', '/project/.claude')).toBeNull()
      expect(getSpecialFileEmoji('index.ts', '/project/index.ts')).toBeNull()
    })
  })

  describe('getClaudeFileColorClass', () => {
    it('should return Tailwind class for claude-config', () => {
      expect(getClaudeFileColorClass('CLAUDE.md', '/project/CLAUDE.md')).toBe('text-orange-400')
    })

    it('should return Tailwind class for prompt', () => {
      expect(getClaudeFileColorClass('.prompts', '/home/.prompts')).toBe('text-pink-400')
    })

    it('should return Tailwind class for skill', () => {
      expect(getClaudeFileColorClass('git.md', '/project/.claude/skills/git.md')).toBe('text-teal-400')
    })

    it('should return Tailwind class for agent', () => {
      expect(getClaudeFileColorClass('AGENTS.md', '/project/AGENTS.md')).toBe('text-purple-400')
    })

    it('should return null for non-claude files', () => {
      expect(getClaudeFileColorClass('index.ts', '/project/index.ts')).toBeNull()
    })
  })

  describe('getClaudeFileColor', () => {
    it('should return dark color by default', () => {
      expect(getClaudeFileColor('CLAUDE.md', '/project/CLAUDE.md')).toBe('#FF8700')
    })

    it('should return light color when specified', () => {
      expect(getClaudeFileColor('CLAUDE.md', '/project/CLAUDE.md', false)).toBe('#D75F00')
    })

    it('should return dark color when specified', () => {
      expect(getClaudeFileColor('CLAUDE.md', '/project/CLAUDE.md', true)).toBe('#FF8700')
    })

    it('should return null for non-claude files', () => {
      expect(getClaudeFileColor('index.ts', '/project/index.ts')).toBeNull()
    })
  })

  describe('isPromptFile', () => {
    it('should match .prompty files', () => {
      expect(isPromptFile('greeting.prompty', '/project/greeting.prompty')).toBe(true)
    })

    it('should match .prompts directory', () => {
      expect(isPromptFile('.prompts', '/home/user/.prompts')).toBe(true)
    })

    it('should match files inside .prompts', () => {
      expect(isPromptFile('welcome.md', '/home/.prompts/welcome.md')).toBe(true)
    })

    it('should match command files in .claude/commands', () => {
      expect(isPromptFile('deploy.md', '/project/.claude/commands/deploy.md')).toBe(true)
    })

    it('should not match other files', () => {
      expect(isPromptFile('CLAUDE.md', '/project/CLAUDE.md')).toBe(false)
      expect(isPromptFile('index.ts', '/project/index.ts')).toBe(false)
    })
  })

  describe('isClaudeFile', () => {
    it('should match all claude ecosystem files', () => {
      expect(isClaudeFile('CLAUDE.md', '/project/CLAUDE.md')).toBe(true)
      expect(isClaudeFile('.claude', '/project/.claude')).toBe(true)
      expect(isClaudeFile('.mcp.json', '/project/.mcp.json')).toBe(true)
      expect(isClaudeFile('AGENTS.md', '/project/AGENTS.md')).toBe(true)
      expect(isClaudeFile('.prompts', '/home/.prompts')).toBe(true)
      expect(isClaudeFile('greeting.prompty', '/project/greeting.prompty')).toBe(true)
      expect(isClaudeFile('plugins', '/project/plugins')).toBe(true)
    })

    it('should match AI-relevant files', () => {
      expect(isClaudeFile('Dockerfile', '/project/Dockerfile')).toBe(true)
      expect(isClaudeFile('.gitignore', '/project/.gitignore')).toBe(true)
      expect(isClaudeFile('.env', '/project/.env')).toBe(true)
      expect(isClaudeFile('private.pem', '/project/private.pem')).toBe(true)
    })

    it('should not match regular files', () => {
      expect(isClaudeFile('index.ts', '/project/index.ts')).toBe(false)
      expect(isClaudeFile('package.json', '/project/package.json')).toBe(false)
    })
  })

  describe('claudeFileColors', () => {
    it('should have all required file types', () => {
      const expectedTypes: Array<Exclude<ClaudeFileType, null>> = [
        'claude-config',
        'prompt',
        'skill',
        'agent',
        'hook',
        'mcp',
        'command',
        'plugin',
        'obsidian-vault',
        'docker',
        'gitignore',
        'env',
        'secrets',
      ]

      expectedTypes.forEach((type) => {
        expect(claudeFileColors[type]).toBeDefined()
        expect(claudeFileColors[type]).toHaveProperty('light')
        expect(claudeFileColors[type]).toHaveProperty('dark')
        expect(claudeFileColors[type]).toHaveProperty('tailwind')
      })
    })

    it('should have valid color values', () => {
      Object.values(claudeFileColors).forEach((colors) => {
        expect(colors.light).toMatch(/^#[0-9A-F]{6}$/i)
        expect(colors.dark).toMatch(/^#[0-9A-F]{6}$/i)
        expect(colors.tailwind).toMatch(/^text-\w+-\d+$/)
      })
    })
  })

  describe('filterDefinitions', () => {
    it('should have prompts filter definition', () => {
      expect(filterDefinitions.prompts).toBeDefined()
      expect(filterDefinitions.prompts.label).toBe('Prompts')
      expect(filterDefinitions.prompts.icon).toBe('📝')
      expect(filterDefinitions.prompts.extensions).toContain('.prompty')
      expect(filterDefinitions.prompts.projectPaths).toContain('.prompts')
    })

    it('should have claude filter definition', () => {
      expect(filterDefinitions.claude).toBeDefined()
      expect(filterDefinitions.claude.label).toBe('Claude')
      expect(filterDefinitions.claude.icon).toBe('🤖')
      expect(filterDefinitions.claude.projectPaths).toContain('.claude')
      expect(filterDefinitions.claude.projectPaths).toContain('CLAUDE.md')
    })

    it('should have favorites filter definition', () => {
      expect(filterDefinitions.favorites).toBeDefined()
      expect(filterDefinitions.favorites.label).toBe('Favorites')
      expect(filterDefinitions.favorites.icon).toBe('⭐')
    })
  })
})
