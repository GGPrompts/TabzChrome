import { describe, it, expect } from 'vitest'
import { getFileTypeAndLanguage, FileType, FileTypeInfo } from '../../../extension/dashboard/utils/fileTypeUtils'

describe('fileTypeUtils', () => {
  describe('getFileTypeAndLanguage', () => {
    describe('special filenames', () => {
      it('should detect Dockerfile', () => {
        const result = getFileTypeAndLanguage('/project/Dockerfile')
        expect(result).toEqual({ type: 'code', language: 'dockerfile' })
      })

      it('should detect Dockerfile case-insensitively', () => {
        const result = getFileTypeAndLanguage('/project/dockerfile')
        expect(result).toEqual({ type: 'code', language: 'dockerfile' })
      })

      it('should detect Makefile', () => {
        const result = getFileTypeAndLanguage('/project/Makefile')
        expect(result).toEqual({ type: 'code', language: 'makefile' })
      })

      it('should detect GNUmakefile', () => {
        const result = getFileTypeAndLanguage('/project/GNUmakefile')
        expect(result).toEqual({ type: 'code', language: 'makefile' })
      })

      it('should detect gnumakefile case-insensitively', () => {
        const result = getFileTypeAndLanguage('/project/gnumakefile')
        expect(result).toEqual({ type: 'code', language: 'makefile' })
      })
    })

    describe('markdown files', () => {
      it('should detect .md files as markdown', () => {
        const result = getFileTypeAndLanguage('/project/README.md')
        expect(result).toEqual({ type: 'markdown', language: 'markdown' })
      })

      it('should detect .markdown files as markdown', () => {
        const result = getFileTypeAndLanguage('/project/docs/guide.markdown')
        expect(result).toEqual({ type: 'markdown', language: 'markdown' })
      })

      it('should detect markdown with uppercase extension', () => {
        const result = getFileTypeAndLanguage('/project/README.MD')
        expect(result).toEqual({ type: 'markdown', language: 'markdown' })
      })
    })

    describe('JSON files', () => {
      it('should detect .json files', () => {
        const result = getFileTypeAndLanguage('/project/package.json')
        expect(result).toEqual({ type: 'json', language: 'json' })
      })

      it('should detect nested JSON files', () => {
        const result = getFileTypeAndLanguage('/project/config/settings.json')
        expect(result).toEqual({ type: 'json', language: 'json' })
      })
    })

    describe('image files', () => {
      const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp']

      imageExtensions.forEach((ext) => {
        it(`should detect .${ext} files as image`, () => {
          const result = getFileTypeAndLanguage(`/project/logo.${ext}`)
          expect(result).toEqual({ type: 'image' })
        })
      })

      it('should detect uppercase image extensions', () => {
        const result = getFileTypeAndLanguage('/project/photo.PNG')
        expect(result).toEqual({ type: 'image' })
      })
    })

    describe('video files', () => {
      const videoExtensions = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv', 'm4v']

      videoExtensions.forEach((ext) => {
        it(`should detect .${ext} files as video`, () => {
          const result = getFileTypeAndLanguage(`/project/demo.${ext}`)
          expect(result).toEqual({ type: 'video' })
        })
      })
    })

    describe('CSV files', () => {
      it('should detect .csv files', () => {
        const result = getFileTypeAndLanguage('/project/data.csv')
        expect(result).toEqual({ type: 'csv' })
      })
    })

    describe('code files with syntax highlighting', () => {
      const codeTestCases: Array<{ ext: string; language: string }> = [
        { ext: 'js', language: 'javascript' },
        { ext: 'jsx', language: 'jsx' },
        { ext: 'ts', language: 'typescript' },
        { ext: 'tsx', language: 'tsx' },
        { ext: 'py', language: 'python' },
        { ext: 'rb', language: 'ruby' },
        { ext: 'java', language: 'java' },
        { ext: 'cpp', language: 'cpp' },
        { ext: 'c', language: 'c' },
        { ext: 'cs', language: 'csharp' },
        { ext: 'php', language: 'php' },
        { ext: 'go', language: 'go' },
        { ext: 'rs', language: 'rust' },
        { ext: 'swift', language: 'swift' },
        { ext: 'kt', language: 'kotlin' },
        { ext: 'scala', language: 'scala' },
        { ext: 'r', language: 'r' },
        { ext: 'sql', language: 'sql' },
        { ext: 'sh', language: 'bash' },
        { ext: 'bash', language: 'bash' },
        { ext: 'zsh', language: 'bash' },
        { ext: 'fish', language: 'bash' },
        { ext: 'ps1', language: 'powershell' },
        { ext: 'css', language: 'css' },
        { ext: 'scss', language: 'scss' },
        { ext: 'sass', language: 'sass' },
        { ext: 'less', language: 'less' },
        { ext: 'html', language: 'html' },
        { ext: 'xml', language: 'xml' },
        { ext: 'yaml', language: 'yaml' },
        { ext: 'yml', language: 'yaml' },
        { ext: 'toml', language: 'toml' },
        { ext: 'ini', language: 'ini' },
        { ext: 'conf', language: 'ini' },
        { ext: 'vue', language: 'javascript' },
        { ext: 'lua', language: 'lua' },
        { ext: 'perl', language: 'perl' },
        { ext: 'elm', language: 'elm' },
        { ext: 'clj', language: 'clojure' },
        { ext: 'ex', language: 'elixir' },
        { ext: 'exs', language: 'elixir' },
        { ext: 'erl', language: 'erlang' },
        { ext: 'hs', language: 'haskell' },
        { ext: 'ml', language: 'ocaml' },
        { ext: 'fs', language: 'fsharp' },
        { ext: 'dart', language: 'dart' },
        { ext: 'graphql', language: 'graphql' },
        { ext: 'gql', language: 'graphql' },
        { ext: 'vim', language: 'vim' },
        { ext: 'tex', language: 'latex' },
        { ext: 'diff', language: 'diff' },
        { ext: 'patch', language: 'diff' },
      ]

      codeTestCases.forEach(({ ext, language }) => {
        it(`should detect .${ext} files as code with language "${language}"`, () => {
          const result = getFileTypeAndLanguage(`/project/file.${ext}`)
          expect(result).toEqual({ type: 'code', language })
        })
      })
    })

    describe('plain text fallback', () => {
      it('should return text type for unknown extensions', () => {
        const result = getFileTypeAndLanguage('/project/file.xyz')
        expect(result).toEqual({ type: 'text' })
      })

      it('should return text type for files without extension', () => {
        const result = getFileTypeAndLanguage('/project/LICENSE')
        expect(result).toEqual({ type: 'text' })
      })

      it('should return text type for .txt files', () => {
        const result = getFileTypeAndLanguage('/project/notes.txt')
        expect(result).toEqual({ type: 'text' })
      })
    })

    describe('edge cases', () => {
      it('should handle deeply nested paths', () => {
        const result = getFileTypeAndLanguage('/a/b/c/d/e/f/g/file.ts')
        expect(result).toEqual({ type: 'code', language: 'typescript' })
      })

      it('should handle files with multiple dots', () => {
        const result = getFileTypeAndLanguage('/project/config.dev.json')
        expect(result).toEqual({ type: 'json', language: 'json' })
      })

      it('should handle files starting with dot', () => {
        const result = getFileTypeAndLanguage('/project/.eslintrc.js')
        expect(result).toEqual({ type: 'code', language: 'javascript' })
      })

      it('should handle empty path', () => {
        const result = getFileTypeAndLanguage('')
        expect(result).toEqual({ type: 'text' })
      })

      it('should handle filename only (no path)', () => {
        const result = getFileTypeAndLanguage('script.py')
        expect(result).toEqual({ type: 'code', language: 'python' })
      })
    })
  })
})
