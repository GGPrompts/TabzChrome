import { describe, it, expect } from 'vitest'
import {
  parsePrompty,
  substituteVariables,
  isPromptyFile,
  getPromptForSending,
  parseContentToSegments,
  getFieldProgress,
  ParsedPrompty,
  ContentSegment,
} from '../../../extension/dashboard/utils/promptyUtils'

describe('promptyUtils', () => {
  describe('parsePrompty', () => {
    it('should parse content without frontmatter', () => {
      const raw = 'Hello {{name}}, welcome to {{place}}!'
      const result = parsePrompty(raw)

      expect(result.frontmatter).toEqual({})
      expect(result.content).toBe(raw)
      expect(result.variables).toEqual(['name', 'place'])
    })

    it('should parse content with frontmatter', () => {
      const raw = `---
name: Greeting
description: A simple greeting prompt
---
Hello {{name}}!`
      const result = parsePrompty(raw)

      expect(result.frontmatter).toEqual({
        name: 'Greeting',
        description: 'A simple greeting prompt',
      })
      expect(result.content).toBe('Hello {{name}}!')
      expect(result.variables).toEqual(['name'])
    })

    it('should handle multiple YAML fields', () => {
      const raw = `---
name: Test
description: Test desc
author: John
version: 1.0
---
Content here`
      const result = parsePrompty(raw)

      expect(result.frontmatter).toEqual({
        name: 'Test',
        description: 'Test desc',
        author: 'John',
        version: '1.0',
      })
    })

    it('should deduplicate variables', () => {
      const raw = 'Hello {{name}}! Bye {{name}}!'
      const result = parsePrompty(raw)

      expect(result.variables).toEqual(['name'])
    })

    it('should handle content with no variables', () => {
      const raw = `---
name: Static
---
This is just static text.`
      const result = parsePrompty(raw)

      expect(result.variables).toEqual([])
      expect(result.content).toBe('This is just static text.')
    })

    it('should handle multiline content', () => {
      const raw = `---
name: Multiline
---
Line 1
Line 2 with {{var1}}
Line 3 with {{var2}}`
      const result = parsePrompty(raw)

      expect(result.content).toContain('Line 1')
      expect(result.content).toContain('Line 2')
      expect(result.content).toContain('Line 3')
      expect(result.variables).toEqual(['var1', 'var2'])
    })

    it('should handle empty frontmatter', () => {
      // Empty frontmatter with blank line between delimiters
      const raw = `---

---
Just content`
      const result = parsePrompty(raw)

      expect(result.frontmatter).toEqual({})
      // The regex captures content after the closing --- delimiter
      expect(result.content).toBe('Just content')
    })

    it('should treat no-newline frontmatter as plain content', () => {
      // Without a newline between delimiters, regex doesn't match
      // so entire content is treated as-is (no frontmatter parsing)
      const raw = `---
---
Just content`
      const result = parsePrompty(raw)

      // No match means frontmatter stays empty and content is raw
      expect(result.frontmatter).toEqual({})
      expect(result.content).toBe(raw)
    })

    it('should handle Windows-style line endings', () => {
      const raw = '---\r\nname: Test\r\n---\r\nContent with {{var}}'
      const result = parsePrompty(raw)

      expect(result.frontmatter).toEqual({ name: 'Test' })
      expect(result.content).toBe('Content with {{var}}')
      expect(result.variables).toEqual(['var'])
    })

    it('should handle trailing whitespace in YAML values', () => {
      const raw = `---
name: Test Name
description: Test description
---
Content`
      const result = parsePrompty(raw)

      expect(result.frontmatter.name).toBe('Test Name')
      expect(result.frontmatter.description).toBe('Test description')
    })
  })

  describe('substituteVariables', () => {
    it('should substitute single variable', () => {
      const content = 'Hello {{name}}!'
      const values = { name: 'World' }
      const result = substituteVariables(content, values)

      expect(result).toBe('Hello World!')
    })

    it('should substitute multiple different variables', () => {
      const content = 'Hello {{name}}, welcome to {{place}}!'
      const values = { name: 'Alice', place: 'Wonderland' }
      const result = substituteVariables(content, values)

      expect(result).toBe('Hello Alice, welcome to Wonderland!')
    })

    it('should substitute same variable multiple times', () => {
      const content = '{{word}} {{word}} {{word}}'
      const values = { word: 'Ho' }
      const result = substituteVariables(content, values)

      expect(result).toBe('Ho Ho Ho')
    })

    it('should leave unmatched variables unchanged', () => {
      const content = 'Hello {{name}} and {{other}}!'
      const values = { name: 'Alice' }
      const result = substituteVariables(content, values)

      expect(result).toBe('Hello Alice and {{other}}!')
    })

    it('should handle empty values object', () => {
      const content = 'Hello {{name}}!'
      const result = substituteVariables(content, {})

      expect(result).toBe('Hello {{name}}!')
    })

    it('should handle empty content', () => {
      const result = substituteVariables('', { name: 'Test' })

      expect(result).toBe('')
    })

    it('should handle special regex characters in values', () => {
      const content = 'Pattern: {{pattern}}'
      const values = { pattern: '$100 (50% off)' }
      const result = substituteVariables(content, values)

      expect(result).toBe('Pattern: $100 (50% off)')
    })
  })

  describe('isPromptyFile', () => {
    it('should return true for .prompty files', () => {
      expect(isPromptyFile('/path/to/file.prompty')).toBe(true)
    })

    it('should return true for .PROMPTY files (case insensitive)', () => {
      expect(isPromptyFile('/path/to/file.PROMPTY')).toBe(true)
    })

    it('should return true for .Prompty files (mixed case)', () => {
      expect(isPromptyFile('/path/to/file.Prompty')).toBe(true)
    })

    it('should return false for non-prompty files', () => {
      expect(isPromptyFile('/path/to/file.txt')).toBe(false)
      expect(isPromptyFile('/path/to/file.md')).toBe(false)
      expect(isPromptyFile('/path/to/file.json')).toBe(false)
    })

    it('should return false for files with prompty in the name but different extension', () => {
      expect(isPromptyFile('/path/to/prompty.txt')).toBe(false)
      expect(isPromptyFile('/path/to/my-prompty-file.json')).toBe(false)
    })

    it('should handle paths without directories', () => {
      expect(isPromptyFile('file.prompty')).toBe(true)
      expect(isPromptyFile('file.txt')).toBe(false)
    })
  })

  describe('getPromptForSending', () => {
    it('should strip frontmatter and substitute variables', () => {
      const raw = `---
name: Greeting
---
Hello {{name}}!`
      const variables = { name: 'World' }
      const result = getPromptForSending(raw, variables)

      expect(result).toBe('Hello World!')
    })

    it('should work with no frontmatter', () => {
      const raw = 'Hello {{name}}!'
      const variables = { name: 'World' }
      const result = getPromptForSending(raw, variables)

      expect(result).toBe('Hello World!')
    })

    it('should preserve content when no variables provided', () => {
      const raw = `---
name: Test
---
Static content here.`
      const result = getPromptForSending(raw, {})

      expect(result).toBe('Static content here.')
    })
  })

  describe('parseContentToSegments', () => {
    it('should parse simple text without fields', () => {
      const content = 'Just plain text'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([{ type: 'text', content: 'Just plain text' }])
    })

    it('should parse text with a single field', () => {
      const content = 'Hello {{name}}!'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([
        { type: 'text', content: 'Hello ' },
        { type: 'field', content: 'name', hint: undefined },
        { type: 'text', content: '!' },
      ])
    })

    it('should parse field with hint', () => {
      const content = 'Enter {{name:Your full name}}'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([
        { type: 'text', content: 'Enter ' },
        { type: 'field', content: 'name', hint: 'Your full name' },
      ])
    })

    it('should handle multiple fields', () => {
      const content = '{{greeting}} {{name}}, welcome!'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([
        { type: 'field', content: 'greeting', hint: undefined },
        { type: 'text', content: ' ' },
        { type: 'field', content: 'name', hint: undefined },
        { type: 'text', content: ', welcome!' },
      ])
    })

    it('should handle fields at start and end', () => {
      const content = '{{start}} middle {{end}}'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([
        { type: 'field', content: 'start', hint: undefined },
        { type: 'text', content: ' middle ' },
        { type: 'field', content: 'end', hint: undefined },
      ])
    })

    it('should handle adjacent fields', () => {
      const content = '{{a}}{{b}}{{c}}'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([
        { type: 'field', content: 'a', hint: undefined },
        { type: 'field', content: 'b', hint: undefined },
        { type: 'field', content: 'c', hint: undefined },
      ])
    })

    it('should trim whitespace in field names and hints', () => {
      const content = '{{ name : hint here }}'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([
        { type: 'field', content: 'name', hint: 'hint here' },
      ])
    })

    it('should handle empty content', () => {
      const segments = parseContentToSegments('')

      expect(segments).toEqual([])
    })

    it('should handle content that is just a field', () => {
      const content = '{{onlyField}}'
      const segments = parseContentToSegments(content)

      expect(segments).toEqual([
        { type: 'field', content: 'onlyField', hint: undefined },
      ])
    })
  })

  describe('getFieldProgress', () => {
    it('should return 100% for empty variables array', () => {
      const result = getFieldProgress([], {})

      expect(result).toEqual({ filled: 0, total: 0, percentage: 100 })
    })

    it('should return 0% when no variables filled', () => {
      const variables = ['name', 'place']
      const values = {}
      const result = getFieldProgress(variables, values)

      expect(result).toEqual({ filled: 0, total: 2, percentage: 0 })
    })

    it('should return 50% when half variables filled', () => {
      const variables = ['name', 'place']
      const values = { name: 'Alice' }
      const result = getFieldProgress(variables, values)

      expect(result).toEqual({ filled: 1, total: 2, percentage: 50 })
    })

    it('should return 100% when all variables filled', () => {
      const variables = ['name', 'place']
      const values = { name: 'Alice', place: 'Wonderland' }
      const result = getFieldProgress(variables, values)

      expect(result).toEqual({ filled: 2, total: 2, percentage: 100 })
    })

    it('should ignore empty string values', () => {
      const variables = ['name', 'place']
      const values = { name: 'Alice', place: '' }
      const result = getFieldProgress(variables, values)

      expect(result).toEqual({ filled: 1, total: 2, percentage: 50 })
    })

    it('should ignore whitespace-only values', () => {
      const variables = ['name', 'place']
      const values = { name: 'Alice', place: '   ' }
      const result = getFieldProgress(variables, values)

      expect(result).toEqual({ filled: 1, total: 2, percentage: 50 })
    })

    it('should round percentage correctly', () => {
      const variables = ['a', 'b', 'c']
      const values = { a: 'filled' }
      const result = getFieldProgress(variables, values)

      expect(result).toEqual({ filled: 1, total: 3, percentage: 33 })
    })

    it('should handle extra values not in variables', () => {
      const variables = ['name']
      const values = { name: 'Alice', extra: 'ignored' }
      const result = getFieldProgress(variables, values)

      expect(result).toEqual({ filled: 1, total: 1, percentage: 100 })
    })
  })
})
