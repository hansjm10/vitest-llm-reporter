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
  TruncationResult,
  ContentType
} from '../types'
import { getTokenCounter } from '../../tokenization/TokenCounter'

/**
 * Error-focused truncation strategy implementation
 */
export class ErrorFocusedStrategy implements ITruncationStrategy {
  public readonly name = 'error-focused'
  public readonly priority = 5

  private readonly errorPatterns = [
    'Error:', 'AssertionError:', 'TypeError:', 'ReferenceError:',
    'SyntaxError:', 'RangeError:', 'EvalError:', 'URIError:',
    'Failed:', 'Expected:', 'Actual:', 'Received:', 'Diff:',
    '✗', '❌', '×', 'FAIL', 'FAILED'
  ]

  private readonly assertionPatterns = [
    'expect(', 'expect.', 'assert(', 'assert.',
    'should', 'toBe', 'toEqual', 'toMatch', 'toContain',
    'toHaveBeenCalled', 'toThrow', 'toReject',
    'not.toBe', 'not.toEqual', 'not.toMatch'
  ]

  /**
   * Truncate content with focus on error information
   */
  async truncate(
    content: string,
    maxTokens: number,
    context: TruncationContext
  ): Promise<TruncationResult> {
    const tokenCounter = getTokenCounter()
    const originalTokens = await tokenCounter.countTokens(content, context.model)

    // If content is already within limits, don't truncate
    if (originalTokens <= maxTokens) {
      return {
        content,
        tokenCount: originalTokens,
        tokensSaved: 0,
        wasTruncated: false,
        strategyUsed: this.name
      }
    }

    try {
      // Extract error-focused content
      const truncatedContent = await this.extractErrorFocusedContent(content, maxTokens, context)
      const finalTokens = await tokenCounter.countTokens(truncatedContent, context.model)

      return {
        content: truncatedContent,
        tokenCount: finalTokens,
        tokensSaved: originalTokens - finalTokens,
        wasTruncated: true,
        strategyUsed: this.name
      }
    } catch (error) {
      // Fallback to simple truncation if analysis fails
      const lines = content.split('\n')
      const maxLines = Math.min(15, lines.length)
      const fallbackContent = lines.slice(0, maxLines).join('\n')
      
      const fallbackTokens = await tokenCounter.countTokens(fallbackContent, context.model)

      return {
        content: fallbackContent,
        tokenCount: fallbackTokens,
        tokensSaved: originalTokens - fallbackTokens,
        wasTruncated: true,
        strategyUsed: `${this.name}-fallback`,
        warnings: ['Error analysis failed, used fallback truncation']
      }
    }
  }

  /**
   * Check if strategy can handle the given content
   */
  canTruncate(content: string, context: TruncationContext): boolean {
    // Error-focused strategy is ideal for error messages, test results, and logs
    return ['error', 'test', 'log'].includes(context.contentType)
  }

  /**
   * Estimate potential token savings
   */
  async estimateSavings(
    content: string,
    maxTokens: number,
    context: TruncationContext
  ): Promise<number> {
    const tokenCounter = getTokenCounter()
    const originalTokens = await tokenCounter.countTokens(content, context.model)

    if (originalTokens <= maxTokens) {
      return 0
    }

    // Estimate based on error content density
    const lines = content.split('\n')
    const errorLines = this.identifyErrorLines(lines)
    
    // Estimate that we preserve error lines + context (typically 40-60% of content)
    const errorRatio = errorLines.length / lines.length
    const estimatedPreservedRatio = Math.min(0.7, errorRatio * 2 + 0.3)
    
    const estimatedPreserved = Math.floor(originalTokens * estimatedPreservedRatio)
    const estimatedFinal = Math.min(estimatedPreserved, maxTokens)
    
    return Math.max(0, originalTokens - estimatedFinal)
  }

  /**
   * Extract error-focused content from input
   */
  private async extractErrorFocusedContent(
    content: string,
    maxTokens: number,
    context: TruncationContext
  ): Promise<string> {
    const lines = content.split('\n')
    const tokenCounter = getTokenCounter()

    // Identify error-related lines
    const errorLines = this.identifyErrorLines(lines)
    
    // Build error sections with context
    const errorSections = this.buildErrorSections(lines, errorLines)

    // Select sections that fit within token limit
    const selectedSections = await this.selectSectionsToFit(errorSections, maxTokens, context)

    // Combine sections into final content
    return this.combineSections(selectedSections, lines)
  }

  /**
   * Identify lines containing error information
   */
  private identifyErrorLines(lines: string[]): number[] {
    const errorLines: number[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (this.matchesErrorPatterns(line) || 
          this.matchesAssertionPatterns(line) ||
          this.containsImportantKeywords(line)) {
        errorLines.push(i)
      }
    }

    return errorLines
  }

  /**
   * Build error sections with context around error lines
   */
  private buildErrorSections(lines: string[], errorLines: number[]): ErrorSection[] {
    const sections: ErrorSection[] = []
    const contextLines = 2 // Lines of context around errors

    for (const errorLineIndex of errorLines) {
      const startLine = Math.max(0, errorLineIndex - contextLines)
      const endLine = Math.min(lines.length - 1, errorLineIndex + contextLines)

      const sectionLines = lines.slice(startLine, endLine + 1)
      const content = sectionLines.join('\n')
      
      // Calculate priority based on error type
      let priority = 1.0

      // Higher priority for direct error messages
      if (this.matchesErrorPatterns(lines[errorLineIndex])) {
        priority += 0.5
      }

      // Higher priority for assertions
      if (this.matchesAssertionPatterns(lines[errorLineIndex])) {
        priority += 0.3
      }

      // Higher priority for user code references
      if (this.containsUserCode(lines[errorLineIndex])) {
        priority += 0.2
      }

      sections.push({
        startLine,
        endLine,
        errorLine: errorLineIndex,
        content,
        priority,
        size: content.length
      })
    }

    return this.mergeOverlappingSections(sections)
  }

  /**
   * Merge overlapping error sections
   */
  private mergeOverlappingSections(sections: ErrorSection[]): ErrorSection[] {
    if (sections.length <= 1) return sections

    const sortedSections = sections.sort((a, b) => a.startLine - b.startLine)
    const merged: ErrorSection[] = []
    let current = sortedSections[0]

    for (let i = 1; i < sortedSections.length; i++) {
      const next = sortedSections[i]

      if (next.startLine <= current.endLine + 1) {
        // Merge sections
        const mergedContent = this.mergeSectionContent(current, next, current.endLine - current.startLine + 1)
        current = {
          startLine: current.startLine,
          endLine: Math.max(current.endLine, next.endLine),
          errorLine: current.errorLine,
          content: mergedContent,
          priority: Math.max(current.priority, next.priority),
          size: mergedContent.length
        }
      } else {
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
  private mergeSectionContent(section1: ErrorSection, section2: ErrorSection, section1Length: number): string {
    const lines1 = section1.content.split('\n')
    const lines2 = section2.content.split('\n')

    const overlapStart = Math.max(0, section2.startLine - section1.startLine)
    
    if (overlapStart < section1Length) {
      // There is overlap
      const beforeOverlap = lines1.slice(0, overlapStart)
      return [...beforeOverlap, ...lines2].join('\n')
    } else {
      // Adjacent sections
      return [...lines1, ...lines2].join('\n')
    }
  }

  /**
   * Select sections that fit within the token limit
   */
  private async selectSectionsToFit(
    sections: ErrorSection[],
    maxTokens: number,
    context: TruncationContext
  ): Promise<ErrorSection[]> {
    const tokenCounter = getTokenCounter()
    const sortedSections = sections.sort((a, b) => b.priority - a.priority)
    const selected: ErrorSection[] = []
    let currentTokens = 0

    for (const section of sortedSections) {
      const sectionTokens = await tokenCounter.countTokens(section.content, context.model)
      
      if (currentTokens + sectionTokens <= maxTokens) {
        selected.push(section)
        currentTokens += sectionTokens
      } else {
        // Try to fit a truncated version
        const remainingTokens = maxTokens - currentTokens
        if (remainingTokens > 50) { // Only if there's meaningful space
          const truncatedContent = section.content.substring(0, remainingTokens * 4 - 10) + '...'
          const truncatedTokens = await tokenCounter.countTokens(truncatedContent, context.model)
          
          if (truncatedTokens <= remainingTokens) {
            selected.push({
              ...section,
              content: truncatedContent,
              size: truncatedContent.length
            })
          }
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
      return originalLines.slice(0, 10).join('\n')
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
  private matchesErrorPatterns(line: string): boolean {
    return this.errorPatterns.some(pattern => 
      line.toLowerCase().includes(pattern.toLowerCase())
    )
  }

  /**
   * Check if line matches assertion patterns
   */
  private matchesAssertionPatterns(line: string): boolean {
    return this.assertionPatterns.some(pattern => line.includes(pattern))
  }

  /**
   * Check if line contains important keywords
   */
  private containsImportantKeywords(line: string): boolean {
    const keywords = ['fail', 'error', 'exception', 'timeout', 'undefined', 'null']
    const lowerLine = line.toLowerCase()
    return keywords.some(keyword => lowerLine.includes(keyword))
  }

  /**
   * Check if line contains user code reference
   */
  private containsUserCode(line: string): boolean {
    const userPatterns = ['src/', 'test/', 'spec/']
    return userPatterns.some(pattern => line.includes(pattern)) && !line.includes('node_modules')
  }
}

/**
 * Error section information
 */
interface ErrorSection {
  startLine: number
  endLine: number
  errorLine: number
  content: string
  priority: number
  size: number
}