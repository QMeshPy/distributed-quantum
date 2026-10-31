import "server-only";
import { z } from "zod";
import {
  WorkbookError,
  listBooks,
  createBook,
  getBook,
  invite,
  join,
  addRun,
  roomAccess,
} from "./service";
import {
  saveVersion,
  listVersions,
  restoreVersion,
  rangeContext,
} from "./versions";
const runInput = z.object({
  kind: z.enum(["pharma", "finance", "circuit"]),
  runId: z.string().min(1).max(160),
});
export async function handleWorkbook(req: Request, path: string[] = []) {
  try {
    if (process.env.SPREADSHEETS_ENABLED !== "true")
      return Response.json(
        { error: "Spreadsheet preview is disabled" },
        { status: 503 },
      );
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      const expected = process.env.BETTER_AUTH_URL || new URL(req.url).origin;
      if (origin !== new URL(expected).origin)
        throw new WorkbookError("Invalid origin", 403);
      if (Number(req.headers.get("content-length") || 0) > 65536)
        throw new WorkbookError("Request too large", 413);
    }
    const [id, action] = path;
    if (req.method === "GET") {
      if (!id) return Response.json(await listBooks());
      if (id === "room" && action)
        return Response.json(await roomAccess(action));
      if (action === "versions") return Response.json(await listVersions(id));
      const { book, role } = await getBook(id);
      if (action === "source") return Response.json(book.runs);
      return Response.json({
        ...book,
        runs: book.runs.map(({ json, ...run }) => ({
          ...run,
          bytes: json.length,
        })),
        role,
      });
    }
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const text = await req.text();
    if (text.length > 65536) throw new WorkbookError("Request too large", 413);
    const body = JSON.parse(text || "{}");
    if (!id) {
      const run = runInput.parse(body);
      const book = await createBook(run.kind, run.runId);
      return Response.json({ id: book._id, state: book.state });
    }
    if (action === "snapshot")
      return Response.json(await saveVersion(id, body.publicConsent === true));
    if (action === "restore")
      return Response.json(
        await restoreVersion(
          id,
          z
            .string()
            .regex(/^[a-zA-Z0-9]{10,120}$/)
            .parse(body.cid),
        ),
      );
    if (action === "context")
      return Response.json(
        await rangeContext(
          id,
          z.string().parse(body.room),
          z.string().parse(body.range),
        ),
      );
    if (action === "invite") {
      const input = z
        .object({ email: z.email(), role: z.enum(["viewer", "editor"]) })
        .parse(body);
      await invite(id, input.email, input.role);
    } else if (action === "join") await join(id);
    else if (action === "runs") {
      const run = runInput.extend({ consent: z.literal(true) }).parse(body);
      await addRun(id, run.kind, run.runId, run.consent);
    } else throw new WorkbookError("Unknown operation", 404);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkbookError)
      return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error(
      "Workbook operation failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    return Response.json(
      {
        error:
          "Workbook operation failed; try again after checking service availability",
      },
      { status: 502 },
    );
  }
}
