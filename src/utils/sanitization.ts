/**
 * Sanitization utilities for preventing XSS and injection attacks
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param str - The string to sanitize
 * @returns The sanitized string safe for HTML contexts
 */
export function sanitizeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitizes a code line for safe display
 * @param line - The code line to sanitize
 * @returns The sanitized code line
 */
export function sanitizeCodeLine(line: string): string {
  // Apply HTML escaping
  return sanitizeHtml(line);
}

/**
 * Sanitizes an array of code lines
 * @param lines - Array of code lines to sanitize
 * @returns Array of sanitized code lines
 */
export function sanitizeCodeArray(lines: string[]): string[] {
  return lines.map(sanitizeCodeLine);
}

/**
 * Validates a file path for security issues
 * @param path - The file path to validate
 * @returns true if the path is valid, false otherwise
 */
export function validateFilePath(path: string): boolean {
  // Prevent path traversal attacks
  if (path.includes('../') || path.includes('..\\')) {
    return false;
  }
  
  // Prevent null bytes
  if (path.includes('\0')) {
    return false;
  }
  
  // Check for absolute path (Unix or Windows)
  const isAbsolutePath = path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
  if (!isAbsolutePath) {
    return false;
  }
  
  return true;
}

/**
 * Sanitizes sensitive information from a file path
 * @param path - The file path to sanitize
 * @returns The sanitized path
 */
export function sanitizeFilePath(path: string): string {
  // Optionally sanitize sensitive information (e.g., username in path)
  return path.replace(/\/(?:Users|home)\/[^/]+/, '/Users/***');
}

/**
 * Creates a safe object without prototype pollution risk
 * @param source - The source object to copy
 * @returns A safe object with no prototype chain
 */
export function createSafeObject<T extends Record<string, unknown>>(source: T): T {
  const safeObj = Object.create(null) as T;
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      // Skip prototype pollution vectors
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      safeObj[key] = source[key];
    }
  }
  
  return safeObj;
}

/**
 * Checks if a property exists safely without prototype pollution
 * @param obj - The object to check
 * @param prop - The property name to check
 * @returns True if the property exists on the object itself
 */
export function hasOwnProperty(obj: unknown, prop: string): boolean {
  if (!obj || typeof obj !== 'object' || obj === null) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(obj, prop);
}