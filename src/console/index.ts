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
export { ConsoleBuffer } from './buffer'
export { ConsoleInterceptor } from './interceptor'
export { ConsoleCapture, consoleCapture } from './capture'
export { ConsoleMerger, consoleMerger } from './merge'

// Type exports
export type {
  ConsoleMethod,
  ConsoleEntry,
  ConsoleBufferConfig,
  ConsoleCaptureConfig
} from '../types/console'
export type { ConsoleInterceptHandler, ConsoleFunction } from './interceptor'
