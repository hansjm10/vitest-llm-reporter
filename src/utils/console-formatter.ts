import { inspect } from 'node:util'

/**
 * Serialize a single console argument using the same rules as ConsoleBuffer
 */
export function serializeConsoleArg(arg: unknown): string {
  try {
    if (arg === undefined) return 'undefined'
    if (arg === null) return 'null'

    if (typeof arg === 'string') {
      return arg.length > 1000 ? arg.substring(0, 1000) + '... [truncated]' : arg
    }

    if (typeof arg === 'number' || typeof arg === 'boolean') {
      return String(arg)
    }

    if (typeof arg === 'bigint') {
      return `${arg}n`
    }

    if (typeof arg === 'symbol') {
      return arg.toString()
    }

    if (typeof arg === 'function') {
      return '[Function]'
    }

    if (typeof arg === 'object') {
      return inspect(arg, {
        depth: 3,
        compact: true,
        maxArrayLength: 10,
        maxStringLength: 200,
        breakLength: 120,
        sorted: true
      })
    }

    return '[unknown]'
  } catch (_error) {
    return '[Failed to serialize]'
  }
}

/**
 * Serialize console arguments and provide the combined message string
 */
export function formatConsoleArgs(args: unknown[]): {
  serializedArgs: string[]
  message: string
} {
  const serializedArgs = args.map((arg) => serializeConsoleArg(arg))
  return {
    serializedArgs,
    message: serializedArgs.join(' ')
  }
}
