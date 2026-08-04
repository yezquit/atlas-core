export const PLATFORM_ADAPTER_VERSION = 1;

export const AUTHENTICATION_STATUS = Object.freeze({
  UNCONFIGURED: "unconfigured",
  CONFIGURED: "configured",
  AUTHENTICATED: "authenticated",
  UNAUTHORIZED: "unauthorized",
});

export function createAuthorizedUserProfile(input = {}) {
  return {
    contract: "AuthorizedUserProfile",
    version: PLATFORM_ADAPTER_VERSION,
    user_id: input.userId || null,
    email: input.email || null,
    role: input.role || "viewer",
    authorization_status: input.authorizationStatus || AUTHENTICATION_STATUS.UNCONFIGURED,
  };
}

export function createPersistencePort(adapter) {
  for (const method of ["appendAnalysis", "appendDeletion", "list", "latestForFixture", "exportJson"]) {
    if (typeof adapter?.[method] !== "function") throw new TypeError(`PersistencePort requiere ${method}.`);
  }
  return Object.freeze({
    contract: "OperationalPersistencePort",
    version: PLATFORM_ADAPTER_VERSION,
    provider: adapter.provider || "server_local_append_only",
    appendAnalysis: adapter.appendAnalysis.bind(adapter),
    appendDeletion: adapter.appendDeletion.bind(adapter),
    list: adapter.list.bind(adapter),
    latestForFixture: adapter.latestForFixture.bind(adapter),
    exportJson: adapter.exportJson.bind(adapter),
  });
}
