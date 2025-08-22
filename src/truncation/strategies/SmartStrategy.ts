/**
 * Smart Truncation Strategy
 *
 * Intelligent content selection strategy that analyzes content to identify
 * and preserve the most important parts. Uses heuristics and patterns
 * to score content importance and make informed truncation decisions.
 */

import type {
  ITruncationStrategy,
  TruncationContext,
  TruncationResult,
  ContentType
} from '../types'
import { getTokenCounter } from '../../tokenization/TokenCounter'

/**
 * Smart truncation strategy implementation
 */
export class SmartStrategy implements ITruncationStrategy {
  public readonly name = 'smart'
  public readonly priority = 4

  private readonly priorityKeywords = [
    'error',
    'fail',
    'expect',
    'assert',
    'throw',
    'reject',
    'timeout',
    'missing',
    'undefined',
    'null',
    'cannot',
    'invalid',
    'TypeError',
    'ReferenceError',
    'SyntaxError'
  ]

  private readonly priorityMarkers = {
    error: ['Error:', 'Failed:', '✗', '❌', 'AssertionError'],
    assertion: ['expect(', 'assert(', 'should', 'toBe', 'toEqual', 'toMatch'],
    userCode: ['src/', 'test/', 'spec/']
  }

  /**
   * Truncate content using intelligent content selection
   */
  async truncate(
    content: string,
    maxTokens: number,
    context: TruncationContext
  ): Promise<TruncationResult> {
    const tokenCounter = getTokenCounter()
    const originalTokens = await tokenCounter.count(content, context.model)

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
      // Analyze content to identify important segments
      const importantLines = this.analyzeContentImportance(content, context)

      // Select and combine important content within token limit
      let truncatedContent = await this.selectImportantContent(
        content,
        importantLines,
        maxTokens,
        context
      )

      let finalTokens = await tokenCounter.count(truncatedContent, context.model)

      // For very small token limits, ensure we meet the constraint
      if (finalTokens > maxTokens && maxTokens < 10) {
        // For extremely small limits, return minimal content
        if (maxTokens <= 3) {
          truncatedContent = '...'
        } else {
          const words = truncatedContent.split(/\s+/)
          truncatedContent = words.slice(0, Math.max(1, Math.floor(maxTokens / 2))).join(' ')
          if (truncatedContent.length === 0) {
            truncatedContent = content.substring(0, Math.min(10, content.length))
          }
        }
        finalTokens = await tokenCounter.count(truncatedContent, context.model)
      }

      return {
        content: truncatedContent,
        tokenCount: finalTokens,
        tokensSaved: originalTokens - finalTokens,
        wasTruncated: true,
        strategyUsed: this.name
      }
    } catch (error) {
      // Fallback to simple line-based truncation
      const lines = content.split('\n')
      const maxLines = Math.min(20, lines.length)
      const fallbackContent = lines.slice(0, maxLines).join('\n')

      const fallbackTokens = await tokenCounter.count(fallbackContent, context.model)
      const wasTruncated = lines.length > maxLines || fallbackTokens < originalTokens

      return {
        content: fallbackContent,
        tokenCount: fallbackTokens,
        tokensSaved: originalTokens - fallbackTokens,
        wasTruncated,
        strategyUsed: wasTruncated ? `${this.name}-fallback` : this.name,
        warnings: ['Smart analysis failed, used fallback truncation']
      }
    }
  }

  /**
   * Check if strategy can handle the given content
   */
  canTruncate(content: string, context: TruncationContext): boolean {
    // Smart strategy works best with structured content that has identifiable patterns
    return context.contentType !== 'json' || !context.preserveStructure
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
    const originalTokens = await tokenCounter.count(content, context.model)

    if (originalTokens <= maxTokens) {
      return 0
    }

    // Quick analysis to estimate important content percentage
    const lines = content.split('\n')
    const importantLines = this.analyzeContentImportance(content, context)

    // Estimate that we can preserve most important content plus some context
    const importantRatio = importantLines.length / lines.length
    const estimatedPreservedRatio = Math.min(0.8, importantRatio + 0.3)

    const estimatedPreserved = Math.floor(originalTokens * estimatedPreservedRatio)
    const estimatedFinal = Math.min(estimatedPreserved, maxTokens)

    return Math.max(0, originalTokens - estimatedFinal)
  }

  /**
   * Analyze content to identify important line indices
   */
  private analyzeContentImportance(content: string, context: TruncationContext): number[] {
    const lines = content.split('\n')
    const importantLines: number[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const importance = this.calculateLineImportance(line, context)

      if (importance >= 0.3) {
        // Threshold for important content
        importantLines.push(i)
      }
    }

    return importantLines
  }

  /**
   * Calculate importance score for a line
   */
  private calculateLineImportance(line: string, context: TruncationContext): number {
    let score = 0.1 // Base score

    const trimmedLine = line.trim()
    if (!trimmedLine) return 0 // Empty lines have no importance

    // Priority keywords boost score significantly
    for (const keyword of this.priorityKeywords) {
      if (trimmedLine.toLowerCase().includes(keyword.toLowerCase())) {
        score += 0.3
      }
    }

    // Priority markers add importance
    for (const [category, markers] of Object.entries(this.priorityMarkers)) {
      for (const marker of markers) {
        if (trimmedLine.includes(marker)) {
          score += category === 'error' ? 0.4 : 0.2
        }
      }
    }

    // Content type specific scoring
    switch (context.contentType) {
      case 'error':
        if (this.isErrorLine(line)) score += 0.5
        break
      case 'test':
        if (line.includes('expect') || line.includes('assert')) score += 0.4
        break
      case 'code':
        if (this.isUserCodeLine(line)) score += 0.3
        break
    }

    // Lines with numbers (like line numbers, values) are often important
    if (/\b\d+\b/.test(trimmedLine)) {
      score += 0.1
    }

    // Lines with quotes often contain important values
    if (/["'].*["']/.test(trimmedLine)) {
      score += 0.1
    }

    return Math.min(score, 1.0) // Cap at 1.0
  }

  /**
   * Select important content to fit within token limit
   */
  private async selectImportantContent(
    content: string,
    importantLines: number[],
    maxTokens: number,
    context: TruncationContext
  ): Promise<string> {
    const lines = content.split('\n')
    const tokenCounter = getTokenCounter()

    // Start with just the most important lines
    let selectedLines: number[] = []
    const contextLines = 1 // Lines of context around important lines

    // Add context around important lines
    const expandedLines = new Set<number>()
    for (const lineIndex of importantLines) {
      const start = Math.max(0, lineIndex - contextLines)
      const end = Math.min(lines.length - 1, lineIndex + contextLines)

      for (let i = start; i <= end; i++) {
        expandedLines.add(i)
      }
    }

    selectedLines = Array.from(expandedLines).sort((a, b) => a - b)

    // Build content and check if it fits
    let result = this.buildSelectedContent(lines, selectedLines)
    let currentTokens = await tokenCounter.count(result, context.model)

    // If still too large, reduce by removing less important lines
    while (currentTokens > maxTokens && selectedLines.length > 1) {
      // Remove lines that are not in the original important lines
      const lessImportant = selectedLines.find((lineIndex) => !importantLines.includes(lineIndex))

      if (lessImportant !== undefined) {
        selectedLines = selectedLines.filter((i) => i !== lessImportant)
      } else {
        // Remove the last important line if necessary
        selectedLines.pop()
      }

      result = this.buildSelectedContent(lines, selectedLines)
      currentTokens = await tokenCounter.count(result, context.model)
    }

    return result
  }

  /**
   * Build content from selected lines
   */
  private buildSelectedContent(lines: string[], selectedLines: number[]): string {
    if (selectedLines.length === 0) {
      // Return minimal content for extremely small limits
      return lines[0] ? lines[0].substring(0, 10) : '...'
    }

    const result: string[] = []
    let lastLine = -1

    for (const lineIndex of selectedLines) {
      // Add separator for gaps
      if (lastLine !== -1 && lineIndex > lastLine + 1) {
        result.push('...')
      }

      result.push(lines[lineIndex])
      lastLine = lineIndex
    }

    return result.join('\n')
  }

  /**
   * Check if line is an error line
   */
  private isErrorLine(line: string): boolean {
    const lowerLine = line.toLowerCase()
    return (
      this.priorityMarkers.error.some((marker) => lowerLine.includes(marker.toLowerCase())) ||
      /\b(error|fail|exception|throw)\b/i.test(line)
    )
  }

  /**
   * Check if line contains user code reference
   */
  private isUserCodeLine(line: string): boolean {
    return (
      this.priorityMarkers.userCode.some((pattern) => line.includes(pattern)) &&
      !line.includes('node_modules')
    )
  }
}
