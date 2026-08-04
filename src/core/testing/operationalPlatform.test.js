import test from "node:test";
import assert from "node:assert/strict";
import { AUTHENTICATION_STATUS, createAuthorizedUserProfile, createPersistencePort } from "../contracts/platformContracts.js";
import { createMemoryOperationalHistory } from "../infrastructure/operationalHistory.js";
import { isLocalRequest } from "../services/localAccessPolicy.js";

test("el perfil futuro no simula autenticación", () => {
  const profile = createAuthorizedUserProfile();
  assert.equal(profile.authorization_status, AUTHENTICATION_STATUS.UNCONFIGURED);
  assert.equal(profile.user_id, null);
});

test("el puerto de persistencia acepta el adaptador local", async () => {
  const port = createPersistencePort(createMemoryOperationalHistory());
  assert.equal(port.provider, "server_local_append_only");
  assert.deepEqual(await port.list(), []);
  assert.equal(Object.isFrozen(port), true);
});

test("las rutas operativas aceptan localhost", () => {
  assert.equal(isLocalRequest(new Request("http://localhost:3000/api/operational-history")), true);
  assert.equal(isLocalRequest(new Request("http://127.0.0.1:3000/api/operational-history")), true);
});

test("las rutas operativas rechazan hosts públicos sin autenticación", () => {
  assert.equal(isLocalRequest(new Request("https://atlas.example/api/operational-history")), false);
});
