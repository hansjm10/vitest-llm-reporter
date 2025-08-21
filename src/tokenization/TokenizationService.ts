import type {
  SupportedModel,
  TokenizationConfig,
  TokenizationResult,
  CacheEntry,
  CacheKey,
  ITokenizer,
  ITokenizerFactory
} from './types.js'
import { TokenizationCache } from './cache.js'
import {
  GPTAdapter,
  ClaudeAdapter,
  GeminiAdapter,
  type ITokenizationAdapter
} from './adapters/index.js'

/**
 * Model to adapter mapping
 */
const MODEL_ADAPTER_MAP: Record<string, new () => ITokenizationAdapter> = {
  gpt: GPTAdapter,
  claude: ClaudeAdapter,
  gemini: GeminiAdapter
}

/**
 * Get the appropriate adapter for a model
 */
function getAdapterForModel(model: SupportedModel): ITokenizationAdapter {
  let adapterClass: new () => ITokenizationAdapter

  if (model.startsWith('gpt-')) {
    adapterClass = MODEL_ADAPTER_MAP['gpt']
  } else if (model.startsWith('claude-')) {
    adapterClass = MODEL_ADAPTER_MAP['claude']
  } else if (model.startsWith('gemini-')) {
    adapterClass = MODEL_ADAPTER_MAP['gemini']
  } else {
    // Default to GPT adapter for unknown models
    adapterClass = MODEL_ADAPTER_MAP['gpt']
  }

  return new adapterClass()
}

/**
 * Adapter-based tokenizer factory
 */
class AdapterTokenizerFactory implements ITokenizerFactory {
  private adapters = new Map<string, ITokenizationAdapter>()
  private lazyLoad: boolean

  constructor(lazyLoad = true) {
    this.lazyLoad = lazyLoad
  }

  async createTokenizer(model: SupportedModel): Promise<ITokenizer> {
    const adapter = this.getOrCreateAdapter(model)
    return adapter.createTokenizer(model)
  }

  isModelSupported(model: string): model is SupportedModel {
    try {
      const adapter = this.getOrCreateAdapter(model as SupportedModel)
      return adapter.supportsModel(model as SupportedModel)
    } catch {
      return false
    }
  }

  /**
   * Get or create adapter for a model
   */
  private getOrCreateAdapter(model: SupportedModel): ITokenizationAdapter {
    const adapterKey = this.getAdapterKey(model)

    let adapter = this.adapters.get(adapterKey)
    if (!adapter) {
      adapter = getAdapterForModel(model)
      this.adapters.set(adapterKey, adapter)
    }

    return adapter
  }

  /**
   * Get adapter cache key for a model
   */
  private getAdapterKey(model: SupportedModel): string {
    if (model.startsWith('gpt-')) return 'gpt'
    if (model.startsWith('claude-')) return 'claude'
    if (model.startsWith('gemini-')) return 'gemini'
    return 'gpt' // Default
  }

  /**
   * Preload tokenizers for all models (useful when lazyLoad is false)
   */
  async preloadAll(): Promise<void> {
    const adapters = [new GPTAdapter(), new ClaudeAdapter(), new GeminiAdapter()]

    for (const adapter of adapters) {
      const models = adapter.getSupportedModels()
      await Promise.all(
        models.map((model) =>
          this.createTokenizer(model).catch(() => {
            // Ignore preload failures
          })
        )
      )
    }
  }

  /**
   * Clear cached tokenizers
   */
  clearCache(): void {
    for (const adapter of this.adapters.values()) {
      adapter.clearCache()
    }
    this.adapters.clear()
  }

  /**
   * Get all available adapters
   */
  getAdapters(): ITokenizationAdapter[] {
    return Array.from(this.adapters.values())
  }

  /**
   * Get adapter for a specific model
   */
  getAdapterForModel(model: SupportedModel): ITokenizationAdapter {
    return this.getOrCreateAdapter(model)
  }
}

/**
 * Main tokenization service
 */
export class TokenizationService {
  private config: Required<TokenizationConfig>
  private cache: TokenizationCache
  private factory: AdapterTokenizerFactory

  constructor(config: TokenizationConfig = {}) {
    this.config = {
      defaultModel: config.defaultModel ?? 'gpt-4',
      cacheSize: config.cacheSize ?? 1000,
      lazyLoad: config.lazyLoad ?? true
    }

    this.cache = new TokenizationCache(this.config.cacheSize)
    this.factory = new AdapterTokenizerFactory(this.config.lazyLoad)
  }

  /**
   * Count tokens in text using specified model
   */
  async countTokens(
    text: string,
    model: SupportedModel = this.config.defaultModel
  ): Promise<TokenizationResult> {
    if (!text) {
      return {
        tokenCount: 0,
        model,
        fromCache: false
      }
    }

    // Check cache first
    const cacheKey: CacheKey = { text, model }
    const cached = this.cache.get(cacheKey)

    if (cached) {
      return {
        ...cached.result,
        fromCache: true
      }
    }

    // Tokenize using appropriate tokenizer
    const tokenizer = await this.factory.createTokenizer(model)
    const tokenCount = tokenizer.countTokens(text)

    const result: TokenizationResult = {
      tokenCount,
      model,
      fromCache: false
    }

    // Cache the result
    const cacheEntry: CacheEntry = {
      result,
      timestamp: Date.now()
    }
    this.cache.set(cacheKey, cacheEntry)

    return result
  }

  /**
   * Encode text to tokens using specified model
   */
  async encode(text: string, model: SupportedModel = this.config.defaultModel): Promise<number[]> {
    if (!text) {
      return []
    }

    const tokenizer = await this.factory.createTokenizer(model)
    return tokenizer.encode(text)
  }

  /**
   * Batch count tokens for multiple texts
   */
  async batchCountTokens(
    texts: string[],
    model: SupportedModel = this.config.defaultModel
  ): Promise<TokenizationResult[]> {
    return Promise.all(texts.map((text) => this.countTokens(text, model)))
  }

  /**
   * Get supported models
   */
  getSupportedModels(): SupportedModel[] {
    const adapters = this.factory.getAdapters()
    const allModels: SupportedModel[] = []

    for (const adapter of adapters) {
      allModels.push(...adapter.getSupportedModels())
    }

    // If no adapters loaded yet, return models from static adapter instances
    if (allModels.length === 0) {
      const gptAdapter = new GPTAdapter()
      const claudeAdapter = new ClaudeAdapter()
      const geminiAdapter = new GeminiAdapter()

      allModels.push(
        ...gptAdapter.getSupportedModels(),
        ...claudeAdapter.getSupportedModels(),
        ...geminiAdapter.getSupportedModels()
      )
    }

    return [...new Set(allModels)] // Remove duplicates
  }

  /**
   * Check if a model is supported
   */
  isModelSupported(model: string): model is SupportedModel {
    return this.factory.isModelSupported(model)
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; capacity: number } {
    return this.cache.getStats()
  }

  /**
   * Clear tokenization cache
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Preload all tokenizers (useful for reducing first-time latency)
   */
  async preloadTokenizers(): Promise<void> {
    await this.factory.preloadAll()
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<TokenizationConfig> {
    return { ...this.config }
  }

  /**
   * Estimate token count without loading tokenizer (rough approximation)
   * Useful for quick estimates when exact count isn't needed
   */
  estimateTokenCount(text: string): number {
    if (!text) return 0

    // Rough approximation: ~4 characters per token for English text
    // This is a very rough estimate and should not be used for precise calculations
    return Math.ceil(text.length / 4)
  }

  /**
   * Check if text exceeds token limit for a model
   */
  async exceedsTokenLimit(
    text: string,
    limit: number,
    model: SupportedModel = this.config.defaultModel
  ): Promise<boolean> {
    const result = await this.countTokens(text, model)
    return result.tokenCount > limit
  }

  /**
   * Truncate text to fit within token limit
   * Note: This is a rough implementation that truncates by characters
   * For precise truncation, you'd need to decode tokens back to text
   */
  async truncateToTokenLimit(
    text: string,
    limit: number,
    model: SupportedModel = this.config.defaultModel
  ): Promise<string> {
    const result = await this.countTokens(text, model)

    if (result.tokenCount <= limit) {
      return text
    }

    // Rough truncation by character ratio
    const ratio = limit / result.tokenCount
    const targetLength = Math.floor(text.length * ratio * 0.9) // 90% to be safe

    return text.substring(0, targetLength)
  }

  /**
   * Get the adapter being used for a specific model
   */
  getAdapterForModel(model: SupportedModel): ITokenizationAdapter {
    return this.factory.getAdapterForModel(model)
  }

  /**
   * Get all available adapters
   */
  getAvailableAdapters(): ITokenizationAdapter[] {
    const gptAdapter = new GPTAdapter()
    const claudeAdapter = new ClaudeAdapter()
    const geminiAdapter = new GeminiAdapter()

    return [gptAdapter, claudeAdapter, geminiAdapter]
  }

  /**
   * Get adapter information for a model
   */
  getAdapterInfo(model: SupportedModel): {
    name: string
    supportsModel: boolean
    models: SupportedModel[]
  } {
    const adapter = this.getAdapterForModel(model)

    return {
      name: adapter.getName(),
      supportsModel: adapter.supportsModel(model),
      models: adapter.getSupportedModels()
    }
  }

  /**
   * Clear all adapter caches
   */
  clearAdapterCaches(): void {
    this.factory.clearCache()
  }
}

/**
 * Default tokenization service instance
 */
let defaultService: TokenizationService | null = null

/**
 * Get or create default tokenization service instance
 */
export function getTokenizationService(config?: TokenizationConfig): TokenizationService {
  if (!defaultService) {
    defaultService = new TokenizationService(config)
  }
  return defaultService
}

/**
 * Reset default tokenization service (useful for testing)
 */
export function resetTokenizationService(): void {
  defaultService = null
}
