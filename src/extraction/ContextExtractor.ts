/**
 * Context Extractor
 *
 * Handles extraction of code context around error locations,
 * including reading source files and parsing stack traces.
 *
 * @module extraction
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, isAbsolute } from 'node:path'

export interface StackFrame {
  file: string
  line: number
  column?: number
  function?: string
}

export interface CodeContext {
  code: string[]
  lineNumber: number
  columnNumber?: number
}

export interface ContextExtractionOptions {
  maxContextLines?: number
  includeLineNumbers?: boolean
  filterNodeModules?: boolean
  rootDir?: string
}

/**
 * Extracts code context and stack frame information from errors
 */
export class ContextExtractor {
  private options: Required<ContextExtractionOptions>

  constructor(options: ContextExtractionOptions = {}) {
    this.options = {
      maxContextLines: options.maxContextLines ?? 3,
      includeLineNumbers: options.includeLineNumbers ?? true,
      filterNodeModules: options.filterNodeModules ?? true,
      rootDir: options.rootDir ?? process.cwd()
    }
  }

  /**
   * Extracts code context around a specific line in a file
   */
  public extractCodeContext(
    filePath: string,
    lineNumber: number,
    columnNumber?: number
  ): CodeContext | undefined {
    try {
      const absolutePath = this.resolveFilePath(filePath)

      if (!existsSync(absolutePath)) {
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
      console.error(
        `Failed to read file context from ${filePath}:`,
        err instanceof Error ? err.message : String(err)
      )
      return undefined
    }
  }

  /**
   * Parses a stack trace string into structured stack frames
   */
  public parseStackTrace(stack: string): StackFrame[] {
    if (!stack) {
      return []
    }

    const frames: StackFrame[] = []
    const lines = stack.split('\n')

    for (const line of lines) {
      // Try to extract function name and location
      // Match patterns like:
      // "at functionName (file:line:column)"
      // "at async functionName (file:line:column)"
      // "at file:line:column"
      // "functionName@file:line:column"

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

      // Try without function name
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
        continue
      }

      // Firefox style
      match = line.match(/^(.+?)@(.+?):(\d+):(\d+)$/)
      if (match) {
        const functionName = match[1].trim()
        const file = this.cleanFilePath(match[2])
        const lineNum = parseInt(match[3], 10)
        const column = parseInt(match[4], 10)

        if (this.shouldIncludeFrame(file)) {
          frames.push({
            file,
            line: lineNum,
            column: isNaN(column) ? undefined : column,
            function: functionName !== '' ? functionName : undefined
          })
        }
        continue
      }

      // Firefox style without function name
      match = line.match(/^@(.+?):(\d+):(\d+)$/)
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
    context?: CodeContext
  } {
    const stackFrames = this.parseStackTrace(stack)

    // Try to get context from first relevant frame
    let context: CodeContext | undefined

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
   * Resolves a file path to an absolute path
   */
  private resolveFilePath(filePath: string): string {
    if (isAbsolute(filePath)) {
      return filePath
    }
    return resolve(this.options.rootDir, filePath)
  }

  /**
   * Cleans up a file path from stack trace
   */
  private cleanFilePath(file: string): string {
    // Remove file:// protocol if present
    file = file.replace(/^file:\/\//, '')

    // Remove parentheses that might wrap the path
    file = file.replace(/^\((.+)\)$/, '$1')

    // Remove query parameters or fragments
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
    const absolute = this.resolveFilePath(filePath)
    if (absolute.startsWith(this.options.rootDir)) {
      return absolute.slice(this.options.rootDir.length).replace(/^\//, '')
    }
    return filePath
  }
}
