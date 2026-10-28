import { handleWorkbook } from "@/features/spreadsheets/server/handler";
export async function GET(
  req: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  return handleWorkbook(req, (await context.params).path);
}
export const POST = GET;
