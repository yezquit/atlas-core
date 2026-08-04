const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isLocalRequest(request) {
  try {
    return LOCAL_HOSTS.has(new URL(request.url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function localAccessDeniedResponse() {
  return Response.json({
    status: "blocked",
    errorCode: "authentication_not_configured",
    message: "Atlas operativo permanece restringido al entorno local hasta configurar autenticación real.",
  }, { status: 403 });
}
