import { requirePersonalSession } from "@/core/auth/personalAccessPolicy";

export async function GET(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  return Response.json(
    {
      status: "success",
      owner_id: access.session.ownerId,
      expires_at: access.session.expiresAt,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
