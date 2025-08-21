/**
 * Stack Trace Truncation Strategy
 *
 * Specialized strategy for intelligent stack trace truncation.
 * Prioritizes user code frames while reducing noise from node_modules
 * and framework internals. Preserves the most relevant debugging context
 * by analyzing frame importance and user code patterns.
 */

import type {
  ITruncationStrategy,
  TruncationContext,
  TruncationResult,
  ContentType
} from '../types'
import { getTokenCounter } from '../../tokenization/TokenCounter'

/**
 * Stack trace truncation strategy implementation
 */
export class StackTraceStrategy implements ITruncationStrategy {
  public readonly name = 'stack-trace'
  public readonly priority = 6

  private readonly userCodePatterns = [
    'src/', 'test/', 'spec/', 'lib/', 'app/',
    '/src/', '/test/', '/spec/', '/lib/', '/app/'
  ]

  private readonly priorityKeywords = [
    'test', 'spec', 'describe', 'it', 'expect',
    'assert', 'should', 'error', 'fail'
  ]

  /**
   * Truncate stack trace content intelligently
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
      // Parse and process stack trace
      const truncatedContent = await this.processStackTrace(content, maxTokens, context)
      const finalTokens = await tokenCounter.countTokens(truncatedContent, context.model)

      return {
        content: truncatedContent,
        tokenCount: finalTokens,
        tokensSaved: originalTokens - finalTokens,
        wasTruncated: true,
        strategyUsed: this.name
      }
    } catch (error) {
      // Fallback to line-based truncation if parsing fails
      const lines = content.split('\n')
      const maxLines = Math.min(25, lines.length)
      const fallbackContent = lines.slice(0, maxLines).join('\n')
      
      const fallbackTokens = await tokenCounter.countTokens(fallbackContent, context.model)

      return {
        content: fallbackContent,
        tokenCount: fallbackTokens,
        tokensSaved: originalTokens - fallbackTokens,
        wasTruncated: true,
        strategyUsed: `${this.name}-fallback`,
        warnings: ['Stack trace parsing failed, used fallback truncation']
      }
    }
  }

  /**
   * Check if strategy can handle the given content
   */
  canTruncate(content: string, context: TruncationContext): boolean {
    // Stack trace strategy is specifically for error content with stack traces
    return context.contentType === 'error' && this.hasStackTracePattern(content)
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

    // Estimate based on stack frame analysis
    const lines = content.split('\n')
    const stackFrameLines = lines.filter(line => this.isStackFrameLine(line))
    const userFrameCount = stackFrameLines.filter(line => this.isUserCodeFrame(line)).length
    
    // Estimate that we keep error message + user frames + some library frames
    const estimatedKeptFrames = Math.min(userFrameCount + 5, 15)
    const estimatedKeptRatio = estimatedKeptFrames / Math.max(stackFrameLines.length, 1)
    
    const estimatedPreserved = Math.floor(originalTokens * Math.max(0.4, estimatedKeptRatio))
    const estimatedFinal = Math.min(estimatedPreserved, maxTokens)
    
    return Math.max(0, originalTokens - estimatedFinal)
  }

  /**
   * Process stack trace content
   */
  private async processStackTrace(
    content: string,
    maxTokens: number,
    context: TruncationContext
  ): Promise<string> {
    // Parse content into frames
    const frames = this.parseStackTrace(content)

    // Select the most important frames
    const selectedFrames = await this.selectImportantFrames(frames, maxTokens, context)

    // Reconstruct stack trace
    return this.reconstructStackTrace(selectedFrames)
  }

  /**
   * Parse stack trace content into structured frames
   */
  private parseStackTrace(content: string): StackFrame[] {
    const lines = content.split('\n')
    const frames: StackFrame[] = []
    let errorMessage = ''

    for (const line of lines) {
      if (this.isErrorMessageLine(line)) {
        errorMessage = line
        frames.push({
          type: 'error-message',
          content: line,
          isUserCode: false,
          importance: 1.0,
          originalText: line
        })
      } else if (this.isStackFrameLine(line)) {
        const frame = this.parseStackFrameLine(line)
        if (frame) {
          frames.push(frame)
        }
      }
    }

    return frames
  }

  /**
   * Parse individual stack frame line
   */
  private parseStackFrameLine(line: string): StackFrame | null {
    const trimmedLine = line.trim()

    // Extract function name and file path
    let functionName: string | undefined
    let fileName: string | undefined
    let lineNumber: number | undefined
    let columnNumber: number | undefined

    // Common patterns:
    // at functionName (path/to/file.js:123:45)
    // at path/to/file.js:123:45
    // at Object.functionName (path/to/file.js:123:45)

    const patterns = [
      /^\s*at\s+([^(]+)\s+\((.+):(\d+):(\d+)\)$/,
      /^\s*at\s+(.+):(\d+):(\d+)$/,
      /^\s*at\s+(.+)$/
    ]

    for (const pattern of patterns) {
      const match = trimmedLine.match(pattern)
      if (match) {
        if (match.length === 5) {
          functionName = match[1].trim()
          fileName = match[2]
          lineNumber = parseInt(match[3], 10)
          columnNumber = parseInt(match[4], 10)
        } else if (match.length === 4) {
          fileName = match[1]
          lineNumber = parseInt(match[2], 10)
          columnNumber = parseInt(match[3], 10)
        } else {
          functionName = match[1]
        }
        break
      }
    }

    const isUserCode = this.isUserCodeFrame(fileName || line)
    const importance = this.calculateFrameImportance(functionName, fileName, isUserCode)

    return {
      type: 'stack-frame',
      content: line,
      isUserCode,
      importance,
      originalText: line,
      functionName,
      fileName,
      lineNumber,
      columnNumber
    }
  }

  /**
   * Select the most important stack frames
   */
  private async selectImportantFrames(
    frames: StackFrame[],
    maxTokens: number,
    context: TruncationContext
  ): Promise<StackFrame[]> {
    const tokenCounter = getTokenCounter()
    
    // Separate error messages, user code, and library code
    const errorFrames = frames.filter(f => f.type === 'error-message')
    const userFrames = frames.filter(f => f.type === 'stack-frame' && f.isUserCode)
    const libraryFrames = frames.filter(f => f.type === 'stack-frame' && !f.isUserCode)

    // Always include error messages
    const selected: StackFrame[] = [...errorFrames]
    let currentTokens = 0

    // Calculate current token count
    for (const frame of selected) {
      currentTokens += await tokenCounter.countTokens(frame.content, context.model)
    }

    // Add user code frames (prioritized)
    const sortedUserFrames = userFrames.sort((a, b) => b.importance - a.importance)
    for (const frame of sortedUserFrames) {
      const frameTokens = await tokenCounter.countTokens(frame.content, context.model)
      if (currentTokens + frameTokens <= maxTokens) {
        selected.push(frame)
        currentTokens += frameTokens
      } else {
        break
      }
    }

    // Add important library frames if there's space
    const sortedLibraryFrames = libraryFrames.sort((a, b) => b.importance - a.importance)
    for (const frame of sortedLibraryFrames) {
      const frameTokens = await tokenCounter.countTokens(frame.content, context.model)
      if (currentTokens + frameTokens <= maxTokens) {
        selected.push(frame)
        currentTokens += frameTokens
      } else {
        break
      }
    }

    // Sort frames back to original order
    const originalOrder = new Map(frames.map((frame, index) => [frame, index]))
    return selected.sort((a, b) => (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0))
  }

  /**
   * Reconstruct stack trace from selected frames
   */
  private reconstructStackTrace(frames: StackFrame[]): string {
    if (frames.length === 0) {
      return '[Empty Stack Trace]'
    }

    const lines: string[] = []
    let lastWasUserCode = false
    let skippedFrameCount = 0

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i]
      const isUserCode = frame.isUserCode

      // Add separator for transitions between user code and library code
      if (i > 0 && lastWasUserCode !== isUserCode) {
        if (skippedFrameCount > 0) {
          lines.push(`    ... ${skippedFrameCount} more frame(s)`)
          skippedFrameCount = 0
        }
      }

      lines.push(frame.originalText)
      lastWasUserCode = isUserCode
    }

    // Add final separator if needed
    if (skippedFrameCount > 0) {
      lines.push(`    ... ${skippedFrameCount} more frame(s)`)
    }

    return lines.join('\n')
  }

  /**
   * Check if content has stack trace patterns
   */
  private hasStackTracePattern(content: string): boolean {
    return /^\s*at\s/.test(content) || content.includes('    at ')
  }

  /**
   * Check if line is an error message line
   */
  private isErrorMessageLine(line: string): boolean {
    const trimmed = line.trim()
    return /^[A-Z]\w*Error:/.test(trimmed) || 
           /^Error:/.test(trimmed) ||
           /^AssertionError:/.test(trimmed)
  }

  /**
   * Check if line is a stack frame line
   */
  private isStackFrameLine(line: string): boolean {
    return /^\s*at\s/.test(line)
  }

  /**
   * Check if frame is user code
   */
  private isUserCodeFrame(filePath: string): boolean {
    if (!filePath) return false

    // Exclude node_modules
    if (filePath.includes('node_modules')) return false

    // Check user code patterns
    return this.userCodePatterns.some(pattern => filePath.includes(pattern))
  }

  /**
   * Calculate frame importance score
   */
  private calculateFrameImportance(
    functionName: string | undefined,
    fileName: string | undefined,
    isUserCode: boolean
  ): number {
    let score = 0.1 // Base score

    // User code gets higher score
    if (isUserCode) {
      score += 0.4
    }

    // Test-related functions get higher score
    if (functionName) {
      for (const keyword of this.priorityKeywords) {
        if (functionName.toLowerCase().includes(keyword.toLowerCase())) {
          score += 0.2
          break
        }
      }
    }

    // Main/entry functions get higher score
    if (functionName?.includes('main') || functionName?.includes('entry')) {
      score += 0.1
    }

    // Anonymous functions get lower score
    if (!functionName || functionName === 'anonymous' || functionName === '<anonymous>') {
      score -= 0.1
    }

    // Internal/built-in functions get lower score
    if (fileName?.includes('internal/') || fileName?.includes('<built-in>')) {
      score -= 0.2
    }

    return Math.max(0, Math.min(1, score))
  }
}

/**
 * Stack frame information
 */
interface StackFrame {
  type: 'error-message' | 'stack-frame'
  content: string
  isUserCode: boolean
  importance: number
  originalText: string
  functionName?: string
  fileName?: string
  lineNumber?: number
  columnNumber?: number
}