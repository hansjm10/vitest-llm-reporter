/**
 * Context Extractor
 *
 * Handles extraction of code context around error locations,
 * including reading source files and parsing stack traces.
 *
 * @module extraction
 */

import { readFileSync } from 'node:fs'
import type { StackFrame, ContextExtractionOptions } from '../types/extraction.js'
import type { ErrorContext } from '../types/schema.js'
import { PathValidator } from '../utils/path-validator.js'
import { extractionLogger, errorLogger, securityLogger } from '../utils/logger.js'

/**
 * Extracts code context and stack frame information from errors
 */
export class ContextExtractor {
  private options: Required<ContextExtractionOptions>
  private pathValidator: PathValidator
  private debug = extractionLogger()
  private debugError = errorLogger()
  private debugSecurity = securityLogger()

  constructor(options: ContextExtractionOptions = {}) {
    this.options = {
      maxContextLines: options.maxContextLines ?? 3,
      includeLineNumbers: options.includeLineNumbers ?? true,
      filterNodeModules: options.filterNodeModules ?? true,
      rootDir: options.rootDir ?? process.cwd()
    }
    this.pathValidator = new PathValidator(this.options.rootDir)
    this.debug('Initialized with options: %o', this.options)
  }

  /**
   * Extracts code context around a specific line in a file
   */
  public extractCodeContext(
    filePath: string,
    lineNumber: number,
    columnNumber?: number
  ): ErrorContext | undefined {
    this.debug('Extracting context from %s:%d:%d', filePath, lineNumber, columnNumber || 0)

    try {
      // Use secure path validation
      const absolutePath = this.pathValidator.validate(filePath)

      if (!absolutePath) {
        // Path validation failed (doesn't exist or security issue)
        if (filePath.includes('..') || filePath.startsWith('/')) {
          this.debugSecurity('Path validation failed for potentially malicious path: %s', filePath)
        } else {
          this.debug('File not found or invalid: %s', filePath)
        }
        return undefined
      }

      const fileContent = readFileSync(absolutePath, 'utf-8')
      const lines = fileContent.split('\n')

      if (lineNumber < 1 || lineNumber > lines.length) {
        return undefined
      }

      const startLine = Math.max(1, lineNumber - this.options.maxContextLines)
      const endLine = Math.min(lines.length, lineNumber + this.options.maxContextLines)

      const codeLines: string[] = []

      for (let i = startLine; i <= endLine; i++) {
        const lineContent = lines[i - 1]
        const linePrefix = this.options.includeLineNumbers ? `${i.toString().padStart(3)}: ` : ''

        const isCurrentLine = i === lineNumber
        const lineSuffix =
          isCurrentLine && columnNumber
            ? ` // <- failure at column ${columnNumber}`
            : isCurrentLine
              ? ' // <- failure'
              : ''

        codeLines.push(`${linePrefix}${lineContent}${lineSuffix}`)
      }

      return {
        code: codeLines,
        lineNumber,
        columnNumber
      }
    } catch (err) {
      // Log unexpected file read errors for debugging
      // (file existence and line validation are handled above)
      this.debugError('Failed to read file context from %s: %O', filePath, err)
      return undefined
    }
  }

  /**
   * Parses a V8-style stack trace string into structured stack frames
   * Optimized for Node.js/Vitest console test reporting
   */
  public parseStackTrace(stack: string): StackFrame[] {
    if (!stack) {
      return []
    }

    const frames: StackFrame[] = []
    const lines = stack.split('\n')

    for (const line of lines) {
      // V8 stack trace patterns (Node.js standard):
      // "at functionName (file:line:column)"
      // "at async functionName (file:line:column)"
      // "at file:line:column"

      let match = line.match(/^\s*at\s+(?:async\s+)?(.+?)\s+\((.+?):(\d+):(\d+)\)$/)
      if (match) {
        // V8 style with function name
        const functionName = match[1].trim()
        const file = this.cleanFilePath(match[2])
        const lineNum = parseInt(match[3], 10)
        const column = parseInt(match[4], 10)

        if (this.shouldIncludeFrame(file)) {
          frames.push({
            file,
            line: lineNum,
            column: isNaN(column) ? undefined : column,
            function: functionName
          })
        }
        continue
      }

      // V8 style without function name
      match = line.match(/^\s*at\s+(.+?):(\d+):(\d+)$/)
      if (match) {
        const file = this.cleanFilePath(match[1])
        const lineNum = parseInt(match[2], 10)
        const column = parseInt(match[3], 10)

        if (this.shouldIncludeFrame(file)) {
          frames.push({
            file,
            line: lineNum,
            column: isNaN(column) ? undefined : column
          })
        }
      }
    }

    return frames
  }

  /**
   * Extracts the first relevant stack frame from a stack trace
   */
  public extractFirstRelevantFrame(stack: string): StackFrame | undefined {
    const frames = this.parseStackTrace(stack)
    return frames[0]
  }

  /**
   * Combines stack frame parsing with code context extraction
   */
  public extractFullContext(
    stack: string,
    fallbackFile?: string,
    fallbackLine?: number
  ): {
    stackFrames: StackFrame[]
    context?: ErrorContext
  } {
    const stackFrames = this.parseStackTrace(stack)

    // Try to get context from first relevant frame
    let context: ErrorContext | undefined

    if (stackFrames.length > 0) {
      const firstFrame = stackFrames[0]
      context = this.extractCodeContext(firstFrame.file, firstFrame.line, firstFrame.column)
    } else if (fallbackFile && fallbackLine) {
      // Use fallback if no frames found
      context = this.extractCodeContext(fallbackFile, fallbackLine)
    }

    return { stackFrames, context }
  }

  /**
   * Cleans up a file path from V8 stack trace
   */
  private cleanFilePath(file: string): string {
    // Remove file:// protocol if present
    file = file.replace(/^file:\/\//, '')

    // Remove query parameters or fragments (e.g., "?cache=123")
    file = file.split(/[?#]/)[0]

    return file.trim()
  }

  /**
   * Determines if a stack frame should be included based on filters
   */
  private shouldIncludeFrame(file: string): boolean {
    if (!this.options.filterNodeModules) {
      return true
    }

    // Filter out node_modules, internal Node.js modules, and dist folders
    const excludePatterns = [
      /node_modules/,
      /^node:/,
      /^internal\//,
      /^\[.*\]$/, // [eval], [stdin], etc.
      /^<anonymous>$/,
      /\/dist\//
    ]

    return !excludePatterns.some((pattern) => pattern.test(file))
  }

  /**
   * Checks if a file path points to a test file
   */
  public isTestFile(filePath: string): boolean {
    const testPatterns = [
      /\.test\.[jt]sx?$/,
      /\.spec\.[jt]sx?$/,
      /\/__tests__\//,
      /\.test\//,
      /\.spec\//
    ]

    return testPatterns.some((pattern) => pattern.test(filePath))
  }

  /**
   * Gets relative path from root directory
   */
  public getRelativePath(filePath: string): string {
    const absolute = this.pathValidator.validate(filePath)
    if (absolute && absolute.startsWith(this.options.rootDir)) {
      return absolute.slice(this.options.rootDir.length).replace(/^\//, '')
    }
    return filePath
  }
}
