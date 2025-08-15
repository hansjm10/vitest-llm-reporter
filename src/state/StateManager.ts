/**
 * State Manager for LLM Reporter
 *
 * Manages the internal state of test execution, tracking modules,
 * tests, and results throughout the test run lifecycle.
 *
 * @module state
 */

import type { TestResult, TestFailure } from '../types/schema'
import type {
  StateConfig,
  TestResults,
  ModuleTiming,
  StateSnapshot,
  TestStatistics
} from '../types/state'

/**
 * Default state configuration
 */
export const DEFAULT_STATE_CONFIG: Required<StateConfig> = {
  trackModuleTiming: true
}

/**
 * State manager for test execution
 *
 * This class encapsulates all state management logic, providing
 * methods to track test progress and retrieve statistics.
 *
 * @example
 * ```typescript
 * const stateManager = new StateManager();
 * stateManager.recordModuleStart('module-1');
 * stateManager.recordTestResult(passedTest);
 * const stats = stateManager.getStatistics();
 * ```
 */
export class StateManager {
  private config: Required<StateConfig>
  private specifications: unknown[] = []
  private queuedModules: Set<string> = new Set()
  private collectedTests: Array<{
    id?: string
    name?: string
    mode?: string
    file?: string
    suite?: string[]
  }> = []
  private runningModules: Set<string> = new Set()
  private completedModules: Set<string> = new Set()
  private moduleTimings: Map<string, ModuleTiming> = new Map()
  private readyTests: Set<string> = new Set()
  private testResults: TestResults = {
    passed: [],
    failed: [],
    skipped: []
  }
  private startTime?: number
  private endTime?: number

  constructor(config: StateConfig = {}) {
    this.config = { ...DEFAULT_STATE_CONFIG, ...config }
  }

  /**
   * Records the start of a test run
   */
  public recordRunStart(specifications: unknown[]): void {
    this.startTime = Date.now()
    this.specifications = specifications
  }

  /**
   * Records the end of a test run
   */
  public recordRunEnd(): void {
    this.endTime = Date.now()
  }

  /**
   * Queues a module for execution
   */
  public queueModule(moduleId: string): void {
    this.queuedModules.add(moduleId)
  }

  /**
   * Records collected tests from a module
   */
  public recordCollectedTests(
    tests: Array<{
      id?: string
      name?: string
      mode?: string
      file?: string
      suite?: string[]
    }>
  ): void {
    this.collectedTests.push(...tests)
  }

  /**
   * Records the start of module execution
   */
  public recordModuleStart(moduleId: string): void {
    this.queuedModules.delete(moduleId)
    this.runningModules.add(moduleId)

    if (this.config.trackModuleTiming) {
      this.moduleTimings.set(moduleId, { startTime: Date.now() })
    }
  }

  /**
   * Records the end of module execution
   */
  public recordModuleEnd(moduleId: string): void {
    this.runningModules.delete(moduleId)
    this.completedModules.add(moduleId)

    if (this.config.trackModuleTiming) {
      const timing = this.moduleTimings.get(moduleId)
      if (timing && !timing.endTime) {
        timing.endTime = Date.now()
        timing.duration = timing.endTime - timing.startTime
      }
    }
  }

  /**
   * Marks a test as ready for execution
   */
  public markTestReady(testId: string): void {
    this.readyTests.add(testId)
  }

  /**
   * Records a passed test result
   */
  public recordPassedTest(test: TestResult): void {
    this.testResults.passed.push(test)
  }

  /**
   * Records a failed test result
   */
  public recordFailedTest(test: TestFailure): void {
    this.testResults.failed.push(test)
  }

  /**
   * Records a skipped test result
   */
  public recordSkippedTest(test: TestResult): void {
    this.testResults.skipped.push(test)
  }

  /**
   * Gets test execution statistics
   */
  public getStatistics(): TestStatistics {
    const total =
      this.testResults.passed.length +
      this.testResults.failed.length +
      this.testResults.skipped.length

    const duration =
      this.startTime && this.endTime
        ? this.endTime - this.startTime
        : this.startTime
          ? Date.now() - this.startTime
          : 0

    return {
      total,
      passed: this.testResults.passed.length,
      failed: this.testResults.failed.length,
      skipped: this.testResults.skipped.length,
      duration
    }
  }

  /**
   * Gets all test results
   */
  public getTestResults(): TestResults {
    return this.testResults
  }

  /**
   * Gets module timing information
   */
  public getModuleTiming(moduleId: string): ModuleTiming | undefined {
    return this.moduleTimings.get(moduleId)
  }

  /**
   * Gets all module timings
   */
  public getAllModuleTimings(): Map<string, ModuleTiming> {
    return new Map(this.moduleTimings)
  }

  /**
   * Gets a complete state snapshot
   */
  public getSnapshot(): StateSnapshot {
    return {
      specifications: [...this.specifications],
      queuedModules: Array.from(this.queuedModules),
      collectedTests: [...this.collectedTests],
      runningModules: Array.from(this.runningModules),
      completedModules: Array.from(this.completedModules),
      moduleTimings: new Map(this.moduleTimings),
      readyTests: Array.from(this.readyTests),
      testResults: {
        passed: [...this.testResults.passed],
        failed: [...this.testResults.failed],
        skipped: [...this.testResults.skipped]
      },
      startTime: this.startTime,
      endTime: this.endTime
    }
  }

  /**
   * Resets the state to initial values
   */
  public reset(): void {
    this.specifications = []
    this.queuedModules.clear()
    this.collectedTests = []
    this.runningModules.clear()
    this.completedModules.clear()
    this.moduleTimings.clear()
    this.readyTests.clear()
    this.testResults = {
      passed: [],
      failed: [],
      skipped: []
    }
    this.startTime = undefined
    this.endTime = undefined
  }

  /**
   * Gets the run start time
   */
  public getStartTime(): number | undefined {
    return this.startTime
  }

  /**
   * Checks if a module is currently running
   */
  public isModuleRunning(moduleId: string): boolean {
    return this.runningModules.has(moduleId)
  }

  /**
   * Checks if a module has completed
   */
  public isModuleCompleted(moduleId: string): boolean {
    return this.completedModules.has(moduleId)
  }
}
