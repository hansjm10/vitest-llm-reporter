/**
 * Console Module
 *
 * Provides comprehensive console output capture functionality for test execution.
 * This module handles the interception, buffering, and management of console
 * output during test runs with thread-safe isolation.
 *
 * @module console
 */

// Core exports
export { ConsoleBuffer } from './buffer.js'
export { ConsoleInterceptor } from './interceptor.js'
export { ConsoleCapture, consoleCapture } from './capture.js'
export { ConsoleMerger, consoleMerger } from './merge.js'

// Type exports
export type {
  ConsoleMethod,
  ConsoleEntry,
  ConsoleBufferConfig,
  ConsoleCaptureConfig
} from '../types/console.js'
export type { ConsoleInterceptHandler, ConsoleFunction } from './interceptor.js'
