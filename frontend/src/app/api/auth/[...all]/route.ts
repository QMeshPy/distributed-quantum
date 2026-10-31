import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/features/auth/server/auth";
import { AUTH } from "@/constants";

export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(async (req: Request) => {
  try {
    const auth = await getAuth();
    const response = await auth.handler(req);
    if (response.status >= 500 && !response.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ message: AUTH.UNAVAILABLE_MESSAGE }, { status: 503 });
    }
    return response;
  } catch (error) {
    console.error("Auth request failed:", error instanceof Error ? error.name : "UnknownError");
    return Response.json({ message: AUTH.UNAVAILABLE_MESSAGE }, { status: 503 });
  }
});
