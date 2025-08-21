/**
 * Console Output Pattern Matcher
 * 
 * Identifies similar console output patterns by analyzing
 * log structure, sequences, and content patterns.
 * 
 * @module ConsoleOutputPattern
 */

import type { IPatternMatcher, PatternType, SimilarityScore, SimilarityLevel } from '../../types/deduplication'

/**
 * Console line classification
 */
type LineType = 'log' | 'error' | 'warn' | 'debug' | 'info' | 'timestamp' | 'data' | 'empty'

/**
 * Parsed console line
 */
interface ConsoleLine {
  type: LineType
  content: string
  normalized: string
  level?: string
  timestamp?: string
  data?: unknown
}

/**
 * Console output pattern matcher implementation
 */
export class ConsoleOutputPattern implements IPatternMatcher {
  readonly type: PatternType = 'console-output'
  
  // Patterns for identifying line types
  private readonly linePatterns = {
    timestamp: /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/,
    error: /^(error|err|exception|fail)/i,
    warn: /^(warn|warning)/i,
    info: /^(info|information)/i,
    debug: /^(debug|trace|verbose)/i,
    json: /^[{\[].+[}\]]$/,
    stackTrace: /^\s*at\s+/
  }

  // Normalization patterns
  private readonly normalizationPatterns = [
    { pattern: /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*(Z|[+-]\d{2}:\d{2})?/g, replacement: '<TIMESTAMP>' },
    { pattern: /\b\d+\b/g, replacement: '<NUM>' },
    { pattern: /0x[0-9a-fA-F]+/g, replacement: '<HEX>' },
    { pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, replacement: '<UUID>' },
    { pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '<IP>' },
    { pattern: /https?:\/\/[^\s]+/g, replacement: '<URL>' },
    { pattern: /[\w\-.]+@[\w\-.]+/g, replacement: '<EMAIL>' }
  ]

  /**
   * Match two console outputs and calculate similarity
   */
  match(a: string, b: string): SimilarityScore {
    const linesA = this.parseConsoleOutput(a)
    const linesB = this.parseConsoleOutput(b)

    if (linesA.length === 0 || linesB.length === 0) {
      return {
        score: 0,
        level: 'low',
        confidence: 0.3
      }
    }

    // Calculate different similarity metrics
    const structuralSimilarity = this.calculateStructuralSimilarity(linesA, linesB)
    const contentSimilarity = this.calculateContentSimilarity(linesA, linesB)
    const sequenceSimilarity = this.calculateSequenceSimilarity(linesA, linesB)
    const patternSimilarity = this.calculatePatternSimilarity(linesA, linesB)

    // Weighted average
    const score = 
      structuralSimilarity * 0.25 +
      contentSimilarity * 0.35 +
      sequenceSimilarity * 0.25 +
      patternSimilarity * 0.15

    return {
      score,
      level: this.getLevel(score),
      confidence: this.calculateConfidence(linesA, linesB),
      details: {
        structural: structuralSimilarity,
        content: contentSimilarity,
        sequence: sequenceSimilarity,
        pattern: patternSimilarity,
        lineCount: { a: linesA.length, b: linesB.length }
      }
    }
  }

  /**
   * Extract a signature from console output
   */
  extractSignature(text: string): string {
    const lines = this.parseConsoleOutput(text)
    const significantLines = this.getSignificantLines(lines)
    
    return significantLines
      .map(line => `${line.type}:${line.normalized.substring(0, 50)}`)
      .join('|')
  }

  /**
   * Normalize console output for comparison
   */
  normalize(text: string): string {
    let normalized = text

    // Apply normalization patterns
    for (const { pattern, replacement } of this.normalizationPatterns) {
      normalized = normalized.replace(pattern, replacement)
    }

    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ').trim()

    return normalized
  }

  /**
   * Parse console output into structured lines
   */
  private parseConsoleOutput(output: string): ConsoleLine[] {
    const lines = output.split('\n')
    const parsed: ConsoleLine[] = []

    for (const line of lines) {
      if (line.trim() === '') {
        parsed.push({
          type: 'empty',
          content: '',
          normalized: ''
        })
        continue
      }

      const lineType = this.detectLineType(line)
      const normalized = this.normalizeLine(line)

      parsed.push({
        type: lineType,
        content: line,
        normalized,
        level: this.extractLogLevel(line),
        timestamp: this.extractTimestamp(line)
      })
    }

    return parsed
  }

  /**
   * Detect the type of a console line
   */
  private detectLineType(line: string): LineType {
    const trimmed = line.trim()

    if (this.linePatterns.timestamp.test(trimmed)) return 'timestamp'
    if (this.linePatterns.error.test(trimmed)) return 'error'
    if (this.linePatterns.warn.test(trimmed)) return 'warn'
    if (this.linePatterns.info.test(trimmed)) return 'info'
    if (this.linePatterns.debug.test(trimmed)) return 'debug'
    if (this.linePatterns.json.test(trimmed)) return 'data'
    
    return 'log'
  }

  /**
   * Normalize a single line
   */
  private normalizeLine(line: string): string {
    let normalized = line.toLowerCase().trim()

    // Apply normalization patterns
    for (const { pattern, replacement } of this.normalizationPatterns) {
      normalized = normalized.replace(pattern, replacement)
    }

    return normalized
  }

  /**
   * Extract log level from a line
   */
  private extractLogLevel(line: string): string | undefined {
    const levelMatch = line.match(/\b(error|warn|warning|info|debug|trace|log)\b/i)
    return levelMatch ? levelMatch[1].toLowerCase() : undefined
  }

  /**
   * Extract timestamp from a line
   */
  private extractTimestamp(line: string): string | undefined {
    const timestampMatch = line.match(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*(Z|[+-]\d{2}:\d{2})?/)
    return timestampMatch ? timestampMatch[0] : undefined
  }

  /**
   * Calculate structural similarity based on line types
   */
  private calculateStructuralSimilarity(linesA: ConsoleLine[], linesB: ConsoleLine[]): number {
    const structureA = linesA.map(l => l.type).join('-')
    const structureB = linesB.map(l => l.type).join('-')

    if (structureA === structureB) return 1

    // Count matching line types at same positions
    const minLength = Math.min(linesA.length, linesB.length)
    const maxLength = Math.max(linesA.length, linesB.length)
    
    let matches = 0
    for (let i = 0; i < minLength; i++) {
      if (linesA[i].type === linesB[i].type) {
        matches++
      }
    }

    return maxLength > 0 ? matches / maxLength : 0
  }

  /**
   * Calculate content similarity
   */
  private calculateContentSimilarity(linesA: ConsoleLine[], linesB: ConsoleLine[]): number {
    const contentA = linesA.map(l => l.normalized).filter(c => c).join('\n')
    const contentB = linesB.map(l => l.normalized).filter(c => c).join('\n')

    if (contentA === contentB) return 1

    // Use Jaccard similarity for content
    const tokensA = new Set(contentA.split(/\s+/))
    const tokensB = new Set(contentB.split(/\s+/))

    const intersection = new Set([...tokensA].filter(t => tokensB.has(t)))
    const union = new Set([...tokensA, ...tokensB])

    return union.size > 0 ? intersection.size / union.size : 0
  }

  /**
   * Calculate sequence similarity
   */
  private calculateSequenceSimilarity(linesA: ConsoleLine[], linesB: ConsoleLine[]): number {
    const seqA = linesA.map(l => l.normalized)
    const seqB = linesB.map(l => l.normalized)

    // Find longest common subsequence
    const lcs = this.longestCommonSubsequence(seqA, seqB)
    const maxLength = Math.max(seqA.length, seqB.length)

    return maxLength > 0 ? lcs / maxLength : 0
  }

  /**
   * Calculate pattern similarity
   */
  private calculatePatternSimilarity(linesA: ConsoleLine[], linesB: ConsoleLine[]): number {
    // Extract patterns (error lines, warning lines, etc.)
    const patternsA = this.extractPatterns(linesA)
    const patternsB = this.extractPatterns(linesB)

    if (patternsA.length === 0 && patternsB.length === 0) {
      return 0.5 // No patterns in either output
    }

    // Compare pattern distributions
    const distributionA = this.getPatternDistribution(patternsA)
    const distributionB = this.getPatternDistribution(patternsB)

    let similarity = 0
    const allTypes = new Set([...Object.keys(distributionA), ...Object.keys(distributionB)])
    
    for (const type of allTypes) {
      const countA = distributionA[type] || 0
      const countB = distributionB[type] || 0
      const maxCount = Math.max(countA, countB)
      
      if (maxCount > 0) {
        similarity += Math.min(countA, countB) / maxCount
      }
    }

    return allTypes.size > 0 ? similarity / allTypes.size : 0
  }

  /**
   * Extract patterns from lines
   */
  private extractPatterns(lines: ConsoleLine[]): Array<{ type: LineType; content: string }> {
    return lines
      .filter(l => l.type !== 'empty' && l.type !== 'log')
      .map(l => ({ type: l.type, content: l.normalized }))
  }

  /**
   * Get pattern distribution
   */
  private getPatternDistribution(patterns: Array<{ type: LineType; content: string }>): Record<string, number> {
    const distribution: Record<string, number> = {}
    
    for (const pattern of patterns) {
      distribution[pattern.type] = (distribution[pattern.type] || 0) + 1
    }
    
    return distribution
  }

  /**
   * Get significant lines (non-empty, non-trivial)
   */
  private getSignificantLines(lines: ConsoleLine[]): ConsoleLine[] {
    return lines.filter(line => 
      line.type !== 'empty' && 
      line.normalized.length > 10 &&
      (line.type === 'error' || line.type === 'warn' || line.normalized.includes('<'))
    ).slice(0, 10) // Keep top 10 significant lines
  }

  /**
   * Calculate confidence based on output quality
   */
  private calculateConfidence(linesA: ConsoleLine[], linesB: ConsoleLine[]): number {
    const avgLines = (linesA.length + linesB.length) / 2
    const hasErrors = [...linesA, ...linesB].some(l => l.type === 'error')
    const hasTimestamps = [...linesA, ...linesB].some(l => l.timestamp)
    const hasStructure = [...linesA, ...linesB].some(l => l.type !== 'log')
    
    let confidence = 0.4

    if (avgLines >= 5) confidence += 0.2
    if (hasErrors) confidence += 0.15
    if (hasTimestamps) confidence += 0.15
    if (hasStructure) confidence += 0.1

    return Math.min(confidence, 1)
  }

  /**
   * Calculate longest common subsequence length
   */
  private longestCommonSubsequence(a: string[], b: string[]): number {
    const m = a.length
    const n = b.length
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
        }
      }
    }

    return dp[m][n]
  }

  /**
   * Get similarity level from score
   */
  private getLevel(score: number): SimilarityLevel {
    if (score >= 0.95) return 'exact'
    if (score >= 0.8) return 'high'
    if (score >= 0.6) return 'medium'
    return 'low'
  }
}