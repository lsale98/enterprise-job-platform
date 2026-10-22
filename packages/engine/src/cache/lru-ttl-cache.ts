/** Bounded TTL/LRU cache; intended only for non-authoritative derived data. */
export class LruTtlCache<K, V> {
  private readonly values = new Map<K, { value: V; expiresAt: number }>();
  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
    private readonly now = Date.now,
  ) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !Number.isFinite(ttlMs) ||
      ttlMs <= 0
    ) {
      throw new RangeError("invalid cache configuration");
    }
  }
  get(key: K): V | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.values.delete(key);
      return undefined;
    }
    this.values.delete(key);
    this.values.set(key, entry); // move to most recently used
    return entry.value;
  }
  set(key: K, value: V): void {
    this.values.delete(key);
    this.values.set(key, { value, expiresAt: this.now() + this.ttlMs });
    if (this.values.size > this.capacity) {
      const oldest = this.values.keys().next().value;
      if (oldest !== undefined) this.values.delete(oldest);
    }
  }
  get size(): number {
    return this.values.size;
  }
}
