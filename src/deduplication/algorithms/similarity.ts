/**
 * Similarity Algorithms
 * 
 * Collection of similarity calculation algorithms used
 * across the deduplication system.
 * 
 * @module similarity
 */

/**
 * Calculate Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  // Fill in the rest of the matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

/**
 * Calculate normalized Levenshtein similarity (0-1)
 */
export function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1
  
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  
  const distance = levenshteinDistance(a, b)
  return 1 - (distance / maxLen)
}

/**
 * Calculate Jaccard similarity between two sets
 */
export function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])
  
  return union.size > 0 ? intersection.size / union.size : 0
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let magnitudeA = 0
  let magnitudeB = 0

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i]
    magnitudeA += vectorA[i] * vectorA[i]
    magnitudeB += vectorB[i] * vectorB[i]
  }

  magnitudeA = Math.sqrt(magnitudeA)
  magnitudeB = Math.sqrt(magnitudeB)

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0
  }

  return dotProduct / (magnitudeA * magnitudeB)
}

/**
 * Calculate longest common subsequence length
 */
export function longestCommonSubsequence<T>(seqA: T[], seqB: T[]): number {
  const m = seqA.length
  const n = seqB.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (seqA[i - 1] === seqB[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  return dp[m][n]
}

/**
 * Calculate LCS-based similarity (0-1)
 */
export function lcsSimilarity<T>(seqA: T[], seqB: T[]): number {
  const lcs = longestCommonSubsequence(seqA, seqB)
  const maxLength = Math.max(seqA.length, seqB.length)
  
  return maxLength > 0 ? lcs / maxLength : 1
}

/**
 * Calculate Dice coefficient (similar to Jaccard but different formula)
 */
export function diceCoefficient<T>(setA: Set<T>, setB: Set<T>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  
  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const totalSize = setA.size + setB.size
  
  return totalSize > 0 ? (2 * intersection.size) / totalSize : 0
}

/**
 * Calculate n-gram similarity
 */
export function ngramSimilarity(textA: string, textB: string, n: number = 2): number {
  const ngramsA = getNgrams(textA, n)
  const ngramsB = getNgrams(textB, n)
  
  return jaccardSimilarity(ngramsA, ngramsB)
}

/**
 * Extract n-grams from text
 */
export function getNgrams(text: string, n: number): Set<string> {
  const ngrams = new Set<string>()
  
  if (text.length < n) {
    ngrams.add(text)
    return ngrams
  }
  
  for (let i = 0; i <= text.length - n; i++) {
    ngrams.add(text.substring(i, i + n))
  }
  
  return ngrams
}

/**
 * Calculate token-based similarity
 */
export function tokenSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(textA.toLowerCase().split(/\s+/).filter(t => t))
  const tokensB = new Set(textB.toLowerCase().split(/\s+/).filter(t => t))
  
  return jaccardSimilarity(tokensA, tokensB)
}

/**
 * Calculate weighted similarity combining multiple metrics
 */
export interface WeightedSimilarityOptions {
  useLevenshtein?: boolean
  useJaccard?: boolean
  useLCS?: boolean
  useNgram?: boolean
  weights?: {
    levenshtein?: number
    jaccard?: number
    lcs?: number
    ngram?: number
  }
}

export function weightedSimilarity(
  textA: string,
  textB: string,
  options: WeightedSimilarityOptions = {}
): number {
  const {
    useLevenshtein = true,
    useJaccard = true,
    useLCS = false,
    useNgram = false,
    weights = {}
  } = options

  const defaultWeights = {
    levenshtein: 0.3,
    jaccard: 0.3,
    lcs: 0.2,
    ngram: 0.2
  }

  const finalWeights = { ...defaultWeights, ...weights }
  
  let totalScore = 0
  let totalWeight = 0

  if (useLevenshtein) {
    totalScore += levenshteinSimilarity(textA, textB) * finalWeights.levenshtein
    totalWeight += finalWeights.levenshtein
  }

  if (useJaccard) {
    totalScore += tokenSimilarity(textA, textB) * finalWeights.jaccard
    totalWeight += finalWeights.jaccard
  }

  if (useLCS) {
    const charsA = textA.split('')
    const charsB = textB.split('')
    totalScore += lcsSimilarity(charsA, charsB) * finalWeights.lcs
    totalWeight += finalWeights.lcs
  }

  if (useNgram) {
    totalScore += ngramSimilarity(textA, textB) * finalWeights.ngram
    totalWeight += finalWeights.ngram
  }

  return totalWeight > 0 ? totalScore / totalWeight : 0
}

/**
 * Fuzzy string matching with tolerance
 */
export function fuzzyMatch(pattern: string, text: string, tolerance: number = 0.8): boolean {
  const similarity = levenshteinSimilarity(pattern.toLowerCase(), text.toLowerCase())
  return similarity >= tolerance
}

/**
 * Find best match from a list of candidates
 */
export function findBestMatch<T>(
  target: string,
  candidates: T[],
  getStr: (item: T) => string,
  threshold: number = 0
): { item: T; score: number } | null {
  let bestMatch: { item: T; score: number } | null = null
  let bestScore = threshold

  for (const candidate of candidates) {
    const candidateStr = getStr(candidate)
    const score = levenshteinSimilarity(target, candidateStr)
    
    if (score > bestScore) {
      bestScore = score
      bestMatch = { item: candidate, score }
    }
  }

  return bestMatch
}

/**
 * Cluster similar strings together
 */
export function clusterSimilarStrings(
  strings: string[],
  threshold: number = 0.7
): string[][] {
  const clusters: string[][] = []
  const assigned = new Set<number>()

  for (let i = 0; i < strings.length; i++) {
    if (assigned.has(i)) continue

    const cluster = [strings[i]]
    assigned.add(i)

    for (let j = i + 1; j < strings.length; j++) {
      if (assigned.has(j)) continue

      const similarity = levenshteinSimilarity(strings[i], strings[j])
      if (similarity >= threshold) {
        cluster.push(strings[j])
        assigned.add(j)
      }
    }

    clusters.push(cluster)
  }

  return clusters
}