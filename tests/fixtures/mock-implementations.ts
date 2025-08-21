/**
 * Mock Implementations for Integration Tests
 * 
 * Provides mock implementations of core interfaces for testing
 */

import type { 
  IStreamManager, 
  StreamConfig, 
  StreamOperation, 
  StreamEvent, 
  StreamEventType,
  IConsoleStreamAdapter,
  ConsoleStreamData 
} from '../../src/streaming/types'
import type { IDeduplicationService, DeduplicationConfig, DeduplicationResult } from '../../src/types/deduplication'
import type { IPerformanceManager, PerformanceConfig, PerformanceMetrics } from '../../src/performance/types'
import type { LLMReporterOutput } from '../../src/types/schema'

/**
 * Mock Stream Manager for testing
 */
export class MockStreamManager implements IStreamManager {
  private config?: StreamConfig
  private ready = false
  private operations: StreamOperation[] = []
  private eventListeners = new Map<StreamEventType, ((event: StreamEvent) => void)[]>()

  async initialize(config: StreamConfig): Promise<void> {
    this.config = config
    this.ready = config.enabled
    this.emit('stream_start', {})
  }

  async write(operation: StreamOperation): Promise<void> {
    if (!this.ready) {
      throw new Error('StreamManager not initialized or not ready')
    }
    
    this.operations.push(operation)
    this.emit('stream_data', { operation })
  }

  async flush(): Promise<void> {
    if (!this.ready) return
    
    this.emit('stream_flush', { operationsCount: this.operations.length })
    // Simulate flush delay
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  isReady(): boolean {
    return this.ready
  }

  async close(): Promise<void> {
    this.emit('stream_end', {})
    this.ready = false
    this.operations = []
    this.eventListeners.clear()
  }

  on(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(listener)
  }

  off(event: StreamEventType, listener: (event: StreamEvent) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  // Test utilities
  getOperations(): StreamOperation[] {
    return [...this.operations]
  }

  getConfig(): StreamConfig | undefined {
    return this.config
  }

  private emit(type: StreamEventType, data: any): void {
    const event: StreamEvent = {
      type,
      timestamp: Date.now(),
      data
    }
    
    const listeners = this.eventListeners.get(type) || []
    listeners.forEach(listener => listener(event))
  }
}

/**
 * Mock Console Stream Adapter for testing
 */
export class MockConsoleStreamAdapter implements IConsoleStreamAdapter {
  private streamManager?: IStreamManager
  private ready = false
  private streamedData: ConsoleStreamData[] = []

  initialize(streamManager: IStreamManager): void {
    this.streamManager = streamManager
    this.ready = streamManager.isReady()
  }

  async streamConsoleData(data: ConsoleStreamData): Promise<void> {
    if (!this.ready || !this.streamManager) {
      throw new Error('Adapter not initialized or not ready')
    }

    this.streamedData.push(data)
    
    // Convert console data to stream operation
    const operation: StreamOperation = {
      content: `[${data.method}] ${JSON.stringify(data.args)}`,
      priority: data.method === 'error' ? 1 : 2,
      stream: data.method === 'error' ? 'stderr' : 'stdout',
      testId: data.testId,
      timestamp: data.timestamp
    }

    await this.streamManager.write(operation)
  }

  isReady(): boolean {
    return this.ready && this.streamManager?.isReady() === true
  }

  destroy(): void {
    this.ready = false
    this.streamManager = undefined
    this.streamedData = []
  }

  // Test utilities
  getStreamedData(): ConsoleStreamData[] {
    return [...this.streamedData]
  }
}

/**
 * Mock Deduplication Service for testing
 */
export class MockDeduplicationService implements IDeduplicationService {
  private config: DeduplicationConfig
  private processedCount = 0

  constructor(config: DeduplicationConfig) {
    this.config = { ...config }
  }

  async processOutput(output: LLMReporterOutput): Promise<DeduplicationResult> {
    this.processedCount++
    
    if (!this.config.enabled) {
      return {
        originalCount: output.failures?.length || 0,
        deduplicatedCount: output.failures?.length || 0,
        groups: [],
        references: [],
        stats: {
          totalFailures: output.failures?.length || 0,
          uniqueFailures: output.failures?.length || 0,
          duplicateGroups: 0,
          compressionRatio: 1.0,
          processingTime: 10
        }
      }
    }

    // Simple mock deduplication: group every 2 similar failures
    const failures = output.failures || []
    const groups = []
    const references = []
    let groupIndex = 0

    for (let i = 0; i < failures.length; i += 2) {
      if (i + 1 < failures.length) {
        // Create a group for pairs
        groups.push({
          id: `group-${groupIndex}`,
          pattern: 'mock-pattern',
          template: failures[i],
          instances: [failures[i], failures[i + 1]],
          similarity: 0.9,
          count: 2
        })
        
        references.push({
          original: failures[i],
          groupId: `group-${groupIndex}`,
          isDuplicate: false
        })
        
        references.push({
          original: failures[i + 1],
          groupId: `group-${groupIndex}`,
          isDuplicate: true
        })
        
        groupIndex++
      } else {
        // Single failure, no grouping
        references.push({
          original: failures[i],
          groupId: null,
          isDuplicate: false
        })
      }
    }

    return {
      originalCount: failures.length,
      deduplicatedCount: failures.length - Math.floor(failures.length / 2),
      groups,
      references,
      stats: {
        totalFailures: failures.length,
        uniqueFailures: failures.length - Math.floor(failures.length / 2),
        duplicateGroups: groups.length,
        compressionRatio: failures.length > 0 ? (failures.length - Math.floor(failures.length / 2)) / failures.length : 1.0,
        processingTime: 25
      }
    }
  }

  getConfig(): DeduplicationConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<DeduplicationConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  // Test utilities
  getProcessedCount(): number {
    return this.processedCount
  }

  reset(): void {
    this.processedCount = 0
  }
}

/**
 * Mock Performance Manager for testing
 */
export class MockPerformanceManager implements IPerformanceManager {
  private config: PerformanceConfig
  private metrics: PerformanceMetrics
  private optimizationCount = 0

  constructor(config: PerformanceConfig = {}) {
    this.config = { 
      enabled: false,
      mode: 'balanced',
      enableCaching: false,
      enableMemoryOptimization: false,
      enableStreamOptimization: false,
      ...config 
    }
    
    this.metrics = {
      totalOperations: 0,
      averageLatency: 0,
      peakMemoryUsage: 0,
      cacheHitRate: 0,
      optimizationSavings: 0,
      lastUpdateTime: Date.now()
    }
  }

  async initialize(): Promise<void> {
    // Mock initialization
    await new Promise(resolve => setTimeout(resolve, 5))
  }

  async start(): Promise<void> {
    if (!this.config.enabled) return
    // Mock start
    await new Promise(resolve => setTimeout(resolve, 5))
  }

  async stop(): Promise<void> {
    // Mock stop
    await new Promise(resolve => setTimeout(resolve, 5))
  }

  async optimize(): Promise<void> {
    if (!this.config.enabled) return
    
    this.optimizationCount++
    
    // Mock optimization effects
    this.metrics = {
      ...this.metrics,
      totalOperations: this.metrics.totalOperations + 1,
      averageLatency: Math.max(0, this.metrics.averageLatency - 5), // Simulate improvement
      cacheHitRate: Math.min(1, this.metrics.cacheHitRate + 0.1),
      optimizationSavings: this.metrics.optimizationSavings + 10,
      lastUpdateTime: Date.now()
    }
    
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics }
  }

  getConfig(): PerformanceConfig {
    return { ...this.config }
  }

  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig }
  }

  // Test utilities
  getOptimizationCount(): number {
    return this.optimizationCount
  }

  simulateLoad(operations: number): void {
    this.metrics.totalOperations += operations
    this.metrics.averageLatency += operations * 0.1
    this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, operations * 1024)
    this.metrics.lastUpdateTime = Date.now()
  }

  reset(): void {
    this.optimizationCount = 0
    this.metrics = {
      totalOperations: 0,
      averageLatency: 0,
      peakMemoryUsage: 0,
      cacheHitRate: 0,
      optimizationSavings: 0,
      lastUpdateTime: Date.now()
    }
  }
}

/**
 * Integration test helper that creates connected mock services
 */
export function createIntegratedMockServices() {
  const streamManager = new MockStreamManager()
  const consoleAdapter = new MockConsoleStreamAdapter()
  const deduplicationService = new MockDeduplicationService({
    enabled: true,
    strategy: 'moderate',
    thresholds: { exact: 1.0, high: 0.9, medium: 0.7, low: 0.5 },
    patterns: { stackTrace: true, errorMessage: true, consoleOutput: true, assertion: true },
    compression: { enabled: true, minGroupSize: 2, maxTemplateVariables: 10, preserveExamples: 3 }
  })
  const performanceManager = new MockPerformanceManager({
    enabled: true,
    mode: 'balanced',
    enableCaching: true,
    enableMemoryOptimization: true,
    enableStreamOptimization: true
  })

  return {
    streamManager,
    consoleAdapter,
    deduplicationService,
    performanceManager
  }
}