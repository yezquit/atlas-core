import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  PERSONAL_SESSION_COOKIE,
  createPersonalSessionToken,
  sessionCookieHeader,
  verifyPersonalCredentials,
  verifyPersonalSessionToken,
} from "../auth/personalAuth.js";
import { createLoginRateLimiter } from "../auth/loginRateLimiter.js";
import { requirePersonalSession } from "../auth/personalAccessPolicy.js";
import { PERSONAL_OWNER_ID } from "../auth/personalIdentity.js";
import { createBetRecord, createMemoryBetLedger } from "../infrastructure/betLedger.js";
import { createMemoryPredictionLedger } from "../infrastructure/predictionLedger.js";
import { POST as login } from "../../app/api/auth/login/route.js";
import { POST as logout } from "../../app/api/auth/logout/route.js";

const TEST_USERNAME = "atlas-test-owner";
const TEST_PASSWORD = "correct horse battery atlas";
const TEST_NOW = Date.parse("2026-08-23T12:00:00.000Z");

function testHash(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

const TEST_ENV = Object.freeze({
  ATLAS_PERSONAL_USERNAME: TEST_USERNAME,
  ATLAS_PERSONAL_PASSWORD_HASH: testHash(TEST_PASSWORD),
  ATLAS_SESSION_SECRET: "unit-test-session-secret-that-is-longer-than-thirty-two-characters",
  ATLAS_SESSION_TTL_SECONDS: "604800",
});

function withAuthEnvironment(task) {
  const previous = Object.fromEntries(
    Object.keys(TEST_ENV).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, TEST_ENV);
  return Promise.resolve()
    .then(task)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test("AUTH 1. acepta credenciales personales válidas y rechaza las inválidas sin detalle", () => {
  assert.deepEqual(
    verifyPersonalCredentials({ username: TEST_USERNAME, password: TEST_PASSWORD }, TEST_ENV),
    { ok: true, ownerId: PERSONAL_OWNER_ID }
  );
  assert.equal(
    verifyPersonalCredentials({ username: TEST_USERNAME, password: "incorrecta" }, TEST_ENV).reason,
    "invalid_credentials"
  );
  assert.equal(
    verifyPersonalCredentials({ username: "otro", password: TEST_PASSWORD }, TEST_ENV).reason,
    "invalid_credentials"
  );
});

test("AUTH 2. la sesión firmada persiste hasta expirar y no acepta manipulación", () => {
  const token = createPersonalSessionToken({ now: TEST_NOW, env: TEST_ENV });
  assert.equal(
    verifyPersonalSessionToken(token, { now: TEST_NOW + 60_000, env: TEST_ENV }).ownerId,
    PERSONAL_OWNER_ID
  );
  assert.equal(verifyPersonalSessionToken(`${token}x`, { now: TEST_NOW, env: TEST_ENV }), null);
  assert.equal(
    verifyPersonalSessionToken(token, { now: TEST_NOW + 8 * 24 * 60 * 60 * 1000, env: TEST_ENV }),
    null
  );
});

test("AUTH 3. cookie HttpOnly/SameSite añade Secure solo bajo HTTPS y logout la expira", () => {
  const httpCookie = sessionCookieHeader("token", { secure: false, maxAge: 60 });
  const httpsCookie = sessionCookieHeader("token", { secure: true, maxAge: 60 });
  const cleared = sessionCookieHeader("", { secure: false, maxAge: 0 });
  assert.match(httpCookie, /HttpOnly/);
  assert.match(httpCookie, /SameSite=Strict/);
  assert.doesNotMatch(httpCookie, /; Secure/);
  assert.match(httpsCookie, /; Secure/);
  assert.match(cleared, /Max-Age=0/);
});

test("AUTH 4. endpoint protegido niega sin sesión y permite cookie válida", () => {
  const denied = requirePersonalSession(new Request("http://localhost/api/bets"), {
    env: TEST_ENV,
    now: TEST_NOW,
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.response.status, 401);

  const token = createPersonalSessionToken({ now: TEST_NOW, env: TEST_ENV });
  const allowed = requirePersonalSession(
    new Request("http://localhost/api/bets", {
      headers: { cookie: `${PERSONAL_SESSION_COOKIE}=${token}` },
    }),
    { env: TEST_ENV, now: TEST_NOW }
  );
  assert.equal(allowed.ok, true);
  assert.equal(allowed.session.ownerId, PERSONAL_OWNER_ID);

  const crossOrigin = requirePersonalSession(
    new Request("http://localhost/api/bets", {
      method: "POST",
      headers: {
        cookie: `${PERSONAL_SESSION_COOKIE}=${token}`,
        origin: "http://otro-equipo.local",
      },
    }),
    { env: TEST_ENV, now: TEST_NOW }
  );
  assert.equal(crossOrigin.ok, false);
  assert.equal(crossOrigin.response.status, 403);

  const lanHost = requirePersonalSession(
    new Request("http://localhost/api/bets", {
      method: "POST",
      headers: {
        cookie: `${PERSONAL_SESSION_COOKIE}=${token}`,
        host: "192.168.1.20:3000",
        origin: "http://192.168.1.20:3000",
      },
    }),
    { env: TEST_ENV, now: TEST_NOW }
  );
  assert.equal(lanHost.ok, true);
});

test("AUTH 5. login HTTP real de Route Handler crea sesión y logout la invalida", async () => {
  await withAuthEnvironment(async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "test-valid" },
        body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
      })
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /HttpOnly/);
    assert.doesNotMatch(response.headers.get("set-cookie"), /; Secure/);

    const httpsResponse = await login(
      new Request("https://atlas.local/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "test-https" },
        body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
      })
    );
    assert.match(httpsResponse.headers.get("set-cookie"), /; Secure/);

    const loginCookie = response.headers.get("set-cookie").split(";")[0];
    const logoutResponse = await logout(
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: { cookie: loginCookie, origin: "http://localhost" },
      })
    );
    assert.equal(logoutResponse.status, 200);
    assert.match(logoutResponse.headers.get("set-cookie"), /Max-Age=0/);

    const deniedLogout = await logout(
      new Request("http://localhost/api/auth/logout", { method: "POST" })
    );
    assert.equal(deniedLogout.status, 401);
  });
});

test("AUTH 6. login inválido usa mensaje genérico y el limitador bloquea fuerza bruta", async () => {
  await withAuthEnvironment(async () => {
    const response = await login(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "test-invalid" },
        body: JSON.stringify({ username: TEST_USERNAME, password: "incorrecta" }),
      })
    );
    assert.equal(response.status, 401);
    assert.equal((await response.json()).message, "Usuario o contraseña incorrectos.");
  });

  let now = 1000;
  const limiter = createLoginRateLimiter({ limit: 2, windowMs: 5000, now: () => now });
  limiter.recordFailure("device");
  assert.equal(limiter.check("device").allowed, true);
  limiter.recordFailure("device");
  assert.equal(limiter.check("device").allowed, false);
  now += 5001;
  assert.equal(limiter.check("device").allowed, true);
});

test("AUTH 7. apuestas nuevas tienen owner y registros legacy sin owner siguen siendo personales", async () => {
  const newBet = createBetRecord({
    betId: "bet-personal",
    analysisId: "analysis-personal",
    fixtureId: 10,
    bookmaker: "Casa de prueba",
    decimalOdds: 1.9,
    stakeAmount: 10,
  });
  assert.equal(newBet.owner_id, PERSONAL_OWNER_ID);

  const legacyBet = { ...newBet, bet_id: "bet-legacy" };
  delete legacyBet.owner_id;
  const ledger = createMemoryBetLedger([
    { type: "bet_registered", payload: legacyBet },
  ]);
  assert.deepEqual(
    (await ledger.list({ ownerId: PERSONAL_OWNER_ID })).map((item) => item.bet_id),
    ["bet-legacy"]
  );
});

test("AUTH 8. prediction ledger incluye históricos legacy en el owner personal", async () => {
  const legacyPrediction = {
    contract: "OfficialPrediction",
    prediction_id: "prediction-legacy",
    fingerprint: "legacy",
    issued_at: "2026-01-01T00:00:00.000Z",
    resolution: { status: "pending" },
  };
  const ledger = createMemoryPredictionLedger([
    { type: "official_prediction_registered", payload: legacyPrediction },
  ]);
  const predictions = await ledger.list({ ownerId: PERSONAL_OWNER_ID });
  assert.equal(predictions.length, 1);
  assert.equal(predictions[0].prediction_id, "prediction-legacy");
});

test("AUTH 9. cliente no almacena contraseña y todas las APIs deportivas exigen sesión", async () => {
  const root = process.cwd();
  const loginClient = await readFile(path.join(root, "src/app/login/login-form.js"), "utf8");
  assert.doesNotMatch(loginClient, /localStorage/i);
  assert.doesNotMatch(loginClient, /ATLAS_(?:SESSION|PERSONAL)/);

  const protectedRoutes = [
    "src/app/api/bets/route.js",
    "src/app/api/predictions/route.js",
    "src/app/api/operational-history/route.js",
    "src/app/api/football/find-fixture/route.js",
    "src/app/api/football/fixture-analysis/route.js",
    "src/app/api/football/fixture-statistics/route.js",
    "src/app/api/football/fixtures/route.js",
    "src/app/api/football/journey-scan/route.js",
    "src/app/api/football/leagues/route.js",
    "src/app/api/football/live/route.js",
    "src/app/api/football/match-intelligence/route.js",
    "src/app/api/football/operational-analysis/route.js",
    "src/app/api/football/status/route.js",
    "src/app/api/football/validate-context/route.js",
  ];
  for (const route of protectedRoutes) {
    assert.match(await readFile(path.join(root, route), "utf8"), /requirePersonalSession/, route);
  }
});

test("AUTH 10. scripts LAN usan la opción host de Next 16 y la plantilla no contiene secretos", async () => {
  const packageJson = JSON.parse(await readFile(path.join(process.cwd(), "package.json"), "utf8"));
  assert.equal(packageJson.scripts["dev:lan"], "next dev -H 0.0.0.0");
  assert.equal(packageJson.scripts["start:lan"], "next start -H 0.0.0.0");
  const template = await readFile(path.join(process.cwd(), ".env.example"), "utf8");
  assert.match(template, /ATLAS_PERSONAL_PASSWORD_HASH=/);
  assert.match(template, /ATLAS_SESSION_SECRET=/);
  assert.doesNotMatch(template, /^SUPABASE_|^NEXT_PUBLIC_/m);
});
