import type { LLMReporterConfig } from '../types/reporter.js'

/**
 * Streaming reporter configuration
 */
export interface StreamingReporterConfig extends LLMReporterConfig {
  /** Enable real-time console output */
  enableStreaming?: boolean
  /** Custom output handler for streaming results */
  onStreamOutput?: (message: string) => void
}
