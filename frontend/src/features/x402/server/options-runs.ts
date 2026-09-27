import "server-only";

type Environment = Readonly<Record<string, string | undefined>>;

export async function postOptionsRun(
  request: Request,
  environment: Environment = process.env,
): Promise<Response> {
  if (environment.X402_ENABLED !== "true") {
    return Response.json(
      { error: "Algorand x402 is not enabled." },
      { status: 503 },
    );
  }

  try {
    const { postConfiguredX402Run } = await import("./runtime");
    return await postConfiguredX402Run(request, environment);
  } catch (error) {
    console.error("Unable to initialize Algorand x402:", error);
    return Response.json(
      { error: "Algorand x402 configuration is invalid." },
      { status: 503 },
    );
  }
}

export async function getOptionsRun(
  jobId: string,
  environment: Environment = process.env,
): Promise<Response> {
  if (environment.X402_ENABLED !== "true") {
    return Response.json(
      { error: "Algorand x402 is not enabled." },
      { status: 503 },
    );
  }

  try {
    const { getConfiguredX402Job } = await import("./runtime");
    return await getConfiguredX402Job("options", jobId, environment);
  } catch (error) {
    console.error("Unable to read Algorand x402 job:", error);
    return Response.json({ error: "Backend unreachable." }, { status: 502 });
  }
}
