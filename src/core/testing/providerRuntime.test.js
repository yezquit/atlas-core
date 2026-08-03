import test from "node:test";
import assert from "node:assert/strict";

import { DATA_LOAD_STATUS } from "../contracts/atlasContracts.js";
import { createMemoryCache } from "../infrastructure/cacheStore.js";
import { createProviderRuntime } from "../infrastructure/providerRuntime.js";

const runtimeConfig = {
  apiKey: "secret-that-must-not-leak",
  baseUrl: "https://v3.football.api-sports.io",
  maxRetries: 0,
};

function response(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("la caché evita llamadas repetidas", async () => {
  let calls = 0;
  const runtime = createProviderRuntime({
    ...runtimeConfig,
    cache: createMemoryCache(),
    fetchImpl: async () => {
      calls += 1;
      return response({ response: [{ id: 1 }], errors: [] });
    },
  });

  const request = { pathname: "/fixtures", query: { id: 1 } };
  const first = await runtime.request(request);
  const second = await runtime.request(request);

  assert.equal(calls, 1);
  assert.equal(first.requestMeta.cacheStatus, "miss");
  assert.equal(second.requestMeta.cacheStatus, "hit");
  assert.equal(runtime.snapshot().cacheHits, 1);
});

test("las solicitudes concurrentes idénticas se deduplican", async () => {
  let resolveFetch;
  let calls = 0;
  const runtime = createProviderRuntime({
    ...runtimeConfig,
    fetchImpl: async () => {
      calls += 1;
      await new Promise((resolve) => {
        resolveFetch = resolve;
      });
      return response({ response: [{ id: 2 }], errors: [] });
    },
  });
  const request = { pathname: "/fixtures", query: { id: 2 } };
  const first = runtime.request(request);
  const second = runtime.request(request);
  while (!resolveFetch) await new Promise((resolve) => setImmediate(resolve));
  resolveFetch();

  const [, deduplicated] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.equal(deduplicated.requestMeta.cacheStatus, "deduplicated");
  assert.equal(runtime.snapshot().deduplicated, 1);
});

test("el presupuesto detiene nuevas llamadas", async () => {
  const runtime = createProviderRuntime({
    ...runtimeConfig,
    budget: 1,
    fetchImpl: async () => response({ response: [], errors: [] }),
  });

  await runtime.request({ pathname: "/fixtures", query: { id: 1 } });
  const blocked = await runtime.request({ pathname: "/fixtures", query: { id: 2 } });

  assert.equal(blocked.status, DATA_LOAD_STATUS.BLOCKED);
  assert.equal(blocked.errorCode, "request_budget_exhausted");
  assert.equal(runtime.snapshot().requestsUsed, 1);
});

test("el límite de concurrencia se respeta", async () => {
  let active = 0;
  let observed = 0;
  const runtime = createProviderRuntime({
    ...runtimeConfig,
    concurrency: 2,
    fetchImpl: async () => {
      active += 1;
      observed = Math.max(observed, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return response({ response: [], errors: [] });
    },
  });

  await Promise.all(
    [1, 2, 3, 4].map((id) =>
      runtime.request({ pathname: "/fixtures", query: { id } })
    )
  );
  assert.equal(observed, 2);
  assert.equal(runtime.snapshot().maxConcurrentObserved, 2);
});

test("solo expone headers numéricos de cuota", async () => {
  const runtime = createProviderRuntime({
    ...runtimeConfig,
    fetchImpl: async () =>
      response(
        { response: [], errors: [], account: { email: "private@example.com" } },
        {
          headers: {
            "x-ratelimit-requests-limit": "7500",
            "x-ratelimit-requests-remaining": "7499",
            "x-provider-account": "private@example.com",
          },
        }
      ),
  });
  const result = await runtime.request({ pathname: "/status" });
  const serialized = JSON.stringify(result);

  assert.equal(runtime.snapshot().providerDailyLimit, 7500);
  assert.equal(runtime.snapshot().providerDailyRemaining, 7499);
  assert.doesNotMatch(serialized, /private@example\.com|account/);
});

test("los errores del proveedor nunca filtran la API key", async () => {
  const runtime = createProviderRuntime({
    ...runtimeConfig,
    fetchImpl: async () =>
      response({ errors: { detail: runtimeConfig.apiKey }, response: [] }),
  });
  const result = await runtime.request({ pathname: "/fixtures", query: { id: 9 } });

  assert.equal(result.status, DATA_LOAD_STATUS.PROVIDER_ERROR);
  assert.equal(JSON.stringify(result).includes(runtimeConfig.apiKey), false);
});
