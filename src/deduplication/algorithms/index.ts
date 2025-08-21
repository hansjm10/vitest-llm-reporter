/**
 * Algorithms Module
 * 
 * Exports for similarity and pattern matching algorithms
 * 
 * @module algorithms
 */

export {
  // Distance metrics
  levenshteinDistance,
  levenshteinSimilarity,
  
  // Set-based metrics
  jaccardSimilarity,
  diceCoefficient,
  
  // Sequence-based metrics
  longestCommonSubsequence,
  lcsSimilarity,
  
  // Vector-based metrics
  cosineSimilarity,
  
  // Text-based metrics
  ngramSimilarity,
  getNgrams,
  tokenSimilarity,
  
  // Combined metrics
  weightedSimilarity,
  type WeightedSimilarityOptions,
  
  // Utility functions
  fuzzyMatch,
  findBestMatch,
  clusterSimilarStrings
} from './similarity'