import {
  createHmac,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

import { PERSONAL_OWNER_ID } from "./personalIdentity.js";

export const PERSONAL_SESSION_COOKIE = "atlas_personal_session";
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const MIN_SESSION_SECRET_LENGTH = 32;
const MAX_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const MIN_SESSION_TTL_SECONDS = 60 * 60;

function safeTextEqual(left, right) {
  const leftDigest = createHash("sha256").update(String(left)).digest();
  const rightDigest = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function parsePasswordHash(encodedHash) {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText] =
    String(encodedHash || "").split("$");
  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);

  if (
    algorithm !== "scrypt" ||
    !Number.isInteger(cost) ||
    cost < 2 ** 12 ||
    cost > 2 ** 18 ||
    !Number.isInteger(blockSize) ||
    blockSize < 1 ||
    blockSize > 16 ||
    !Number.isInteger(parallelization) ||
    parallelization < 1 ||
    parallelization > 4 ||
    !saltText ||
    !hashText
  ) {
    return null;
  }

  try {
    const salt = Buffer.from(saltText, "base64url");
    const hash = Buffer.from(hashText, "base64url");
    if (salt.length < 16 || hash.length !== 64) return null;
    return { cost, blockSize, parallelization, salt, hash };
  } catch {
    return null;
  }
}

export function personalAuthConfiguration(env = process.env) {
  const username = String(env.ATLAS_PERSONAL_USERNAME || "").trim();
  const passwordHash = String(env.ATLAS_PERSONAL_PASSWORD_HASH || "").trim();
  const sessionSecret = String(env.ATLAS_SESSION_SECRET || "");
  const requestedTtl = Number(env.ATLAS_SESSION_TTL_SECONDS);
  const ttlSeconds = Number.isInteger(requestedTtl)
    ? Math.min(Math.max(requestedTtl, MIN_SESSION_TTL_SECONDS), MAX_SESSION_TTL_SECONDS)
    : DEFAULT_SESSION_TTL_SECONDS;

  return {
    configured:
      username.length > 0 &&
      Boolean(parsePasswordHash(passwordHash)) &&
      sessionSecret.length >= MIN_SESSION_SECRET_LENGTH,
    username,
    passwordHash,
    sessionSecret,
    ttlSeconds,
  };
}

export function verifyPersonalCredentials({ username, password }, env = process.env) {
  const configuration = personalAuthConfiguration(env);
  if (!configuration.configured) return { ok: false, reason: "not_configured" };
  if (typeof username !== "string" || typeof password !== "string") {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (username.length > 128 || password.length > 256) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const parsedHash = parsePasswordHash(configuration.passwordHash);
  let suppliedHash;
  try {
    suppliedHash = scryptSync(password, parsedHash.salt, parsedHash.hash.length, {
      N: parsedHash.cost,
      r: parsedHash.blockSize,
      p: parsedHash.parallelization,
      maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return { ok: false, reason: "invalid_credentials" };
  }

  const valid =
    safeTextEqual(username.trim(), configuration.username) &&
    timingSafeEqual(suppliedHash, parsedHash.hash);
  return valid
    ? { ok: true, ownerId: PERSONAL_OWNER_ID }
    : { ok: false, reason: "invalid_credentials" };
}

function signPayload(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createPersonalSessionToken({ now = Date.now(), env = process.env } = {}) {
  const configuration = personalAuthConfiguration(env);
  if (!configuration.configured) throw new Error("personal_auth_not_configured");

  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      subject: PERSONAL_OWNER_ID,
      issued_at: issuedAt,
      expires_at: issuedAt + configuration.ttlSeconds,
    })
  ).toString("base64url");

  return `${payload}.${signPayload(payload, configuration.sessionSecret)}`;
}

export function verifyPersonalSessionToken(token, { now = Date.now(), env = process.env } = {}) {
  const configuration = personalAuthConfiguration(env);
  if (!configuration.configured || typeof token !== "string") return null;

  const [payload, suppliedSignature, extra] = token.split(".");
  if (!payload || !suppliedSignature || extra) return null;

  const expectedSignature = signPayload(payload, configuration.sessionSecret);
  if (!safeTextEqual(suppliedSignature, expectedSignature)) return null;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const nowSeconds = Math.floor(now / 1000);
    if (
      decoded?.version !== 1 ||
      decoded?.subject !== PERSONAL_OWNER_ID ||
      !Number.isInteger(decoded?.issued_at) ||
      !Number.isInteger(decoded?.expires_at) ||
      decoded.issued_at > nowSeconds + 60 ||
      decoded.expires_at <= nowSeconds ||
      decoded.expires_at - decoded.issued_at > MAX_SESSION_TTL_SECONDS
    ) {
      return null;
    }
    return {
      ownerId: PERSONAL_OWNER_ID,
      issuedAt: decoded.issued_at,
      expiresAt: decoded.expires_at,
    };
  } catch {
    return null;
  }
}

export function isSecureRequest(request) {
  const forwardedProtocol = request?.headers?.get?.("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol === "https") return true;
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function sessionCookieHeader(token, { secure = false, maxAge = DEFAULT_SESSION_TTL_SECONDS } = {}) {
  const parts = [
    `${PERSONAL_SESSION_COOKIE}=${encodeURIComponent(token || "")}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
