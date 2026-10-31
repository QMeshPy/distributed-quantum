import { expect, test } from "bun:test";
import {
  validateSnapshot,
  parseRange,
  pinSnapshot,
} from "../src/shared/spreadsheets/snapshot";
const snapshot = {
  schema: 1,
  engine: "11d8a49540634249094b2c92c3ee1a3aa3d3b4ca",
  createdAt: "2026-10-29T00:00:00Z",
  sheets: [
    {
      name: "Notes",
      room: "ec_" + "a".repeat(64),
      source: false,
      save: "version:1.5\ncell:A1:vtf:n:2:1+1\n",
    },
  ],
  runs: [],
};
test("native saves survive snapshot serialization", () =>
  expect(validateSnapshot(JSON.stringify(snapshot))).toEqual(snapshot));
test("malformed snapshots and huge ranges fail closed", () => {
  expect(() => validateSnapshot('{"schema":99}')).toThrow();
  expect(parseRange("A1:B3")).toEqual({
    startCol: 1,
    startRow: 1,
    endCol: 2,
    endRow: 3,
  });
  expect(() => parseRange("A1:ZZ9999")).toThrow();
  expect(() => parseRange("A0:B2")).toThrow();
});
test("pin records actual CID only after byte retrieval verification", async () => {
  const bytes = JSON.stringify(snapshot);
  let calls = 0;
  const transport = async () => {
    calls++;
    return calls === 1
      ? new Response(JSON.stringify({ Hash: "bafyactual" }))
      : new Response(bytes);
  };
  expect(await pinSnapshot(bytes, "http://kubo", transport)).toBe("bafyactual");
  expect(calls).toBe(2);
});
test("provider and verification failures cannot become saved versions", async () => {
  await expect(
    pinSnapshot(
      "bytes",
      "http://kubo",
      async () => new Response("bad", { status: 500 }),
    ),
  ).rejects.toThrow();
  let calls = 0;
  await expect(
    pinSnapshot("bytes", "http://kubo", async () =>
      ++calls === 1
        ? new Response('{"Hash":"bafyactual"}')
        : new Response("wrong bytes"),
    ),
  ).rejects.toThrow();
});

test("restore remaps only formulas, preserving literal source text", async () => {
  const { remapSheetReferences } =
    await import("../src/shared/spreadsheets/snapshot");
  const save = "cell:A1:t:ec_old\ncell:B1:vtf:n:2:ec_old!A1+1\n";
  expect(remapSheetReferences(save, new Map([["ec_old", "ec_new"]]))).toBe(
    "cell:A1:t:ec_old\ncell:B1:vtf:n:2:ec_new!A1+1\n",
  );
});
