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
  TruncationConfig,
  TruncationResult,
  ContentType,
  HeadTailOptions
} from '../types.js'

/**
 * Default configuration for head/tail truncation
 */
const DEFAULT_HEAD_TAIL_CONFIG: Required<HeadTailOptions> = {
  headRatio: 0.4,           // 40% from beginning
  tailRatio: 0.4,           // 40% from end  
  separator: '\n...\n',     // Separator between head and tail
  preserveLines: true,      // Keep complete lines
  maxLines: 100,            // Maximum total lines
  minPreserve: 100,         // Minimum characters to preserve
  priorityKeywords: [],
  priorityMarkers: {
    error: [],
    assertion: [],
    userCode: []
  }
}

/**
 * Head/Tail truncation strategy implementation
 */
export class HeadTailStrategy implements ITruncationStrategy {
  public readonly name = 'head-tail'
  public readonly description = 'Preserves content from beginning and end with configurable ratios'

  /**
   * Truncate content preserving head and tail sections
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

    // If content is too small to meaningfully truncate, preserve it
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

    let truncatedContent: string

    if (mergedConfig.preserveLines) {
      truncatedContent = this.truncateByLines(content, context.targetSize, mergedConfig)
    } else {
      truncatedContent = this.truncateByCharacters(content, context.targetSize, mergedConfig)
    }

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

    // Estimate final size based on head/tail ratios and separator
    const separatorSize = mergedConfig.separator?.length || 0
    const availableSize = context.targetSize - separatorSize
    
    let estimatedSize = availableSize

    // Adjust for line preservation if enabled
    if (mergedConfig.preserveLines) {
      const lines = content.split('\n')
      const avgLineLength = content.length / lines.length
      const maxLines = Math.min(mergedConfig.maxLines || lines.length, Math.floor(availableSize / avgLineLength))
      estimatedSize = Math.min(maxLines * avgLineLength, availableSize)
    }

    // Add separator back
    estimatedSize += separatorSize

    return {
      finalSize: Math.min(estimatedSize, originalSize),
      ratio: Math.min(estimatedSize / originalSize, 1),
      wasTruncated: estimatedSize < originalSize
    }
  }

  /**
   * Check if strategy supports content type
   */
  supports(contentType: ContentType): boolean {
    // Head/tail works well for most content types except stack traces
    // which need more intelligent frame selection
    return contentType !== 'stack-trace'
  }

  /**
   * Get default configuration
   */
  getDefaultConfig(): TruncationConfig {
    return { ...DEFAULT_HEAD_TAIL_CONFIG }
  }

  /**
   * Truncate by preserving complete lines
   */
  private truncateByLines(
    content: string,
    targetSize: number,
    config: Required<HeadTailOptions>
  ): string {
    const lines = content.split('\n')
    const totalLines = lines.length

    // If we have very few lines, just preserve all
    if (totalLines <= 3) {
      return content
    }

    // Calculate available space for content (minus separator)
    const separatorSize = config.separator.length
    const availableSize = targetSize - separatorSize

    // Determine how many lines to take from head and tail
    const maxTotalLines = Math.min(config.maxLines, totalLines)
    const headLines = Math.floor(maxTotalLines * config.headRatio)
    const tailLines = Math.floor(maxTotalLines * config.tailRatio)

    // Adjust if we have more lines than we can use
    let actualHeadLines = headLines
    let actualTailLines = tailLines

    // Calculate actual content size to ensure we stay within target
    let currentSize = 0
    const headContent = lines.slice(0, actualHeadLines)
    const tailContent = lines.slice(-actualTailLines)
    
    // Count size of head and tail content
    currentSize += headContent.join('\n').length
    currentSize += tailContent.join('\n').length
    currentSize += separatorSize

    // Adjust line counts if we exceed target size
    while (currentSize > targetSize && (actualHeadLines > 1 || actualTailLines > 1)) {
      if (actualHeadLines > actualTailLines && actualHeadLines > 1) {
        actualHeadLines--
      } else if (actualTailLines > 1) {
        actualTailLines--
      } else {
        actualHeadLines--
      }

      // Recalculate size
      const newHeadContent = lines.slice(0, actualHeadLines)
      const newTailContent = lines.slice(-actualTailLines)
      currentSize = newHeadContent.join('\n').length + 
                   newTailContent.join('\n').length + 
                   separatorSize
    }

    // Build final content
    const headPart = lines.slice(0, actualHeadLines).join('\n')
    const tailPart = lines.slice(-actualTailLines).join('\n')

    // Avoid duplicate content if head and tail overlap
    if (actualHeadLines + actualTailLines >= totalLines) {
      return content // Return original if we'd include most of it anyway
    }

    return `${headPart}${config.separator}${tailPart}`
  }

  /**
   * Truncate by character count
   */
  private truncateByCharacters(
    content: string,
    targetSize: number,
    config: Required<HeadTailOptions>
  ): string {
    const totalLength = content.length
    const separatorSize = config.separator.length

    // Calculate available space for content
    const availableSize = targetSize - separatorSize

    // Calculate head and tail sizes
    const headSize = Math.floor(availableSize * config.headRatio)
    const tailSize = Math.floor(availableSize * config.tailRatio)

    // Ensure we don't overlap
    if (headSize + tailSize >= totalLength) {
      return content
    }

    // Extract head and tail
    const headPart = content.substring(0, headSize)
    const tailPart = content.substring(totalLength - tailSize)

    return `${headPart}${config.separator}${tailPart}`
  }

  /**
   * Merge user config with defaults
   */
  private mergeConfig(config?: TruncationConfig): Required<HeadTailOptions> {
    return {
      ...DEFAULT_HEAD_TAIL_CONFIG,
      ...config,
      // Ensure ratios don't exceed 1.0 total
      headRatio: Math.min(config?.headRatio || DEFAULT_HEAD_TAIL_CONFIG.headRatio, 0.8),
      tailRatio: Math.min(config?.tailRatio || DEFAULT_HEAD_TAIL_CONFIG.tailRatio, 0.8)
    } as Required<HeadTailOptions>
  }
}