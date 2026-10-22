import { test } from "node:test";
import assert from "node:assert/strict";
import { LruTtlCache } from "./lru-ttl-cache.js";
test("LRU evicts least recently used and refreshes access order", () => {
  const cache = new LruTtlCache<string, number>(2, 1000);
  cache.set("a", 1);
  cache.set("b", 2);
  assert.equal(cache.get("a"), 1);
  cache.set("c", 3);
  assert.equal(cache.get("b"), undefined);
  assert.equal(cache.get("c"), 3);
});
test("TTL prevents stale values", () => {
  let time = 0;
  const cache = new LruTtlCache<string, string>(2, 100, () => time);
  cache.set("key", "cached");
  time = 101;
  assert.equal(cache.get("key"), undefined);
});
