import "server-only";

import { cookies } from "next/headers";

import {
  PERSONAL_SESSION_COOKIE,
  verifyPersonalSessionToken,
} from "./personalAuth.js";

export async function currentPersonalSession() {
  const cookieStore = await cookies();
  return verifyPersonalSessionToken(
    cookieStore.get(PERSONAL_SESSION_COOKIE)?.value
  );
}
