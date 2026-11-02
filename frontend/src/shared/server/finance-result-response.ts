export async function financeResultResponse(
  response: Response,
  download: boolean,
) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!download || !response.ok) {
    const data = await response.json();
    return Response.json(data, { status: response.status, headers });
  }
  if (!response.headers.get("Content-Disposition")?.startsWith("attachment;")) {
    return Response.json(
      { detail: "The backend did not return a provenance attachment." },
      { status: 502, headers },
    );
  }
  // Parsing and reserializing here changes committed numbers such as 1.0 to 1.
  return new Response(response.body, {
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="price-provenance.json"',
      "X-Content-Type-Options": "nosniff",
    },
  });
}
