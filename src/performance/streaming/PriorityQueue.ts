/**
 * Priority Queue - Task Scheduling System
 *
 * Efficient priority-based task queue for optimal scheduling
 * of streaming operations based on importance and performance.
 *
 * @module PriorityQueue
 */

import type { StreamingOptimizationConfig } from '../types'

interface QueueItem<T> {
  id: string
  task: T
  priority: number
  timestamp: number
}

export class PriorityQueue<T> {
  private queue: QueueItem<T>[] = []
  private config: Required<StreamingOptimizationConfig>['priorityQueue']

  constructor(config: Required<StreamingOptimizationConfig>['priorityQueue']) {
    this.config = config
  }

  enqueue(id: string, task: T, priority: number): void {
    const item: QueueItem<T> = {
      id,
      task,
      priority,
      timestamp: Date.now()
    }

    // Insert in priority order
    let inserted = false
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority < priority) {
        this.queue.splice(i, 0, item)
        inserted = true
        break
      }
    }

    if (!inserted) {
      this.queue.push(item)
    }

    // Maintain size limit
    if (this.queue.length > this.config.maxSize) {
      this.queue.pop() // Remove lowest priority item
    }
  }

  dequeue(): QueueItem<T> | undefined {
    return this.queue.shift()
  }

  adjustPriority(taskId: string, newPriority: number): void {
    const index = this.queue.findIndex(item => item.id === taskId)
    if (index >= 0) {
      const item = this.queue.splice(index, 1)[0]
      this.enqueue(item.id, item.task, newPriority)
    }
  }

  getOptimalBatchSize(): number {
    // Adjust batch size based on queue load
    const loadRatio = this.queue.length / this.config.maxSize
    if (loadRatio > 0.8) {
      return Math.max(this.config.batchSize * 0.5, 1)
    } else if (loadRatio < 0.2) {
      return this.config.batchSize * 1.5
    }
    return this.config.batchSize
  }

  size(): number {
    return this.queue.length
  }
}