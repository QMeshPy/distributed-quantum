import { connectOverviewResponse } from "@/features/billing/server/connect";

export const dynamic = "force-dynamic";

export async function GET() {
  return connectOverviewResponse();
}
