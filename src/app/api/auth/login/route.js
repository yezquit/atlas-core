import { createLoginRateLimiter } from "../../../../core/auth/loginRateLimiter.js";
import {
  createPersonalSessionToken,
  isSecureRequest,
  personalAuthConfiguration,
  sessionCookieHeader,
  verifyPersonalCredentials,
} from "../../../../core/auth/personalAuth.js";

const limiterKey = Symbol.for("atlas.personal.login-limiter");
const globalLimiter = globalThis;
const loginLimiter =
  globalLimiter[limiterKey] ||
  (globalLimiter[limiterKey] = createLoginRateLimiter());

function requestKey(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ||
    new URL(request.url).hostname ||
    "local"
  );
}

function json(payload, { status = 200, headers = {} } = {}) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

export async function POST(request) {
  const key = requestKey(request);
  const allowance = loginLimiter.check(key);
  if (!allowance.allowed) {
    return json(
      {
        status: "blocked",
        errorCode: "login_temporarily_blocked",
        message: "Demasiados intentos. Espera antes de volver a intentarlo.",
      },
      { status: 429, headers: { "Retry-After": String(allowance.retryAfterSeconds) } }
    );
  }

  let input;
  try {
    input = await request.json();
  } catch {
    loginLimiter.recordFailure(key);
    return json(
      { status: "unavailable", errorCode: "invalid_json", message: "Solicitud inválida." },
      { status: 400 }
    );
  }

  const configuration = personalAuthConfiguration();
  if (!configuration.configured) {
    return json(
      {
        status: "unavailable",
        errorCode: "personal_auth_not_configured",
        message: "Atlas Personal todavía no está configurado en el servidor.",
      },
      { status: 503 }
    );
  }

  const credentialResult = verifyPersonalCredentials({
    username: input?.username,
    password: input?.password,
  });
  if (!credentialResult.ok) {
    const failure = loginLimiter.recordFailure(key);
    return json(
      {
        status: "unauthorized",
        errorCode: "invalid_credentials",
        message: "Usuario o contraseña incorrectos.",
      },
      {
        status: failure.allowed ? 401 : 429,
        headers: failure.allowed
          ? {}
          : { "Retry-After": String(failure.retryAfterSeconds) },
      }
    );
  }

  loginLimiter.recordSuccess(key);
  const token = createPersonalSessionToken();
  return json(
    { status: "success", owner_id: credentialResult.ownerId },
    {
      headers: {
        "Set-Cookie": sessionCookieHeader(token, {
          secure: isSecureRequest(request),
          maxAge: configuration.ttlSeconds,
        }),
      },
    }
  );
}
