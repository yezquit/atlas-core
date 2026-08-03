import "server-only";

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CACHE_SCHEMA_VERSION } from "./cacheStore.js";

function cacheFilename(key) {
  return `${createHash("sha256").update(key).digest("hex")}.json`;
}

export function createPersistentFileCache({
  directory = path.join(process.cwd(), ".atlas-cache", `v${CACHE_SCHEMA_VERSION}`),
  now = () => Date.now(),
} = {}) {
  async function ensureDirectory() {
    await mkdir(directory, { recursive: true });
  }

  async function readEntry(filename) {
    try {
      const payload = JSON.parse(await readFile(path.join(directory, filename), "utf8"));
      if (payload.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
      return payload;
    } catch {
      return null;
    }
  }

  return {
    directory,

    async get(key) {
      await ensureDirectory();
      const filename = cacheFilename(key);
      const entry = await readEntry(filename);
      if (!entry || entry.key !== key) return null;
      if (Date.parse(entry.expiresAt) <= now()) {
        await unlink(path.join(directory, filename)).catch(() => {});
        return null;
      }
      return entry;
    },

    async set(key, value, metadata = {}) {
      await ensureDirectory();
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
      const destination = path.join(directory, cacheFilename(key));
      const temporary = `${destination}.${Date.now()}.tmp`;
      await writeFile(temporary, JSON.stringify(entry), {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporary, destination);
      return entry;
    },

    async invalidate({ tags = [] } = {}) {
      await ensureDirectory();
      const requested = new Set(tags);
      const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
      let deleted = 0;
      for (const filename of files) {
        const entry = await readEntry(filename);
        if (entry?.tags?.some((tag) => requested.has(tag))) {
          await unlink(path.join(directory, filename)).catch(() => {});
          deleted += 1;
        }
      }
      return deleted;
    },

    async clearExpired() {
      await ensureDirectory();
      const files = (await readdir(directory)).filter((name) => name.endsWith(".json"));
      let deleted = 0;
      for (const filename of files) {
        const entry = await readEntry(filename);
        if (!entry || Date.parse(entry.expiresAt) <= now()) {
          await unlink(path.join(directory, filename)).catch(() => {});
          deleted += 1;
        }
      }
      return deleted;
    },
  };
}
