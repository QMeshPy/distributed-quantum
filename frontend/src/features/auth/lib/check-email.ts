import { API, AUTH } from "@/constants";
import { readApiError } from "@/shared/lib/api-error";

export async function checkEmailExists(email: string): Promise<boolean> {
  const response = await fetch(API.AUTH.CHECK_EMAIL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) {
    throw new Error(await readApiError(response, AUTH.UNAVAILABLE_MESSAGE));
  }
  const data: unknown = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || !("exists" in data) || typeof data.exists !== "boolean") {
    throw new Error(AUTH.UNAVAILABLE_MESSAGE);
  }
  return data.exists;
}
