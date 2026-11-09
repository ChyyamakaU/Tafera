/**
 * Minimal in-process limiter for memory-intensive asynchronous work.
 *
 * A slot is reserved before the task starts and transferred directly to the
 * next queued task when one finishes. This prevents a newly arriving task
 * from taking a slot that has already been promised to a waiter. The waiting
 * queue has a hard bound; operations are rejected once it is full.
 */
class ConcurrencyQueueFullError extends Error {
  constructor() {
    super('The operation queue is full.')
    this.name = 'ConcurrencyQueueFullError'
  }
}

class ConcurrencyLimiter {
  #active = 0
  #queue = []
  #maxConcurrency
  #maxQueue

  constructor(maxConcurrency, maxQueue = 50) {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new RangeError('maxConcurrency must be a positive integer')
    }

    if (!Number.isInteger(maxQueue) || maxQueue < 0) {
      throw new RangeError('maxQueue must be a non-negative integer')
    }

    this.#maxConcurrency = maxConcurrency
    this.#maxQueue = maxQueue
  }

  get maxConcurrency() {
    return this.#maxConcurrency
  }

  get maxQueue() {
    return this.#maxQueue
  }

  get activeCount() {
    return this.#active
  }

  get queuedCount() {
    return this.#queue.length
  }

  async run(task) {
    if (typeof task !== 'function') {
      throw new TypeError('task must be a function')
    }

    if (this.#active < this.#maxConcurrency) {
      this.#active += 1
    } else {
      if (this.#queue.length >= this.#maxQueue) {
        throw new ConcurrencyQueueFullError()
      }

      await new Promise((resolve) => {
        this.#queue.push(resolve)
      })
    }

    try {
      return await task()
    } finally {
      this.#release()
    }
  }

  #release() {
    const next = this.#queue.shift()

    if (next) {
      // The finished task's slot is transferred; #active stays unchanged.
      next()
    } else {
      this.#active -= 1
    }
  }
}

module.exports = {
  ConcurrencyLimiter,
  ConcurrencyQueueFullError,
}
