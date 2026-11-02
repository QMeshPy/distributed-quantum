import { connectOnboardResponse } from "@/features/billing/server/connect";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return connectOnboardResponse(request);
}
