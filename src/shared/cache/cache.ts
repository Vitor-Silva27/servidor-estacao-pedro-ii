import type Redis from "ioredis";

export type CacheStore = Pick<Redis, "get" | "set" | "del">;

const PREFIX = "cache:";

export function createCache(store: CacheStore, defaultTtlSeconds = 60) {
  return {
    async get<T>(key: string): Promise<T | null> {
      const raw = await store.get(PREFIX + key);
      return raw === null ? null : (JSON.parse(raw) as T);
    },

    async set(key: string, value: unknown, ttlSeconds = defaultTtlSeconds): Promise<void> {
      await store.set(PREFIX + key, JSON.stringify(value), "EX", ttlSeconds);
    },

    async del(key: string): Promise<void> {
      await store.del(PREFIX + key);
    },
  };
}

export type Cache = ReturnType<typeof createCache>;
