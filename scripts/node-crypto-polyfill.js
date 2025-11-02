import crypto from 'node:crypto'

// Ensure a global crypto object is available (Node 18 exposes webcrypto under crypto.webcrypto)
if (typeof globalThis.crypto === 'undefined' && crypto.webcrypto) {
  Object.defineProperty(globalThis, 'crypto', {
    value: crypto.webcrypto,
    configurable: true,
    enumerable: true,
    writable: true
  })
}

const globalCrypto = globalThis.crypto

if (globalCrypto && typeof globalCrypto.hash !== 'function') {
  /**
   * Polyfill for the synchronous crypto.hash API used by Vite 6+.
   * Falls back to Node's createHash implementation when unavailable (e.g. Node 18).
   */
  globalCrypto.hash = (algorithm, data, encoding = 'hex') => {
    const hash = crypto.createHash(algorithm)

    if (typeof data === 'string') {
      hash.update(data)
    } else if (data instanceof ArrayBuffer) {
      hash.update(Buffer.from(data))
    } else if (ArrayBuffer.isView(data)) {
      hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
    } else {
      hash.update(Buffer.from(String(data)))
    }

    return encoding ? hash.digest(encoding) : hash.digest()
  }
}
