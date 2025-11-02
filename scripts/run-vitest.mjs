import './node-crypto-polyfill.js'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { URL as NodeURL, fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkgPath = require.resolve('vitest/package.json')
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
const vitestEntry = path.resolve(path.dirname(pkgPath), pkg.bin.vitest)

// Ensure child Node processes (worker threads / Vite servers) also load the polyfill
const polyfillPath = fileURLToPath(new NodeURL('./node-crypto-polyfill.js', import.meta.url))
const importFlag = `--import=${polyfillPath}`
process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, importFlag]
  .filter(Boolean)
  .join(' ')

// Replace the argv entry so Vitest's CLI thinks it was invoked directly.
process.argv[1] = vitestEntry

await import(pathToFileURL(vitestEntry).href)
