/**
 * Reference Manager
 *
 * Manages references between test failures and deduplication groups,
 * enabling efficient lookup and retrieval of deduplicated data.
 *
 * @module ReferenceManager
 */

import type {
  DeduplicationReference,
  DeduplicationGroup,
  DuplicateEntry,
  CompressedReference,
  FailureTemplate,
  SimilarityScore
} from '../../types/deduplication'

/**
 * Reference index entry
 */
interface ReferenceIndex {
  testId: string
  groupId: string
  templateId?: string
  similarity: SimilarityScore
  timestamp: Date
  metadata?: Record<string, unknown>
}

/**
 * Reference lookup result
 */
export interface ReferenceLookup {
  reference: DeduplicationReference
  group?: DeduplicationGroup
  template?: FailureTemplate
  original?: DuplicateEntry
}

/**
 * Reference statistics
 */
export interface ReferenceStats {
  totalReferences: number
  uniqueGroups: number
  averageSimilarity: number
  similarityDistribution: Record<string, number>
  compressionRatio: number
}

/**
 * Reference manager implementation
 */
export class ReferenceManager {
  private references: Map<string, ReferenceIndex>
  private groupIndex: Map<string, Set<string>> // groupId -> Set<testId>
  private templateIndex: Map<string, Set<string>> // templateId -> Set<testId>
  private groups: Map<string, DeduplicationGroup>
  private templates: Map<string, FailureTemplate>
  private originals: Map<string, DuplicateEntry>

  constructor() {
    this.references = new Map()
    this.groupIndex = new Map()
    this.templateIndex = new Map()
    this.groups = new Map()
    this.templates = new Map()
    this.originals = new Map()
  }

  /**
   * Add a reference
   */
  addReference(
    testId: string,
    groupId: string,
    similarity: SimilarityScore,
    templateId?: string,
    variables?: Record<string, unknown>
  ): void {
    // Create reference index entry
    const index: ReferenceIndex = {
      testId,
      groupId,
      templateId,
      similarity,
      timestamp: new Date()
    }

    this.references.set(testId, index)

    // Update group index
    if (!this.groupIndex.has(groupId)) {
      this.groupIndex.set(groupId, new Set())
    }
    this.groupIndex.get(groupId)!.add(testId)

    // Update template index if applicable
    if (templateId) {
      if (!this.templateIndex.has(templateId)) {
        this.templateIndex.set(templateId, new Set())
      }
      this.templateIndex.get(templateId)!.add(testId)
    }
  }

  /**
   * Get a reference by test ID
   */
  getReference(testId: string): DeduplicationReference | null {
    const index = this.references.get(testId)
    if (!index) {
      return null
    }

    return {
      groupId: index.groupId,
      templateId: index.templateId,
      similarity: index.similarity
    }
  }

  /**
   * Get all references for a group
   */
  getGroupReferences(groupId: string): DeduplicationReference[] {
    const testIds = this.groupIndex.get(groupId)
    if (!testIds) {
      return []
    }

    const references: DeduplicationReference[] = []
    for (const testId of testIds) {
      const ref = this.getReference(testId)
      if (ref) {
        references.push(ref)
      }
    }

    return references
  }

  /**
   * Get all references using a template
   */
  getTemplateReferences(templateId: string): DeduplicationReference[] {
    const testIds = this.templateIndex.get(templateId)
    if (!testIds) {
      return []
    }

    const references: DeduplicationReference[] = []
    for (const testId of testIds) {
      const ref = this.getReference(testId)
      if (ref) {
        references.push(ref)
      }
    }

    return references
  }

  /**
   * Lookup complete reference information
   */
  lookup(testId: string): ReferenceLookup | null {
    const reference = this.getReference(testId)
    if (!reference) {
      return null
    }

    return {
      reference,
      group: this.groups.get(reference.groupId),
      template: reference.templateId ? this.templates.get(reference.templateId) : undefined,
      original: this.originals.get(testId)
    }
  }

  /**
   * Register a deduplication group
   */
  registerGroup(group: DeduplicationGroup): void {
    this.groups.set(group.id, group)

    // Register all test references in the group
    for (const testId of group.references) {
      if (!this.references.has(testId)) {
        // Auto-create reference if not exists
        this.addReference(testId, group.id, { score: 1, level: 'exact', confidence: 1 })
      }
    }
  }

  /**
   * Register a template
   */
  registerTemplate(template: FailureTemplate): void {
    this.templates.set(template.id, template)
  }

  /**
   * Register an original entry
   */
  registerOriginal(entry: DuplicateEntry): void {
    this.originals.set(entry.testId, entry)
  }

  /**
   * Remove a reference
   */
  removeReference(testId: string): boolean {
    const index = this.references.get(testId)
    if (!index) {
      return false
    }

    // Remove from references
    this.references.delete(testId)

    // Remove from group index
    const groupRefs = this.groupIndex.get(index.groupId)
    if (groupRefs) {
      groupRefs.delete(testId)
      if (groupRefs.size === 0) {
        this.groupIndex.delete(index.groupId)
      }
    }

    // Remove from template index
    if (index.templateId) {
      const templateRefs = this.templateIndex.get(index.templateId)
      if (templateRefs) {
        templateRefs.delete(testId)
        if (templateRefs.size === 0) {
          this.templateIndex.delete(index.templateId)
        }
      }
    }

    // Remove original if exists
    this.originals.delete(testId)

    return true
  }

  /**
   * Remove a group and all its references
   */
  removeGroup(groupId: string): number {
    const testIds = this.groupIndex.get(groupId)
    if (!testIds) {
      return 0
    }

    let removed = 0
    for (const testId of testIds) {
      if (this.removeReference(testId)) {
        removed++
      }
    }

    this.groups.delete(groupId)
    return removed
  }

  /**
   * Get compressed references
   */
  getCompressedReferences(): CompressedReference[] {
    const compressed: CompressedReference[] = []

    for (const [testId, index] of this.references) {
      const ref: CompressedReference = {
        testId,
        groupId: index.groupId
      }

      // Add variables if template is used
      if (index.templateId && this.templates.has(index.templateId)) {
        const original = this.originals.get(testId)
        if (original) {
          ref.vars = this.extractVariables(original, this.templates.get(index.templateId)!)
        }
      }

      compressed.push(ref)
    }

    return compressed
  }

  /**
   * Extract variables from an entry based on a template
   */
  private extractVariables(
    entry: DuplicateEntry,
    template: FailureTemplate
  ): Record<string, unknown> {
    const vars: Record<string, unknown> = {}

    // Extract from error message
    if (entry.errorMessage && template.pattern.includes('error')) {
      const extracted = this.extractFromPattern(entry.errorMessage, template.pattern)
      Object.assign(vars, extracted)
    }

    // Extract from stack trace
    if (entry.stackTrace && template.pattern.includes('stack')) {
      const lines = entry.stackTrace.split('\n')
      template.variables.forEach((variable, index) => {
        if (variable.type === 'line-number' && lines[index]) {
          const lineMatch = lines[index].match(/:\d+/)
          if (lineMatch) {
            vars[variable.name] = lineMatch[0].substring(1)
          }
        }
      })
    }

    return vars
  }

  /**
   * Extract variables from text based on pattern
   */
  private extractFromPattern(text: string, pattern: string): Record<string, unknown> {
    const vars: Record<string, unknown> = {}

    // Simple extraction by finding variable placeholders
    const varPattern = /{{(\w+)}}/g
    let match
    let lastIndex = 0

    while ((match = varPattern.exec(pattern)) !== null) {
      const varName = match[1]
      const beforeVar = pattern.substring(lastIndex, match.index)
      const textIndex = text.indexOf(beforeVar, lastIndex)

      if (textIndex !== -1) {
        const startIndex = textIndex + beforeVar.length
        const nextStaticPart = pattern.substring(match.index + match[0].length).match(/^[^{]+/)

        if (nextStaticPart) {
          const endIndex = text.indexOf(nextStaticPart[0], startIndex)
          if (endIndex !== -1) {
            vars[varName] = text.substring(startIndex, endIndex)
          }
        } else {
          // Variable is at the end
          vars[varName] = text.substring(startIndex)
        }
      }

      lastIndex = match.index + match[0].length
    }

    return vars
  }

  /**
   * Get statistics
   */
  getStats(): ReferenceStats {
    const similarities = Array.from(this.references.values()).map((r) => r.similarity)

    const similarityDistribution: Record<string, number> = {
      exact: 0,
      high: 0,
      medium: 0,
      low: 0
    }

    for (const sim of similarities) {
      similarityDistribution[sim.level]++
    }

    const totalOriginalSize = Array.from(this.originals.values()).reduce((sum, entry) => {
      const size = JSON.stringify(entry).length
      return sum + size
    }, 0)

    const compressedSize = this.getCompressedReferences().reduce((sum, ref) => {
      const size = JSON.stringify(ref).length
      return sum + size
    }, 0)

    return {
      totalReferences: this.references.size,
      uniqueGroups: this.groupIndex.size,
      averageSimilarity:
        similarities.length > 0
          ? similarities.reduce((sum, s) => sum + s.score, 0) / similarities.length
          : 0,
      similarityDistribution,
      compressionRatio: totalOriginalSize > 0 ? 1 - compressedSize / totalOriginalSize : 0
    }
  }

  /**
   * Clear all references
   */
  clear(): void {
    this.references.clear()
    this.groupIndex.clear()
    this.templateIndex.clear()
    this.groups.clear()
    this.templates.clear()
    this.originals.clear()
  }

  /**
   * Export references to Map
   */
  exportReferences(): Map<string, DeduplicationReference> {
    const exported = new Map<string, DeduplicationReference>()

    for (const [testId, index] of this.references) {
      exported.set(testId, {
        groupId: index.groupId,
        templateId: index.templateId,
        similarity: index.similarity
      })
    }

    return exported
  }

  /**
   * Import references from Map
   */
  importReferences(references: Map<string, DeduplicationReference>): void {
    for (const [testId, ref] of references) {
      this.addReference(testId, ref.groupId, ref.similarity, ref.templateId, ref.variables)
    }
  }
}
