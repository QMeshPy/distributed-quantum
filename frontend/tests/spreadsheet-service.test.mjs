import { expect, test, beforeAll, afterAll, mock } from "bun:test";
import { MongoClient } from "mongodb";
import { randomUUID } from "node:crypto";
if (process.env.RUN_SPREADSHEET_DB_TESTS !== "1") {
  test.skip("MongoDB integration (set RUN_SPREADSHEET_DB_TESTS=1 and MONGODB_URI)", () => {});
} else {
mock.module("server-only", () => ({}));
let identity = { id: "owner", email: "owner@example.test" };
mock.module("../src/features/auth/server/session", () => ({
  getSession: async () => ({ user: identity }),
}));
mock.module("../src/features/auth/server/backend-assertion", () => ({
  backendAssertion: () => `Bearer ${identity.id}`,
}));
const mongo = new MongoClient(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
});
const db = mongo.db("qmesh_ethercalc_test_" + randomUUID().replaceAll("-", ""));
mock.module("../src/shared/lib/mongodb", () => ({
  getDatabase: async () => db,
}));
let imports = 0;
let fail = false;
mock.module("../src/features/spreadsheets/server/engine", () => ({
  engineRequest: async () => {
    imports++;
    if (fail) throw new Error("service unavailable");
    return "version:1.5\n";
  },
}));
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) =>
  options.headers.Authorization === "Bearer stranger"
    ? new Response("{}", { status: 404 })
    : Response.json({
        job_id: "run1",
        status: "completed",
        result: { score: 2 },
      });
const service = await import("../src/features/spreadsheets/server/service");
beforeAll(async () => {
  await mongo.connect();
}, 30000);
afterAll(async () => {
  globalThis.fetch = originalFetch;
  await db.dropDatabase();
  await mongo.close();
});
test("concurrent create reopens one workbook without reimporting notes", async () => {
  const [a, b] = await Promise.all([
    service.createBook("finance", "run1"),
    service.createBook("finance", "run1"),
  ]);
  expect(a._id).toBe(b._id);
  expect(await db.collection("spreadsheet_workbooks").countDocuments()).toBe(1);
  const before = imports;
  await service.createBook("finance", "run1");
  expect(imports).toBe(before);
});
test("invite requires owner, join requires matching email, viewer cannot write", async () => {
  const book = await service.createBook("finance", "run1");
  await service.invite(book._id, "viewer@example.test", "viewer");
  identity = { id: "stranger", email: "stranger@example.test" };
  await expect(service.join(book._id)).rejects.toThrow("Invitation not found");
  await expect(service.getBook(book._id)).rejects.toThrow("Workbook not found");
  await expect(service.createBook("finance", "run1")).rejects.toThrow(
    "Owned run",
  );
  identity = { id: "viewer", email: "viewer@example.test" };
  await service.join(book._id);
  expect((await service.getBook(book._id)).role).toBe("viewer");
  await expect(service.getBook(book._id, true)).rejects.toThrow(
    "Permission denied",
  );
  await expect(
    service.invite(book._id, "other@example.test", "editor"),
  ).rejects.toThrow("Permission denied");
  const room = (await service.getBook(book._id)).book.sheets.at(-1).room;
  expect((await service.roomAccess(room)).write).toBe(false);
  identity = { id: "owner", email: "owner@example.test" };
});
test("add-run requires consent and source import failures do not destroy active workbook", async () => {
  const book = await service.createBook("finance", "run1");
  await expect(
    service.addRun(book._id, "finance", "run2", false),
  ).rejects.toThrow("Confirm sharing");
  fail = true;
  await expect(
    service.addRun(book._id, "finance", "run2", true),
  ).rejects.toThrow("service unavailable");
  fail = false;
  const after = (await service.getBook(book._id)).book;
  expect(after.state).toBe("ready");
  expect(after.sheets).toEqual(book.sheets);
});

test("failed initial imports can retry without overwriting a ready workbook", async () => {
  identity = { id: "owner", email: "owner@example.test" };
  fail = true;
  await expect(service.createBook("finance", "retry-run")).rejects.toThrow(
    "service unavailable",
  );
  fail = false;
  const recovered = await service.createBook("finance", "retry-run");
  expect(recovered.state).toBe("ready");
  const before = imports;
  expect((await service.createBook("finance", "retry-run"))._id).toBe(
    recovered._id,
  );
  expect(imports).toBe(before);
});

}
