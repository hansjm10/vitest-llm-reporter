import { normalize, isAbsolute, relative, resolve } from 'node:path'
import { realpathSync, existsSync } from 'node:fs'

/**
 * Secure path validator that prevents path traversal attacks and ensures
 * file access stays within project boundaries
 */
export class PathValidator {
  private rootDir: string
  private realRootDir: string
  private validatedPaths = new Map<string, string | null>()

  constructor(rootDir: string) {
    this.rootDir = rootDir
    // Resolve the real path of root directory to handle symlinks
    try {
      this.realRootDir = realpathSync(rootDir)
    } catch {
      // If root doesn't exist or can't be resolved, use normalized version
      this.realRootDir = normalize(rootDir)
    }
  }

  /**
   * Validates and resolves a file path, ensuring it stays within project boundaries
   * @param filePath - The path to validate
   * @returns The validated absolute path, or null if validation fails
   */
  public validate(filePath: string): string | null {
    // Check cache first
    if (this.validatedPaths.has(filePath)) {
      return this.validatedPaths.get(filePath)!
    }

    try {
      // Handle empty string
      if (!filePath || filePath.trim() === '') {
        this.validatedPaths.set(filePath, null)
        return null
      }

      // Check for null bytes (security issue)
      if (filePath.includes('\0')) {
        this.validatedPaths.set(filePath, null)
        return null
      }

      // Normalize to remove ../ sequences and resolve . references
      const normalized = normalize(filePath)

      // Convert to absolute path
      const absolutePath = isAbsolute(normalized) ? normalized : resolve(this.rootDir, normalized)

      // Check if file exists before trying to resolve real path
      if (!existsSync(absolutePath)) {
        this.validatedPaths.set(filePath, null)
        return null
      }

      // Resolve symlinks to get real path
      const realPath = realpathSync(absolutePath)

      // Check if the resolved path is within the project root
      if (!this.isWithinRoot(realPath)) {
        this.validatedPaths.set(filePath, null)
        return null
      }

      // Cache and return the validated path
      this.validatedPaths.set(filePath, realPath)
      return realPath
    } catch (_error) {
      // Any error in path resolution means the path is invalid
      this.validatedPaths.set(filePath, null)
      return null
    }
  }

  /**
   * Checks if a path is within the project root
   */
  private isWithinRoot(path: string): boolean {
    // Get relative path from root
    const relativePath = relative(this.realRootDir, path)

    // If relative path starts with .., it's outside root
    if (relativePath.startsWith('..')) {
      return false
    }

    // Additional check for absolute paths that might bypass
    if (isAbsolute(relativePath)) {
      return false
    }

    return true
  }

  /**
   * Clears the validation cache
   */
  public clearCache(): void {
    this.validatedPaths.clear()
  }

  /**
   * Gets cache statistics
   */
  public getCacheStats(): { hits: number; misses: number; size: number } {
    const size = this.validatedPaths.size
    const hits = Array.from(this.validatedPaths.values()).filter((v) => v !== null).length
    const misses = size - hits
    return { hits, misses, size }
  }
}
