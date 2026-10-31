import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getDatabase } from "@/shared/lib/mongodb";
import { getSession } from "@/features/auth/server/session";
import { backendAssertion } from "@/features/auth/server/backend-assertion";
import { BACKEND } from "@/constants";
import {
  mapRun,
  nativeSheet,
  workbookKey,
  type RunKind,
  type SheetSeed,
} from "@/shared/spreadsheets/model";
import { access } from "@/shared/spreadsheets/access";
import type { Workbook, SourceRun } from "../types";
import { engineRequest } from "./engine";

export class WorkbookError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function user() {
  const session = await getSession();
  if (!session?.user) throw new WorkbookError("Sign in required", 401);
  return session.user;
}
export async function books() {
  const collection = (await getDatabase()).collection<Workbook>(
    "spreadsheet_workbooks",
  );
  await collection.createIndex({ key: 1 }, { unique: true });
  await collection.createIndex(
    { "sheets.room": 1 },
    { unique: true, sparse: true },
  );
  return collection;
}
export async function ownedRun(
  kind: RunKind,
  runId: string,
): Promise<SourceRun> {
  if (
    !["pharma", "finance", "circuit"].includes(kind) ||
    !/^[\w-]{1,160}$/.test(runId)
  )
    throw new WorkbookError("Invalid run");
  const current = await user();
  const assertion = backendAssertion(current);
  if (!assertion)
    throw new WorkbookError("Backend identity bridge unavailable", 503);
  const url =
    kind === "pharma"
      ? BACKEND.PHARMA.JOB(runId)
      : kind === "finance"
        ? BACKEND.FINANCE.DETAIL(runId)
        : BACKEND.JOBS.DETAIL(runId);
  const res = await fetch(url, {
    headers: { Authorization: assertion },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new WorkbookError("Owned run is unavailable", res.status);
  const json = await res.text();
  if (json.length > 5_000_000)
    throw new WorkbookError("Run exceeds import limit", 413);
  mapRun(kind, JSON.parse(json));
  return {
    kind,
    runId,
    json,
    ownerId: current.id,
    version: createHash("sha256").update(json).digest("hex"),
  };
}
export async function getBook(id: string, write = false, owner = false) {
  const current = await user();
  const book = await (await books()).findOne({ _id: id });
  const role =
    book?.ownerId === current.id
      ? "owner"
      : book?.members.find((m) => m.userId === current.id)?.role;
  if (!book || !role) throw new WorkbookError("Workbook not found", 404);
  if ((write && role === "viewer") || (owner && role !== "owner"))
    throw new WorkbookError("Permission denied", 403);
  return { book, current, role };
}
export async function listBooks() {
  const current = await user();
  return (await books())
    .find(
      {
        $or: [
          { ownerId: current.id },
          { "members.userId": current.id },
          { "invitations.email": current.email.toLowerCase() },
        ],
      },
      { projection: { runs: 0 } },
    )
    .toArray();
}
export async function createBook(kind: RunKind, runId: string) {
  const run = await ownedRun(kind, runId);
  const collection = await books();
  const key = workbookKey(run.ownerId, kind, runId, run.version);
  const existing = await collection.findOne({ key });
  if (existing && existing.state !== "failed") return existing;
  const id = existing?._id ?? randomUUID().replaceAll("-", "");
  const book: Workbook = {
    _id: id,
    key,
    ownerId: run.ownerId,
    title: `${kind} · ${runId}`,
    members: [],
    invitations: [],
    sheets: [],
    runs: [run],
    state: "creating",
    createdAt: new Date().toISOString(),
  };
  try {
    if (existing) {
      const retry = await collection.replaceOne(
        { _id: id, state: "failed" },
        book,
      );
      if (!retry.modifiedCount) return (await collection.findOne({ _id: id }))!;
    } else {
      await collection.insertOne(book);
    }
  } catch (error) {
    const winner = await collection.findOne({ key });
    if (winner) return winner;
    throw error;
  }
  try {
    const seeds = [
      ...mapRun(kind, JSON.parse(run.json)),
      {
        name: "Comparison and notes",
        source: false,
        save: nativeSheet([["Notes", "Value"]]),
      },
    ];
    book.sheets = await importSheets(id, seeds);
    book.state = "ready";
    await collection.replaceOne({ _id: id }, book);
  } catch (error) {
    book.state = "failed";
    book.error = "Import failed; no editable workbook was published";
    await collection.replaceOne({ _id: id }, book);
    throw error;
  }
  return book;
}
export async function importSheets(id: string, seeds: SheetSeed[]) {
  if (seeds.length > 30) throw new WorkbookError("Too many sheets");
  const sheets = [];
  for (const seed of seeds) {
    const room = `ec_${id}${randomUUID().replaceAll("-", "")}`;
    await engineRequest(room, "PUT", seed.save);
    sheets.push({ name: seed.name, source: seed.source, room });
  }
  return sheets;
}
export async function invite(
  id: string,
  email: string,
  role: "viewer" | "editor",
) {
  await getBook(id, false, true);
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !["viewer", "editor"].includes(role)
  )
    throw new WorkbookError("Invalid invitation");
  const collection = await books();
  await collection.updateOne(
    { _id: id },
    { $pull: { invitations: { email: email.toLowerCase() } } },
  );
  await collection.updateOne(
    { _id: id },
    { $push: { invitations: { email: email.toLowerCase(), role } } },
  );
}
export async function join(id: string) {
  const current = await user();
  const collection = await books();
  const book = await collection.findOne({ _id: id });
  const invitation = book?.invitations.find(
    (i) => i.email === current.email.toLowerCase(),
  );
  if (!invitation) throw new WorkbookError("Invitation not found", 404);
  await collection.updateOne(
    {
      _id: id,
      "invitations.email": invitation.email,
      "members.userId": { $ne: current.id },
    },
    {
      $push: { members: { userId: current.id, role: invitation.role } },
      $pull: { invitations: { email: invitation.email } },
    },
  );
}
export async function roomAccess(room: string) {
  const current = await user();
  const book = await (
    await books()
  ).findOne({ "sheets.room": room, state: "ready" });
  const allowed = book && access(book, current.id, room);
  if (!allowed) throw new WorkbookError("Room not found", 404);
  return {
    ...allowed,
    userId: current.id,
    readableRooms: book!.sheets.map((sheet) => sheet.room),
  };
}
export async function addRun(
  id: string,
  kind: RunKind,
  runId: string,
  consent: boolean,
) {
  const { book } = await getBook(id, true);
  if (consent !== true)
    throw new WorkbookError(
      "Confirm sharing this run with every workbook member",
    );
  if (book.state !== "ready")
    throw new WorkbookError("Workbook is not ready", 409);
  const run = await ownedRun(kind, runId);
  if (
    book.runs.some(
      (r) => r.kind === kind && r.runId === runId && r.version === run.version,
    )
  )
    return;
  const collection = await books();
  // Hide the workbook while extending its room allowlist; imports never replace existing rooms.
  const lock = await collection.updateOne(
    { _id: id, state: "ready" },
    { $set: { state: "creating" } },
  );
  if (!lock.modifiedCount)
    throw new WorkbookError("Another workbook operation is running", 409);
  try {
    const sheets = await importSheets(id, mapRun(kind, JSON.parse(run.json)));
    await collection.updateOne(
      { _id: id },
      {
        $push: { sheets: { $each: sheets }, runs: run },
        $set: { state: "ready" },
      },
    );
  } catch (error) {
    await collection.updateOne({ _id: id }, { $set: { state: "ready" } });
    throw error;
  }
}
