import type { ILRUCache, CacheKey, CacheEntry } from './types.js';

/**
 * Node in the doubly-linked list for LRU cache
 */
class CacheNode<K, V> {
  constructor(
    public key: K,
    public value: V,
    public prev: CacheNode<K, V> | null = null,
    public next: CacheNode<K, V> | null = null
  ) {}
}

/**
 * LRU (Least Recently Used) Cache implementation
 * Uses a doubly-linked list and hash map for O(1) operations
 */
export class LRUCache<K, V> implements ILRUCache<K, V> {
  private readonly keyMap = new Map<string, CacheNode<K, V>>();
  private readonly maxSize: number;
  private head: CacheNode<K, V>;
  private tail: CacheNode<K, V>;

  constructor(maxSize = 1000) {
    if (maxSize <= 0) {
      throw new Error('Cache size must be positive');
    }
    
    this.maxSize = maxSize;
    
    // Initialize dummy head and tail nodes
    this.head = new CacheNode<K, V>(null as unknown as K, null as unknown as V);
    this.tail = new CacheNode<K, V>(null as unknown as K, null as unknown as V);
    
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get value by key, marking it as most recently used
   */
  get(key: K): V | undefined {
    const keyStr = this.serializeKey(key);
    const node = this.keyMap.get(keyStr);
    
    if (!node) {
      return undefined;
    }

    // Move to front (most recently used)
    this.moveToFront(node);
    return node.value;
  }

  /**
   * Set key-value pair, evicting LRU item if necessary
   */
  set(key: K, value: V): void {
    const keyStr = this.serializeKey(key);
    const existingNode = this.keyMap.get(keyStr);
    
    if (existingNode) {
      // Update existing node
      existingNode.value = value;
      this.moveToFront(existingNode);
      return;
    }

    // Create new node
    const newNode = new CacheNode(key, value);
    
    // Add to front
    this.addToFront(newNode);
    this.keyMap.set(keyStr, newNode);

    // Evict LRU if over capacity
    if (this.keyMap.size > this.maxSize) {
      this.removeLRU();
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: K): boolean {
    const keyStr = this.serializeKey(key);
    return this.keyMap.has(keyStr);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.keyMap.clear();
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  /**
   * Get current cache size
   */
  size(): number {
    return this.keyMap.size;
  }

  /**
   * Get maximum cache capacity
   */
  capacity(): number {
    return this.maxSize;
  }

  /**
   * Move node to front (most recently used position)
   */
  private moveToFront(node: CacheNode<K, V>): void {
    this.removeNode(node);
    this.addToFront(node);
  }

  /**
   * Add node to front of the list
   */
  private addToFront(node: CacheNode<K, V>): void {
    node.prev = this.head;
    node.next = this.head.next;
    
    if (this.head.next) {
      this.head.next.prev = node;
    }
    this.head.next = node;
  }

  /**
   * Remove node from the list
   */
  private removeNode(node: CacheNode<K, V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    }
  }

  /**
   * Remove least recently used item
   */
  private removeLRU(): void {
    const lru = this.tail.prev;
    if (lru && lru !== this.head) {
      const keyStr = this.serializeKey(lru.key);
      this.keyMap.delete(keyStr);
      this.removeNode(lru);
    }
  }

  /**
   * Serialize key for use in Map
   */
  private serializeKey(key: K): string {
    if (typeof key === 'string') {
      return key;
    }
    return JSON.stringify(key);
  }
}

/**
 * Create a cache key for tokenization operations
 */
export function createCacheKey(text: string, model: string): string {
  // Use a simple concatenation with delimiter for performance
  // Hash could be used for very long texts, but adds complexity
  return `${model}:${text}`;
}

/**
 * Tokenization-specific LRU cache
 */
export class TokenizationCache {
  private cache: LRUCache<string, CacheEntry>;

  constructor(maxSize = 1000) {
    this.cache = new LRUCache<string, CacheEntry>(maxSize);
  }

  /**
   * Get cached tokenization result
   */
  get(cacheKey: CacheKey): CacheEntry | undefined {
    const key = createCacheKey(cacheKey.text, cacheKey.model);
    return this.cache.get(key);
  }

  /**
   * Set cached tokenization result
   */
  set(cacheKey: CacheKey, entry: CacheEntry): void {
    const key = createCacheKey(cacheKey.text, cacheKey.model);
    this.cache.set(key, entry);
  }

  /**
   * Check if result is cached
   */
  has(cacheKey: CacheKey): boolean {
    const key = createCacheKey(cacheKey.text, cacheKey.model);
    return this.cache.has(key);
  }

  /**
   * Clear all cached results
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; capacity: number; hitRatio?: number } {
    return {
      size: this.cache.size(),
      capacity: this.cache.capacity(),
    };
  }
}