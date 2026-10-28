import { handleWorkbook } from "@/features/spreadsheets/server/handler";
export const GET = (req: Request) => handleWorkbook(req);
export const POST = GET;
