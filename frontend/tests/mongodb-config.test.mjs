import { afterAll, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("mongodb", () => ({
  MongoClient: class {
    async connect() { return this; }
    db(name) { return { databaseName: name }; }
  },
}));
const keys = ["MONGODB_URI", "MONGODB_DB_NAME", "MONGODB_DATABASE"];
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
process.env.MONGODB_URI = "mongodb://fixture.invalid";
afterAll(() => {
  for (const key of keys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
});
const { getDatabase } = await import("../src/shared/lib/mongodb");

test("MongoDB uses the canonical name, the legacy name, then the existing default", async () => {
  process.env.MONGODB_DATABASE = "legacy_database";
  delete process.env.MONGODB_DB_NAME;
  expect((await getDatabase()).databaseName).toBe("legacy_database");
  process.env.MONGODB_DB_NAME = "canonical_database";
  expect((await getDatabase()).databaseName).toBe("canonical_database");
  delete process.env.MONGODB_DB_NAME;
  delete process.env.MONGODB_DATABASE;
  expect((await getDatabase()).databaseName).toBe("quantum_platform");
});
