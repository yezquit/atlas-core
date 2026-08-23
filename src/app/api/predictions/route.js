import { requirePersonalSession } from "@/core/auth/personalAccessPolicy";
import { predictionApiGet, predictionApiPatch, predictionApiPost } from "@/core/services/predictionMemoryApi";
import { predictionMemoryService } from "@/core/services/predictionMemoryServer";

export async function GET(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  return predictionApiGet(request, predictionMemoryService);
}

export async function POST(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  return predictionApiPost(request, predictionMemoryService);
}

export async function PATCH(request) {
  const access = requirePersonalSession(request);
  if (!access.ok) return access.response;
  return predictionApiPatch(request, predictionMemoryService);
}
