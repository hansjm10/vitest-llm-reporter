import { StdioInterceptor, type WriteFunction } from './stdio-interceptor.js'
import type { ResolvedStdioPlan } from './stdio-plan.js'
import { cloneResolvedStdioPlan, shouldInterceptStdio } from './stdio-plan.js'
import { StdioSuppressionPolicy } from './stdio-filter.js'

export class StdioSessionController {
  private plan: ResolvedStdioPlan
  private policy: StdioSuppressionPolicy
  private session?: StdioInterceptor

  constructor(plan: ResolvedStdioPlan) {
    this.plan = cloneResolvedStdioPlan(plan)
    this.policy = new StdioSuppressionPolicy(this.plan)
  }

  armForRun(options: { resetActiveSession?: boolean } = {}): void {
    const { resetActiveSession = false } = options

    if (this.session?.isActive()) {
      if (resetActiveSession || this.session.isHoldingReport()) {
        this.session.disable({ bufferedOutput: 'discard' })
        this.session = undefined
      } else {
        return
      }
    }

    if (!shouldInterceptStdio(this.plan)) {
      this.session = undefined
      return
    }

    this.session = new StdioInterceptor(this.plan, this.policy)
    this.session.enable()
  }

  beginRun(): void {
    this.armForRun()
  }

  endRunBeforeReport(): void {
    if (!this.session) {
      return
    }

    // Reporter shutdown owns the blocked-stdout fallback; the pre-report flush
    // must not throw before the reporter can warn or redirect JSON.
    this.session.disable({ bufferedOutput: 'filter', swallowStdoutWriteErrors: true })
    this.session = undefined
  }

  prepareForReportHold(): void {
    this.session?.prepareForReportHold()
  }

  flushBufferedOutput(): void {
    this.session?.flushBufferedOutput()
  }

  abortOnClose(): void {
    if (!this.session) {
      return
    }

    this.session.disable({ bufferedOutput: 'discard' })
    this.session = undefined
  }

  updatePlan(plan: ResolvedStdioPlan): void {
    this.plan = cloneResolvedStdioPlan(plan)
    this.policy = new StdioSuppressionPolicy(this.plan)

    if (!this.session?.isActive()) {
      this.session = undefined
      return
    }

    if (!shouldInterceptStdio(this.plan) && !this.session.isHoldingReport()) {
      // Reporter-level console fallback still owns blocked stdout; live plan
      // refreshes must not abort the run when flushing buffered stdout.
      this.session.disable({ bufferedOutput: 'filter', swallowStdoutWriteErrors: true })
      this.session = undefined
      return
    }

    this.session.updatePlan(this.plan, this.policy, { swallowStdoutWriteErrors: true })
  }

  getPolicy(): StdioSuppressionPolicy {
    return this.policy
  }

  getWriters(): { stdout: WriteFunction; stderr: WriteFunction } {
    return this.session?.getOriginalWriters() ?? this.getFallbackWriters()
  }

  isActive(): boolean {
    return this.session?.isActive() ?? false
  }

  isHoldingReport(): boolean {
    return this.session?.isHoldingReport() ?? false
  }

  private getFallbackWriters(): { stdout: WriteFunction; stderr: WriteFunction } {
    return {
      stdout: process.stdout.write.bind(process.stdout),
      stderr: process.stderr.write.bind(process.stderr)
    }
  }
}
