/**
 * Head/Tail Truncation Strategy
 *
 * Simple truncation strategy that preserves content from the beginning
 * and end of the input, with configurable ratios for each section.
 * This maintains both initial context and final results while removing
 * middle content that may be less critical for debugging.
 */

import type {
  ITruncationStrategy,
  TruncationContext,
  TruncationResult,
  ContentType
} from '../types'
import { getTokenCounter } from '../../tokenization/TokenCounter'

/**
 * Head/Tail truncation strategy implementation
 */
export class HeadTailStrategy implements ITruncationStrategy {
  public readonly name = 'head-tail'
  public readonly priority = 2

  /**
   * Truncate content preserving head and tail sections
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

    // Configuration from context metadata
    const headRatio = (context.metadata?.headRatio as number) ?? 0.4
    const tailRatio = (context.metadata?.tailRatio as number) ?? 0.4
    const separator = (context.metadata?.separator as string) ?? '\n...\n'
    const preserveLines = (context.metadata?.preserveLines as boolean) ?? true

    let truncatedContent: string

    if (preserveLines) {
      truncatedContent = this.truncateByLines(content, maxTokens, headRatio, tailRatio, separator, context)
    } else {
      truncatedContent = this.truncateByCharacters(content, maxTokens, headRatio, tailRatio, separator, context)
    }

    const finalTokens = await tokenCounter.countTokens(truncatedContent, context.model)

    return {
      content: truncatedContent,
      tokenCount: finalTokens,
      tokensSaved: originalTokens - finalTokens,
      wasTruncated: true,
      strategyUsed: this.name
    }
  }

  /**
   * Check if strategy can handle the given content
   */
  canTruncate(content: string, context: TruncationContext): boolean {
    // Head/tail works well for most content types except when structure preservation is critical
    return !context.preserveStructure || context.contentType !== 'json'
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

    // Estimate that head/tail preserves about 70-80% of original content typically
    const estimatedPreserved = Math.floor(originalTokens * 0.75)
    const estimatedFinal = Math.min(estimatedPreserved, maxTokens)
    
    return Math.max(0, originalTokens - estimatedFinal)
  }

  /**
   * Truncate by preserving complete lines
   */
  private truncateByLines(
    content: string,
    maxTokens: number,
    headRatio: number,
    tailRatio: number,
    separator: string,
    context: TruncationContext
  ): string {
    const lines = content.split('\n')
    const totalLines = lines.length

    if (totalLines <= 3) {
      return content
    }

    // Start with a reasonable distribution
    let headLines = Math.floor(totalLines * headRatio)
    let tailLines = Math.floor(totalLines * tailRatio)

    // Ensure we don't exceed total lines
    if (headLines + tailLines >= totalLines) {
      headLines = Math.floor(totalLines * 0.4)
      tailLines = Math.floor(totalLines * 0.4)
    }

    // Build and test truncated content iteratively
    let truncatedContent = this.buildTruncatedContent(lines, headLines, tailLines, separator)
    
    // If still too large, reduce further
    while (headLines + tailLines > 2) {
      const estimatedTokens = Math.floor(truncatedContent.length / 4) // Rough estimate
      if (estimatedTokens <= maxTokens) {
        break
      }

      if (headLines > tailLines) {
        headLines--
      } else {
        tailLines--
      }

      truncatedContent = this.buildTruncatedContent(lines, headLines, tailLines, separator)
    }

    return truncatedContent
  }

  /**
   * Truncate by character count
   */
  private truncateByCharacters(
    content: string,
    maxTokens: number,
    headRatio: number,
    tailRatio: number,
    separator: string,
    context: TruncationContext
  ): string {
    const totalLength = content.length
    const separatorLength = separator.length

    // Estimate available characters (roughly 4 chars per token)
    const availableChars = (maxTokens * 4) - separatorLength

    const headChars = Math.floor(availableChars * headRatio)
    const tailChars = Math.floor(availableChars * tailRatio)

    // Ensure we don't overlap
    if (headChars + tailChars >= totalLength) {
      return content
    }

    const headPart = content.substring(0, headChars)
    const tailPart = content.substring(totalLength - tailChars)

    return `${headPart}${separator}${tailPart}`
  }

  /**
   * Build truncated content from selected lines
   */
  private buildTruncatedContent(
    lines: string[],
    headLines: number,
    tailLines: number,
    separator: string
  ): string {
    const headPart = lines.slice(0, headLines).join('\n')
    const tailPart = lines.slice(-tailLines).join('\n')

    // Avoid duplicate content if head and tail overlap
    if (headLines + tailLines >= lines.length) {
      return lines.join('\n')
    }

    return `${headPart}${separator}${tailPart}`
  }
}