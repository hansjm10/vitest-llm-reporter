/**
 * Error-Focused Truncation Strategy
 *
 * Specialized strategy that prioritizes error messages, assertions,
 * and failure information while minimizing less critical content.
 * Ideal for debugging test failures by preserving the most relevant
 * error context and diagnostic information.
 */

import type {
  ITruncationStrategy,
  TruncationContext,
  TruncationConfig,
  TruncationResult,
  ContentType,
  ErrorFocusedOptions
} from '../types.js'

/**
 * Default configuration for error-focused truncation
 */
const DEFAULT_ERROR_CONFIG: Required<ErrorFocusedOptions> = {
  errorPatterns: [
    'Error:', 'AssertionError:', 'TypeError:', 'ReferenceError:',
    'SyntaxError:', 'RangeError:', 'EvalError:', 'URIError:',
    'Failed:', 'Expected:', 'Actual:', 'Received:', 'Diff:',
    '✗', '❌', '×', 'FAIL', 'FAILED'
  ],
  assertionPatterns: [
    'expect(', 'expect.', 'assert(', 'assert.',
    'should', 'toBe', 'toEqual', 'toMatch', 'toContain',
    'toHaveBeenCalled', 'toThrow', 'toReject',
    'not.toBe', 'not.toEqual', 'not.toMatch'
  ],
  errorContextLines: 3,
  preserveErrorChains: true,
  maxLines: 100,
  preserveLines: true,
  minPreserve: 150,
  priorityKeywords: [
    'error', 'fail', 'expect', 'actual', 'received',
    'diff', 'assertion', 'mismatch', 'undefined',
    'null', 'missing', 'invalid', 'timeout'
  ],
  priorityMarkers: {
    error: ['Error:', 'Failed:', '✗', '❌', 'FAIL'],
    assertion: ['expect(', 'assert(', 'should', 'toBe', 'toEqual'],
    userCode: ['src/', 'test/', 'spec/']
  }
}

/**
 * Error-focused truncation strategy implementation
 */
export class ErrorFocusedStrategy implements ITruncationStrategy {
  public readonly name = 'error-focused'
  public readonly description = 'Prioritizes error messages, assertions, and failure information'

  /**
   * Truncate content with focus on error information
   */
  async truncate(
    content: string,
    context: TruncationContext,
    config?: TruncationConfig
  ): Promise<TruncationResult> {
    const startTime = Date.now()
    const originalSize = content.length

    // If content is already small enough, don't truncate
    if (originalSize <= context.targetSize) {
      return {
        content,
        wasTruncated: false,
        finalSize: originalSize,
        originalSize,
        ratio: 1,
        strategy: this.name,
        performance: {
          duration: Date.now() - startTime
        }
      }
    }

    // Merge configuration
    const mergedConfig = this.mergeConfig(config)

    // If content is too small to meaningfully analyze, preserve it
    if (originalSize <= mergedConfig.minPreserve) {
      return {
        content,
        wasTruncated: false,
        finalSize: originalSize,
        originalSize,
        ratio: 1,
        strategy: this.name,
        performance: {
          duration: Date.now() - startTime
        }
      }
    }

    try {
      // Identify and prioritize error-related content
      const truncatedContent = this.extractErrorFocusedContent(content, context.targetSize, mergedConfig)

      const finalSize = truncatedContent.length
      const duration = Date.now() - startTime

      return {
        content: truncatedContent,
        wasTruncated: finalSize < originalSize,
        finalSize,
        originalSize,
        ratio: finalSize / originalSize,
        strategy: this.name,
        performance: {
          duration
        }
      }
    } catch (error) {
      // Fallback to simple truncation if analysis fails
      const fallbackContent = content.substring(0, context.targetSize - 3) + '...'
      const duration = Date.now() - startTime

      return {
        content: fallbackContent,
        wasTruncated: true,
        finalSize: fallbackContent.length,
        originalSize,
        ratio: fallbackContent.length / originalSize,
        strategy: `${this.name}-fallback`,
        performance: {
          duration
        }
      }
    }
  }

  /**
   * Estimate truncation result without performing it
   */
  async estimate(
    content: string,
    context: TruncationContext,
    config?: TruncationConfig
  ): Promise<Pick<TruncationResult, 'finalSize' | 'ratio' | 'wasTruncated'>> {
    const originalSize = content.length

    if (originalSize <= context.targetSize) {
      return {
        finalSize: originalSize,
        ratio: 1,
        wasTruncated: false
      }
    }

    const mergedConfig = this.mergeConfig(config)

    if (originalSize <= mergedConfig.minPreserve) {
      return {
        finalSize: originalSize,
        ratio: 1,
        wasTruncated: false
      }
    }

    // Quick estimate based on error content density
    const lines = content.split('\n')
    const errorLines = this.identifyErrorLines(lines, mergedConfig)
    const contextLines = errorLines.length * (mergedConfig.errorContextLines * 2 + 1)
    const avgLineLength = originalSize / lines.length
    const estimatedSize = Math.min(contextLines * avgLineLength, context.targetSize)

    return {
      finalSize: estimatedSize,
      ratio: estimatedSize / originalSize,
      wasTruncated: estimatedSize < originalSize
    }
  }

  /**
   * Check if strategy supports content type
   */
  supports(contentType: ContentType): boolean {
    // Error-focused strategy is ideal for error messages, assertions, and stack traces
    return ['error-message', 'assertion', 'stack-trace', 'console-output'].includes(contentType)
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): TruncationConfig {
    return { ...DEFAULT_ERROR_CONFIG }
  }

  /**
   * Extract error-focused content from input
   */
  private extractErrorFocusedContent(
    content: string,
    targetSize: number,
    config: Required<ErrorFocusedOptions>
  ): string {
    const lines = content.split('\n')
    const errorSections: ErrorSection[] = []

    // Phase 1: Identify error lines
    const errorLines = this.identifyErrorLines(lines, config)

    // Phase 2: Build error sections with context
    for (const errorLineIndex of errorLines) {
      const section = this.buildErrorSection(lines, errorLineIndex, config)
      errorSections.push(section)
    }

    // Phase 3: Merge overlapping sections
    const mergedSections = this.mergeOverlappingSections(errorSections)

    // Phase 4: Select sections that fit within target size
    const selectedSections = this.selectSectionsToFit(mergedSections, targetSize)

    // Phase 5: Combine sections into final content
    return this.combineSections(selectedSections, lines)
  }

  /**
   * Identify lines containing error information
   */
  private identifyErrorLines(
    lines: string[],
    config: Required<ErrorFocusedOptions>
  ): number[] {
    const errorLines: number[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      // Check error patterns
      if (this.matchesErrorPatterns(line, config.errorPatterns)) {
        errorLines.push(i)
        continue
      }

      // Check assertion patterns
      if (this.matchesAssertionPatterns(line, config.assertionPatterns)) {
        errorLines.push(i)
        continue
      }

      // Check priority keywords
      if (this.containsPriorityKeywords(line, config.priorityKeywords)) {
        errorLines.push(i)
        continue
      }

      // Check priority markers
      if (this.containsPriorityMarkers(line, config.priorityMarkers)) {
        errorLines.push(i)
        continue
      }
    }

    return errorLines
  }

  /**
   * Build an error section with context around an error line
   */
  private buildErrorSection(
    lines: string[],
    errorLineIndex: number,
    config: Required<ErrorFocusedOptions>
  ): ErrorSection {
    const contextLines = config.errorContextLines
    const startLine = Math.max(0, errorLineIndex - contextLines)
    const endLine = Math.min(lines.length - 1, errorLineIndex + contextLines)

    const sectionLines = lines.slice(startLine, endLine + 1)
    const content = sectionLines.join('\n')
    
    // Calculate priority based on error type and content
    let priority = 1.0

    // Higher priority for direct error messages
    if (this.matchesErrorPatterns(lines[errorLineIndex], config.errorPatterns)) {
      priority += 0.5
    }

    // Higher priority for assertions
    if (this.matchesAssertionPatterns(lines[errorLineIndex], config.assertionPatterns)) {
      priority += 0.3
    }

    // Higher priority for user code
    if (this.containsPriorityMarkers(lines[errorLineIndex], { userCode: config.priorityMarkers.userCode })) {
      priority += 0.2
    }

    return {
      startLine,
      endLine,
      errorLine: errorLineIndex,
      content,
      priority,
      size: content.length
    }
  }

  /**
   * Merge overlapping error sections
   */
  private mergeOverlappingSections(sections: ErrorSection[]): ErrorSection[] {
    if (sections.length <= 1) return sections

    // Sort by start line
    const sortedSections = sections.sort((a, b) => a.startLine - b.startLine)
    const merged: ErrorSection[] = []
    let current = sortedSections[0]

    for (let i = 1; i < sortedSections.length; i++) {
      const next = sortedSections[i]

      // Check for overlap or adjacency
      if (next.startLine <= current.endLine + 1) {
        // Merge sections
        const mergedContent = this.mergeSectionContent(current, next)
        current = {
          startLine: current.startLine,
          endLine: Math.max(current.endLine, next.endLine),
          errorLine: current.errorLine, // Keep the first error line
          content: mergedContent,
          priority: Math.max(current.priority, next.priority),
          size: mergedContent.length
        }
      } else {
        // No overlap, save current and move to next
        merged.push(current)
        current = next
      }
    }

    merged.push(current)
    return merged
  }

  /**
   * Merge content from two overlapping sections
   */
  private mergeSectionContent(section1: ErrorSection, section2: ErrorSection): string {
    const lines1 = section1.content.split('\n')
    const lines2 = section2.content.split('\n')

    // Find the overlap and merge without duplication
    const overlapStart = Math.max(0, section2.startLine - section1.startLine)
    const section1EndRelative = section1.endLine - section1.startLine
    
    if (overlapStart <= section1EndRelative) {
      // There is overlap
      const beforeOverlap = lines1.slice(0, overlapStart)
      const afterOverlap = lines2
      return [...beforeOverlap, ...afterOverlap].join('\n')
    } else {
      // Adjacent but not overlapping
      return lines1.concat(lines2).join('\n')
    }
  }

  /**
   * Select sections that fit within the target size
   */
  private selectSectionsToFit(sections: ErrorSection[], targetSize: number): ErrorSection[] {
    // Sort by priority (highest first)
    const sortedSections = sections.sort((a, b) => b.priority - a.priority)
    const selected: ErrorSection[] = []
    let currentSize = 0
    const separatorSize = 4 // Size of "...\n" separator

    for (const section of sortedSections) {
      const sectionWithSeparator = section.size + (selected.length > 0 ? separatorSize : 0)

      if (currentSize + sectionWithSeparator <= targetSize) {
        selected.push(section)
        currentSize += sectionWithSeparator
      } else {
        // Try to fit a truncated version
        const remainingSpace = targetSize - currentSize - separatorSize
        if (remainingSpace > 50) { // Only if there's meaningful space
          const truncatedContent = section.content.substring(0, remainingSpace - 3) + '...'
          selected.push({
            ...section,
            content: truncatedContent,
            size: truncatedContent.length
          })
        }
        break
      }
    }

    return selected
  }

  /**
   * Combine selected sections into final content
   */
  private combineSections(sections: ErrorSection[], originalLines: string[]): string {
    if (sections.length === 0) {
      // Fallback: return first few lines if no error sections found
      const fallbackLines = originalLines.slice(0, 10)
      return fallbackLines.join('\n')
    }

    // Sort sections by original line order
    const sortedSections = sections.sort((a, b) => a.startLine - b.startLine)
    const result: string[] = []
    let lastEndLine = -1

    for (const section of sortedSections) {
      // Add separator if there's a gap
      if (lastEndLine !== -1 && section.startLine > lastEndLine + 1) {
        result.push('...')
      }

      result.push(section.content)
      lastEndLine = section.endLine
    }

    return result.join('\n')
  }

  /**
   * Check if line matches error patterns
   */
  private matchesErrorPatterns(line: string, patterns: string[]): boolean {
    return patterns.some(pattern => 
      line.toLowerCase().includes(pattern.toLowerCase())
    )
  }

  /**
   * Check if line matches assertion patterns
   */
  private matchesAssertionPatterns(line: string, patterns: string[]): boolean {
    return patterns.some(pattern => line.includes(pattern))
  }

  /**
   * Check if line contains priority keywords
   */
  private containsPriorityKeywords(line: string, keywords: string[]): boolean {
    const lowerLine = line.toLowerCase()
    return keywords.some(keyword => 
      lowerLine.includes(keyword.toLowerCase())
    )
  }

  /**
   * Check if line contains priority markers
   */
  private containsPriorityMarkers(
    line: string, 
    markers: Record<string, string[]>
  ): boolean {
    return Object.values(markers)
      .flat()
      .some(marker => line.includes(marker))
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config?: TruncationConfig): Required<ErrorFocusedOptions> {
    return {
      ...DEFAULT_ERROR_CONFIG,
      ...config,
      errorPatterns: [
        ...DEFAULT_ERROR_CONFIG.errorPatterns,
        ...(config?.priorityKeywords || [])
      ],
      priorityKeywords: [
        ...DEFAULT_ERROR_CONFIG.priorityKeywords,
        ...(config?.priorityKeywords || [])
      ],
      priorityMarkers: {
        error: [
          ...DEFAULT_ERROR_CONFIG.priorityMarkers.error,
          ...(config?.priorityMarkers?.error || [])
        ],
        assertion: [
          ...DEFAULT_ERROR_CONFIG.priorityMarkers.assertion,
          ...(config?.priorityMarkers?.assertion || [])
        ],
        userCode: [
          ...DEFAULT_ERROR_CONFIG.priorityMarkers.userCode,
          ...(config?.priorityMarkers?.userCode || [])
        ]
      }
    } as Required<ErrorFocusedOptions>
  }
}

/**
 * Error section information
 */
interface ErrorSection {
  /** Start line index */
  startLine: number
  /** End line index */
  endLine: number
  /** Line index of the error */
  errorLine: number
  /** Section content */
  content: string
  /** Priority score (higher = more important) */
  priority: number
  /** Content size in characters */
  size: number
}