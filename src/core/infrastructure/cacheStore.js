export const CACHE_SCHEMA_VERSION = 1;

export function createMemoryCache({ now = () => Date.now() } = {}) {
  const entries = new Map();

  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (Date.parse(entry.expiresAt) <= now()) {
        entries.delete(key);
        return null;
      }
      return entry;
    },

    async set(key, value, metadata = {}) {
      const fetchedAt = metadata.fetchedAt || new Date(now()).toISOString();
      const ttlSeconds = Math.max(1, metadata.ttlSeconds || 300);
      const entry = {
        schemaVersion: CACHE_SCHEMA_VERSION,
        key,
        value,
        fetchedAt,
        expiresAt: new Date(Date.parse(fetchedAt) + ttlSeconds * 1000).toISOString(),
        source: metadata.source || "api-football",
        externalIds: metadata.externalIds || {},
        tags: [...new Set(metadata.tags || [])],
      };
      entries.set(key, entry);
      return entry;
    },

    async invalidate({ tags = [] } = {}) {
      const requested = new Set(tags);
      let deleted = 0;
      for (const [key, entry] of entries) {
        if (entry.tags.some((tag) => requested.has(tag))) {
          entries.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    },

    async clearExpired() {
      let deleted = 0;
      for (const [key, entry] of entries) {
        if (Date.parse(entry.expiresAt) <= now()) {
          entries.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    },

    size() {
      return entries.size;
    },
  };
}
