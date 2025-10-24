export interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export interface CacheConfig {
  ttl: number
  maxSize: number
}

export class InMemoryCache<T = unknown> {
  private readonly store = new Map<string, CacheEntry<T>>()

  constructor(private readonly config: CacheConfig) {}

  get(key: string): T | undefined {
    const record = this.store.get(key)
    if (!record) return undefined
    if (record.expiresAt < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return record.value
  }

  set(key: string, value: T, ttl?: number) {
    if (this.store.size >= this.config.maxSize) {
      const iterator = this.store.keys().next()
      if (!iterator.done) {
        this.store.delete(iterator.value)
      }
    }
    const lifetime = ttl ?? this.config.ttl
    this.store.set(key, {
      value,
      expiresAt: Date.now() + lifetime,
    })
  }

  delete(key: string) {
    this.store.delete(key)
  }

  clear() {
    this.store.clear()
  }

  async wrap(key: string, producer: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key)
    if (cached !== undefined) return cached
    const value = await producer()
    this.set(key, value, ttl)
    return value
  }
}

export function createCompositeKey(parts: Array<string | number | undefined | null>): string {
  return parts
    .map((part) => (part === undefined || part === null ? '' : String(part)))
    .join('::')
}
