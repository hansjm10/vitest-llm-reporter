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
  TruncationConfig,
  TruncationResult,
  ContentType,
  ContentAnalysis,
  ContentSegment,
  SmartTruncationOptions
} from '../types.js'

/**
 * Default configuration for smart truncation
 */
const DEFAULT_SMART_CONFIG: Required<SmartTruncationOptions> = {
  priorityKeywords: [
    'error', 'fail', 'expect', 'assert', 'throw', 'reject',
    'timeout', 'missing', 'undefined', 'null', 'cannot',
    'invalid', 'TypeError', 'ReferenceError', 'SyntaxError'
  ],
  analysisDepth: 'medium',
  useMLScoring: false,
  minImportanceScore: 0.3,
  maxLines: 100,
  preserveLines: true,
  minPreserve: 200,
  priorityMarkers: {
    error: ['Error:', 'Failed:', '✗', '❌', 'AssertionError'],
    assertion: ['expect(', 'assert(', 'should', 'toBe', 'toEqual', 'toMatch'],
    userCode: ['src/', 'test/', 'spec/']
  }
}

/**
 * Smart truncation strategy implementation
 */
export class SmartStrategy implements ITruncationStrategy {
  public readonly name = 'smart'
  public readonly description = 'Intelligent content selection using importance scoring and heuristics'

  /**
   * Truncate content using intelligent content selection
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

    // If content is too small to meaningfully analyze, use simple truncation
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
      // Analyze content to identify important segments
      const analysis = await this.analyzeContent(content, context.contentType, mergedConfig)

      // Select segments to preserve based on importance and target size
      const preservedContent = this.selectImportantContent(analysis, context.targetSize, mergedConfig)

      const finalSize = preservedContent.length
      const duration = Date.now() - startTime

      return {
        content: preservedContent,
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
      // Fallback to simple head/tail if analysis fails
      const lines = content.split('\n')
      const maxLines = Math.min(mergedConfig.maxLines, lines.length)
      const preservedLines = lines.slice(0, Math.floor(maxLines / 2))
        .concat(['...'])
        .concat(lines.slice(-Math.floor(maxLines / 2)))
      
      const fallbackContent = preservedLines.join('\n')
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

    // Quick analysis for estimation
    const lines = content.split('\n')
    const importantLineCount = this.estimateImportantLines(lines, mergedConfig)
    const avgLineLength = originalSize / lines.length
    const estimatedSize = Math.min(
      importantLineCount * avgLineLength,
      context.targetSize
    )

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
    // Smart strategy works best with structured content
    return ['error-message', 'code-context', 'console-output', 'assertion', 'generic'].includes(contentType)
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): TruncationConfig {
    return { ...DEFAULT_SMART_CONFIG }
  }

  /**
   * Analyze content to identify important segments
   */
  private async analyzeContent(
    content: string,
    contentType: ContentType,
    config: Required<SmartTruncationOptions>
  ): Promise<ContentAnalysis> {
    const lines = content.split('\n')
    const segments: ContentSegment[] = []
    const importantLines: number[] = []
    const errorLines: number[] = []
    const stackTraceLines: number[] = []
    const userCodeLines: number[] = []

    // Analyze each line for importance
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const importance = this.calculateLineImportance(line, contentType, config)
      
      if (importance >= config.minImportanceScore) {
        importantLines.push(i)
      }

      // Classify line types
      if (this.isErrorLine(line, config)) {
        errorLines.push(i)
      }

      if (this.isStackTraceLine(line)) {
        stackTraceLines.push(i)
      }

      if (this.isUserCodeLine(line, config)) {
        userCodeLines.push(i)
      }
    }

    // Create content segments based on analysis depth
    if (config.analysisDepth === 'deep') {
      this.createDetailedSegments(lines, segments, importantLines, config)
    } else if (config.analysisDepth === 'medium') {
      this.createMediumSegments(lines, segments, importantLines, config)
    } else {
      this.createShallowSegments(lines, segments, importantLines, config)
    }

    return {
      totalLines: lines.length,
      importantLines,
      errorLines,
      stackTraceLines,
      userCodeLines,
      segments
    }
  }

  /**
   * Calculate importance score for a line
   */
  private calculateLineImportance(
    line: string,
    contentType: ContentType,
    config: Required<SmartTruncationOptions>
  ): number {
    let score = 0.1 // Base score

    const trimmedLine = line.trim()
    if (!trimmedLine) return 0 // Empty lines have no importance

    // Priority keywords boost score significantly
    for (const keyword of config.priorityKeywords) {
      if (trimmedLine.toLowerCase().includes(keyword.toLowerCase())) {
        score += 0.3
      }
    }

    // Priority markers add importance
    for (const [category, markers] of Object.entries(config.priorityMarkers)) {
      for (const marker of markers) {
        if (trimmedLine.includes(marker)) {
          score += category === 'error' ? 0.4 : 0.2
        }
      }
    }

    // Content type specific scoring
    switch (contentType) {
      case 'error-message':
        if (this.isErrorLine(line, config)) score += 0.5
        break
      case 'stack-trace':
        if (this.isStackTraceLine(line)) score += 0.3
        if (this.isUserCodeLine(line, config)) score += 0.4
        break
      case 'assertion':
        if (line.includes('expect') || line.includes('assert')) score += 0.4
        break
      case 'code-context':
        if (this.isUserCodeLine(line, config)) score += 0.3
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
   * Check if line is an error line
   */
  private isErrorLine(line: string, config: Required<SmartTruncationOptions>): boolean {
    const lowerLine = line.toLowerCase()
    return config.priorityMarkers.error.some(marker => 
      lowerLine.includes(marker.toLowerCase())
    ) || /\b(error|fail|exception|throw)\b/i.test(line)
  }

  /**
   * Check if line is a stack trace line
   */
  private isStackTraceLine(line: string): boolean {
    return /^\s*at\s/.test(line) || 
           /^\s*\w+Error:/.test(line) ||
           /\(\/.+:\d+:\d+\)$/.test(line)
  }

  /**
   * Check if line contains user code reference
   */
  private isUserCodeLine(line: string, config: Required<SmartTruncationOptions>): boolean {
    return config.priorityMarkers.userCode.some(pattern => 
      line.includes(pattern)
    ) && !line.includes('node_modules')
  }

  /**
   * Create detailed segments for deep analysis
   */
  private createDetailedSegments(
    lines: string[],
    segments: ContentSegment[],
    importantLines: number[],
    config: Required<SmartTruncationOptions>
  ): void {
    // Group consecutive important lines into segments
    let segmentStart = -1
    let segmentEnd = -1

    for (let i = 0; i < lines.length; i++) {
      const isImportant = importantLines.includes(i)

      if (isImportant && segmentStart === -1) {
        segmentStart = i
      }

      if (!isImportant && segmentStart !== -1) {
        segmentEnd = i - 1
        this.addSegment(lines, segments, segmentStart, segmentEnd, config)
        segmentStart = -1
      }
    }

    // Handle final segment if it ends with important content
    if (segmentStart !== -1) {
      this.addSegment(lines, segments, segmentStart, lines.length - 1, config)
    }
  }

  /**
   * Create medium-depth segments
   */
  private createMediumSegments(
    lines: string[],
    segments: ContentSegment[],
    importantLines: number[],
    config: Required<SmartTruncationOptions>
  ): void {
    // Create larger segments with context around important lines
    const contextLines = 2
    const processedLines = new Set<number>()

    for (const importantLine of importantLines) {
      const start = Math.max(0, importantLine - contextLines)
      const end = Math.min(lines.length - 1, importantLine + contextLines)

      // Skip if already processed
      if (processedLines.has(importantLine)) continue

      this.addSegment(lines, segments, start, end, config)

      // Mark lines as processed
      for (let i = start; i <= end; i++) {
        processedLines.add(i)
      }
    }
  }

  /**
   * Create shallow segments
   */
  private createShallowSegments(
    lines: string[],
    segments: ContentSegment[],
    importantLines: number[],
    config: Required<SmartTruncationOptions>
  ): void {
    // Just use individual important lines
    for (const lineIndex of importantLines) {
      this.addSegment(lines, segments, lineIndex, lineIndex, config)
    }
  }

  /**
   * Add a segment to the segments array
   */
  private addSegment(
    lines: string[],
    segments: ContentSegment[],
    startLine: number,
    endLine: number,
    config: Required<SmartTruncationOptions>
  ): void {
    const segmentLines = lines.slice(startLine, endLine + 1)
    const content = segmentLines.join('\n')
    
    // Calculate average importance for the segment
    let totalImportance = 0
    for (let i = startLine; i <= endLine; i++) {
      totalImportance += this.calculateLineImportance(lines[i], 'generic', config)
    }
    const avgImportance = totalImportance / (endLine - startLine + 1)

    segments.push({
      startLine,
      endLine,
      content,
      importance: avgImportance,
      type: 'generic',
      preserve: avgImportance >= config.minImportanceScore
    })
  }

  /**
   * Select important content to preserve based on target size
   */
  private selectImportantContent(
    analysis: ContentAnalysis,
    targetSize: number,
    config: Required<SmartTruncationOptions>
  ): string {
    // Sort segments by importance (highest first)
    const sortedSegments = analysis.segments
      .filter(seg => seg.preserve)
      .sort((a, b) => b.importance - a.importance)

    const selectedSegments: ContentSegment[] = []
    let currentSize = 0

    // Select segments until we reach target size
    for (const segment of sortedSegments) {
      const segmentSize = segment.content.length + 1 // +1 for newline
      
      if (currentSize + segmentSize <= targetSize) {
        selectedSegments.push(segment)
        currentSize += segmentSize
      } else {
        // Try to fit partial segment if there's room
        const remainingSpace = targetSize - currentSize
        if (remainingSpace > 50) { // Only if there's meaningful space
          const partialContent = segment.content.substring(0, remainingSpace - 4) + '...'
          selectedSegments.push({
            ...segment,
            content: partialContent
          })
        }
        break
      }
    }

    // Sort selected segments by their original line order
    selectedSegments.sort((a, b) => a.startLine - b.startLine)

    // Combine segments with separators where there are gaps
    const result: string[] = []
    let lastEndLine = -1

    for (const segment of selectedSegments) {
      if (lastEndLine !== -1 && segment.startLine > lastEndLine + 1) {
        result.push('...')
      }
      result.push(segment.content)
      lastEndLine = segment.endLine
    }

    return result.join('\n')
  }

  /**
   * Estimate number of important lines for quick analysis
   */
  private estimateImportantLines(
    lines: string[],
    config: Required<SmartTruncationOptions>
  ): number {
    let count = 0
    for (const line of lines) {
      if (this.calculateLineImportance(line, 'generic', config) >= config.minImportanceScore) {
        count++
      }
    }
    return Math.min(count, config.maxLines)
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config?: TruncationConfig): Required<SmartTruncationOptions> {
    return {
      ...DEFAULT_SMART_CONFIG,
      ...config,
      priorityKeywords: [
        ...DEFAULT_SMART_CONFIG.priorityKeywords,
        ...(config?.priorityKeywords || [])
      ],
      priorityMarkers: {
        error: [
          ...DEFAULT_SMART_CONFIG.priorityMarkers.error,
          ...(config?.priorityMarkers?.error || [])
        ],
        assertion: [
          ...DEFAULT_SMART_CONFIG.priorityMarkers.assertion,
          ...(config?.priorityMarkers?.assertion || [])
        ],
        userCode: [
          ...DEFAULT_SMART_CONFIG.priorityMarkers.userCode,
          ...(config?.priorityMarkers?.userCode || [])
        ]
      }
    } as Required<SmartTruncationOptions>
  }
}