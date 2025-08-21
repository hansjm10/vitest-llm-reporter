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
  TruncationConfig,
  TruncationResult,
  ContentType,
  StackFrame,
  StackTraceOptions
} from '../types.js'

/**
 * Default configuration for stack trace truncation
 */
const DEFAULT_STACK_CONFIG: Required<StackTraceOptions> = {
  maxFrames: 20,
  prioritizeUserCode: true,
  userCodePatterns: [
    'src/', 'test/', 'spec/', 'lib/', 'app/',
    '/src/', '/test/', '/spec/', '/lib/', '/app/'
  ],
  preserveFrameContext: true,
  minUserFrames: 3,
  maxLines: 50,
  preserveLines: true,
  minPreserve: 200,
  priorityKeywords: [
    'test', 'spec', 'describe', 'it', 'expect',
    'assert', 'should', 'error', 'fail'
  ],
  priorityMarkers: {
    error: ['Error:', 'at '],
    assertion: ['expect', 'assert', 'should'],
    userCode: ['src/', 'test/', 'spec/']
  }
}

/**
 * Stack trace truncation strategy implementation
 */
export class StackTraceStrategy implements ITruncationStrategy {
  public readonly name = 'stack-trace'
  public readonly description = 'Intelligent stack frame selection prioritizing user code over dependencies'

  /**
   * Truncate stack trace content intelligently
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
      // Parse stack trace and select important frames
      const truncatedContent = this.processStackTrace(content, context.targetSize, mergedConfig)

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
      // Fallback to line-based truncation if parsing fails
      const lines = content.split('\n')
      const maxLines = Math.min(mergedConfig.maxLines, lines.length)
      const fallbackContent = lines.slice(0, maxLines).join('\n')
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

    // Quick estimate based on frame count
    const lines = content.split('\n')
    const stackFrameLines = lines.filter(line => this.isStackFrameLine(line))
    const avgFrameLength = originalSize / Math.max(stackFrameLines.length, 1)
    const estimatedFrames = Math.min(mergedConfig.maxFrames, stackFrameLines.length)
    const estimatedSize = Math.min(estimatedFrames * avgFrameLength, context.targetSize)

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
    // Stack trace strategy is specifically designed for stack traces
    return contentType === 'stack-trace'
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): TruncationConfig {
    return { ...DEFAULT_STACK_CONFIG }
  }

  /**
   * Process stack trace content
   */
  private processStackTrace(
    content: string,
    targetSize: number,
    config: Required<StackTraceOptions>
  ): string {
    // Parse content into frames
    const frames = this.parseStackTrace(content, config)

    // Select the most important frames
    const selectedFrames = this.selectImportantFrames(frames, config)

    // Ensure we have enough content to fit target size
    const finalFrames = this.adjustFramesToFitSize(selectedFrames, targetSize, config)

    // Reconstruct stack trace
    return this.reconstructStackTrace(finalFrames, config)
  }

  /**
   * Parse stack trace content into structured frames
   */
  private parseStackTrace(content: string, config: Required<StackTraceOptions>): StackFrame[] {
    const lines = content.split('\n')
    const frames: StackFrame[] = []
    let currentErrorMessage = ''

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]

      if (this.isErrorMessageLine(line)) {
        currentErrorMessage = line
        continue
      }

      if (this.isStackFrameLine(line)) {
        const frame = this.parseStackFrameLine(line, config)
        if (frame) {
          frames.push(frame)
        }
      }
    }

    // If we found error message, add it as a special frame
    if (currentErrorMessage) {
      frames.unshift({
        functionName: '[Error Message]',
        fileName: undefined,
        lineNumber: undefined,
        columnNumber: undefined,
        isUserCode: false,
        originalText: currentErrorMessage,
        importance: 1.0 // Highest importance
      })
    }

    return frames
  }

  /**
   * Parse individual stack frame line
   */
  private parseStackFrameLine(line: string, config: Required<StackTraceOptions>): StackFrame | null {
    const trimmedLine = line.trim()

    // Common stack frame patterns:
    // at functionName (path/to/file.js:123:45)
    // at path/to/file.js:123:45
    // at Object.functionName (path/to/file.js:123:45)

    let functionName: string | undefined
    let fileName: string | undefined
    let lineNumber: number | undefined
    let columnNumber: number | undefined

    // Try to match different patterns
    const patterns = [
      // at functionName (path/to/file.js:123:45)
      /^\s*at\s+([^(]+)\s+\((.+):(\d+):(\d+)\)$/,
      // at path/to/file.js:123:45
      /^\s*at\s+(.+):(\d+):(\d+)$/,
      // Generic at line
      /^\s*at\s+(.+)$/
    ]

    for (const pattern of patterns) {
      const match = trimmedLine.match(pattern)
      if (match) {
        if (match.length === 5) {
          // Pattern with function name and location
          functionName = match[1].trim()
          fileName = match[2]
          lineNumber = parseInt(match[3], 10)
          columnNumber = parseInt(match[4], 10)
        } else if (match.length === 4) {
          // Pattern with just location
          fileName = match[1]
          lineNumber = parseInt(match[2], 10)
          columnNumber = parseInt(match[3], 10)
        } else {
          // Generic pattern
          const text = match[1]
          if (text.includes('(') && text.includes(')')) {
            const locationMatch = text.match(/\(([^)]+)\)/)
            if (locationMatch) {
              const location = locationMatch[1]
              const locationParts = location.split(':')
              if (locationParts.length >= 2) {
                fileName = locationParts.slice(0, -2).join(':')
                lineNumber = parseInt(locationParts[locationParts.length - 2], 10)
                columnNumber = parseInt(locationParts[locationParts.length - 1], 10)
              }
              functionName = text.substring(0, text.indexOf('('))
            }
          } else {
            functionName = text
          }
        }
        break
      }
    }

    const isUserCode = this.isUserCodeFrame(fileName, config)
    const importance = this.calculateFrameImportance(
      functionName,
      fileName,
      isUserCode,
      config
    )

    return {
      functionName,
      fileName,
      lineNumber,
      columnNumber,
      isUserCode,
      originalText: line,
      importance
    }
  }

  /**
   * Select the most important stack frames
   */
  private selectImportantFrames(frames: StackFrame[], config: Required<StackTraceOptions>): StackFrame[] {
    if (frames.length <= config.maxFrames) {
      return frames
    }

    // Separate error messages, user code, and library code
    const errorFrames = frames.filter(f => f.functionName?.includes('[Error Message]'))
    const userFrames = frames.filter(f => f.isUserCode && !f.functionName?.includes('[Error Message]'))
    const libraryFrames = frames.filter(f => !f.isUserCode && !f.functionName?.includes('[Error Message]'))

    // Always include error messages
    const selected: StackFrame[] = [...errorFrames]
    let remainingSlots = config.maxFrames - selected.length

    if (config.prioritizeUserCode) {
      // Prioritize user code frames
      const userFramesToInclude = Math.min(
        Math.max(config.minUserFrames, remainingSlots * 0.7),
        userFrames.length
      )

      // Sort user frames by importance and take the best ones
      const sortedUserFrames = userFrames
        .sort((a, b) => b.importance - a.importance)
        .slice(0, userFramesToInclude)

      selected.push(...sortedUserFrames)
      remainingSlots -= sortedUserFrames.length

      // Fill remaining slots with library frames if needed
      if (remainingSlots > 0 && libraryFrames.length > 0) {
        const sortedLibraryFrames = libraryFrames
          .sort((a, b) => b.importance - a.importance)
          .slice(0, remainingSlots)

        selected.push(...sortedLibraryFrames)
      }
    } else {
      // Include frames based purely on importance
      const allNonErrorFrames = [...userFrames, ...libraryFrames]
        .sort((a, b) => b.importance - a.importance)
        .slice(0, remainingSlots)

      selected.push(...allNonErrorFrames)
    }

    // Sort frames back to original order (preserving stack trace structure)
    const originalOrder = new Map(frames.map((frame, index) => [frame, index]))
    return selected.sort((a, b) => (originalOrder.get(a) || 0) - (originalOrder.get(b) || 0))
  }

  /**
   * Adjust frames to fit within target size
   */
  private adjustFramesToFitSize(
    frames: StackFrame[],
    targetSize: number,
    config: Required<StackTraceOptions>
  ): StackFrame[] {
    let currentSize = 0
    const result: StackFrame[] = []

    for (const frame of frames) {
      const frameSize = frame.originalText.length + 1 // +1 for newline
      
      if (currentSize + frameSize <= targetSize) {
        result.push(frame)
        currentSize += frameSize
      } else {
        // Try to fit a truncated version of the frame
        const remainingSpace = targetSize - currentSize
        if (remainingSpace > 50) { // Only if there's meaningful space
          const truncatedText = frame.originalText.substring(0, remainingSpace - 4) + '...'
          result.push({
            ...frame,
            originalText: truncatedText
          })
        }
        break
      }
    }

    return result
  }

  /**
   * Reconstruct stack trace from selected frames
   */
  private reconstructStackTrace(frames: StackFrame[], config: Required<StackTraceOptions>): string {
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
      if (i > 0 && lastWasUserCode !== isUserCode && config.preserveFrameContext) {
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
  private isUserCodeFrame(fileName: string | undefined, config: Required<StackTraceOptions>): boolean {
    if (!fileName) return false

    // Exclude node_modules
    if (fileName.includes('node_modules')) return false

    // Check user code patterns
    return config.userCodePatterns.some(pattern => 
      fileName.includes(pattern)
    )
  }

  /**
   * Calculate frame importance score
   */
  private calculateFrameImportance(
    functionName: string | undefined,
    fileName: string | undefined,
    isUserCode: boolean,
    config: Required<StackTraceOptions>
  ): number {
    let score = 0.1 // Base score

    // Error messages get highest priority
    if (functionName?.includes('[Error Message]')) {
      return 1.0
    }

    // User code gets higher score
    if (isUserCode) {
      score += 0.4
    }

    // Test-related functions get higher score
    if (functionName) {
      for (const keyword of config.priorityKeywords) {
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

    return Math.max(0, Math.min(1, score)) // Clamp between 0 and 1
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config?: TruncationConfig): Required<StackTraceOptions> {
    return {
      ...DEFAULT_STACK_CONFIG,
      ...config,
      userCodePatterns: [
        ...DEFAULT_STACK_CONFIG.userCodePatterns,
        ...(config?.priorityMarkers?.userCode || [])
      ],
      priorityKeywords: [
        ...DEFAULT_STACK_CONFIG.priorityKeywords,
        ...(config?.priorityKeywords || [])
      ]
    } as Required<StackTraceOptions>
  }
}