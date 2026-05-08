import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/features/auth/server/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await getAuth();
  const { GET: handler } = toNextJsHandler(auth);
  return handler(req);
}

export async function POST(req: Request) {
  const auth = await getAuth();
  const { POST: handler } = toNextJsHandler(auth);
  return handler(req);
}
