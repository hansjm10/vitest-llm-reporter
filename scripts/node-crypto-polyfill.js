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

const computeHash = (algorithm, data, encoding = 'hex') => {
  const hash = crypto.createHash(algorithm)

  if (typeof data === 'string' || data instanceof String) {
    hash.update(String(data))
  } else if (data instanceof ArrayBuffer) {
    hash.update(Buffer.from(data))
  } else if (ArrayBuffer.isView(data)) {
    hash.update(Buffer.from(data.buffer, data.byteOffset, data.byteLength))
  } else if (data != null) {
    hash.update(Buffer.from(String(data)))
  }

  return encoding ? hash.digest(encoding) : hash.digest()
}

const ensureHash = (target) => {
  if (target && typeof target.hash !== 'function') {
    Object.defineProperty(target, 'hash', {
      value: computeHash,
      configurable: true,
      enumerable: false,
      writable: true
    })
  }
}

ensureHash(globalThis.crypto ?? crypto.webcrypto)
ensureHash(crypto)
