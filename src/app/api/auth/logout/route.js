import {
  isSecureRequest,
  sessionCookieHeader,
} from "../../../../core/auth/personalAuth.js";
import { requirePersonalSession } from "../../../../core/auth/personalAccessPolicy.js";

export async function POST(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  return Response.json(
    { status: "success" },
    {
      headers: {
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookieHeader("", {
          secure: isSecureRequest(request),
          maxAge: 0,
        }),
      },
    }
  );
}
