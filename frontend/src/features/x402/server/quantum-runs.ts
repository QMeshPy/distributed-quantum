import "server-only";

type Environment = Readonly<Record<string, string | undefined>>;

export async function postQuantumRun(
  request: Request,
  environment: Environment = process.env,
): Promise<Response> {
  if (environment.X402_ENABLED !== "true") {
    return Response.json({ error: "x402 is not enabled." }, { status: 503 });
  }

  try {
    const { postCircuitPayment } = await import("./circuit-payments");
    return await postCircuitPayment(request, environment);
  } catch (error) {
    console.error("Unable to initialize x402:", error);
    return Response.json(
      { error: "x402 is temporarily unavailable." },
      { status: 503 },
    );
  }
}

export async function getQuantumRun(
  jobId: string,
  environment: Environment = process.env,
): Promise<Response> {
  if (environment.X402_ENABLED !== "true") {
    return Response.json({ error: "x402 is not enabled." }, { status: 503 });
  }

  try {
    const [{ fetchX402Job }, { loadCircuitPaymentConfig }] = await Promise.all([
      import("./backend"),
      import("./networks"),
    ]);
    return await fetchX402Job(
      jobId,
      loadCircuitPaymentConfig(environment),
      "circuits",
    );
  } catch (error) {
    console.error("Unable to read x402 circuit job:", error);
    return Response.json({ error: "Backend unreachable." }, { status: 502 });
  }
}
