/**
 * Path Utilities
 *
 * Helper functions for path normalization and classification
 * for repo-relative path handling across the reporter stack.
 *
 * @module utils/paths
 */

import { relative, isAbsolute, normalize } from 'node:path'

/**
 * Normalizes file URLs or file system paths to absolute paths.
 * Handles file:// URLs and regular paths.
 *
 * @param input - A file:// URL or file system path
 * @returns Normalized absolute file system path
 */
export function normalizeFileUrlOrPath(input: string): string {
  if (!input) {
    return input
  }

  // Handle file:// URLs
  if (input.startsWith('file://')) {
    // Convert file URL to path
    // Handle both Unix and Windows file URLs
    let path = input.slice(7) // Remove 'file://' prefix
    
    // Windows file URLs may have an extra slash: file:///C:/...
    // Unix file URLs: file:///home/...
    if (path.startsWith('/') && /^\/[A-Za-z]:/.test(path)) {
      // Windows path with leading slash: /C:/...
      path = path.slice(1)
    }
    
    // Clean up multiple slashes
    return path.replace(/\/+/g, '/')
  }

  // Already a regular path - clean up multiple slashes but preserve Windows paths
  // For Windows paths like C:\, don't replace backslashes
  if (/^[A-Za-z]:\\/.test(input)) {
    // Windows path - normalize backslashes but don't change them to forward slashes yet
    return input.replace(/\\+/g, '\\')
  }
  
  // Unix path - clean up multiple forward slashes
  return input.replace(/\/+/g, '/')
}

/**
 * Converts an absolute path to a repo-relative path.
 * If the path is not under the root directory, returns the original path.
 *
 * @param absPath - The absolute path to convert
 * @param rootDir - The repository root directory
 * @returns Repo-relative path if under root, otherwise original path
 */
export function toRepoRelative(absPath: string, rootDir: string): string {
  if (!absPath || !rootDir) {
    return absPath || ''
  }

  // Normalize Windows paths to Unix-style for comparison
  const normalizeForComparison = (p: string) => {
    // Convert Windows backslashes to forward slashes
    let normalized = p.replace(/\\/g, '/')
    // Remove Windows drive letter if present for root comparison
    return normalized
  }

  const pathForComparison = normalizeForComparison(absPath)
  const rootForComparison = normalizeForComparison(rootDir)

  // Check if path is under root (handle both Unix and Windows paths)
  if (pathForComparison.startsWith(rootForComparison)) {
    // Get the relative part
    let relativePath = pathForComparison.slice(rootForComparison.length)
    
    // Remove leading slash
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1)
    }
    
    // Handle empty relative path (same directory)
    if (!relativePath) {
      relativePath = '.'
    }
    
    // Always return with forward slashes
    return relativePath
  }

  // Path is outside root, return as-is
  return absPath
}

/**
 * Classifies a path based on its location relative to the project.
 *
 * @param absPath - The absolute path to classify
 * @param rootDir - The repository root directory
 * @returns Classification flags for the path
 */
export function classify(
  absPath: string,
  rootDir: string
): { inProject: boolean; inNodeModules: boolean } {
  if (!absPath) {
    return { inProject: false, inNodeModules: false }
  }

  // Normalize paths to Unix-style for consistent comparison
  const normalizedPath = absPath.replace(/\\/g, '/')
  const normalizedRoot = rootDir.replace(/\\/g, '/')

  // Check if path is in node_modules (cross-platform)
  const inNodeModules = normalizedPath.includes('/node_modules/') ||
                        normalizedPath.includes('node_modules')

  // Check if path is in project (under root and not in node_modules)
  const inProject = normalizedPath.startsWith(normalizedRoot) && !inNodeModules

  return { inProject, inNodeModules }
}

/**
 * Processes a file path for the schema, normalizing and converting to repo-relative.
 * Returns both relative and absolute paths along with classification.
 *
 * @param filePath - The file path to process (can be URL or path)
 * @param rootDir - The repository root directory
 * @param includeAbsolute - Whether to include absolute path in result
 * @returns Processed path information
 */
export function processFilePath(
  filePath: string | undefined,
  rootDir: string,
  includeAbsolute = false
): {
  fileRelative: string
  fileAbsolute?: string
  inProject: boolean
  inNodeModules: boolean
} {
  if (!filePath) {
    return {
      fileRelative: '',
      inProject: false,
      inNodeModules: false
    }
  }

  // Normalize the path (handle file:// URLs)
  const absolutePath = normalizeFileUrlOrPath(filePath)
  
  // Check if it's a Windows absolute path (C:\... or C:/...)
  const isWindowsAbsolute = /^[A-Za-z]:[\\\/]/.test(absolutePath)
  
  // Get classification
  const { inProject, inNodeModules } = classify(absolutePath, rootDir)
  
  // Convert to repo-relative if possible
  const fileRelative = (isAbsolute(absolutePath) || isWindowsAbsolute)
    ? toRepoRelative(absolutePath, rootDir)
    : filePath // Keep original if not absolute

  const result: ReturnType<typeof processFilePath> = {
    fileRelative,
    inProject,
    inNodeModules
  }

  if (includeAbsolute && isAbsolute(absolutePath)) {
    result.fileAbsolute = absolutePath
  }

  return result
}