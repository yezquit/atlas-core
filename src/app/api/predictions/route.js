import { isLocalRequest, localAccessDeniedResponse } from "@/core/services/localAccessPolicy";
import { predictionApiGet, predictionApiPatch, predictionApiPost } from "@/core/services/predictionMemoryApi";
import { predictionMemoryService } from "@/core/services/predictionMemoryServer";

export async function GET(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  return predictionApiGet(request, predictionMemoryService);
}

export async function POST(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  return predictionApiPost(request, predictionMemoryService);
}

export async function PATCH(request) {
  if (!isLocalRequest(request)) return localAccessDeniedResponse();
  return predictionApiPatch(request, predictionMemoryService);
}
