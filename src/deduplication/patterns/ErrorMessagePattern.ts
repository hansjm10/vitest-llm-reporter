/**
 * Error Message Pattern Matcher
 * 
 * Identifies similar error messages by analyzing structure,
 * keywords, and variable parts.
 * 
 * @module ErrorMessagePattern
 */

import type { IPatternMatcher, PatternType, SimilarityScore, SimilarityLevel } from '../../types/deduplication'

/**
 * Token types for error message analysis
 */
type TokenType = 'keyword' | 'variable' | 'literal' | 'number' | 'path' | 'identifier'

/**
 * Token representation
 */
interface Token {
  type: TokenType
  value: string
  normalized: string
  position: number
}

/**
 * Error message pattern matcher implementation
 */
export class ErrorMessagePattern implements IPatternMatcher {
  readonly type: PatternType = 'error-message'
  
  // Common error keywords with higher weight
  private readonly errorKeywords = new Set([
    'error', 'exception', 'fail', 'failed', 'failure',
    'undefined', 'null', 'not', 'cannot', 'unable',
    'invalid', 'missing', 'required', 'expected',
    'unexpected', 'timeout', 'refused', 'denied'
  ])

  // Variable patterns that should be normalized
  private readonly variablePatterns = [
    /\b\d+\b/g,                           // Numbers
    /0x[0-9a-fA-F]+/g,                   // Hex numbers
    /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, // UUIDs
    /\/[\w\-./]+/g,                      // File paths
    /\b[A-Z][a-zA-Z0-9_]*\b/g,          // Class names
    /'[^']*'/g,                          // Single quoted strings
    /"[^"]*"/g,                          // Double quoted strings
    /`[^`]*`/g,                          // Template strings
    /\[[^\]]*\]/g,                       // Array indices
    /\([^)]*\)/g                         // Parenthesized content
  ]

  /**
   * Match two error messages and calculate similarity
   */
  match(a: string, b: string): SimilarityScore {
    const tokensA = this.tokenize(a)
    const tokensB = this.tokenize(b)

    if (tokensA.length === 0 || tokensB.length === 0) {
      return {
        score: 0,
        level: 'low',
        confidence: 0.3
      }
    }

    // Calculate different similarity metrics
    const structuralSimilarity = this.calculateStructuralSimilarity(tokensA, tokensB)
    const keywordSimilarity = this.calculateKeywordSimilarity(tokensA, tokensB)
    const sequenceSimilarity = this.calculateSequenceSimilarity(tokensA, tokensB)
    const lengthSimilarity = this.calculateLengthSimilarity(a, b)

    // Weighted average
    const score = 
      structuralSimilarity * 0.35 +
      keywordSimilarity * 0.30 +
      sequenceSimilarity * 0.25 +
      lengthSimilarity * 0.10

    return {
      score,
      level: this.getLevel(score),
      confidence: this.calculateConfidence(tokensA, tokensB),
      details: {
        structural: structuralSimilarity,
        keyword: keywordSimilarity,
        sequence: sequenceSimilarity,
        length: lengthSimilarity,
        tokenCount: { a: tokensA.length, b: tokensB.length }
      }
    }
  }

  /**
   * Extract a signature from an error message
   */
  extractSignature(text: string): string {
    const tokens = this.tokenize(text)
    const significantTokens = tokens.filter(t => 
      t.type === 'keyword' || 
      t.type === 'literal' ||
      (t.type === 'identifier' && this.errorKeywords.has(t.normalized))
    )

    return significantTokens
      .map(t => t.normalized)
      .join('_')
  }

  /**
   * Normalize an error message for comparison
   */
  normalize(text: string): string {
    let normalized = text.toLowerCase().trim()

    // Replace variable parts with placeholders
    normalized = normalized.replace(/\b\d+\b/g, '<NUM>')
    normalized = normalized.replace(/0x[0-9a-fA-F]+/g, '<HEX>')
    normalized = normalized.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '<UUID>')
    normalized = normalized.replace(/\/[\w\-./]+/g, '<PATH>')
    normalized = normalized.replace(/'[^']*'/g, '<STRING>')
    normalized = normalized.replace(/"[^"]*"/g, '<STRING>')
    normalized = normalized.replace(/`[^`]*`/g, '<STRING>')
    
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ')

    return normalized
  }

  /**
   * Tokenize an error message
   */
  private tokenize(text: string): Token[] {
    const tokens: Token[] = []
    let remaining = text
    let position = 0

    // First, extract variable parts
    const variables: Array<{ pattern: RegExp; type: TokenType; placeholder: string }> = [
      { pattern: /0x[0-9a-fA-F]+/, type: 'number', placeholder: 'HEX' },
      { pattern: /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i, type: 'identifier', placeholder: 'UUID' },
      { pattern: /\/[\w\-./]+/, type: 'path', placeholder: 'PATH' },
      { pattern: /'[^']*'/, type: 'variable', placeholder: 'STRING' },
      { pattern: /"[^"]*"/, type: 'variable', placeholder: 'STRING' },
      { pattern: /`[^`]*`/, type: 'variable', placeholder: 'STRING' },
      { pattern: /\b\d+(\.\d+)?\b/, type: 'number', placeholder: 'NUM' }
    ]

    // Process the text to identify tokens
    const words = text.split(/\s+/)
    
    for (const word of words) {
      if (!word) continue

      const lowerWord = word.toLowerCase()
      let tokenType: TokenType = 'literal'
      let normalized = lowerWord

      // Check if it's a keyword
      if (this.errorKeywords.has(lowerWord)) {
        tokenType = 'keyword'
      } 
      // Check if it matches any variable pattern
      else {
        for (const { pattern, type, placeholder } of variables) {
          if (pattern.test(word)) {
            tokenType = type
            normalized = placeholder
            break
          }
        }
      }

      // Check if it's an identifier (PascalCase or camelCase)
      if (tokenType === 'literal' && /^[A-Z][a-zA-Z0-9]*$/.test(word)) {
        tokenType = 'identifier'
        normalized = 'CLASS'
      } else if (tokenType === 'literal' && /^[a-z][a-zA-Z0-9]*$/.test(word)) {
        tokenType = 'identifier'
        normalized = lowerWord
      }

      tokens.push({
        type: tokenType,
        value: word,
        normalized,
        position
      })

      position++
    }

    return tokens
  }

  /**
   * Calculate structural similarity based on token types
   */
  private calculateStructuralSimilarity(tokensA: Token[], tokensB: Token[]): number {
    const structureA = tokensA.map(t => t.type).join('-')
    const structureB = tokensB.map(t => t.type).join('-')

    if (structureA === structureB) return 1

    // Use edit distance for structural comparison
    const distance = this.editDistance(structureA, structureB)
    const maxLength = Math.max(structureA.length, structureB.length)
    
    return maxLength > 0 ? 1 - (distance / maxLength) : 0
  }

  /**
   * Calculate keyword similarity
   */
  private calculateKeywordSimilarity(tokensA: Token[], tokensB: Token[]): number {
    const keywordsA = new Set(
      tokensA.filter(t => t.type === 'keyword').map(t => t.normalized)
    )
    const keywordsB = new Set(
      tokensB.filter(t => t.type === 'keyword').map(t => t.normalized)
    )

    if (keywordsA.size === 0 && keywordsB.size === 0) {
      return 0.5 // No keywords in either message
    }

    const intersection = new Set([...keywordsA].filter(k => keywordsB.has(k)))
    const union = new Set([...keywordsA, ...keywordsB])

    return union.size > 0 ? intersection.size / union.size : 0
  }

  /**
   * Calculate sequence similarity using normalized tokens
   */
  private calculateSequenceSimilarity(tokensA: Token[], tokensB: Token[]): number {
    const seqA = tokensA.map(t => t.normalized)
    const seqB = tokensB.map(t => t.normalized)

    // Find longest common subsequence
    const lcs = this.longestCommonSubsequence(seqA, seqB)
    const maxLength = Math.max(seqA.length, seqB.length)

    return maxLength > 0 ? lcs / maxLength : 0
  }

  /**
   * Calculate length similarity
   */
  private calculateLengthSimilarity(a: string, b: string): number {
    const lengthA = a.length
    const lengthB = b.length
    const maxLength = Math.max(lengthA, lengthB)
    const minLength = Math.min(lengthA, lengthB)

    if (maxLength === 0) return 1

    return minLength / maxLength
  }

  /**
   * Calculate confidence based on token quality
   */
  private calculateConfidence(tokensA: Token[], tokensB: Token[]): number {
    const avgTokens = (tokensA.length + tokensB.length) / 2
    const hasKeywords = [...tokensA, ...tokensB].some(t => t.type === 'keyword')
    const hasVariables = [...tokensA, ...tokensB].some(t => t.type === 'variable')
    
    let confidence = 0.5

    if (avgTokens >= 5) confidence += 0.2
    if (hasKeywords) confidence += 0.2
    if (hasVariables) confidence += 0.1

    return Math.min(confidence, 1)
  }

  /**
   * Calculate edit distance between two strings
   */
  private editDistance(a: string, b: string): number {
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
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
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