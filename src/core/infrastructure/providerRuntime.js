import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { CACHE_STATUS } from "../contracts/sportsIntelligenceContracts.js";
import { createMemoryCache } from "./cacheStore.js";

const TRANSIENT_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const ALLOWED_PROVIDER_HOSTS = new Set(["v3.football.api-sports.io"]);

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function quotaFromHeaders(headers) {
  if (!headers?.get) return { dailyLimit: null, dailyRemaining: null };
  return {
    dailyLimit: safeNumber(headers.get("x-ratelimit-requests-limit")),
    dailyRemaining: safeNumber(headers.get("x-ratelimit-requests-remaining")),
  };
}

function providerFailure(status, errorCode, message) {
  return { status, errorCode, message, response: [] };
}

function hasErrors(errors) {
  if (!errors) return false;
  if (Array.isArray(errors)) return errors.length > 0;
  if (typeof errors === "object") return Object.keys(errors).length > 0;
  return Boolean(String(errors).trim());
}

function planLimited(errors) {
  const text = JSON.stringify(errors || "").toLowerCase();
  return ["plan", "subscription", "season", "quota", "request limit", "access"].some(
    (token) => text.includes(token)
  );
}

function stableKey(pathname, query = {}) {
  const params = Object.entries(query)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return `api-football:${pathname}?${params}`;
}

function createConcurrencyLimiter(maxConcurrency, metrics) {
  const queue = [];
  let active = 0;

  function drain() {
    while (active < maxConcurrency && queue.length > 0) {
      const next = queue.shift();
      active += 1;
      metrics.maxConcurrentObserved = Math.max(metrics.maxConcurrentObserved, active);
      next.task()
        .then(next.resolve, next.reject)
        .finally(() => {
          active -= 1;
          drain();
        });
    }
  }

  return (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      drain();
    });
}

export function createProviderRuntime({
  apiKey,
  baseUrl,
  budget = 40,
  concurrency = 3,
  timeoutMs = 8_000,
  maxRetries = 1,
  fetchImpl = fetch,
  cache = createMemoryCache(),
  now = () => Date.now(),
  quotaWarningRatio = 0.15,
  quotaBlockRatio = 0.05,
} = {}) {
  const configuredBudget = Math.max(1, Math.min(3000, Number(budget) || 40));
  const metrics = {
    requestsUsed: 0,
    budgetStops: 0,
    cacheHits: 0,
    cacheMisses: 0,
    deduplicated: 0,
    retries: 0,
    maxConcurrentObserved: 0,
    providerDailyLimit: null,
    providerDailyRemaining: null,
    startedAt: new Date(now()).toISOString(),
  };
  const inFlight = new Map();
  const limit = createConcurrencyLimiter(Math.max(1, concurrency), metrics);

  function validatedBaseUrl() {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" || !ALLOWED_PROVIDER_HOSTS.has(url.hostname)) {
        return null;
      }
      return url;
    } catch {
      return null;
    }
  }

  function snapshot() {
    const dailyRatio = metrics.providerDailyLimit > 0 && metrics.providerDailyRemaining !== null
      ? metrics.providerDailyRemaining / metrics.providerDailyLimit
      : null;
    return {
      ...metrics,
      configuredBudget,
      configuredBudgetRemaining: Math.max(0, configuredBudget - metrics.requestsUsed),
      budgetExhausted: metrics.budgetStops > 0,
      quotaStatus:
        dailyRatio === null
          ? "unknown"
          : dailyRatio < quotaBlockRatio
            ? "preventive_block"
            : dailyRatio < quotaWarningRatio
              ? "warning"
              : "available",
      quotaRemainingRatio: dailyRatio,
      finishedAt: new Date(now()).toISOString(),
    };
  }

  async function networkRequest({ pathname, query }) {
    const providerUrl = validatedBaseUrl();
    if (!apiKey || !providerUrl) {
      return providerFailure(
        DATA_LOAD_STATUS.UNAVAILABLE,
        "provider_unconfigured",
        "La integración deportiva no está disponible en este entorno."
      );
    }

    if (
      metrics.providerDailyLimit > 0 &&
      metrics.providerDailyRemaining / metrics.providerDailyLimit < quotaBlockRatio
    ) {
      return providerFailure(
        DATA_LOAD_STATUS.BLOCKED,
        "provider_quota_preventive_block",
        "La consulta se detuvo para preservar la cuota diaria configurada."
      );
    }

    const url = new URL(pathname, providerUrl);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (metrics.requestsUsed >= configuredBudget) {
        metrics.budgetStops += 1;
        return providerFailure(
          DATA_LOAD_STATUS.BLOCKED,
          "request_budget_exhausted",
          "La operación se detuvo al alcanzar su presupuesto de consultas."
        );
      }

      metrics.requestsUsed += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(url, {
          headers: { "x-apisports-key": apiKey },
          signal: controller.signal,
          cache: "no-store",
        });
        const quota = quotaFromHeaders(response.headers);
        if (quota.dailyLimit !== null) metrics.providerDailyLimit = quota.dailyLimit;
        if (quota.dailyRemaining !== null) {
          metrics.providerDailyRemaining = quota.dailyRemaining;
        }

        if (TRANSIENT_HTTP_STATUS.has(response.status) && attempt < maxRetries) {
          await response.body?.cancel?.();
          metrics.retries += 1;
          continue;
        }

        let payload;
        try {
          payload = await response.json();
        } catch {
          return providerFailure(
            DATA_LOAD_STATUS.PROVIDER_ERROR,
            "provider_invalid_response",
            "El proveedor devolvió una respuesta no procesable."
          );
        }

        if (!response.ok) {
          return providerFailure(
            [401, 403].includes(response.status)
              ? DATA_LOAD_STATUS.UNAVAILABLE
              : DATA_LOAD_STATUS.PROVIDER_ERROR,
            [401, 403].includes(response.status)
              ? "provider_access_unavailable"
              : "provider_request_failed",
            [401, 403].includes(response.status)
              ? "El proveedor no autorizó esta consulta."
              : "El proveedor deportivo no pudo completar la consulta."
          );
        }

        if (hasErrors(payload?.errors)) {
          return providerFailure(
            planLimited(payload.errors)
              ? DATA_LOAD_STATUS.UNAVAILABLE
              : DATA_LOAD_STATUS.PROVIDER_ERROR,
            planLimited(payload.errors)
              ? "provider_plan_unavailable"
              : "provider_rejected_request",
            planLimited(payload.errors)
              ? "El plan actual no permite consultar esta temporada o recurso."
              : "El proveedor rechazó la consulta deportiva."
          );
        }

        if (!Array.isArray(payload?.response)) {
          return providerFailure(
            DATA_LOAD_STATUS.PROVIDER_ERROR,
            "provider_invalid_response",
            "El proveedor devolvió una respuesta no procesable."
          );
        }

        return {
          status: DATA_LOAD_STATUS.SUCCESS,
          response: payload.response,
          providerMeta: { quota },
        };
      } catch (error) {
        const timedOut = controller.signal.aborted || error?.name === "AbortError";
        if (!timedOut && attempt < maxRetries) {
          metrics.retries += 1;
          continue;
        }
        return providerFailure(
          DATA_LOAD_STATUS.PROVIDER_ERROR,
          timedOut ? "provider_timeout" : "provider_network_error",
          timedOut
            ? "El proveedor no respondió dentro del tiempo permitido."
            : "No fue posible conectar con el proveedor deportivo."
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    return providerFailure(
      DATA_LOAD_STATUS.PROVIDER_ERROR,
      "provider_request_failed",
      "El proveedor deportivo no pudo completar la consulta."
    );
  }

  async function request({
    pathname,
    query = {},
    ttlSeconds = 300,
    cacheScope = "",
    tags = [],
    externalIds = {},
  }) {
    const key = stableKey(cacheScope ? `${pathname}#${cacheScope}` : pathname, query);
    const cached = await cache.get(key);
    if (cached) {
      metrics.cacheHits += 1;
      return {
        ...cached.value,
        requestMeta: {
          cacheStatus: CACHE_STATUS.HIT,
          fetchedAt: cached.fetchedAt,
          expiresAt: cached.expiresAt,
        },
      };
    }

    if (inFlight.has(key)) {
      metrics.deduplicated += 1;
      const shared = await inFlight.get(key);
      return {
        ...shared,
        requestMeta: {
          ...(shared.requestMeta || {}),
          cacheStatus: CACHE_STATUS.DEDUPLICATED,
        },
      };
    }

    metrics.cacheMisses += 1;
    const operation = limit(async () => {
      const result = await networkRequest({ pathname, query });
      const fetchedAt = new Date(now()).toISOString();
      if (result.status === DATA_LOAD_STATUS.SUCCESS) {
        const entry = await cache.set(key, result, {
          fetchedAt,
          ttlSeconds,
          source: "api-football",
          externalIds,
          tags,
        });
        return {
          ...result,
          requestMeta: {
            cacheStatus: CACHE_STATUS.MISS,
            fetchedAt: entry.fetchedAt,
            expiresAt: entry.expiresAt,
          },
        };
      }
      return {
        ...result,
        requestMeta: { cacheStatus: CACHE_STATUS.MISS, fetchedAt, expiresAt: null },
      };
    });
    inFlight.set(key, operation);
    try {
      return await operation;
    } finally {
      inFlight.delete(key);
    }
  }

  return {
    request,
    snapshot,
    cache,
    configuredBudget,
  };
}
