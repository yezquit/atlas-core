import {
  PERSONAL_SESSION_COOKIE,
  verifyPersonalSessionToken,
} from "./personalAuth.js";

function cookieValue(header, name) {
  const entry = String(header || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!entry) return null;
  try {
    return decodeURIComponent(entry.slice(name.length + 1));
  } catch {
    return null;
  }
}

export function personalSessionFromRequest(request, options = {}) {
  const token =
    request?.cookies?.get?.(PERSONAL_SESSION_COOKIE)?.value ||
    cookieValue(request?.headers?.get?.("cookie"), PERSONAL_SESSION_COOKIE);
  return verifyPersonalSessionToken(token, options);
}

function hasMismatchedOrigin(request) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request?.method)) return false;
  const origin = request?.headers?.get?.("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    const effectiveHost = forwardedHost || request.headers.get("host") || requestUrl.host;
    const effectiveProtocol = forwardedProtocol || requestUrl.protocol.replace(":", "");
    return originUrl.host !== effectiveHost || originUrl.protocol !== `${effectiveProtocol}:`;
  } catch {
    return true;
  }
}

export function requirePersonalSession(request, options = {}) {
  const session = personalSessionFromRequest(request, options);
  if (!session) {
    return {
      ok: false,
      response: Response.json(
        { status: "unauthorized", errorCode: "personal_session_required" },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      ),
    };
  }
  if (hasMismatchedOrigin(request)) {
    return {
      ok: false,
      response: Response.json(
        { status: "forbidden", errorCode: "origin_mismatch" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      ),
    };
  }
  return { ok: true, session };
}
