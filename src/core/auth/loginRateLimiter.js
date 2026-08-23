const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;

export function createLoginRateLimiter({
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
  now = () => Date.now(),
} = {}) {
  const attempts = new Map();

  function current(key) {
    const entry = attempts.get(key);
    if (!entry || now() >= entry.resetAt) {
      attempts.delete(key);
      return null;
    }
    return entry;
  }

  return {
    check(key) {
      const entry = current(key);
      if (!entry || entry.failures < limit) return { allowed: true, retryAfterSeconds: 0 };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now()) / 1000)),
      };
    },
    recordFailure(key) {
      const entry = current(key) || { failures: 0, resetAt: now() + windowMs };
      entry.failures += 1;
      attempts.set(key, entry);
      return this.check(key);
    },
    recordSuccess(key) {
      attempts.delete(key);
    },
    reset() {
      attempts.clear();
    },
  };
}
