/**
 * Template Extractor
 *
 * Extracts templates from similar failures to enable compression
 * by identifying common patterns and variable parts.
 *
 * @module TemplateExtractor
 */

import type { FailureTemplate, TemplateVariable, DuplicateEntry } from '../../types/deduplication.js'
import { levenshteinDistance } from '../algorithms/similarity.js'

/**
 * Template extraction options
 */
export interface TemplateExtractionOptions {
  maxVariables?: number
  minCommonLength?: number
  variableThreshold?: number
}

/**
 * Template segment
 */
interface TemplateSegment {
  type: 'static' | 'variable'
  content: string
  positions: number[]
  examples: string[]
}

/**
 * Template extractor implementation
 */
export class TemplateExtractor {
  private readonly defaultOptions: Required<TemplateExtractionOptions> = {
    maxVariables: 10,
    minCommonLength: 5,
    variableThreshold: 0.3
  }

  private options: Required<TemplateExtractionOptions>

  constructor(options?: TemplateExtractionOptions) {
    this.options = { ...this.defaultOptions, ...options }
  }

  /**
   * Extract a template from a group of similar failures
   */
  extractTemplate(failures: DuplicateEntry[]): FailureTemplate | null {
    if (failures.length < 2) {
      return null
    }

    // Extract templates from different failure components
    const errorTemplate = this.extractFromErrorMessages(failures)
    const stackTemplate = this.extractFromStackTraces(failures)
    const consoleTemplate = this.extractFromConsoleOutput(failures)

    // Combine templates
    const template = this.combineTemplates(errorTemplate, stackTemplate, consoleTemplate)

    if (!template) {
      return null
    }

    return {
      id: this.generateTemplateId(template),
      pattern: template.pattern,
      variables: template.variables,
      commonElements: template.commonElements,
      differingElements: template.differingElements
    }
  }

  /**
   * Extract template from error messages
   */
  private extractFromErrorMessages(failures: DuplicateEntry[]): FailureTemplate | null {
    const messages = failures.map((f) => f.errorMessage).filter((m): m is string => !!m)

    if (messages.length < 2) {
      return null
    }

    const segments = this.findCommonSegments(messages)
    return this.buildTemplate(segments, 'error')
  }

  /**
   * Extract template from stack traces
   */
  private extractFromStackTraces(failures: DuplicateEntry[]): FailureTemplate | null {
    const traces = failures.map((f) => f.stackTrace).filter((t): t is string => !!t)

    if (traces.length < 2) {
      return null
    }

    // Process stack traces line by line
    const lineArrays = traces.map((t) => t.split('\n'))
    const commonLines = this.findCommonLines(lineArrays)

    return this.buildStackTemplate(commonLines, lineArrays)
  }

  /**
   * Extract template from console output
   */
  private extractFromConsoleOutput(failures: DuplicateEntry[]): FailureTemplate | null {
    const outputs = failures
      .map((f) => f.consoleOutput)
      .filter((o): o is string[] => !!o && o.length > 0)

    if (outputs.length < 2) {
      return null
    }

    // Flatten console output
    const flatOutputs = outputs.map((o) => o.join('\n'))
    const segments = this.findCommonSegments(flatOutputs)

    return this.buildTemplate(segments, 'console')
  }

  /**
   * Find common segments in a list of strings
   */
  private findCommonSegments(strings: string[]): TemplateSegment[] {
    if (strings.length === 0) {
      return []
    }

    // Use the first string as reference
    const reference = strings[0]
    const segments: TemplateSegment[] = []

    // Find common prefixes and suffixes
    const commonPrefix = this.findCommonPrefix(strings)
    const commonSuffix = this.findCommonSuffix(strings)

    // Build segments

    // Add common prefix as static segment
    if (commonPrefix.length >= this.options.minCommonLength) {
      segments.push({
        type: 'static',
        content: commonPrefix,
        positions: [0],
        examples: [commonPrefix]
      })
      // Variable 'position' was assigned but never used, removing it
    }

    // Find variable parts in the middle
    const middleParts = strings.map((s) => {
      const start = commonPrefix.length
      const end = s.length - commonSuffix.length
      return s.substring(start, end)
    })

    if (middleParts.some((p) => p.length > 0)) {
      // Analyze middle parts for patterns
      const variableSegments = this.analyzeVariableParts(middleParts)
      segments.push(...variableSegments)
    }

    // Add common suffix as static segment
    if (commonSuffix.length >= this.options.minCommonLength) {
      segments.push({
        type: 'static',
        content: commonSuffix,
        positions: [reference.length - commonSuffix.length],
        examples: [commonSuffix]
      })
    }

    return segments
  }

  /**
   * Find common prefix in strings
   */
  private findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) return ''

    let prefix = ''
    const minLength = Math.min(...strings.map((s) => s.length))

    for (let i = 0; i < minLength; i++) {
      const char = strings[0][i]
      if (strings.every((s) => s[i] === char)) {
        prefix += char
      } else {
        break
      }
    }

    // Trim prefix to last complete word if needed
    // But keep the whole prefix if it ends with a space or quote
    const lastChar = prefix[prefix.length - 1]
    if (lastChar !== ' ' && lastChar !== '"' && lastChar !== "'") {
      const lastSpace = prefix.lastIndexOf(' ')
      if (lastSpace > 0) {
        // Only trim if we're not including a quote after the space
        const nextCharInOriginal = strings[0][prefix.length]
        if (nextCharInOriginal !== '"' && nextCharInOriginal !== "'") {
          prefix = prefix.substring(0, lastSpace)
        }
      }
    }

    return prefix
  }

  /**
   * Find common suffix in strings
   */
  private findCommonSuffix(strings: string[]): string {
    if (strings.length === 0) return ''

    const reversed = strings.map((s) => s.split('').reverse().join(''))
    const commonPrefix = this.findCommonPrefix(reversed)
    return commonPrefix.split('').reverse().join('')
  }

  /**
   * Analyze variable parts for patterns
   */
  private analyzeVariableParts(parts: string[]): TemplateSegment[] {
    const segments: TemplateSegment[] = []

    // Check if all parts match a pattern
    const patterns = [
      { name: 'number', regex: /^\d+$/, type: 'number' },
      { name: 'path', regex: /^[/\\].+/, type: 'path' },
      { name: 'identifier', regex: /^[a-zA-Z_]\w*$/, type: 'variable-name' },
      { name: 'string', regex: /^['"`].+['"`]$/, type: 'string' }
    ]

    for (const pattern of patterns) {
      if (parts.every((p) => pattern.regex.test(p))) {
        segments.push({
          type: 'variable',
          content: `<${pattern.name.toUpperCase()}>`,
          positions: [],
          examples: parts.slice(0, 3)
        })
        return segments
      }
    }

    // Default variable segment
    if (parts.length > 0) {
      segments.push({
        type: 'variable',
        content: '<VAR>',
        positions: [],
        examples: parts.slice(0, 3)
      })
    }

    return segments
  }

  /**
   * Find common lines in stack traces
   */
  private findCommonLines(lineArrays: string[][]): string[] {
    if (lineArrays.length === 0) return []

    const commonLines: string[] = []
    const minLength = Math.min(...lineArrays.map((a) => a.length))

    for (let i = 0; i < minLength; i++) {
      const referenceLine = this.normalizeStackLine(lineArrays[0][i])

      if (
        lineArrays.every((lines) => {
          const normalizedLine = this.normalizeStackLine(lines[i])
          return this.areStackLinesSimilar(referenceLine, normalizedLine)
        })
      ) {
        commonLines.push(referenceLine)
      }
    }

    return commonLines
  }

  /**
   * Normalize a stack trace line
   */
  private normalizeStackLine(line: string): string {
    return line
      .replace(/:\d+:\d+/g, ':<LINE>:<COL>') // Line and column numbers
      .replace(/\b\d+\b/g, '<NUM>') // Other numbers
      .replace(/\/[^/\s]+/g, (match) => {
        // Keep file name, replace path
        const parts = match.split('/')
        return `<PATH>/${parts[parts.length - 1]}`
      })
  }

  /**
   * Check if two stack lines are similar
   */
  private areStackLinesSimilar(a: string, b: string): boolean {
    if (a === b) return true

    // Calculate similarity
    const distance = levenshteinDistance(a, b)
    const maxLength = Math.max(a.length, b.length)
    const similarity = 1 - distance / maxLength

    return similarity >= 0.7
  }

  /**
   * Build a template from segments
   */
  private buildTemplate(segments: TemplateSegment[], source: string): FailureTemplate | null {
    if (segments.length === 0) {
      return null
    }

    const variables: TemplateVariable[] = []
    const commonElements: string[] = []
    const differingElements: string[] = []
    let pattern = ''
    let varIndex = 0

    for (const segment of segments) {
      if (segment.type === 'static') {
        pattern += segment.content
        // Add the full static content to common elements
        if (segment.content.length > 0) {
          commonElements.push(segment.content)
        }
      } else {
        const varName = `var${varIndex++}`
        pattern += `{{${varName}}}`

        variables.push({
          name: varName,
          type: this.detectVariableType(segment.examples),
          examples: segment.examples.slice(0, 3),
          position: pattern.length
        })

        differingElements.push(...segment.examples)
      }
    }

    // Don't create template if too many variables
    if (variables.length > this.options.maxVariables) {
      return null
    }

    return {
      id: `template-${source}-${Date.now()}`,
      pattern,
      variables,
      commonElements,
      differingElements: [...new Set(differingElements)].slice(0, 10)
    }
  }

  /**
   * Build a template from stack trace lines
   */
  private buildStackTemplate(
    commonLines: string[],
    lineArrays: string[][]
  ): FailureTemplate | null {
    if (commonLines.length === 0) {
      return null
    }

    const pattern = commonLines.join('\n')
    const variables: TemplateVariable[] = []

    // Find variable lines (lines that differ)
    const variableLineIndices: number[] = []
    const minLength = Math.min(...lineArrays.map((a) => a.length))

    for (let i = 0; i < minLength; i++) {
      const lines = lineArrays.map((arr) => arr[i])
      const normalized = lines.map((l) => this.normalizeStackLine(l))

      if (!normalized.every((l) => l === normalized[0])) {
        variableLineIndices.push(i)

        variables.push({
          name: `line${i}`,
          type: 'string',
          examples: lines.slice(0, 3),
          position: i
        })
      }
    }

    return {
      id: `stack-template-${Date.now()}`,
      pattern,
      variables,
      commonElements: commonLines,
      differingElements: variableLineIndices.map((i) => `Line ${i}`)
    }
  }

  /**
   * Detect the type of a variable from examples
   */
  private detectVariableType(examples: string[]): TemplateVariable['type'] {
    if (examples.every((e) => /^\d+$/.test(e))) {
      return 'number'
    }
    if (examples.every((e) => /^[/\\].+/.test(e))) {
      return 'path'
    }
    if (examples.every((e) => /^\d+$/.test(e))) {
      return 'line-number'
    }
    if (examples.every((e) => /^[a-zA-Z_]\w*$/.test(e))) {
      return 'variable-name'
    }
    return 'string'
  }

  /**
   * Combine multiple templates
   */
  private combineTemplates(
    error: FailureTemplate | null,
    stack: FailureTemplate | null,
    console: FailureTemplate | null
  ): FailureTemplate | null {
    const templates = [error, stack, console].filter((t): t is FailureTemplate => t !== null)

    if (templates.length === 0) {
      return null
    }

    // If only one template, return it
    if (templates.length === 1) {
      return templates[0]
    }

    // Combine multiple templates
    const combined: FailureTemplate = {
      id: `combined-${Date.now()}`,
      pattern: templates.map((t) => t.pattern).join('\n---\n'),
      variables: templates.flatMap((t) => t.variables),
      commonElements: templates.flatMap((t) => t.commonElements),
      differingElements: [...new Set(templates.flatMap((t) => t.differingElements))]
    }

    // Limit variables
    if (combined.variables.length > this.options.maxVariables) {
      combined.variables = combined.variables.slice(0, this.options.maxVariables)
    }

    return combined
  }

  /**
   * Generate a unique template ID
   */
  private generateTemplateId(template: FailureTemplate): string {
    const hash = this.simpleHash(template.pattern)
    return `template-${hash}-${Date.now()}`
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }
}
