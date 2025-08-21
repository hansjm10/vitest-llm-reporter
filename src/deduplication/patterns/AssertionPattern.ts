/**
 * Assertion Pattern Matcher
 * 
 * Identifies similar assertion failures by analyzing
 * assertion types, expected/actual values, and operators.
 * 
 * @module AssertionPattern
 */

import type { IPatternMatcher, PatternType, SimilarityScore, SimilarityLevel } from '../../types/deduplication'

/**
 * Assertion types
 */
type AssertionType = 
  | 'equality' 
  | 'inequality' 
  | 'comparison' 
  | 'truthiness' 
  | 'type' 
  | 'property' 
  | 'exception' 
  | 'custom'

/**
 * Parsed assertion structure
 */
interface ParsedAssertion {
  type: AssertionType
  operator?: string
  expected?: string
  actual?: string
  property?: string
  message?: string
  normalizedExpected?: string
  normalizedActual?: string
}

/**
 * Assertion pattern matcher implementation
 */
export class AssertionPattern implements IPatternMatcher {
  readonly type: PatternType = 'assertion'

  // Common assertion operators
  private readonly operators = {
    equality: ['===', '==', 'toBe', 'toEqual', 'equals', 'eq', 'strictEqual', 'deepEqual'],
    inequality: ['!==', '!=', 'notToBe', 'notEqual', 'ne', 'notStrictEqual'],
    comparison: ['>', '<', '>=', '<=', 'toBeGreaterThan', 'toBeLessThan', 'gt', 'lt', 'gte', 'lte'],
    truthiness: ['toBeTruthy', 'toBeFalsy', 'toBeTrue', 'toBeFalse', 'ok', 'notOk'],
    type: ['toBeInstanceOf', 'toBeTypeOf', 'instanceof', 'typeof'],
    property: ['toHaveProperty', 'toHaveLength', 'toContain', 'includes', 'has'],
    exception: ['toThrow', 'toThrowError', 'throws', 'rejects']
  }

  // Patterns for extracting assertion components
  private readonly extractionPatterns = [
    // Jest/Vitest style: expect(actual).toBe(expected)
    /expect\((.+?)\)\.([\w]+)\((.+?)\)/,
    // Chai style: expect(actual).to.be.equal(expected)
    /expect\((.+?)\)\.to\.(?:be\.)?(\w+)\((.+?)\)/,
    // Assert style: assert.equal(actual, expected)
    /assert\.(\w+)\((.+?),\s*(.+?)\)/,
    // Comparison: actual === expected
    /(.+?)\s*(===|!==|==|!=|>|<|>=|<=)\s*(.+)/,
    // Property check: actual.property
    /(.+?)\.(\w+)/
  ]

  /**
   * Match two assertion failures and calculate similarity
   */
  match(a: string, b: string): SimilarityScore {
    const assertionA = this.parseAssertion(a)
    const assertionB = this.parseAssertion(b)

    if (!assertionA || !assertionB) {
      return {
        score: 0,
        level: 'low',
        confidence: 0.2
      }
    }

    // Calculate different similarity metrics
    const typeSimilarity = this.calculateTypeSimilarity(assertionA, assertionB)
    const operatorSimilarity = this.calculateOperatorSimilarity(assertionA, assertionB)
    const valueSimilarity = this.calculateValueSimilarity(assertionA, assertionB)
    const structureSimilarity = this.calculateStructureSimilarity(assertionA, assertionB)

    // Weighted average
    const score = 
      typeSimilarity * 0.3 +
      operatorSimilarity * 0.2 +
      valueSimilarity * 0.35 +
      structureSimilarity * 0.15

    return {
      score,
      level: this.getLevel(score),
      confidence: this.calculateConfidence(assertionA, assertionB),
      details: {
        type: typeSimilarity,
        operator: operatorSimilarity,
        value: valueSimilarity,
        structure: structureSimilarity
      }
    }
  }

  /**
   * Extract a signature from an assertion
   */
  extractSignature(text: string): string {
    const assertion = this.parseAssertion(text)
    
    if (!assertion) {
      return this.normalize(text).substring(0, 50)
    }

    const parts = [
      assertion.type,
      assertion.operator || 'unknown',
      assertion.normalizedExpected || 'none',
      assertion.normalizedActual || 'none'
    ]

    return parts.join(':')
  }

  /**
   * Normalize an assertion for comparison
   */
  normalize(text: string): string {
    let normalized = text.toLowerCase().trim()

    // Normalize values
    normalized = normalized.replace(/\b\d+\b/g, '<NUM>')
    normalized = normalized.replace(/'[^']*'/g, '<STRING>')
    normalized = normalized.replace(/"[^"]*"/g, '<STRING>')
    normalized = normalized.replace(/`[^`]*`/g, '<STRING>')
    normalized = normalized.replace(/\[.*?\]/g, '<ARRAY>')
    normalized = normalized.replace(/\{.*?\}/g, '<OBJECT>')
    
    // Normalize common assertion patterns
    normalized = normalized.replace(/expect\((.*?)\)/g, 'expect(<VALUE>)')
    normalized = normalized.replace(/assert\.\w+/g, 'assert.METHOD')
    
    // Normalize whitespace
    normalized = normalized.replace(/\s+/g, ' ')

    return normalized
  }

  /**
   * Parse an assertion string
   */
  private parseAssertion(text: string): ParsedAssertion | null {
    // Try to match against known patterns
    for (const pattern of this.extractionPatterns) {
      const match = text.match(pattern)
      if (match) {
        return this.buildAssertion(match, text)
      }
    }

    // Fallback: try to identify by keywords
    const assertion = this.parseByKeywords(text)
    if (assertion) {
      return assertion
    }

    return null
  }

  /**
   * Build assertion from regex match
   */
  private buildAssertion(match: RegExpMatchArray, fullText: string): ParsedAssertion {
    const assertion: ParsedAssertion = {
      type: 'custom',
      message: fullText
    }

    // Determine assertion type based on operator/method
    if (match[2]) {
      const operator = match[2].toLowerCase()
      assertion.operator = operator
      assertion.type = this.getAssertionType(operator)
    }

    // Extract values
    if (match[1]) {
      assertion.actual = match[1].trim()
      assertion.normalizedActual = this.normalizeValue(assertion.actual)
    }

    if (match[3]) {
      assertion.expected = match[3].trim()
      assertion.normalizedExpected = this.normalizeValue(assertion.expected)
    }

    return assertion
  }

  /**
   * Parse assertion by looking for keywords
   */
  private parseByKeywords(text: string): ParsedAssertion | null {
    const lowerText = text.toLowerCase()
    
    // Look for expected/actual patterns
    const expectedMatch = text.match(/expected:?\s*(.+?)(?:\n|$|,)/i)
    const actualMatch = text.match(/(?:actual|received|got):?\s*(.+?)(?:\n|$|,)/i)
    
    if (expectedMatch || actualMatch) {
      const assertion: ParsedAssertion = {
        type: 'equality',
        message: text
      }

      if (expectedMatch) {
        assertion.expected = expectedMatch[1].trim()
        assertion.normalizedExpected = this.normalizeValue(assertion.expected)
      }

      if (actualMatch) {
        assertion.actual = actualMatch[1].trim()
        assertion.normalizedActual = this.normalizeValue(assertion.actual)
      }

      // Try to determine type from context
      for (const [type, operators] of Object.entries(this.operators)) {
        if (operators.some(op => lowerText.includes(op))) {
          assertion.type = type as AssertionType
          break
        }
      }

      return assertion
    }

    return null
  }

  /**
   * Get assertion type from operator
   */
  private getAssertionType(operator: string): AssertionType {
    const lowerOp = operator.toLowerCase()
    
    for (const [type, operators] of Object.entries(this.operators)) {
      if (operators.includes(lowerOp)) {
        return type as AssertionType
      }
    }

    return 'custom'
  }

  /**
   * Normalize a value for comparison
   */
  private normalizeValue(value: string): string {
    let normalized = value.trim()

    // Identify value type and normalize
    if (/^(true|false)$/i.test(normalized)) {
      return 'BOOLEAN'
    }
    if (/^(null|undefined)$/i.test(normalized)) {
      return 'NULL'
    }
    if (/^\d+(\.\d+)?$/.test(normalized)) {
      return 'NUMBER'
    }
    if (/^['"`].*['"`]$/.test(normalized)) {
      return 'STRING'
    }
    if (/^\[.*\]$/.test(normalized)) {
      return 'ARRAY'
    }
    if (/^\{.*\}$/.test(normalized)) {
      return 'OBJECT'
    }
    if (/^\/.*\/[gimsu]*$/.test(normalized)) {
      return 'REGEX'
    }

    // Default normalization
    return normalized
      .replace(/\b\d+\b/g, 'NUM')
      .replace(/['"`]/g, '')
      .toLowerCase()
  }

  /**
   * Calculate type similarity
   */
  private calculateTypeSimilarity(a: ParsedAssertion, b: ParsedAssertion): number {
    return a.type === b.type ? 1 : 0.3
  }

  /**
   * Calculate operator similarity
   */
  private calculateOperatorSimilarity(a: ParsedAssertion, b: ParsedAssertion): number {
    if (!a.operator && !b.operator) return 0.5
    if (!a.operator || !b.operator) return 0.2
    
    if (a.operator === b.operator) return 1

    // Check if operators are in the same category
    for (const operators of Object.values(this.operators)) {
      if (operators.includes(a.operator) && operators.includes(b.operator)) {
        return 0.7
      }
    }

    return 0
  }

  /**
   * Calculate value similarity
   */
  private calculateValueSimilarity(a: ParsedAssertion, b: ParsedAssertion): number {
    let similarity = 0
    let count = 0

    // Compare expected values
    if (a.normalizedExpected && b.normalizedExpected) {
      similarity += a.normalizedExpected === b.normalizedExpected ? 1 : 0.3
      count++
    }

    // Compare actual values
    if (a.normalizedActual && b.normalizedActual) {
      similarity += a.normalizedActual === b.normalizedActual ? 1 : 0.3
      count++
    }

    // If no values to compare
    if (count === 0) {
      return 0.5
    }

    return similarity / count
  }

  /**
   * Calculate structure similarity
   */
  private calculateStructureSimilarity(a: ParsedAssertion, b: ParsedAssertion): number {
    const hasExpectedA = !!a.expected
    const hasExpectedB = !!b.expected
    const hasActualA = !!a.actual
    const hasActualB = !!b.actual
    const hasPropertyA = !!a.property
    const hasPropertyB = !!b.property

    let matches = 0
    let total = 0

    if (hasExpectedA === hasExpectedB) matches++
    total++

    if (hasActualA === hasActualB) matches++
    total++

    if (hasPropertyA === hasPropertyB) matches++
    total++

    return total > 0 ? matches / total : 0
  }

  /**
   * Calculate confidence based on assertion quality
   */
  private calculateConfidence(a: ParsedAssertion, b: ParsedAssertion): number {
    let confidence = 0.5

    // Higher confidence if we successfully parsed both assertions
    if (a.type !== 'custom' && b.type !== 'custom') {
      confidence += 0.2
    }

    // Higher confidence if we have values to compare
    if ((a.expected || a.actual) && (b.expected || b.actual)) {
      confidence += 0.2
    }

    // Higher confidence if operators are identified
    if (a.operator && b.operator) {
      confidence += 0.1
    }

    return Math.min(confidence, 1)
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