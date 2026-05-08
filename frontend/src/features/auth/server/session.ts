import "server-only";

import { headers } from "next/headers";
import { getAuth } from "./auth";

export async function getSession() {
  const auth = await getAuth();
  return auth.api.getSession({
    headers: await headers(),
  });
}
