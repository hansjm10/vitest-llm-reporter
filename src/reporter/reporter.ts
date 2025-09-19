/**
 * LLM Reporter Implementation
 *
 * Core reporter class for Vitest that generates LLM-optimized output.
 * Orchestrates various components to process test results.
 *
 * @module reporter
 */

import type { Vitest, SerializedError, Reporter, UserConsoleLog, File } from 'vitest'
// These types come from vitest/node exports
import type { TestModule, TestCase, TestSpecification, TestRunEndReason } from 'vitest/node'
import type {
  FrameworkPresetName,
  LLMReporterConfig,
  StdioConfig,
  TruncationConfig,
  EnvironmentMetadataConfig,
  OutputViewConfig
} from '../types/reporter.js'
import type { OrchestratorConfig } from '../events/types.js'
import type { LLMReporterOutput, TestError } from '../types/schema.js'
import { StdioFilterEvaluator } from '../console/stdio-filter.js'

interface ResolvedStdioConfig {
  suppressStdout: boolean
  suppressStderr: boolean
  filterPattern: StdioConfig['filterPattern']
  frameworkPresets: FrameworkPresetName[]
  autoDetectFrameworks: boolean
  redirectToStderr: boolean
  flushWithFiltering: boolean
}

// Type for resolved configuration with explicit undefined handling
interface ResolvedLLMReporterConfig
  extends Omit<
    LLMReporterConfig,
    'outputFile' | 'enableStreaming' | 'enableConsoleOutput' | 'truncation' | 'deduplicateLogs'
  > {
  verbose: boolean
  outputFile: string | undefined // Explicitly undefined, not optional
  includePassedTests: boolean
  includeSkippedTests: boolean
  captureConsoleOnFailure: boolean
  captureConsoleOnSuccess: boolean
  maxConsoleBytes: number
  maxConsoleLines: number
  includeDebugOutput: boolean
  tokenCountingEnabled: boolean
  maxTokens: number | undefined
  enableConsoleOutput: boolean
  includeAbsolutePaths: boolean // Whether to include absolute paths in output
  performance: Required<MonitoringConfig>
  truncation: {
    enabled: boolean
    maxTokens: number | undefined
    enableEarlyTruncation: boolean
    enableLateTruncation: boolean
    enableMetrics: boolean
  }
  framedOutput: boolean // Gate for console separator frames
  includeStackString: boolean // Include raw stack strings in error output
  fileJsonSpacing: number
  consoleJsonSpacing: number
  spinner: {
    enabled: boolean
    intervalMs: number
    stream: 'stdout' | 'stderr'
    prefix: string
  }
  pureStdout: boolean
  stdio: ResolvedStdioConfig
  warnWhenConsoleBlocked: boolean
  fallbackToStderrOnBlocked: boolean
  deduplicateLogs:
    | boolean
    | {
        enabled?: boolean
        maxCacheEntries?: number
        normalizeWhitespace?: boolean
        includeSources?: boolean
        stripTimestamps?: boolean
        stripAnsiCodes?: boolean
        scope?: 'global' | 'per-test'
      }
    | undefined
  environmentMetadata: EnvironmentMetadataConfig | undefined
  outputView: OutputViewConfig | undefined
}

// Import new components
import { StateManager } from '../state/StateManager.js'
import { TestCaseExtractor } from '../extraction/TestCaseExtractor.js'
import { ErrorExtractor } from '../extraction/ErrorExtractor.js'
import { TestResultBuilder } from '../builders/TestResultBuilder.js'
import { ErrorContextBuilder } from '../builders/ErrorContextBuilder.js'
import { OutputBuilder } from '../output/OutputBuilder.js'
import type { OutputBuilderConfig } from '../output/types.js'
import { OutputWriter } from '../output/OutputWriter.js'
import { EventOrchestrator } from '../events/EventOrchestrator.js'
import { StdioInterceptor } from '../console/stdio-interceptor.js'
import { detectFrameworkPresets } from '../console/framework-log-presets.js'
import { coreLogger, errorLogger } from '../utils/logger.js'
import {
  normalizeDeduplicationConfig,
  validateDeduplicationConfig
} from '../config/deduplication-config.js'
import type { DeduplicationConfig } from '../types/deduplication.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { isTTY, isCI } from '../utils/environment.js'
import { getRuntimeEnvironmentSummary } from '../utils/runtime-environment.js'
import {
  PerformanceManager,
  createPerformanceManager,
  type MonitoringConfig
} from '../monitoring/index.js'

export class LLMReporter implements Reporter {
  private config: ResolvedLLMReporterConfig
  private context?: Vitest
  private output?: LLMReporterOutput
  private debug = coreLogger()
  private debugError = errorLogger()
  private isTestRunActive = false // Track if a test run is in progress (watch mode)
  private rootDir?: string // Root directory from Vitest config

  // Component instances
  private stateManager: StateManager
  private testExtractor: TestCaseExtractor
  private errorExtractor: ErrorExtractor
  private resultBuilder: TestResultBuilder
  private contextBuilder: ErrorContextBuilder
  private outputBuilder: OutputBuilder
  private outputWriter: OutputWriter
  private orchestrator: EventOrchestrator
  private performanceManager?: PerformanceManager
  // Stdio interceptor
  private stdioInterceptor?: StdioInterceptor
  private stdioFilter: StdioFilterEvaluator
  private originalStdoutWrite?: typeof process.stdout.write
  private originalStderrWrite?: typeof process.stderr.write
  // Spinner state
  private spinnerTimer?: NodeJS.Timeout
  private spinnerActive = false
  private spinnerIndex = 0
  private spinnerStartTime = 0
  private spinnerLastLength = 0
  private readonly spinnerFrames = ['|', '/', '-', '\\']

  /**
   * Creates a new instance of the LLM Reporter
   *
   * @param config - Configuration options for the reporter
   */
  constructor(config: LLMReporterConfig = {}) {
    // Validate config before using it
    this.validateConfig(config)

    // Handle backward compatibility for enableStreaming -> enableConsoleOutput
    let enableConsoleOutput = config.enableConsoleOutput
    if (enableConsoleOutput === undefined && config.enableStreaming !== undefined) {
      enableConsoleOutput = config.enableStreaming
      this.debug('enableStreaming is deprecated. Use enableConsoleOutput instead.')
    }
    // Default to true when no outputFile specified or when explicitly enabled
    if (enableConsoleOutput === undefined) {
      enableConsoleOutput = !config.outputFile || isTTY
    }

    // Check for spinner environment override
    const spinnerEnvOverride = process.env.LLM_REPORTER_SPINNER === '0'

    // Resolve stdio configuration
    let stdioConfig: ResolvedStdioConfig
    if (config.pureStdout) {
      // Pure stdout mode: suppress all stdout, no pattern filtering
      stdioConfig = {
        suppressStdout: true,
        suppressStderr: false,
        filterPattern: null, // Null means suppress all output
        frameworkPresets: [],
        autoDetectFrameworks: false,
        redirectToStderr: false,
        flushWithFiltering: false
      }
    } else {
      const stdioOptions = config.stdio ?? {}
      const hasFilterPatternProperty = Object.hasOwn(stdioOptions, 'filterPattern')
      const hasFrameworkPresets = Object.hasOwn(stdioOptions, 'frameworkPresets')
      const filterPatternValue = hasFilterPatternProperty ? stdioOptions.filterPattern : undefined
      const filterPatternProvided = hasFilterPatternProperty && filterPatternValue !== undefined
      const filterPattern = filterPatternProvided ? filterPatternValue : undefined
      const defaultFrameworkPresets: FrameworkPresetName[] = ['nest']
      const frameworkPresets = hasFrameworkPresets
        ? [...(stdioOptions.frameworkPresets ?? [])]
        : filterPatternProvided
          ? []
          : [...defaultFrameworkPresets]

      stdioConfig = {
        suppressStdout: stdioOptions.suppressStdout ?? true, // Default to true for clean output
        suppressStderr: stdioOptions.suppressStderr ?? false,
        filterPattern,
        frameworkPresets,
        autoDetectFrameworks: stdioOptions.autoDetectFrameworks ?? false,
        redirectToStderr: stdioOptions.redirectToStderr ?? false,
        flushWithFiltering: stdioOptions.flushWithFiltering ?? false
      }
    }

    // Properly resolve config without unsafe casting
    this.config = {
      verbose: config.verbose ?? false,
      outputFile: config.outputFile ?? undefined,
      includePassedTests: config.includePassedTests ?? false,
      includeSkippedTests: config.includeSkippedTests ?? false,
      captureConsoleOnFailure: config.captureConsoleOnFailure ?? true,
      captureConsoleOnSuccess: config.captureConsoleOnSuccess ?? false,
      maxConsoleBytes: config.maxConsoleBytes ?? 50_000,
      maxConsoleLines: config.maxConsoleLines ?? 100,
      includeDebugOutput: config.includeDebugOutput ?? false,
      tokenCountingEnabled: config.tokenCountingEnabled ?? false,
      maxTokens: config.maxTokens ?? undefined,
      enableConsoleOutput,
      includeAbsolutePaths: config.includeAbsolutePaths ?? false,
      filterNodeModules: config.filterNodeModules ?? true,
      deduplicateLogs: config.deduplicateLogs ?? true, // Default to enabled
      performance: {
        enabled: config.performance?.enabled ?? false,
        cacheSize: config.performance?.cacheSize ?? 1000,
        memoryWarningThreshold: config.performance?.memoryWarningThreshold ?? 500 * 1024 * 1024 // 500MB
      },
      truncation: {
        enabled: config.truncation?.enabled ?? false,
        maxTokens: config.truncation?.maxTokens ?? undefined,
        enableEarlyTruncation: config.truncation?.enableEarlyTruncation ?? false,
        enableLateTruncation: config.truncation?.enableLateTruncation ?? false,
        enableMetrics: config.truncation?.enableMetrics ?? false
      },
      framedOutput: config.framedOutput ?? false,
      includeStackString: config.includeStackString ?? false,
      fileJsonSpacing: config.fileJsonSpacing ?? 0,
      consoleJsonSpacing: config.consoleJsonSpacing ?? 2,
      spinner: {
        enabled: spinnerEnvOverride ? false : isTTY && !isCI,
        intervalMs: 80,
        stream: 'stderr',
        prefix: 'Running tests'
      },
      pureStdout: config.pureStdout ?? false,
      stdio: stdioConfig,
      warnWhenConsoleBlocked: config.warnWhenConsoleBlocked ?? true,
      fallbackToStderrOnBlocked: config.fallbackToStderrOnBlocked ?? true,
      environmentMetadata: config.environmentMetadata ?? undefined,
      outputView: config.outputView ?? undefined
    }

    this.stdioFilter = new StdioFilterEvaluator(
      stdioConfig.filterPattern,
      stdioConfig.frameworkPresets ?? []
    )

    // Initialize components
    this.stateManager = new StateManager()
    this.testExtractor = new TestCaseExtractor()
    this.errorExtractor = new ErrorExtractor({
      includeAbsolutePaths: false, // Will be updated in onInit with actual config
      filterNodeModules: this.config.filterNodeModules ?? true // Use config value or default to true
    })
    this.resultBuilder = new TestResultBuilder({
      includeAbsolutePaths: false, // Will be updated in onInit with actual config
      includeStackString: this.config.includeStackString
    })
    this.contextBuilder = new ErrorContextBuilder()
    this.outputBuilder = new OutputBuilder({
      verbose: this.config.verbose,
      includePassedTests: this.config.includePassedTests,
      includeSkippedTests: this.config.includeSkippedTests,
      filterNodeModules: this.config.filterNodeModules ?? true,
      includeStackString: this.config.includeStackString,
      includeAbsolutePaths: this.config.includeAbsolutePaths,
      rootDir: process.cwd(),
      truncation: this.config.truncation,
      environmentMetadata: this.config.environmentMetadata,
      view: this.config.outputView
    })
    this.outputWriter = new OutputWriter()

    // Initialize orchestrator with all dependencies and console config
    this.orchestrator = new EventOrchestrator(
      this.stateManager,
      this.testExtractor,
      this.errorExtractor,
      this.resultBuilder,
      this.contextBuilder,
      {
        captureConsoleOnFailure: this.config.captureConsoleOnFailure,
        captureConsoleOnSuccess: this.config.captureConsoleOnSuccess,
        maxConsoleBytes: this.config.maxConsoleBytes,
        maxConsoleLines: this.config.maxConsoleLines,
        includeDebugOutput: this.config.includeDebugOutput,
        truncationConfig: this.config.truncation,
        deduplicationConfig: this.getDeduplicationConfig()
      },
      this.stdioFilter,
      this.shouldFilterSuccessLogs()
    )

    // Initialize performance manager if enabled
    if (this.config.performance.enabled) {
      this.performanceManager = createPerformanceManager(this.config.performance)
      void this.initializePerformanceManager()
    }
  }

  /**
   * Initialize performance manager
   */
  private async initializePerformanceManager(): Promise<void> {
    if (!this.performanceManager) {
      return
    }

    try {
      await this.performanceManager.initialize()
      this.debug('Performance manager initialized')
    } catch (error) {
      this.debugError('Failed to initialize performance manager: %O', error)
      // Don't fail the reporter if performance manager fails
      this.performanceManager = undefined
    }
  }

  /**
   * Validates configuration values
   */
  private validateConfig(config: LLMReporterConfig): void {
    if (config.maxConsoleBytes !== undefined && config.maxConsoleBytes < 0) {
      throw new Error('maxConsoleBytes must be a positive number')
    }
    if (config.maxConsoleLines !== undefined && config.maxConsoleLines < 0) {
      throw new Error('maxConsoleLines must be a positive number')
    }
    if (config.maxTokens !== undefined && config.maxTokens < 0) {
      throw new Error('maxTokens must be a positive number')
    }

    // Validate deduplicateLogs configuration
    if (config.deduplicateLogs !== undefined) {
      if (
        typeof config.deduplicateLogs !== 'boolean' &&
        typeof config.deduplicateLogs !== 'object'
      ) {
        throw new Error('deduplicateLogs must be a boolean or configuration object')
      }

      if (typeof config.deduplicateLogs === 'object' && config.deduplicateLogs !== null) {
        // Delegate to centralized validation
        validateDeduplicationConfig(config.deduplicateLogs)
      }
    }

    if (config.environmentMetadata) {
      const metadata = config.environmentMetadata
      const booleanKeys: Array<keyof EnvironmentMetadataConfig> = [
        'enabled',
        'includeOsVersion',
        'includeNodeRuntime',
        'includeVitest',
        'includeCi',
        'includePackageManager'
      ]

      for (const key of booleanKeys) {
        const value = metadata[key]
        if (value !== undefined && typeof value !== 'boolean') {
          throw new Error(`environmentMetadata.${key.toString()} must be a boolean`)
        }
      }
    }

    if (config.outputView?.console) {
      const { includeTestId, includeTimestampMs } = config.outputView.console
      if (includeTestId !== undefined && typeof includeTestId !== 'boolean') {
        throw new Error('outputView.console.includeTestId must be a boolean')
      }
      if (includeTimestampMs !== undefined && typeof includeTimestampMs !== 'boolean') {
        throw new Error('outputView.console.includeTimestampMs must be a boolean')
      }
    }
  }

  /**
   * Cleanup resources (always called in finally blocks)
   */
  private cleanup(): void {
    this.stopSpinner()
    this.orchestrator.reset()
    this.isTestRunActive = false

    // Note: stdio interception is NOT stopped here since it was initialized in onInit()
    // and should remain active for the entire Vitest session (including watch mode)

    // Stop performance monitoring
    if (this.performanceManager) {
      this.performanceManager.stop()
    }
  }

  /**
   * Final cleanup when reporter is completely done
   */
  private finalCleanup(): void {
    // Stop stdio interception
    if (this.stdioInterceptor) {
      this.stdioInterceptor.disable()
      this.stdioInterceptor = undefined
      this.originalStdoutWrite = undefined
      this.originalStderrWrite = undefined
    }
  }

  /**
   * Reset state for watch mode reuse
   */
  private reset(): void {
    this.debug('Resetting reporter state for new test run')
    this.stateManager.reset()
    this.orchestrator.reset()
    this.output = undefined

    // Reset performance state
    if (this.performanceManager) {
      this.performanceManager.reset()
    }
  }

  /**
   * Safe wrapper for orchestrator calls with error handling
   */
  private safeOrchestratorCall<T>(
    methodName: string,
    data: T | undefined | null,
    handler: (data: T) => void
  ): void {
    if (!data) {
      this.debugError(`Received null/undefined data in ${methodName}`)
      return
    }
    try {
      handler(data)
    } catch (error) {
      this.debugError(`Error in ${methodName}: %O`, error)
    }
  }

  /**
   * Get the resolved reporter configuration
   *
   * @returns The resolved configuration with all defaults applied
   */
  getConfig(): ResolvedLLMReporterConfig {
    return this.config
  }

  /**
   * Update reporter configuration dynamically
   */
  updateConfig(partialConfig: Partial<LLMReporterConfig>): void {
    this.validateConfig({ ...this.config, ...partialConfig } as LLMReporterConfig)

    const hasPartialStdio = Object.hasOwn(partialConfig, 'stdio')
    const hasPartialTruncation = Object.hasOwn(partialConfig, 'truncation')
    const hasPartialPerformance = Object.hasOwn(partialConfig, 'performance')

    const shallowConfig: Partial<LLMReporterConfig> = { ...partialConfig }
    if (hasPartialStdio) {
      delete shallowConfig.stdio
    }
    if (hasPartialTruncation) {
      delete shallowConfig.truncation
    }
    if (hasPartialPerformance) {
      delete shallowConfig.performance
    }

    Object.assign(this.config, shallowConfig)

    if (hasPartialPerformance) {
      this.config.performance = this.mergePerformanceConfig(
        this.config.performance,
        partialConfig.performance
      )
    }

    if (hasPartialTruncation) {
      this.config.truncation = this.mergeTruncationConfig(
        this.config.truncation,
        partialConfig.truncation
      )
    }

    if (hasPartialStdio) {
      this.config.stdio = this.mergeResolvedStdioConfig(this.config.stdio, partialConfig.stdio)
    }

    let shouldUpdateOrchestrator = false
    const orchestratorConfig: OrchestratorConfig = {}

    // Update orchestrator if console-related config changed
    const consoleConfigKeys = [
      'captureConsoleOnFailure',
      'captureConsoleOnSuccess',
      'maxConsoleBytes',
      'maxConsoleLines',
      'includeDebugOutput',
      'truncation'
    ]
    if (consoleConfigKeys.some((key) => key in partialConfig)) {
      orchestratorConfig.captureConsoleOnFailure = this.config.captureConsoleOnFailure
      orchestratorConfig.captureConsoleOnSuccess = this.config.captureConsoleOnSuccess
      orchestratorConfig.maxConsoleBytes = this.config.maxConsoleBytes
      orchestratorConfig.maxConsoleLines = this.config.maxConsoleLines
      orchestratorConfig.includeDebugOutput = this.config.includeDebugOutput
      orchestratorConfig.truncationConfig = this.config.truncation
      shouldUpdateOrchestrator = true
    }

    if ('deduplicateLogs' in partialConfig) {
      orchestratorConfig.deduplicationConfig = this.getDeduplicationConfig()
      shouldUpdateOrchestrator = true
    }

    if (shouldUpdateOrchestrator) {
      this.orchestrator.updateConfig(orchestratorConfig)
    }

    let shouldUpdateOutputBuilder = false
    const outputBuilderConfig: OutputBuilderConfig = {}
    if ('includeAbsolutePaths' in partialConfig) {
      outputBuilderConfig.includeAbsolutePaths = this.config.includeAbsolutePaths
      shouldUpdateOutputBuilder = true
    }
    if ('filterNodeModules' in partialConfig) {
      outputBuilderConfig.filterNodeModules = this.config.filterNodeModules
      shouldUpdateOutputBuilder = true
    }
    if ('includeStackString' in partialConfig) {
      outputBuilderConfig.includeStackString = this.config.includeStackString
      shouldUpdateOutputBuilder = true
    }
    if ('verbose' in partialConfig) {
      outputBuilderConfig.verbose = this.config.verbose
      shouldUpdateOutputBuilder = true
    }
    if ('includePassedTests' in partialConfig) {
      outputBuilderConfig.includePassedTests = this.config.includePassedTests
      shouldUpdateOutputBuilder = true
    }
    if ('includeSkippedTests' in partialConfig) {
      outputBuilderConfig.includeSkippedTests = this.config.includeSkippedTests
      shouldUpdateOutputBuilder = true
    }
    if ('truncation' in partialConfig) {
      outputBuilderConfig.truncation = this.config.truncation
      shouldUpdateOutputBuilder = true
    }
    if ('environmentMetadata' in partialConfig) {
      outputBuilderConfig.environmentMetadata = this.config.environmentMetadata
      shouldUpdateOutputBuilder = true
    }

    if (shouldUpdateOutputBuilder) {
      this.outputBuilder.updateConfig(outputBuilderConfig)
    }

    if (hasPartialStdio || Object.hasOwn(partialConfig, 'captureConsoleOnSuccess')) {
      this.refreshStdioFilter()
    }
  }

  /**
   * Get the Vitest context
   *
   * @returns The Vitest context if initialized, undefined otherwise
   */
  getContext(): Vitest | undefined {
    return this.context
  }

  /**
   * Get a snapshot of the current test state
   *
   * @returns A snapshot of the state manager's current state
   */
  getState(): ReturnType<StateManager['getSnapshot']> {
    // Return state snapshot for backward compatibility
    return this.stateManager.getSnapshot()
  }

  /**
   * Get the generated LLM reporter output
   *
   * @returns The output if generated, undefined otherwise
   */
  getOutput(): LLMReporterOutput | undefined {
    return this.output
  }

  /**
   * Get performance metrics
   *
   * @returns Performance metrics if available, undefined otherwise
   */
  getPerformanceMetrics(): ReturnType<PerformanceManager['getMetrics']> | undefined {
    return this.performanceManager?.getMetrics()
  }

  /**
   * Check if performance is within configured limits
   *
   * @returns True if within limits, false otherwise
   */
  isPerformanceWithinLimits(): boolean {
    return this.performanceManager?.isWithinLimits() ?? true
  }

  /**
   * Get the deduplication configuration
   * Provides defaults for all configuration options
   * @internal - Public for testing only
   */
  getDeduplicationConfig(): DeduplicationConfig {
    return normalizeDeduplicationConfig(this.config.deduplicateLogs)
  }

  /**
   * Initialize the reporter with Vitest context
   *
   * @param ctx - The Vitest context
   */
  onInit(ctx: Vitest): void {
    this.context = ctx
    this.rootDir = ctx.config.root

    // Update components with root directory and config
    this.resultBuilder.updateConfig({
      rootDir: this.rootDir,
      includeAbsolutePaths: this.config.includeAbsolutePaths,
      includeStackString: this.config.includeStackString
    })
    this.outputBuilder.updateConfig({
      rootDir: this.rootDir,
      includeAbsolutePaths: this.config.includeAbsolutePaths
    })
    // Recreate ErrorExtractor with updated rootDir and config
    this.errorExtractor = new ErrorExtractor({
      rootDir: this.rootDir,
      includeAbsolutePaths: this.config.includeAbsolutePaths,
      filterNodeModules: this.config.filterNodeModules ?? true // Default to true if not specified
    })
    // Update the orchestrator's error extractor reference
    this.orchestrator.updateErrorExtractor(this.errorExtractor)

    this.applyAutoDetectedFrameworkPresets(this.rootDir)

    if (this.config.stdio.frameworkPresets.length > 0) {
      this.debug('stdio framework presets active: %o', this.config.stdio.frameworkPresets)
    }

    // Start stdio interception early if configured to catch test setup logs
    if (this.config.stdio.suppressStdout || this.config.stdio.suppressStderr) {
      this.stdioInterceptor = new StdioInterceptor(this.config.stdio)
      this.stdioInterceptor.enable()

      // Save original writers for later use
      const originalWriters = this.stdioInterceptor.getOriginalWriters()
      this.originalStdoutWrite = originalWriters.stdout
      this.originalStderrWrite = originalWriters.stderr
    } else {
      this.stdioInterceptor = undefined
      this.originalStdoutWrite = undefined
      this.originalStderrWrite = undefined
    }
  }

  private applyAutoDetectedFrameworkPresets(rootDir?: string): void {
    if (!this.config.stdio.autoDetectFrameworks) {
      return
    }

    const packageJson = this.loadNearestPackageJson(rootDir)
    const detected = detectFrameworkPresets({
      packageJson,
      env: process.env
    })

    if (detected.length === 0) {
      this.debug('auto-detect stdio frameworks: no matches found')
      return
    }

    const combined = new Set<FrameworkPresetName>(this.config.stdio.frameworkPresets)
    let changed = false
    for (const preset of detected) {
      if (!combined.has(preset)) {
        combined.add(preset)
        changed = true
      }
    }

    if (changed) {
      this.config.stdio.frameworkPresets = Array.from(combined)
      this.refreshStdioFilter()
    }

    this.debug('auto-detected stdio framework presets: %o', detected)
  }

  private refreshStdioFilter(): void {
    const stdio = this.config.stdio
    const presets = stdio.frameworkPresets ?? []
    this.stdioFilter = new StdioFilterEvaluator(stdio.filterPattern, presets)
    this.orchestrator?.updateStdioFilter(this.stdioFilter, this.shouldFilterSuccessLogs())
  }

  private shouldFilterSuccessLogs(): boolean {
    const stdio = this.config.stdio
    return (
      this.config.captureConsoleOnSuccess &&
      (stdio.suppressStdout ||
        stdio.filterPattern !== undefined ||
        (stdio.frameworkPresets?.length ?? 0) > 0)
    )
  }

  private mergeResolvedStdioConfig(
    current: ResolvedStdioConfig,
    update?: StdioConfig
  ): ResolvedStdioConfig {
    const merged: ResolvedStdioConfig = {
      ...current,
      frameworkPresets: [...current.frameworkPresets]
    }

    if (!update) {
      return merged
    }

    if (Object.hasOwn(update, 'suppressStdout')) {
      merged.suppressStdout = update.suppressStdout ?? merged.suppressStdout
    }
    if (Object.hasOwn(update, 'suppressStderr')) {
      merged.suppressStderr = update.suppressStderr ?? merged.suppressStderr
    }
    if (Object.hasOwn(update, 'filterPattern')) {
      merged.filterPattern = update.filterPattern
    }
    if (Object.hasOwn(update, 'frameworkPresets')) {
      const presets = update.frameworkPresets
      merged.frameworkPresets = presets ? [...presets] : []
    }
    if (Object.hasOwn(update, 'autoDetectFrameworks')) {
      merged.autoDetectFrameworks = update.autoDetectFrameworks ?? merged.autoDetectFrameworks
    }
    if (Object.hasOwn(update, 'redirectToStderr')) {
      merged.redirectToStderr = update.redirectToStderr ?? merged.redirectToStderr
    }
    if (Object.hasOwn(update, 'flushWithFiltering')) {
      merged.flushWithFiltering = update.flushWithFiltering ?? merged.flushWithFiltering
    }

    return merged
  }

  private mergeTruncationConfig(
    current: ResolvedLLMReporterConfig['truncation'],
    update?: TruncationConfig
  ): ResolvedLLMReporterConfig['truncation'] {
    const merged: ResolvedLLMReporterConfig['truncation'] = { ...current }

    if (!update) {
      return merged
    }

    if (Object.hasOwn(update, 'enabled')) {
      merged.enabled = update.enabled ?? merged.enabled
    }
    if (Object.hasOwn(update, 'maxTokens')) {
      merged.maxTokens = update.maxTokens
    }
    if (Object.hasOwn(update, 'enableEarlyTruncation')) {
      merged.enableEarlyTruncation = update.enableEarlyTruncation ?? merged.enableEarlyTruncation
    }
    if (Object.hasOwn(update, 'enableLateTruncation')) {
      merged.enableLateTruncation = update.enableLateTruncation ?? merged.enableLateTruncation
    }
    if (Object.hasOwn(update, 'enableMetrics')) {
      merged.enableMetrics = update.enableMetrics ?? merged.enableMetrics
    }

    return merged
  }

  private mergePerformanceConfig(
    current: ResolvedLLMReporterConfig['performance'],
    update?: MonitoringConfig
  ): ResolvedLLMReporterConfig['performance'] {
    const merged: ResolvedLLMReporterConfig['performance'] = { ...current }

    if (!update) {
      return merged
    }

    if (Object.hasOwn(update, 'enabled')) {
      merged.enabled = update.enabled ?? merged.enabled
    }
    if (Object.hasOwn(update, 'cacheSize')) {
      merged.cacheSize = update.cacheSize ?? merged.cacheSize
    }
    if (Object.hasOwn(update, 'memoryWarningThreshold')) {
      merged.memoryWarningThreshold = update.memoryWarningThreshold ?? merged.memoryWarningThreshold
    }

    return merged
  }

  private loadNearestPackageJson(rootDir?: string): Record<string, unknown> | undefined {
    const searchRoots: string[] = []
    if (rootDir) {
      searchRoots.push(rootDir)
    }

    const cwd = process.cwd()
    if (!searchRoots.includes(cwd)) {
      searchRoots.push(cwd)
    }

    for (const base of searchRoots) {
      const packagePath = path.join(base, 'package.json')
      try {
        if (!fs.existsSync(packagePath)) {
          continue
        }
        const contents = fs.readFileSync(packagePath, 'utf8')
        return JSON.parse(contents) as Record<string, unknown>
      } catch (error) {
        this.debug('Failed to read package.json for stdio auto-detection: %O', error)
      }
    }

    return undefined
  }

  /**
   * Handle test run start event
   *
   * @param specifications - The test specifications for the run
   */
  onTestRunStart(specifications: ReadonlyArray<TestSpecification>): void {
    // Handle watch mode: reset if a test run is already active
    if (this.isTestRunActive) {
      this.reset()
    }
    this.isTestRunActive = true

    try {
      // Start spinner if enabled (but not if stderr is suppressed)
      if (this.config.spinner.enabled && !this.config.stdio.suppressStderr) {
        this.startSpinner()
      }

      // Start performance monitoring
      if (this.performanceManager) {
        this.performanceManager.start()
      }

      this.orchestrator.handleTestRunStart(specifications)
    } catch (error) {
      this.debugError('Error in onTestRunStart: %O', error)
      // Continue operation even if orchestrator fails
    }
  }

  /**
   * Handle test module queued event
   *
   * @param testModule - The test module that was queued
   */
  onTestModuleQueued(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleQueued', testModule, (module) =>
      this.orchestrator.handleTestModuleQueued(module)
    )
  }

  /**
   * Handle test module collected event
   *
   * @param testModule - The test module that was collected
   */
  onTestModuleCollected(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleCollected', testModule, (module) =>
      this.orchestrator.handleTestModuleCollected(module)
    )
  }

  /**
   * Handle test module start event
   *
   * @param testModule - The test module that is starting
   */
  onTestModuleStart(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleStart', testModule, (module) =>
      this.orchestrator.handleTestModuleStart(module)
    )
  }

  /**
   * Handle test module end event
   *
   * @param testModule - The test module that has ended
   */
  onTestModuleEnd(testModule: TestModule): void {
    this.safeOrchestratorCall('onTestModuleEnd', testModule, (module) =>
      this.orchestrator.handleTestModuleEnd(module)
    )
  }

  /**
   * Handle test case ready event
   *
   * @param testCase - The test case that is ready to run
   */
  onTestCaseReady(testCase: TestCase): void {
    this.safeOrchestratorCall('onTestCaseReady', testCase, (test) =>
      this.orchestrator.handleTestCaseReady(test)
    )
  }

  /**
   * Handle test case result event
   *
   * @param testCase - The test case with its result
   */
  onTestCaseResult(testCase: TestCase): void {
    this.safeOrchestratorCall('onTestCaseResult', testCase, (test) =>
      this.orchestrator.handleTestCaseResult(test)
    )
  }

  /**
   * Handle test run end event
   *
   * @param testModules - The test modules that were run
   * @param unhandledErrors - Any unhandled errors that occurred
   * @param reason - The reason the test run ended
   */
  async onTestRunEnd(
    testModules: ReadonlyArray<TestModule>,
    unhandledErrors: ReadonlyArray<SerializedError>,
    reason: TestRunEndReason
  ): Promise<void> {
    try {
      // Stop spinner before building output
      this.stopSpinner()
      // Delegate to orchestrator with error handling
      try {
        this.orchestrator.handleTestRunEnd(testModules, unhandledErrors, reason)
      } catch (orchestratorError) {
        this.debugError('Error in orchestrator.handleTestRunEnd: %O', orchestratorError)
        // Continue to build output even if orchestrator fails
      }

      // Debug-log any unhandled errors in a compact formatted way
      if (unhandledErrors && unhandledErrors.length > 0) {
        for (const ue of unhandledErrors) {
          try {
            const formatted = this.errorExtractor.format(this.errorExtractor.extractWithContext(ue))
            this.debug('Unhandled error (formatted):\n%s', formatted)
          } catch (e) {
            this.debugError('Failed to format unhandled error: %O', e)
          }
        }
      }

      // Get statistics and test results
      const statistics = this.stateManager.getStatistics()
      const testResults = this.stateManager.getTestResults()

      // Build output using OutputBuilder
      try {
        this.output = this.outputBuilder.build({
          testResults,
          duration: statistics.duration,
          startTime: this.stateManager.getStartTime(),
          unhandledErrors: unhandledErrors
        })
      } catch (buildError) {
        this.debugError('Error building output: %O', buildError)
        // Create minimal output if builder fails
        const environment = getRuntimeEnvironmentSummary(this.config.environmentMetadata)
        this.output = {
          summary: {
            total: 0,
            passed: 0,
            failed: 0,
            skipped: 0,
            duration: 0,
            timestamp: new Date().toISOString(),
            ...(environment ? { environment } : {})
          }
        }
      }

      // Run performance optimization if enabled
      if (this.performanceManager) {
        try {
          const optimizations = await this.performanceManager.optimize()
          if (optimizations.length > 0) {
            this.debug('Applied %d performance optimizations', optimizations.length)
          }

          // Check if we're within performance limits
          if (!this.performanceManager.isWithinLimits()) {
            this.debugError('Performance overhead exceeded limits')
          }

          // Log performance metrics in debug mode
          const metrics = this.performanceManager.getMetrics()
          this.debug('Performance metrics: %O', {
            testCount: metrics.testCount,
            cacheHitRate: metrics.cache.hitRate,
            memoryUsed: metrics.memory.used,
            uptime: metrics.uptime
          })
        } catch (perfError) {
          this.debugError('Performance optimization failed: %O', perfError)
        }
      }

      // Note: Output writing moved to onFinished to capture afterAll errors

      // Output writing moved to onFinished to capture afterAll errors
    } finally {
      // Always cleanup, even if errors occurred
      this.cleanup()
    }
  }

  /**
   * Capture user console logs forwarded by Vitest (v3)
   *
   * @param log - The console log event from Vitest containing test output
   */
  onUserConsoleLog(log: UserConsoleLog): void {
    try {
      this.orchestrator.handleUserConsoleLog(log)
    } catch (error) {
      this.debugError('Error in onUserConsoleLog: %O', error)
    }
  }

  /**
   * Start spinner animation on selected stream
   */
  private startSpinner(): void {
    if (this.spinnerActive || !this.config.spinner.enabled) return
    const stream = this.config.spinner.stream === 'stdout' ? process.stdout : process.stderr
    if (!stream.isTTY) return
    this.spinnerActive = true
    this.spinnerIndex = 0
    this.spinnerStartTime = Date.now()
    this.spinnerLastLength = 0

    const render = (): void => {
      const elapsedMs = Date.now() - this.spinnerStartTime
      const seconds = Math.max(0, Math.round(elapsedMs / 1000))
      const frame = this.spinnerFrames[this.spinnerIndex % this.spinnerFrames.length]
      const message = `${this.config.spinner.prefix} ${frame} ${seconds}s`

      if (this.spinnerLastLength > 0) {
        stream.write('\r' + ' '.repeat(this.spinnerLastLength) + '\r')
      }
      stream.write(message)
      this.spinnerLastLength = message.length
      this.spinnerIndex++
    }

    render()
    this.spinnerTimer = setInterval(render, this.config.spinner.intervalMs)
  }

  /**
   * Stop spinner and clear line
   */
  private stopSpinner(): void {
    if (!this.spinnerActive) return
    if (this.spinnerTimer) clearInterval(this.spinnerTimer)
    this.spinnerTimer = undefined
    const stream = this.config.spinner.stream === 'stdout' ? process.stdout : process.stderr
    if (this.spinnerLastLength > 0 && stream.isTTY) {
      stream.write('\r' + ' '.repeat(this.spinnerLastLength) + '\r')
    }
    this.spinnerActive = false
    this.spinnerLastLength = 0
  }

  /**
   * Handle reporter finished event (Vitest is completely done)
   * This is called after all teardown (including afterAll hooks) completes
   *
   * @param files - Test files that were run
   * @param errors - Any errors that occurred during teardown
   * @param coverage - Coverage data (unused)
   */
  onFinished(files: File[], errors: unknown[], _coverage?: unknown): void {
    try {
      // Process any additional errors that occurred during teardown (e.g., afterAll hooks)
      if (errors && errors.length > 0 && this.output) {
        this.debug('Processing %d teardown errors in onFinished', errors.length)

        // Add teardown errors to the output
        if (!this.output.failures) {
          this.output.failures = []
        }

        for (const error of errors) {
          try {
            // Convert unknown error to SerializedError format
            const serializedError: SerializedError =
              error instanceof Error
                ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                  }
                : typeof error === 'object' && error !== null && 'message' in error
                  ? (error as SerializedError)
                  : { message: String(error) }

            // Extract error details
            const extracted = this.errorExtractor.extractWithContext(serializedError)

            // Add to failures as a teardown error
            // Ensure context has required fields
            const errorWithContext: TestError = {
              ...extracted,
              context: extracted.context
                ? {
                    ...extracted.context,
                    code: extracted.context.code || []
                  }
                : {
                    code: []
                  }
            }

            this.output.failures.push({
              test: 'Teardown Error',
              fileRelative: '',
              startLine: 0,
              endLine: 0,
              suite: ['AfterAll Hook'],
              error: errorWithContext
            })

            // Also log for debugging
            const formatted = this.errorExtractor.format(extracted)
            this.debug('Teardown error (formatted):\n%s', formatted)
          } catch (e) {
            this.debugError('Failed to process teardown error: %O', e)
          }
        }

        // Update summary to reflect the teardown errors
        if (this.output.summary) {
          this.output.summary.failed = (this.output.summary.failed || 0) + errors.length
          this.output.summary.total = (this.output.summary.total || 0) + errors.length
        }
      }

      // Write output based on configuration
      if (this.output) {
        // Use statistics from the already-built output
        const statistics = this.output.summary

        // Write to file if configured
        if (this.config.outputFile) {
          try {
            // Update OutputWriter config with file spacing
            this.outputWriter.updateConfig({ jsonSpacing: this.config.fileJsonSpacing })
            this.outputWriter.write(this.config.outputFile, this.output)
            this.debug('Output written to %s', this.config.outputFile)
          } catch (writeError) {
            this.debugError(
              'Failed to write output file %s: %O',
              this.config.outputFile,
              writeError
            )
            // Don't propagate write errors - log is sufficient
          }
        }

        // Also write to console if no file is specified or console output is enabled
        // Only when running as an actual Vitest reporter (context set).
        // Only output when there are actual test results or errors to avoid spurious outputs
        const canWriteConsole =
          (!this.config.outputFile || this.config.enableConsoleOutput) && this.context

        const hasMeaningfulResults =
          statistics.total > 0 || (this.output.failures && this.output.failures.length > 0)

        if (canWriteConsole && hasMeaningfulResults) {
          try {
            // Use original stdout writer if available (when stdio interception is active)
            // This ensures the reporter's JSON output is never filtered
            const writeToStdout =
              this.originalStdoutWrite || process.stdout.write.bind(process.stdout)

            // Write to console with proper formatting
            const jsonOutput = JSON.stringify(this.output, null, this.config.consoleJsonSpacing)

            // Only add framing if framedOutput is enabled
            if (this.config.framedOutput) {
              writeToStdout('\n' + '='.repeat(80) + '\n')
              writeToStdout('LLM Reporter Output:\n')
              writeToStdout('='.repeat(80) + '\n')
            }

            writeToStdout(jsonOutput + '\n')

            if (this.config.framedOutput) {
              writeToStdout('='.repeat(80) + '\n')
            }

            this.debug('Output written to console')
          } catch (consoleError) {
            // If stdout write fails, warn user on stderr and optionally fallback
            this.debugError('Failed to write to console: %O', consoleError)
            if (this.config.warnWhenConsoleBlocked) {
              try {
                // Prefer the current stderr writer so spies/mocks can observe it
                const currentStderrWrite: typeof process.stderr.write = process.stderr.write.bind(
                  process.stderr
                )
                const hint =
                  'vitest-llm-reporter: Console output appears blocked. ' +
                  "If you do not see the JSON output, configure `outputFile` or adjust your project's log/silent settings.\n"
                try {
                  currentStderrWrite(hint)
                } catch {
                  // Fallback to original or direct fd if current write fails
                  try {
                    ;(this.originalStderrWrite || process.stderr.write.bind(process.stderr))(hint)
                  } catch {
                    try {
                      fs.writeSync(2, hint)
                    } catch (e) {
                      this.debugError('fs.writeSync stderr hint failed: %O', e)
                    }
                  }
                }

                if (this.config.fallbackToStderrOnBlocked && this.output) {
                  const jsonOutput = JSON.stringify(
                    this.output,
                    null,
                    this.config.consoleJsonSpacing
                  )
                  try {
                    currentStderrWrite(jsonOutput + '\n')
                  } catch {
                    try {
                      ;(this.originalStderrWrite || process.stderr.write.bind(process.stderr))(
                        jsonOutput + '\n'
                      )
                    } catch {
                      try {
                        fs.writeSync(2, jsonOutput + '\n')
                      } catch (e) {
                        this.debugError('fs.writeSync stderr JSON failed: %O', e)
                      }
                    }
                  }
                }
              } catch (stderrError) {
                this.debugError('Failed to write fallback warning to stderr: %O', stderrError)
              }
            }
          }
        } else if (
          (!this.config.outputFile || this.config.enableConsoleOutput) &&
          this.context &&
          this.config.warnWhenConsoleBlocked
        ) {
          // No meaningful results to print, but proactively detect a blocked stdout
          // to still warn the user and provide fallback JSON on stderr for debugging
          try {
            const writeToStdout =
              this.originalStdoutWrite || process.stdout.write.bind(process.stdout)
            try {
              writeToStdout('') // probe; will throw if stdout is blocked
            } catch (probeError) {
              this.debugError('Stdout appears blocked during probe: %O', probeError)
              const currentStderrWrite: typeof process.stderr.write = process.stderr.write.bind(
                process.stderr
              )
              const hint =
                'vitest-llm-reporter: Console output appears blocked. ' +
                "If you do not see the JSON output, configure `outputFile` or adjust your project's log/silent settings.\n"
              try {
                currentStderrWrite(hint)
              } catch {
                try {
                  ;(this.originalStderrWrite || process.stderr.write.bind(process.stderr))(hint)
                } catch {
                  try {
                    fs.writeSync(2, hint)
                  } catch (e) {
                    this.debugError('fs.writeSync stderr hint failed: %O', e)
                  }
                }
              }
              if (this.config.fallbackToStderrOnBlocked && this.output) {
                const jsonOutput = JSON.stringify(this.output, null, this.config.consoleJsonSpacing)
                try {
                  currentStderrWrite(jsonOutput + '\n')
                } catch {
                  try {
                    ;(this.originalStderrWrite || process.stderr.write.bind(process.stderr))(
                      jsonOutput + '\n'
                    )
                  } catch {
                    try {
                      fs.writeSync(2, jsonOutput + '\n')
                    } catch (e) {
                      this.debugError('fs.writeSync stderr JSON failed: %O', e)
                    }
                  }
                }
              }
            }
          } catch (stderrError) {
            this.debugError('Failed during blocked-stdout probe/warn: %O', stderrError)
          }
        }
      }
    } finally {
      // Always perform final cleanup
      this.finalCleanup()
    }
  }
}
