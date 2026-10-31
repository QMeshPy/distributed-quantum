import { afterAll, expect, mock, test } from "bun:test";

const connect = mock(async function () { return this; });
const close = mock(async () => {});
mock.module("server-only", () => ({}));
mock.module("mongodb", () => ({ MongoClient: class {
  connect = connect;
  close = close;
} }));
const previous = process.env.MONGODB_URI;
afterAll(() => {
  if (previous === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = previous;
});
const { default: getClient } = await import("../src/shared/lib/mongodb");

test("missing configuration can be corrected without leaving a rejected connection cached", async () => {
  delete process.env.MONGODB_URI;
  await expect(getClient()).rejects.toThrow("MONGODB_URI");
  process.env.MONGODB_URI = "mongodb://fixture.invalid";
  connect.mockRejectedValueOnce(new Error("connection failed"));
  const first = getClient();
  expect(getClient()).toBe(first);
  await expect(first).rejects.toThrow("connection failed");
  expect(close).toHaveBeenCalledTimes(1);
  const recovered = getClient();
  expect(await recovered).toBeDefined();
  expect(getClient()).toBe(recovered);
  expect(connect).toHaveBeenCalledTimes(2);
});
