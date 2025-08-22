/**
 * Stack Trace Pattern Matcher
 *
 * Identifies similar stack traces by analyzing frame patterns,
 * error locations, and call sequences.
 *
 * @module StackTracePattern
 */

import type {
  IPatternMatcher,
  PatternType,
  SimilarityScore,
  SimilarityLevel
} from '../../types/deduplication'

/**
 * Stack frame representation
 */
interface StackFrame {
  function?: string
  file?: string
  line?: number
  column?: number
  native?: boolean
}

/**
 * Stack trace pattern matcher implementation
 */
export class StackTracePattern implements IPatternMatcher {
  readonly type: PatternType = 'stack-trace'

  private readonly lineNumberWeight = 0.1
  private readonly filePathWeight = 0.3
  private readonly functionNameWeight = 0.4
  private readonly sequenceWeight = 0.2

  /**
   * Match two stack traces and calculate similarity
   */
  match(a: string, b: string): SimilarityScore {
    const framesA = this.parseStackTrace(a)
    const framesB = this.parseStackTrace(b)

    if (framesA.length === 0 || framesB.length === 0) {
      return {
        score: 0,
        level: 'low',
        confidence: 0.5
      }
    }

    // Calculate various similarity metrics
    const structuralSimilarity = this.calculateStructuralSimilarity(framesA, framesB)
    const sequenceSimilarity = this.calculateSequenceSimilarity(framesA, framesB)
    const errorLocationSimilarity = this.calculateErrorLocationSimilarity(framesA, framesB)

    // Weighted average
    const score =
      structuralSimilarity * 0.4 + sequenceSimilarity * 0.3 + errorLocationSimilarity * 0.3

    return {
      score,
      level: this.getLevel(score),
      confidence: this.calculateConfidence(framesA, framesB),
      details: {
        structural: structuralSimilarity,
        sequence: sequenceSimilarity,
        errorLocation: errorLocationSimilarity,
        frameCount: { a: framesA.length, b: framesB.length }
      }
    }
  }

  /**
   * Extract a signature from a stack trace
   */
  extractSignature(text: string): string {
    const frames = this.parseStackTrace(text)
    const significantFrames = this.getSignificantFrames(frames)

    return significantFrames
      .map((frame) => {
        const parts = []
        if (frame.function) parts.push(frame.function)
        if (frame.file) {
          // Keep the original file extension in signature
          const file = frame.file.replace(/\\/g, '/')
          parts.push(file.includes('/') ? file.substring(file.lastIndexOf('/') + 1) : file)
        }
        return parts.join('@')
      })
      .join('|')
  }

  /**
   * Normalize a stack trace for comparison
   */
  normalize(text: string): string {
    const frames = this.parseStackTrace(text)
    return frames.map((frame) => this.normalizeFrame(frame)).join('\n')
  }

  /**
   * Parse a stack trace string into frames
   */
  private parseStackTrace(stackTrace: string): StackFrame[] {
    const lines = stackTrace.split('\n')
    const frames: StackFrame[] = []

    for (const line of lines) {
      const frame = this.parseStackFrame(line)
      if (frame) {
        frames.push(frame)
      }
    }

    return frames
  }

  /**
   * Parse a single stack frame line
   */
  private parseStackFrame(line: string): StackFrame | null {
    // Common patterns for stack frames
    const patterns = [
      // Node.js/V8 pattern: at Function.name (file:line:column)
      /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/,
      // Alternative pattern: at file:line:column
      /^\s*at\s+(.+?):(\d+):(\d+)$/,
      // Simple pattern with just file and line
      /^\s*(.+?):(\d+)$/,
      // Pattern with function name only
      /^\s*at\s+(.+?)$/
    ]

    for (const pattern of patterns) {
      const match = line.match(pattern)
      if (match) {
        if (match.length === 5) {
          // Full pattern with function name
          return {
            function: match[1] || undefined,
            file: match[2],
            line: parseInt(match[3], 10),
            column: parseInt(match[4], 10)
          }
        } else if (match.length === 4) {
          // Pattern without function name
          return {
            file: match[1],
            line: parseInt(match[2], 10),
            column: parseInt(match[3], 10)
          }
        } else if (match.length === 3) {
          // Simple file:line pattern
          return {
            file: match[1],
            line: parseInt(match[2], 10)
          }
        } else if (match.length === 2) {
          // Function name only
          return {
            function: match[1]
          }
        }
      }
    }

    return null
  }

  /**
   * Calculate structural similarity between frame sets
   */
  private calculateStructuralSimilarity(framesA: StackFrame[], framesB: StackFrame[]): number {
    const minLength = Math.min(framesA.length, framesB.length)
    const maxLength = Math.max(framesA.length, framesB.length)

    if (maxLength === 0) return 0

    let matchingFrames = 0

    for (let i = 0; i < minLength; i++) {
      const similarity = this.compareFrames(framesA[i], framesB[i])
      matchingFrames += similarity
    }

    return matchingFrames / maxLength
  }

  /**
   * Calculate sequence similarity using LCS approach
   */
  private calculateSequenceSimilarity(framesA: StackFrame[], framesB: StackFrame[]): number {
    const sigA = framesA.map((f) => this.getFrameSignature(f))
    const sigB = framesB.map((f) => this.getFrameSignature(f))

    const lcs = this.longestCommonSubsequence(sigA, sigB)
    const maxLength = Math.max(sigA.length, sigB.length)

    return maxLength > 0 ? lcs / maxLength : 0
  }

  /**
   * Calculate error location similarity (top frames)
   */
  private calculateErrorLocationSimilarity(framesA: StackFrame[], framesB: StackFrame[]): number {
    const topFramesCount = 3
    const topA = framesA.slice(0, topFramesCount)
    const topB = framesB.slice(0, topFramesCount)

    let totalSimilarity = 0
    let totalWeight = 0

    for (let i = 0; i < Math.min(topA.length, topB.length); i++) {
      const weight = 1 / (i + 1) // Higher weight for top frames
      const similarity = this.compareFrames(topA[i], topB[i])
      totalSimilarity += similarity * weight
      totalWeight += weight
    }

    return totalWeight > 0 ? totalSimilarity / totalWeight : 0
  }

  /**
   * Compare two frames
   */
  private compareFrames(a: StackFrame, b: StackFrame): number {
    let similarity = 0
    let totalWeight = 0

    // Compare function names
    if (a.function && b.function) {
      const funcSim = this.stringSimilarity(a.function, b.function)
      similarity += funcSim * this.functionNameWeight
      totalWeight += this.functionNameWeight
    }

    // Compare file paths
    if (a.file && b.file) {
      const fileSim = this.filePathSimilarity(a.file, b.file)
      similarity += fileSim * this.filePathWeight
      totalWeight += this.filePathWeight
    }

    // Compare line numbers (with tolerance)
    if (a.line !== undefined && b.line !== undefined) {
      const lineDiff = Math.abs(a.line - b.line)
      const lineSim = lineDiff <= 5 ? 1 - (lineDiff / 5) * 0.5 : 0
      similarity += lineSim * this.lineNumberWeight
      totalWeight += this.lineNumberWeight
    }

    return totalWeight > 0 ? similarity / totalWeight : 0
  }

  /**
   * Get frame signature for comparison
   */
  private getFrameSignature(frame: StackFrame): string {
    const parts = []
    if (frame.function) parts.push(frame.function)
    if (frame.file) parts.push(this.normalizeFilePath(frame.file))
    return parts.join('@')
  }

  /**
   * Get significant frames (non-native, non-node_modules)
   */
  private getSignificantFrames(frames: StackFrame[]): StackFrame[] {
    return frames
      .filter((frame) => {
        if (frame.native) return false
        if (frame.file && frame.file.includes('node_modules')) return false
        return true
      })
      .slice(0, 10) // Keep top 10 significant frames
  }

  /**
   * Normalize a frame for output
   */
  private normalizeFrame(frame: StackFrame): string {
    const parts = []

    if (frame.function) {
      parts.push(`at ${frame.function}`)
    } else {
      parts.push('at')
    }

    if (frame.file) {
      const location = [`${this.normalizeFilePath(frame.file)}`]
      if (frame.line) location.push(`:${frame.line}`)
      if (frame.column) location.push(`:${frame.column}`)
      parts.push(`(${location.join('')})`)
    }

    return parts.join(' ')
  }

  /**
   * Normalize file path for comparison
   */
  private normalizeFilePath(path: string): string {
    // Remove absolute path prefixes
    const normalized = path
      .replace(/^.*\/node_modules\//, 'node_modules/')
      .replace(/^.*\/src\//, 'src/')
      .replace(/^.*\/test\//, 'test/')
      .replace(/^.*\/tests\//, 'tests/')
      .replace(/\\/g, '/') // Normalize path separators

    // Remove common file extensions variations
    return normalized.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '.js')
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1

    const maxLen = Math.max(a.length, b.length)
    if (maxLen === 0) return 1

    const distance = this.levenshteinDistance(a, b)
    return 1 - distance / maxLen
  }

  /**
   * Calculate file path similarity
   */
  private filePathSimilarity(a: string, b: string): number {
    const normalizedA = this.normalizeFilePath(a)
    const normalizedB = this.normalizeFilePath(b)

    if (normalizedA === normalizedB) return 1

    // Check if they're in the same directory
    const dirA = normalizedA.substring(0, normalizedA.lastIndexOf('/'))
    const dirB = normalizedB.substring(0, normalizedB.lastIndexOf('/'))

    if (dirA === dirB) {
      // Same directory, compare filenames
      const fileA = normalizedA.substring(normalizedA.lastIndexOf('/') + 1)
      const fileB = normalizedB.substring(normalizedB.lastIndexOf('/') + 1)
      return 0.5 + this.stringSimilarity(fileA, fileB) * 0.5
    }

    return this.stringSimilarity(normalizedA, normalizedB)
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        }
      }
    }

    return matrix[b.length][a.length]
  }

  /**
   * Calculate longest common subsequence length
   */
  private longestCommonSubsequence(a: string[], b: string[]): number {
    const m = a.length
    const n = b.length
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0) as number[])

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
   * Calculate confidence based on frame quality
   */
  private calculateConfidence(framesA: StackFrame[], framesB: StackFrame[]): number {
    const avgFrames = (framesA.length + framesB.length) / 2
    const hasFileInfo = [...framesA, ...framesB].some((f) => f.file)
    const hasFunctionInfo = [...framesA, ...framesB].some((f) => f.function)

    let confidence = 0.5

    if (avgFrames >= 5) confidence += 0.2
    if (hasFileInfo) confidence += 0.2
    if (hasFunctionInfo) confidence += 0.1

    return Math.min(confidence, 1)
  }

  /**
   * Get similarity level from score
   */
  private getLevel(score: number): SimilarityLevel {
    if (score >= 1.0) return 'exact'
    if (score >= 0.8) return 'high'
    if (score >= 0.6) return 'medium'
    return 'low'
  }
}
