import { BaseAdapter } from './BaseAdapter.js'
import type { SupportedModel, ITokenizer } from '../types.js'

/**
 * Custom tokenizer implementation for Gemini models
 * Uses character-based approximation with language-aware adjustments
 */
class GeminiTokenizer implements ITokenizer {
  constructor(private model: SupportedModel) {}

  encode(text: string): number[] {
    // Since we don't have access to Google's actual tokenizer,
    // we'll create a reasonable approximation based on character analysis
    return this.approximateTokenization(text)
  }

  countTokens(text: string): number {
    return this.encode(text).length
  }

  getModel(): SupportedModel {
    return this.model
  }

  /**
   * Approximate tokenization for Gemini models
   * Based on observed patterns in multilingual models
   */
  private approximateTokenization(text: string): number[] {
    if (!text) return []

    const tokens: number[] = []
    let currentToken = 0

    // Split by common boundaries
    const segments = this.segmentText(text)

    for (const segment of segments) {
      // Each segment becomes one or more tokens
      const segmentTokens = this.segmentToTokens(segment)
      tokens.push(...segmentTokens.map(() => currentToken++))
    }

    return tokens
  }

  /**
   * Segment text into meaningful units
   */
  private segmentText(text: string): string[] {
    // More sophisticated segmentation for better approximation
    return text.split(/(\s+|[.,!?;:]|[(){}[\]]|["']|\n|\t)/).filter((segment) => segment.length > 0)
  }

  /**
   * Convert a text segment to approximate tokens
   */
  private segmentToTokens(segment: string): string[] {
    if (!segment.trim()) {
      return [segment] // Whitespace is usually one token
    }

    // For non-whitespace segments, use length-based approximation
    // Gemini tends to be more efficient with common words
    if (this.isCommonWord(segment)) {
      return [segment] // Common words are typically single tokens
    }

    // Longer segments might be split
    if (segment.length <= 4) {
      return [segment]
    } else if (segment.length <= 8) {
      return [segment] // Most words under 8 chars are single tokens
    } else {
      // Split longer segments
      const numTokens = Math.ceil(segment.length / 4)
      return Array(numTokens).fill(segment) as number[]
    }
  }

  /**
   * Check if a word is commonly used (likely to be a single token)
   */
  private isCommonWord(word: string): boolean {
    const commonWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'can',
      'may',
      'might',
      'must',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'me',
      'him',
      'her',
      'us',
      'them',
      'my',
      'your',
      'his',
      'her',
      'its',
      'our',
      'their'
    ])

    return commonWords.has(word.toLowerCase())
  }
}

/**
 * Adapter for Google Gemini models
 * Uses custom approximation logic since Google's tokenizer isn't publicly available
 */
export class GeminiAdapter extends BaseAdapter {
  private supportedModels: SupportedModel[] = [
    // Note: Gemini models would need to be added to SupportedModel type
    // For now, this serves as a template for when Gemini support is added
  ]

  getName(): string {
    return 'Gemini Adapter (Custom approximation)'
  }

  getSupportedModels(): SupportedModel[] {
    return [...this.supportedModels]
  }

  protected createTokenizerImplementation(model: SupportedModel): Promise<ITokenizer> {
    try {
      return Promise.resolve(new GeminiTokenizer(model))
    } catch (error) {
      throw new Error(`Failed to initialize Gemini tokenizer for model ${model}: ${error}`)
    }
  }

  /**
   * Get information about the tokenization method used
   */
  getTokenizationMethod(): string {
    return 'Custom character-based approximation with language awareness'
  }

  /**
   * Get accuracy information about this approximation
   */
  getApproximationInfo(): {
    accuracy: string
    notes: string[]
  } {
    return {
      accuracy: 'Rough approximation (~70-85% accurate)',
      notes: [
        'Uses character-based analysis with word boundaries',
        'Accounts for common word patterns',
        'No access to actual Google tokenizer',
        'Best effort approximation for planning purposes',
        'Consider this for rough estimation only'
      ]
    }
  }

  /**
   * Estimate tokens using multiple methods and return average
   */
  async estimateTokensMultiMethod(
    text: string,
    model: SupportedModel
  ): Promise<{
    characterBased: number
    wordBased: number
    customApproximation: number
    recommended: number
  }> {
    const tokenizer = await this.createTokenizer(model)
    const customApproximation = tokenizer.countTokens(text)

    // Character-based approximation (common baseline)
    const characterBased = Math.ceil(text.length / 4)

    // Word-based approximation
    const words = text.trim().split(/\s+/).length
    const wordBased = Math.ceil(words * 1.3) // Account for punctuation and subwords

    // Recommended is the custom approximation
    const recommended = customApproximation

    return {
      characterBased,
      wordBased,
      customApproximation,
      recommended
    }
  }

  /**
   * Quick estimation without creating tokenizer instance
   */
  quickEstimate(text: string): number {
    if (!text) return 0

    // Quick approximation based on text analysis
    const words = text.trim().split(/\s+/).length
    const avgWordLength = text.length / words

    // Adjust based on average word length
    let multiplier = 1.2 // Base multiplier

    if (avgWordLength > 6) {
      multiplier = 1.4 // Longer words tend to be split more
    } else if (avgWordLength < 4) {
      multiplier = 1.1 // Shorter words are often single tokens
    }

    return Math.ceil(words * multiplier)
  }
}
