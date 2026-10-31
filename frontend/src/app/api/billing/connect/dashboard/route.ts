import { connectDashboardResponse } from "@/features/billing/server/connect";

export const dynamic = "force-dynamic";

export async function POST() {
  return connectDashboardResponse();
}
