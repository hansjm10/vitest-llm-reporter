import { readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { createLogger } from '../utils/logger.js'

const require = createRequire(import.meta.url)

const TEST_IDENTIFIERS = new Set(['test', 'it', 'bench'])

type TypeScriptModule = typeof import('typescript')

interface FileCacheEntry {
  mtimeMs: number
  map: Map<number, number>
}

/**
 * Resolves the end line of test callbacks using TypeScript AST parsing.
 * Falls back silently when TypeScript isn't available or parsing fails.
 */
export class TestEndResolver {
  private tsModule: TypeScriptModule | null | false = null
  private cache = new Map<string, FileCacheEntry>()
  private debug = createLogger('test-end-resolver')

  constructor(private readonly rootDir: string = process.cwd()) {}

  /**
   * Attempts to resolve the closing line of a test defined at `startLine`.
   *
   * @param filePath - Absolute or workspace-relative file path
   * @param startLine - 1-based line where the test call starts
   * @returns 1-based end line or undefined when unavailable
   */
  public resolve(filePath: string | undefined, startLine: number): number | undefined {
    if (!filePath || startLine <= 0) {
      return undefined
    }

    const ts = this.ensureTypescript()
    if (!ts) {
      return undefined
    }

    const absolutePath = this.resolvePath(filePath)
    if (!absolutePath) {
      return undefined
    }

    try {
      const stats = statSync(absolutePath)
      const cached = this.cache.get(absolutePath)
      if (!cached || cached.mtimeMs !== stats.mtimeMs) {
        const fileText = readFileSync(absolutePath, 'utf-8')
        const sourceFile = ts.createSourceFile(
          absolutePath,
          fileText,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.TSX
        )
        const map = this.buildLineMap(ts, sourceFile)
        this.cache.set(absolutePath, {
          mtimeMs: stats.mtimeMs,
          map
        })
      }

      const entry = this.cache.get(absolutePath)
      const resolved = entry?.map.get(startLine)
      if (resolved !== undefined && resolved >= startLine) {
        return resolved
      }
    } catch (error) {
      this.debug('Failed resolving end line for %s:%d -> %O', absolutePath, startLine, error)
    }

    return undefined
  }

  private resolvePath(filePath: string): string | undefined {
    if (path.isAbsolute(filePath)) {
      return filePath
    }
    const absolute = path.resolve(this.rootDir, filePath)
    return absolute
  }

  private ensureTypescript(): TypeScriptModule | null {
    if (this.tsModule === false) {
      return null
    }
    if (this.tsModule) {
      return this.tsModule
    }

    try {
      const ts = require('typescript') as TypeScriptModule
      this.tsModule = ts
      return ts
    } catch (error) {
      this.debug('TypeScript module unavailable, skipping end line resolution: %O', error)
      this.tsModule = false
      return null
    }
  }

  private buildLineMap(
    ts: TypeScriptModule,
    sourceFile: import('typescript').SourceFile
  ): Map<number, number> {
    const map = new Map<number, number>()

    const visit = (node: import('typescript').Node): void => {
      if (ts.isCallExpression(node) && this.isTestCall(ts, node)) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
        const callback = this.getCallback(ts, node)
        if (callback && start > 0) {
          const endLine = this.getCallbackEndLine(ts, sourceFile, callback)
          if (endLine !== undefined) {
            map.set(start, endLine)
          }
        }
      }

      ts.forEachChild(node, visit)
    }

    visit(sourceFile)
    return map
  }

  private isTestCall(ts: TypeScriptModule, node: import('typescript').CallExpression): boolean {
    const identifiers = this.collectIdentifiers(ts, node.expression)
    return identifiers.some((name) => TEST_IDENTIFIERS.has(name))
  }

  private collectIdentifiers(
    ts: TypeScriptModule,
    expression: import('typescript').Expression
  ): string[] {
    if (ts.isIdentifier(expression)) {
      return [expression.text]
    }

    if (ts.isPropertyAccessExpression(expression)) {
      return [...this.collectIdentifiers(ts, expression.expression), expression.name.text]
    }

    if (ts.isElementAccessExpression(expression)) {
      return this.collectIdentifiers(ts, expression.expression)
    }

    if (ts.isCallExpression(expression)) {
      return this.collectIdentifiers(ts, expression.expression)
    }

    if (ts.isParenthesizedExpression(expression)) {
      return this.collectIdentifiers(ts, expression.expression)
    }

    if (ts.isAsExpression(expression) || ts.isNonNullExpression(expression)) {
      return this.collectIdentifiers(ts, expression.expression)
    }

    return []
  }

  private getCallback(
    ts: TypeScriptModule,
    node: import('typescript').CallExpression
  ): import('typescript').ArrowFunction | import('typescript').FunctionExpression | undefined {
    for (const arg of node.arguments) {
      if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        return arg
      }
    }
    return undefined
  }

  private getCallbackEndLine(
    ts: TypeScriptModule,
    sourceFile: import('typescript').SourceFile,
    callback: import('typescript').ArrowFunction | import('typescript').FunctionExpression
  ): number | undefined {
    if (!callback.body) {
      return undefined
    }

    const body = callback.body

    let endPos: number
    if (ts.isBlock(body)) {
      endPos = body.getEnd()
    } else {
      endPos = body.getEnd()
    }

    const { line } = sourceFile.getLineAndCharacterOfPosition(Math.max(0, endPos - 1))
    return line + 1
  }
}

export const testEndResolver = new TestEndResolver()
