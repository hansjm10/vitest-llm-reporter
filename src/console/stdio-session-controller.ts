import { StdioInterceptor, type WriteFunction } from './stdio-interceptor.js'
import type { BufferedTailPolicy, ResolvedStdioPlan } from './stdio-plan.js'
import { cloneResolvedStdioPlan, shouldInterceptStdio } from './stdio-plan.js'
import { StdioSuppressionPolicy } from './stdio-filter.js'

export type SessionState = 'idle' | 'prepared' | 'running' | 'holding-report'

export class StdioSessionController {
  private plannedPlan: ResolvedStdioPlan
  private plannedPolicy: StdioSuppressionPolicy
  private activePlan: ResolvedStdioPlan
  private activePolicy: StdioSuppressionPolicy
  private session?: StdioInterceptor
  private state: SessionState = 'idle'

  constructor(plan: ResolvedStdioPlan) {
    this.plannedPlan = cloneResolvedStdioPlan(plan)
    this.plannedPolicy = new StdioSuppressionPolicy(this.plannedPlan)
    this.activePlan = cloneResolvedStdioPlan(plan)
    this.activePolicy = new StdioSuppressionPolicy(this.activePlan)
  }

  stagePlan(plan: ResolvedStdioPlan): void {
    this.plannedPlan = cloneResolvedStdioPlan(plan)
    this.plannedPolicy = new StdioSuppressionPolicy(this.plannedPlan)

    if (this.state === 'idle') {
      this.activePlan = cloneResolvedStdioPlan(this.plannedPlan)
      this.activePolicy = new StdioSuppressionPolicy(this.activePlan)
      return
    }

    if (this.state === 'prepared') {
      this.armPreparedSession()
    }
  }

  prepareForRun(): void {
    if (this.state === 'prepared') {
      return
    }

    if (this.state === 'running' || this.state === 'holding-report') {
      this.stopSession('discard')
    }

    this.armPreparedSession()
  }

  beginRun(): void {
    this.prepareForRun()
    this.state = 'running'
  }

  endRunBeforeReport(): void {
    this.stopSession('filter')
  }

  finishAfterTeardown(bufferedOutput: BufferedTailPolicy = 'filter'): void {
    this.stopSession(bufferedOutput)
  }

  prepareForReportHold(): void {
    this.session?.prepareForReportHold()

    if (this.session?.isHoldingReport()) {
      this.state = 'holding-report'
    }
  }

  flushBufferedOutput(): void {
    this.session?.flushBufferedOutput()
  }

  abortOnClose(): void {
    this.stopSession('discard')
  }

  getPlan(): ResolvedStdioPlan {
    return cloneResolvedStdioPlan(this.activePlan)
  }

  getPolicy(): StdioSuppressionPolicy {
    return this.activePolicy
  }

  getWriters(): { stdout: WriteFunction; stderr: WriteFunction } {
    return this.session?.getOriginalWriters() ?? this.getFallbackWriters()
  }

  getState(): SessionState {
    return this.state
  }

  isActive(): boolean {
    return this.session?.isActive() ?? false
  }

  isHoldingReport(): boolean {
    return this.session?.isHoldingReport() ?? false
  }

  private armPreparedSession(): void {
    this.activePlan = cloneResolvedStdioPlan(this.plannedPlan)
    this.activePolicy = new StdioSuppressionPolicy(this.activePlan)

    if (!shouldInterceptStdio(this.activePlan)) {
      this.session = undefined
      this.state = 'prepared'
      return
    }

    this.stopSession('discard')
    this.session = new StdioInterceptor(this.activePlan, this.activePolicy)
    this.session.enable()
    this.state = 'prepared'
  }

  private stopSession(bufferedOutput: BufferedTailPolicy): void {
    if (this.session) {
      this.session.disable({
        bufferedOutput,
        swallowStdoutWriteErrors: bufferedOutput === 'filter'
      })
      this.session = undefined
    }

    this.activePlan = cloneResolvedStdioPlan(this.plannedPlan)
    this.activePolicy = new StdioSuppressionPolicy(this.activePlan)
    this.state = 'idle'
  }

  private getFallbackWriters(): { stdout: WriteFunction; stderr: WriteFunction } {
    return {
      stdout: process.stdout.write.bind(process.stdout),
      stderr: process.stderr.write.bind(process.stderr)
    }
  }
}
