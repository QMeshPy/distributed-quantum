export async function readApiError(
  response: Response,
  fallback: string,
): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (!body || typeof body !== "object") return fallback;
  if ("message" in body && typeof body.message === "string" && body.message.trim()) {
    return body.message;
  }
  if ("detail" in body && typeof body.detail === "string" && body.detail.trim()) {
    return body.detail;
  }
  if ("detail" in body && Array.isArray(body.detail)) {
    const messages = body.detail.flatMap((error: unknown) =>
      error &&
      typeof error === "object" &&
      "msg" in error &&
      typeof error.msg === "string" &&
      error.msg.trim()
        ? [error.msg]
        : [],
    );
    if (messages.length) return messages.join("; ");
  }
  if ("error" in body && typeof body.error === "string" && body.error.trim()) {
    return body.error;
  }
  return fallback;
}
