/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  /** Number of iterations to run */
  iterations: number
  /** Number of warmup iterations */
  warmupIterations: number
  /** Timeout for each iteration in ms */
  timeout: number
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  /** Benchmark name */
  name: string
  /** Average time per iteration in ms */
  averageTime: number
  /** Success rate as percentage */
  successRate: number
  /** Memory delta in bytes */
  memoryDelta: number
}

/**
 * Memory snapshot
 */
export interface MemorySnapshot {
  heapUsed: number
  heapTotal: number
  external: number
  rss: number
  timestamp: number
}
