/**
 * Output Mode Selector
 *
 * Implements decision logic for selecting the appropriate output mode based on
 * configuration, environment detection, and fallback chains. Coordinates between
 * the existing output strategies to provide a unified interface.
 *
 * @module output-mode-selector
 */

import { FileOutputStrategy } from './strategies/FileOutputStrategy.js'
import { ConsoleOutputStrategy } from './strategies/ConsoleOutputStrategy.js'
import { DualOutputStrategy } from './strategies/DualOutputStrategy.js'
import { OutputValidator } from './validators/OutputValidator.js'
import { detectEnvironment } from '../utils/environment.js'
import { createLogger } from '../utils/logger.js'
import type { OutputStrategy } from './strategies/FileOutputStrategy.js'
import type { EnvironmentInfo } from '../types/environment.js'
import type { LLMReporterOutput } from '../types/schema.js'
import { DEFAULT_ENVIRONMENT_PREFERENCES } from '../types/output-modes.js'
import type {
  OutputMode,
  OutputModeSelection,
  OutputModeSelectionConfig,
  OutputModeConfig,
  ConfigurationSource,
  EnvironmentOutputPreferences,
  StreamOutputConfig
} from '../types/output-modes.js'

const logger = createLogger('output-mode-selector')

/**
 * Stream output strategy (placeholder implementation)
 * This would be implemented when streaming functionality is added
 */
class StreamOutputStrategy implements OutputStrategy {
  private config: StreamOutputConfig
  private fallbackStrategy?: OutputStrategy

  constructor(config: StreamOutputConfig) {
    this.config = config
    // For now, use console as fallback for stream mode
    this.fallbackStrategy = new ConsoleOutputStrategy({
      stream: config.target === 'file' ? 'stdout' : 'stdout',
      formatting: { spaces: 2 }
    })
  }

  public canExecute(): boolean {
    return this.fallbackStrategy?.canExecute() ?? false
  }

  public async initialize(): Promise<void> {
    if (this.fallbackStrategy) {
      await this.fallbackStrategy.initialize()
    }
  }

  public async write(data: LLMReporterOutput): Promise<void> {
    if (this.fallbackStrategy) {
      await this.fallbackStrategy.write(data)
    }
  }

  public async close(): Promise<void> {
    if (this.fallbackStrategy) {
      await this.fallbackStrategy.close()
    }
  }
}

/**
 * Output Mode Selector
 *
 * Implements the decision matrix for selecting output modes:
 * - CI environment → file mode
 * - TTY available → console mode
 * - Config override → use config
 * - Fallback chain for failures
 *
 * Always succeeds with at least one working mode.
 */
export class OutputModeSelector {
  private environment: EnvironmentInfo
  private validator: OutputValidator
  private config: OutputModeSelectionConfig
  private preferences: EnvironmentOutputPreferences
  private selectedStrategy?: OutputStrategy
  private selection?: OutputModeSelection

  constructor(config: OutputModeSelectionConfig = {}) {
    this.environment = detectEnvironment()
    this.validator = new OutputValidator()
    this.config = config
    this.preferences = {
      ...DEFAULT_ENVIRONMENT_PREFERENCES,
      ...config.environmentPreferences
    }

    logger('OutputModeSelector initialized with config: %o', config)
  }

  /**
   * Selects the appropriate output mode based on configuration and environment
   */
  public selectOutputMode(): OutputModeSelection {
    if (this.selection) {
      logger('Using cached output mode selection: %s', this.selection.mode)
      return this.selection
    }

    logger('Starting output mode selection')

    // Priority 1: Use forced/configured mode if specified
    if (this.config.forcedMode) {
      const selection = this.tryConfiguredMode(this.config.forcedMode)
      if (selection) {
        this.selection = selection
        return selection
      }
    }

    // Priority 2: Environment-based selection
    const environmentMode = this.determineEnvironmentMode()
    const environmentSelection = this.tryConfiguredMode(environmentMode)
    if (environmentSelection) {
      this.selection = environmentSelection
      return environmentSelection
    }

    // Priority 3: Fallback chain
    const fallbackSelection = this.tryFallbackChain()
    this.selection = fallbackSelection
    return fallbackSelection
  }

  /**
   * Creates and returns the selected output strategy
   */
  public getOutputStrategy(): OutputStrategy {
    if (!this.selectedStrategy) {
      const selection = this.selectOutputMode()
      this.selectedStrategy = this.createStrategy(selection.mode, selection.config)
    }

    return this.selectedStrategy
  }

  /**
   * Gets the current selection information
   */
  public getSelection(): OutputModeSelection | undefined {
    return this.selection
  }

  /**
   * Clears cached selections (useful for testing)
   */
  public clearCache(): void {
    this.selection = undefined
    this.selectedStrategy = undefined
    this.validator.clearCache()
    logger('OutputModeSelector cache cleared')
  }

  /**
   * Updates environment information (useful for testing)
   */
  public updateEnvironment(environment: EnvironmentInfo): void {
    this.environment = environment
    this.validator.updateEnvironment(environment)
    this.clearCache() // Clear cache when environment changes
    logger('Environment updated in OutputModeSelector')
  }

  /**
   * Determines the preferred mode based on environment
   */
  private determineEnvironmentMode(): OutputMode {
    logger('Determining environment-based output mode')

    // CI environment → file mode
    if (this.environment.ci.isCI) {
      logger('CI environment detected, preferring file mode')
      return this.preferences.ciMode
    }

    // TTY available → console mode
    if (this.environment.tty.hasAnyTTY) {
      logger('TTY detected, preferring console mode')
      return this.preferences.ttyMode
    }

    // Headless environment → file mode
    if (this.environment.platform.isHeadless) {
      logger('Headless environment detected, preferring file mode')
      return this.preferences.headlessMode
    }

    logger('Using default fallback mode: %s', this.preferences.fallbackMode)
    return this.preferences.fallbackMode
  }

  /**
   * Tries to configure and validate a specific output mode
   */
  private tryConfiguredMode(mode: OutputMode): OutputModeSelection | null {
    logger('Trying to configure output mode: %s', mode)

    const config = this.createModeConfig(mode)
    const strategy = this.createStrategy(mode, config)

    if (strategy.canExecute()) {
      logger('Output mode %s is available and configured', mode)

      const source: ConfigurationSource = {
        source: this.config.forcedMode ? 'config' : 'environment',
        reason: this.getSelectionReason(mode),
        isFallback: false
      }

      return {
        mode,
        config,
        source
      }
    }

    logger('Output mode %s is not available in current environment', mode)
    return null
  }

  /**
   * Attempts fallback chain to ensure at least one mode works
   */
  private tryFallbackChain(): OutputModeSelection {
    logger('Starting fallback chain')

    const fallbackOrder: OutputMode[] = ['console', 'file', 'dual', 'stream']

    for (const mode of fallbackOrder) {
      logger('Trying fallback mode: %s', mode)

      const config = this.createModeConfig(mode)
      const strategy = this.createStrategy(mode, config)

      if (strategy.canExecute()) {
        logger('Fallback mode %s is available', mode)

        const source: ConfigurationSource = {
          source: 'fallback',
          reason: `Fallback to ${mode} mode - other modes unavailable`,
          isFallback: true
        }

        return {
          mode,
          config,
          source
        }
      }
    }

    // Last resort: force console with minimal config
    logger('All modes failed, forcing console as last resort')
    const config = this.createModeConfig('console')

    const source: ConfigurationSource = {
      source: 'fallback',
      reason: 'Emergency fallback to console mode',
      isFallback: true
    }

    return {
      mode: 'console',
      config,
      source
    }
  }

  /**
   * Creates configuration for a specific output mode
   */
  private createModeConfig(mode: OutputMode): OutputModeConfig {
    switch (mode) {
      case 'file':
        return {
          mode: 'file',
          config: {
            filePath: this.getDefaultFilePath(),
            ...this.config.fileConfig
          }
        }

      case 'console':
        return {
          mode: 'console',
          config: {
            stream: 'stdout',
            formatting: { spaces: 2 },
            ...this.config.consoleConfig
          }
        }

      case 'dual':
        return {
          mode: 'dual',
          config: {
            file: {
              filePath: this.getDefaultFilePath(),
              ...this.config.fileConfig
            },
            console: {
              stream: 'stdout',
              formatting: { spaces: 2 },
              ...this.config.consoleConfig
            },
            ...this.config.dualConfig
          }
        }

      case 'stream':
        return {
          mode: 'stream',
          config: {
            realTime: true,
            target: 'console',
            ...this.config.streamConfig
          }
        }

      default:
        throw new Error(`Unsupported output mode: ${mode as string}`)
    }
  }

  /**
   * Creates an output strategy instance for the given mode
   */
  private createStrategy(mode: OutputMode, config: OutputModeConfig): OutputStrategy {
    switch (config.mode) {
      case 'file':
        return new FileOutputStrategy(config.config)

      case 'console':
        return new ConsoleOutputStrategy(config.config)

      case 'dual':
        return new DualOutputStrategy(config.config)

      case 'stream':
        return new StreamOutputStrategy(config.config)

      default:
        throw new Error(`Cannot create strategy for mode: ${mode}`)
    }
  }

  /**
   * Gets the default file path for output
   */
  private getDefaultFilePath(): string {
    return this.config.fileConfig?.filePath || './vitest-llm-report.json'
  }

  /**
   * Gets a human-readable reason for the selection
   */
  private getSelectionReason(mode: OutputMode): string {
    if (this.config.forcedMode) {
      return `Explicitly configured to use ${mode} mode`
    }

    if (this.environment.ci.isCI && mode === 'file') {
      return 'CI environment detected, using file output for persistence'
    }

    if (this.environment.tty.hasAnyTTY && mode === 'console') {
      return 'TTY available, using console output for real-time feedback'
    }

    if (this.environment.platform.isHeadless && mode === 'file') {
      return 'Headless environment detected, using file output'
    }

    return `Selected ${mode} mode based on environment capabilities`
  }
}
