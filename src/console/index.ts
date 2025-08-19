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

// Type exports
export type { ConsoleMethod, ConsoleEntry, ConsoleBufferConfig } from '../types/console'
export type { ConsoleInterceptHandler, ConsoleFunction } from './interceptor'
export type { ConsoleCaptureConfig } from './capture'
