import { BACKEND } from "@/constants";

interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
}

export async function backendFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { body, headers: customHeaders, ...rest } = options;

  const url = path.startsWith("http") ? path : `${BACKEND.BASE_URL}${path}`;

  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...customHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(
      (errorBody as { detail?: string }).detail ||
        `Backend error: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}
